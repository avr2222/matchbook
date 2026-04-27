#!/usr/bin/env python3
"""
CricHeroes Auto-Sync Script
Fetches match results via the CricHeroes internal API (api.cricheroes.in),
maps players to internal IDs, and updates the JSON data files.

No browser, no proxy, no Cloudflare needed — works directly from GitHub Actions.

Usage:
  python scripts/sync_cricheroes.py

Environment variables:
  GH_TOKEN  - GitHub token (set automatically by GitHub Actions)
"""

import json
import re
import sys
import time
import difflib
from datetime import datetime, timedelta, timezone
from pathlib import Path
import urllib.request
import urllib.error

DATA_DIR = Path(__file__).parent.parent / "public" / "data"

# CricHeroes internal API — same credentials used by their web/mobile app
API_BASE = "https://api.cricheroes.in/api/v1"
API_HEADERS = {
    "api-key":     "cr!CkH3r0s",
    "device-type": "Chrome: 124.0.0.0",
    "udid":        "VIlqkQdJ",
    "Referer":     "https://cricheroes.com/",
    "Accept":      "application/json, text/plain, */*",
    "User-Agent":  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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


def api_get(path, retries=3):
    url = path if path.startswith("http") else f"{API_BASE}/{path.lstrip('/')}"
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=API_HEADERS)
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read())
        except Exception as e:
            print(f"  Attempt {attempt} failed for {url}: {e}")
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError(f"Failed to fetch API {url} after {retries} attempts")


def fuzzy_match(name, candidates, threshold=0.5):
    """Return (best_player_id, confidence) using fuzzy string matching."""
    best_score = 0.0
    best_id = None
    name_lower = name.lower().strip()
    for player in candidates:
        candidate = player["display_name"].lower().strip()
        score = difflib.SequenceMatcher(None, name_lower, candidate).ratio()
        if player.get("cricheroes_name"):
            score2 = difflib.SequenceMatcher(None, name_lower, player["cricheroes_name"].lower().strip()).ratio()
            score = max(score, score2)
        if score > best_score:
            best_score = score
            best_id = player["id"]
    if best_score >= threshold:
        return best_id, round(best_score, 3)
    return None, round(best_score, 3)


# ── CricHeroes API calls ──────────────────────────────────────────────────────

def get_tournament_matches(tournament_id):
    """Fetch all past matches for the tournament via internal API."""
    ts = int(time.time() * 1000)
    path = f"match/get-tournament-matches/3/-1/-1?tournamentid={tournament_id}&status=3&pagesize=100&pageno=1&datetime={ts}"
    print(f"Fetching match list via CricHeroes API (tournament {tournament_id})")
    data = api_get(path)
    items = data.get("data", [])
    if isinstance(items, dict):
        items = items.get("data", [])
    print(f"  Found {len(items)} matches")
    return items


def get_match_scorecard(match_id):
    """Fetch scorecard for a match via internal API."""
    data = api_get(f"scorecard/v2/get-scorecard/{match_id}")
    if not data.get("status"):
        print(f"  Warning: API returned status=false for match {match_id}")
        return {}
    return data.get("data", {})


def extract_players_from_scorecard(scorecard_data):
    """Extract {cricheroes_player_id: name} from API scorecard data."""
    seen = {}
    for team_key in ("team_a", "team_b"):
        team = scorecard_data.get(team_key, {})
        for innings in team.get("scorecard", []):
            for batter in innings.get("batting", []):
                pid = str(batter.get("player_id", ""))
                name = re.sub(r"\s*\(c\s*&\s*wk\)|\s*\(wk\)|\s*\(c\)", "", batter.get("name", ""), flags=re.I).strip()
                if pid and name:
                    seen[pid] = name
            for bowler in innings.get("bowling", []):
                pid = str(bowler.get("player_id", ""))
                name = re.sub(r"\s*\(c\s*&\s*wk\)|\s*\(wk\)|\s*\(c\)", "", bowler.get("name", ""), flags=re.I).strip()
                if pid and name:
                    seen[pid] = name
    return seen  # { cricheroes_player_id: name }


# ── Main sync logic ───────────────────────────────────────────────────────────

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
    tournament_url       = config["cricheroes_tournament_url"]

    # Extract numeric tournament ID from URL (e.g. ".../tournament/1874258/...")
    m = re.search(r"/tournament/(\d+)/", tournament_url)
    if not m:
        raise ValueError(f"Cannot extract tournament ID from URL: {tournament_url}")
    tournament_id = m.group(1)

    # Build lookup: cricheroes_player_id -> internal player_id
    ch_to_internal = {
        m["cricheroes_player_id"]: m["player_id"]
        for m in mappings
        if m.get("confirmed") and m.get("player_id")
    }
    for p in players:
        if p.get("cricheroes_player_id"):
            ch_to_internal.setdefault(str(p["cricheroes_player_id"]), p["id"])

    # week_id format: W_YYYY_MM_DD
    existing_week_ids      = {w["week_id"] for w in weeks}
    existing_session_dates = {w["match_date"] for w in weeks if w.get("status") == "completed"}

    def date_already_covered(d):
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
    all_matches = get_tournament_matches(tournament_id)

    # Group completed matches by session date (multiple mini-games per Sunday)
    sessions = {}  # date -> [match, ...]
    for match in all_matches:
        match_date = match.get("match_start_time", "")[:10]
        if not match_date:
            continue
        if date_already_covered(match_date):
            continue
        sessions.setdefault(match_date, []).append(match)

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
            scorecard_data = get_match_scorecard(match_id)
            ch_players = extract_players_from_scorecard(scorecard_data)
            all_session_ch_players.update(ch_players)
            print(f"  Match {match_id}: {len(ch_players)} players")
            time.sleep(1)

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
                "cricheroes_match_id": all_match_ids[0],
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

        # Map CricHeroes players -> internal IDs
        played_internal_ids = set()
        for ch_pid, ch_name in all_session_ch_players.items():
            internal_id = ch_to_internal.get(ch_pid)
            if internal_id:
                played_internal_ids.add(internal_id)
            else:
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

    # Add newly unmatched to mapping file
    existing_unmatched_ids = {u["cricheroes_player_id"] for u in unmatched}
    for ch_pid, ch_name in newly_unmatched.items():
        if ch_pid not in existing_unmatched_ids and ch_pid not in ch_to_internal:
            unmatched.append({"cricheroes_player_id": ch_pid, "cricheroes_name": ch_name})
            changed = True

    if not changed:
        print("\nNo changes detected. Everything up to date.")
        return

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
