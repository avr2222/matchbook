#!/usr/bin/env python3
"""
CricHeroes Auto-Sync Script
Fetches match results via the CricHeroes internal API (api.cricheroes.in),
maps players to internal IDs, and writes directly to Supabase.

No browser, no proxy, no Cloudflare needed — works directly from GitHub Actions.

Usage:
  python scripts/sync_cricheroes.py

Environment variables:
  SUPABASE_URL          - Supabase project URL
  SUPABASE_SERVICE_KEY  - Service role key (bypasses RLS for writes)
"""

import json
import os
import re
import sys
import time
import difflib
from datetime import datetime, timedelta, timezone
import urllib.request
import urllib.error

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed. Run: pip install requests")
    sys.exit(1)

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
    sys.exit(1)

SB_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
}

# CricHeroes internal API
API_BASE = "https://api.cricheroes.in/api/v1"
API_HEADERS = {
    "api-key":     "cr!CkH3r0s",
    "device-type": "Chrome: 124.0.0.0",
    "udid":        "VIlqkQdJ",
    "Referer":     "https://cricheroes.com/",
    "Accept":      "application/json, text/plain, */*",
    "User-Agent":  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}


# ── Supabase helpers ──────────────────────────────────────────────────────────

def sb_get_all(table, select='*', filters=''):
    """Fetch all rows from a table, paginating automatically."""
    rows = []
    limit = 1000
    offset = 0
    while True:
        url = f'{SUPABASE_URL}/rest/v1/{table}?select={select}&limit={limit}&offset={offset}'
        if filters:
            url += f'&{filters}'
        r = requests.get(url, headers={**SB_HEADERS, 'Prefer': 'count=none'})
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows


def sb_get_one(table, select='*', filters=''):
    url = f'{SUPABASE_URL}/rest/v1/{table}?select={select}&limit=1'
    if filters:
        url += f'&{filters}'
    r = requests.get(url, headers={**SB_HEADERS, 'Prefer': 'count=none'})
    r.raise_for_status()
    data = r.json()
    return data[0] if data else None


def sb_upsert(table, rows, chunk=500):
    if not rows:
        return
    rows_list = rows if isinstance(rows, list) else [rows]
    for i in range(0, len(rows_list), chunk):
        r = requests.post(
            f'{SUPABASE_URL}/rest/v1/{table}',
            headers=SB_HEADERS,
            json=rows_list[i:i + chunk],
        )
        if not r.ok:
            print(f"  ERROR upserting {table}: {r.status_code} {r.text[:400]}")
            r.raise_for_status()
    print(f"  Saved {len(rows_list)} rows → {table}")


# ── CricHeroes API helpers ────────────────────────────────────────────────────

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
    best_score, best_id = 0.0, None
    name_lower = name.lower().strip()
    for player in candidates:
        candidate = player["display_name"].lower().strip()
        score = difflib.SequenceMatcher(None, name_lower, candidate).ratio()
        if player.get("cricheroes_name"):
            score2 = difflib.SequenceMatcher(None, name_lower, player["cricheroes_name"].lower().strip()).ratio()
            score = max(score, score2)
        if score > best_score:
            best_score, best_id = score, player["id"]
    if best_score >= threshold:
        return best_id, round(best_score, 3)
    return None, round(best_score, 3)


def get_tournament_matches(tournament_id):
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
    data = api_get(f"scorecard/v2/get-scorecard/{match_id}")
    if not data.get("status"):
        print(f"  Warning: API returned status=false for match {match_id}")
        return {}
    return data.get("data", {})


def extract_players_from_scorecard(scorecard_data):
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
    return seen


# ── Main sync logic ───────────────────────────────────────────────────────────

def sync():
    print("\n=== CricHeroes Sync (Supabase) ===")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}\n")

    # ── Load all data from Supabase ──────────────────────────────────────────
    config = sb_get_one('config', select='*', filters='id=eq.1')
    if not config:
        print("ERROR: config table is empty. Run the migration script first.")
        sys.exit(1)

    players    = sb_get_all('players')
    weeks      = sb_get_all('weeks')
    attendance = sb_get_all('attendance')

    # Load mapping (single JSONB row)
    mapping_row = sb_get_one('cricheroes_mapping', select='mapping', filters='id=eq.1')
    mapping_data = mapping_row.get('mapping', {}) if mapping_row else {}
    mappings     = mapping_data.get('player_mappings', [])
    unmatched    = mapping_data.get('unmatched', [])

    active_tournament_id = config["active_tournament_id"]
    match_fee            = config.get("default_match_fee", 500)
    tournament_url       = config.get("cricheroes_tournament_url", "")

    m = re.search(r"/tournament/(\d+)/", tournament_url)
    if not m:
        raise ValueError(f"Cannot extract tournament ID from URL: {tournament_url}")
    tournament_id = m.group(1)

    # Build lookup: cricheroes_player_id -> internal player_id
    ch_to_internal = {
        m_["cricheroes_player_id"]: m_["player_id"]
        for m_ in mappings
        if m_.get("confirmed") and m_.get("player_id")
    }
    for p in players:
        if p.get("cricheroes_player_id"):
            ch_to_internal.setdefault(str(p["cricheroes_player_id"]), p["id"])

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

    all_matches = get_tournament_matches(tournament_id)

    # Group by session date
    sessions = {}
    for match in all_matches:
        match_date = match.get("match_start_time", "")[:10]
        if not match_date or date_already_covered(match_date):
            continue
        sessions.setdefault(match_date, []).append(match)

    print(f"\nNew sessions to sync: {len(sessions)} dates — {sorted(sessions.keys())}")

    # Accumulate rows to upsert at the end
    new_players    = []
    new_weeks      = []
    new_attendance = []
    changed        = False

    for match_date, session_matches in sorted(sessions.items()):
        week_id = f"W_{match_date.replace('-', '_')}"
        print(f"\nProcessing session {match_date} ({len(session_matches)} game(s))")

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

        if week_id not in existing_week_ids:
            week_row = {
                "week_id":              week_id,
                "tournament_id":        active_tournament_id,
                "match_date":           match_date,
                "label":                datetime.strptime(match_date, "%Y-%m-%d").strftime("%b %d").lstrip("0"),
                "venue":                "Machaxi J Sports, Bengaluru",
                "match_fee":            match_fee,
                "status":               "completed",
                "cricheroes_match_id":  all_match_ids[0],
                "cricheroes_match_ids": all_match_ids,
                "team_a":               team_a,
                "team_b":               team_b,
                "result":               "",
                "players_count":        len(all_session_ch_players),
                "notes":                f"{len(session_matches)} game(s)" if len(session_matches) > 1 else "",
            }
            new_weeks.append(week_row)
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
                        "cricheroes_name":      ch_name,
                        "player_id":            best_id,
                        "match_confidence":     confidence,
                        "match_method":         "auto_fuzzy",
                        "confirmed":            True,
                    })
                    played_internal_ids.add(best_id)
                    changed = True
                elif confidence >= 0.5:
                    print(f"  Low-confidence: '{ch_name}' (CH:{ch_pid}) -> {best_id} (conf={confidence}) — needs review")
                    mappings.append({
                        "cricheroes_player_id": ch_pid,
                        "cricheroes_name":      ch_name,
                        "player_id":            best_id,
                        "match_confidence":     confidence,
                        "match_method":         "auto_fuzzy",
                        "confirmed":            False,
                    })
                    changed = True
                else:
                    existing_ids = {p["id"] for p in players} | {p["id"] for p in new_players}
                    guest_id = f"PLY_G_{ch_pid}"
                    if guest_id not in existing_ids:
                        print(f"  Auto-creating guest: '{ch_name}' (CH:{ch_pid}) -> {guest_id}")
                        guest_row = {
                            "id":                    guest_id,
                            "display_name":          ch_name,
                            "type":                  "guest",
                            "status":                "active",
                            "joined_date":           match_date,
                            "phone":                 "",
                            "github_username":       "",
                            "cricheroes_player_id":  ch_pid,
                            "cricheroes_name":       ch_name,
                            "guest_fee_mode":        "free",
                            "sponsored_by_player_id": None,
                            "notes":                 "Auto-created from CricHeroes",
                        }
                        new_players.append(guest_row)
                        players.append(guest_row)  # keep in-memory list current
                        mappings.append({
                            "cricheroes_player_id": ch_pid,
                            "cricheroes_name":      ch_name,
                            "player_id":            guest_id,
                            "match_confidence":     1.0,
                            "match_method":         "auto_guest",
                            "confirmed":            True,
                        })
                        ch_to_internal[ch_pid] = guest_id
                        changed = True
                    played_internal_ids.add(ch_to_internal.get(ch_pid, guest_id))

        # Build attendance records for every active player for this week
        existing_att_ids   = {r["id"] for r in attendance}
        active_player_ids  = {p["id"] for p in players if p.get("status") == "active"}
        active_player_ids |= {p["id"] for p in new_players if p.get("status") == "active"}

        for pid in active_player_ids:
            att_id = f"ATT_{pid}_{week_id}"
            if att_id not in existing_att_ids:
                new_attendance.append({
                    "id":            att_id,
                    "player_id":     pid,
                    "week_id":       week_id,
                    "tournament_id": active_tournament_id,
                    "status":        "played" if pid in played_internal_ids else "absent",
                    "source":        "cricheroes_sync",
                    "fee_deducted":  False,
                })
                changed = True

    if not changed:
        print("\nNo changes detected. Everything up to date.")
        return

    # ── Write all changes to Supabase ────────────────────────────────────────
    print("\nWriting changes to Supabase…")

    if new_players:
        sb_upsert('players', new_players)

    if new_weeks:
        sb_upsert('weeks', new_weeks)

    if new_attendance:
        sb_upsert('attendance', new_attendance)

    # Always update mapping so last_sync timestamp is current
    updated_mapping = {
        "player_mappings": mappings,
        "unmatched":       unmatched,
        "last_sync":       datetime.now(timezone.utc).isoformat(),
    }
    r = requests.post(
        f'{SUPABASE_URL}/rest/v1/cricheroes_mapping',
        headers=SB_HEADERS,
        json={'id': 1, 'mapping': updated_mapping, 'updated_at': datetime.now(timezone.utc).isoformat()},
    )
    r.raise_for_status()
    print("  Saved mapping → cricheroes_mapping")

    print(f"\nSync complete. {len(sessions)} session(s) processed.")


if __name__ == "__main__":
    sync()
