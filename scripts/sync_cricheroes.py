#!/usr/bin/env python3
"""
CricHeroes Auto-Sync Script
Scrapes match results from CricHeroes tournament page (__NEXT_DATA__ JSON),
maps players to internal IDs, and updates the JSON data files.

Usage:
  python scripts/sync_cricheroes.py

Environment variables:
  GH_TOKEN  - GitHub token (set automatically by GitHub Actions)
"""

import json
import os
import re
import sys
import time
import difflib
from datetime import datetime, timedelta, timezone
from pathlib import Path
import urllib.parse
import urllib.request
import urllib.error

DATA_DIR = Path(__file__).parent.parent / "public" / "data"

# When set, CricHeroes URLs are fetched via this Cloudflare Worker proxy
# instead of directly — needed in GitHub Actions where CricHeroes blocks cloud IPs.
CRICHEROES_PROXY_URL = os.environ.get("CRICHEROES_PROXY_URL", "").rstrip("/")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_json(filename):
    path = DATA_DIR / filename
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(filename, data):
    path = DATA_DIR / filename
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved {filename}")


def fetch_url(url, retries=3):
    # Route CricHeroes requests through the Cloudflare Worker proxy when configured.
    # The worker fetches from Cloudflare edge IPs, which are not blocked by CricHeroes.
    if CRICHEROES_PROXY_URL and "cricheroes.com" in url:
        actual_url = f"{CRICHEROES_PROXY_URL}/cricheroes?url={urllib.parse.quote(url, safe='')}"
        print(f"  (via proxy) {url}")
    else:
        actual_url = url

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(actual_url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.read().decode("utf-8")
        except Exception as e:
            print(f"  Attempt {attempt} failed for {url}: {e}")
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError(f"Failed to fetch {url} after {retries} attempts")


def extract_next_data(html):
    """Extract __NEXT_DATA__ JSON from a Next.js page."""
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
    if not match:
        raise ValueError("__NEXT_DATA__ not found in page")
    return json.loads(match.group(1))


def fuzzy_match(name, candidates, threshold=0.5):
    """Return (best_player_id, confidence) using fuzzy string matching."""
    best_score = 0.0
    best_id = None
    name_lower = name.lower().strip()
    for player in candidates:
        candidate = player["display_name"].lower().strip()
        score = difflib.SequenceMatcher(None, name_lower, candidate).ratio()
        # Also check cricheroes_name if set
        if player.get("cricheroes_name"):
            score2 = difflib.SequenceMatcher(None, name_lower, player["cricheroes_name"].lower().strip()).ratio()
            score = max(score, score2)
        if score > best_score:
            best_score = score
            best_id = player["id"]
    if best_score >= threshold:
        return best_id, round(best_score, 3)
    return None, round(best_score, 3)


# ── Main sync logic ───────────────────────────────────────────────────────────

def get_tournament_matches(tournament_url):
    """Fetch match list from the tournament page."""
    print(f"Fetching tournament page: {tournament_url}")
    html = fetch_url(tournament_url)
    data = extract_next_data(html)
    match_response = data["props"]["pageProps"].get("matchResponse", {})
    # matchResponse is a dict with a "data" key containing the list
    if isinstance(match_response, dict):
        matches = match_response.get("data", [])
    else:
        matches = match_response  # fallback if structure changes
    print(f"  Found {len(matches)} matches on page")
    return matches


def get_match_scorecard(match_id, tournament_slug, team_a, team_b):
    """Fetch full scorecard for a match."""
    def slugify(s):
        return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

    slug_a = slugify(team_a)
    slug_b = slugify(team_b)
    url = f"https://cricheroes.com/scorecard/{match_id}/{tournament_slug}/{slug_a}-vs-{slug_b}/scorecard"
    print(f"  Fetching scorecard: {url}")
    try:
        html = fetch_url(url)
        data = extract_next_data(html)
        scorecard = data["props"]["pageProps"].get("scorecard", [])
        return scorecard
    except Exception as e:
        print(f"  Warning: Could not fetch scorecard for match {match_id}: {e}")
        return []


def extract_players_from_scorecard(scorecard):
    """Extract unique (player_id, name) pairs from all innings."""
    seen = {}
    for inning in scorecard:
        for batter in inning.get("batting", []):
            pid = str(batter.get("player_id", ""))
            name = batter.get("name", "").strip()
            if pid and name:
                seen[pid] = name
        for bowler in inning.get("bowling", []):
            pid = str(bowler.get("player_id", ""))
            name = bowler.get("name", "").strip()
            if pid and name:
                seen[pid] = name
    return seen  # { cricheroes_player_id: name }


def sync():
    print("\n=== CricHeroes Sync ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}\n")

    # Load all data files
    config      = load_json("config.json")
    players_raw = load_json("players.json")
    weeks_raw   = load_json("weeks.json")
    attend_raw  = load_json("attendance.json")
    txns_raw    = load_json("transactions.json")
    mapping_raw = load_json("cricheroes_mapping.json")

    players      = players_raw["players"]
    weeks        = weeks_raw["weeks"]
    attendance   = attend_raw["records"]
    transactions = txns_raw["transactions"]
    mappings     = mapping_raw["player_mappings"]
    unmatched    = mapping_raw.get("unmatched", [])

    active_tournament_id = config["active_tournament_id"]
    match_fee            = config.get("default_match_fee", 500)
    auto_deduct          = config.get("auto_deduct_on_sync", True)
    tournament_url       = config["cricheroes_tournament_url"]
    tournament_slug      = tournament_url.rstrip("/").split("/")[-1]

    # Build lookup: cricheroes_player_id -> internal player_id
    ch_to_internal = {
        m["cricheroes_player_id"]: m["player_id"]
        for m in mappings
        if m.get("confirmed") and m.get("player_id")
    }
    # Also build from players who have cricheroes_player_id set directly
    for p in players:
        if p.get("cricheroes_player_id"):
            ch_to_internal.setdefault(str(p["cricheroes_player_id"]), p["id"])

    # week_id format: W_YYYY_MM_DD (one per session date, not per CricHeroes match)
    existing_week_ids    = {w["week_id"] for w in weeks}
    existing_session_dates = {w["match_date"] for w in weeks if w.get("status") == "completed"}

    def date_already_covered(d):
        """Return True if d or d±1 day is already in existing_session_dates."""
        from datetime import date as dt_date
        try:
            parsed = dt_date.fromisoformat(d)
        except Exception:
            return False
        for delta in (-1, 0, 1):
            candidate = (parsed + timedelta(days=delta)).isoformat()
            if candidate in existing_session_dates:
                print(f"  Skipping already-synced session {d} (matched {candidate})")
                return True
        return False

    # Fetch match list
    all_matches = get_tournament_matches(tournament_url)

    # Group completed matches by session date (multiple mini-games per Sunday)
    sessions = {}  # date -> [match, ...]
    for m in all_matches:
        if m.get("status") != "past":
            continue
        match_date = m.get("match_start_time", "")[:10]
        if not match_date:
            continue
        if date_already_covered(match_date):
            continue
        sessions.setdefault(match_date, []).append(m)

    print(f"\nNew sessions to sync: {len(sessions)} dates — {sorted(sessions.keys())}")

    newly_unmatched = {}
    changed = False

    for match_date, session_matches in sorted(sessions.items()):
        week_id = f"W_{match_date.replace('-', '_')}"
        print(f"\nProcessing session {match_date} ({len(session_matches)} game(s))")

        # Collect all unique players across all games in this session
        all_session_ch_players = {}
        all_match_ids = []
        team_a = team_b = ""
        for match in session_matches:
            match_id = str(match["match_id"])
            all_match_ids.append(match_id)
            team_a = match.get("team_a", team_a)
            team_b = match.get("team_b", team_b)
            scorecard = get_match_scorecard(match_id, tournament_slug, match.get("team_a",""), match.get("team_b",""))
            ch_players = extract_players_from_scorecard(scorecard)
            all_session_ch_players.update(ch_players)
            print(f"  Match {match_id}: {len(ch_players)} players")
            time.sleep(1)  # be polite to CricHeroes

        print(f"  Total unique players this session: {len(all_session_ch_players)}")

        # Add single week/session entry
        if week_id not in existing_week_ids:
            weeks.append({
                "week_id": week_id,
                "tournament_id": active_tournament_id,
                "match_date": match_date,
                "label": datetime.strptime(match_date, "%Y-%m-%d").strftime("%b %d").lstrip("0"),
                "venue": "Machaxi J Sports, Bengaluru",
                "match_fee": match_fee,
                "status": "completed",
                "cricheroes_match_id": all_match_ids[0],  # first match of the session
                "cricheroes_match_ids": all_match_ids,
                "team_a": team_a,
                "team_b": team_b,
                "result": "",
                "players_count": len(all_session_ch_players),
                "notes": f"{len(session_matches)} game(s)" if len(session_matches) > 1 else "",
            })
            existing_week_ids.add(week_id)
            existing_session_dates.add(match_date)
            changed = True

        # Map CricHeroes players -> internal IDs (union of all games)
        played_internal_ids = set()
        for ch_pid, ch_name in all_session_ch_players.items():
            internal_id = ch_to_internal.get(ch_pid)
            if internal_id:
                played_internal_ids.add(internal_id)
            else:
                # Try auto fuzzy match against players not yet mapped
                active_players = [p for p in players if p["status"] == "active"]
                best_id, confidence = fuzzy_match(ch_name, active_players)
                if confidence >= 0.85:
                    print(f"  Auto-mapped: '{ch_name}' (CH:{ch_pid}) -> {best_id} (conf={confidence})")
                    ch_to_internal[ch_pid] = best_id
                    mappings.append({
                        "cricheroes_player_id": ch_pid,
                        "cricheroes_name": ch_name,
                        "player_id": best_id,
                        "match_confidence": confidence,
                        "match_method": "auto_fuzzy",
                        "confirmed": True,
                    })
                    played_internal_ids.add(best_id)
                    changed = True
                elif confidence >= 0.5:
                    print(f"  Low-confidence: '{ch_name}' (CH:{ch_pid}) -> {best_id} (conf={confidence}) — needs review")
                    mappings.append({
                        "cricheroes_player_id": ch_pid,
                        "cricheroes_name": ch_name,
                        "player_id": best_id,
                        "match_confidence": confidence,
                        "match_method": "auto_fuzzy",
                        "confirmed": False,
                    })
                    changed = True
                else:
                    # Auto-create as guest player (free, not charged expenses)
                    existing_ids = {p["id"] for p in players}
                    guest_id = f"PLY_G_{ch_pid}"
                    if guest_id not in existing_ids:
                        print(f"  Auto-creating guest: '{ch_name}' (CH:{ch_pid}) -> {guest_id}")
                        players.append({
                            "id": guest_id,
                            "display_name": ch_name,
                            "type": "guest",
                            "status": "active",
                            "joined_date": match_date,
                            "phone": "",
                            "corpus_balance": 0,
                            "total_paid": 0,
                            "total_deducted": 0,
                            "balance_status": "good",
                            "github_username": "",
                            "cricheroes_player_id": ch_pid,
                            "cricheroes_name": ch_name,
                            "guest_fee_mode": "free",
                            "sponsored_by_player_id": None,
                            "notes": "Auto-created from CricHeroes",
                        })
                        # Add to confirmed mappings
                        mappings.append({
                            "cricheroes_player_id": ch_pid,
                            "cricheroes_name": ch_name,
                            "player_id": guest_id,
                            "match_confidence": 1.0,
                            "match_method": "auto_guest",
                            "confirmed": True,
                        })
                        ch_to_internal[ch_pid] = guest_id
                        changed = True
                    played_internal_ids.add(ch_to_internal.get(ch_pid, guest_id))

        # Create attendance records
        existing_att_ids = {r["id"] for r in attendance}
        active_player_ids = {p["id"] for p in players if p["status"] == "active"}

        for pid in active_player_ids:
            att_id = f"ATT_{pid}_{week_id}"
            if att_id not in existing_att_ids:
                attendance.append({
                    "id": att_id,
                    "player_id": pid,
                    "week_id": week_id,
                    "tournament_id": active_tournament_id,
                    "status": "played" if pid in played_internal_ids else "absent",
                    "source": "cricheroes_sync",
                    "fee_deducted": False,
                })
                changed = True

        # NOTE: No auto-deduction here.
        # Fee per session = (ground cost + snacks) / corpus players who played.
        # This varies each week. Admin enters the actual expense in the admin panel,
        # then confirms the deduction which applies per-player shares to corpus balances.

    # Add newly unmatched to mapping file
    existing_unmatched_ids = {u["cricheroes_player_id"] for u in unmatched}
    for ch_pid, ch_name in newly_unmatched.items():
        if ch_pid not in existing_unmatched_ids and ch_pid not in ch_to_internal:
            unmatched.append({"cricheroes_player_id": ch_pid, "cricheroes_name": ch_name})
            changed = True

    if not changed:
        print("\nNo changes detected. Everything up to date.")
        return

    # Save all updated files
    print("\nSaving updated data files…")
    players_raw["players"]      = players
    players_raw["last_updated"] = datetime.now(timezone.utc).isoformat()
    save_json("players.json", players_raw)

    weeks_raw["weeks"] = weeks
    save_json("weeks.json", weeks_raw)

    attend_raw["records"]      = attendance
    attend_raw["last_updated"] = datetime.now(timezone.utc).isoformat()
    save_json("attendance.json", attend_raw)

    txns_raw["transactions"] = transactions
    save_json("transactions.json", txns_raw)

    mapping_raw["player_mappings"] = mappings
    mapping_raw["unmatched"]       = unmatched
    mapping_raw["last_sync"]       = datetime.now(timezone.utc).isoformat()
    save_json("cricheroes_mapping.json", mapping_raw)

    print(f"\nSync complete. {len(sessions)} session(s) processed.")
    if newly_unmatched:
        print(f"WARNING: {len(newly_unmatched)} unmatched player(s) — fix mapping in admin panel.")


if __name__ == "__main__":
    sync()
