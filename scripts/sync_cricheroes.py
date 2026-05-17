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

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').strip().rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '').strip()

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


def sb_patch(table, row_filter, data):
    url = f'{SUPABASE_URL}/rest/v1/{table}?{row_filter}'
    r = requests.patch(url, headers={**SB_HEADERS, 'Prefer': 'return=minimal'}, json=data)
    if not r.ok:
        print(f"  ERROR patching {table}: {r.status_code} {r.text[:200]}")


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


def _clean_name(n):
    return n.strip().strip('\xa0').strip()


def parse_fielder_from_dismissal(dismissal_text):
    """Parse CricHeroes how_to_out text; returns (kind, fielder_name) or (None, None).
    kind: 'caught' | 'stumped' | 'run_out'
    CricHeroes format examples:
      'c seenu b Lokesh kumar YC'
      'st seenu b Srikanta Maddara'  (may have non-breaking space after 'st')
      'run out Pabitra / seenu'      (no parentheses)
      'run out seenu'
      'b Srikanta Maddara'           (bowled — no fielder)
      'not out'
    """
    d = str(dismissal_text or '').strip()
    # "c & b Jones" / "c and b Jones" — caught and bowled by same player
    m = re.match(r'^c\s*(?:&|and)\s*b\s+(.+)$', d, re.I)
    if m:
        return 'caught', _clean_name(m.group(1))
    # "c Smith b Jones"
    m = re.match(r'^c\s+(.+?)\s+b\s+', d, re.I)
    if m:
        return 'caught', _clean_name(m.group(1))
    # "st Smith b Jones" (may have \xa0 non-breaking space after 'st')
    m = re.match(r'^st[\s\xa0]+(.+?)\s+b\s+', d, re.I)
    if m:
        return 'stumped', _clean_name(m.group(1))
    # "run out Smith / Jones" or "run out Smith" — CricHeroes uses no parentheses
    m = re.match(r'^run\s*out\s+(.+)$', d, re.I)
    if m:
        name = _clean_name(m.group(1))
        if '/' in name:
            name = _clean_name(name.split('/')[-1])
        return 'run_out', name
    return None, None


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


def fetch_potm_for_match(match_id, scorecard_data):
    """Try several CricHeroes API endpoints to get POTM ch_player_id.
    Returns the CricHeroes player_id string, or None.
    """
    # Try match-detail API endpoint (returns a richer match object)
    try:
        detail = api_get(f"match/get-match-detail/{match_id}")
        d = detail.get("data") or {}
        if isinstance(d, list):
            d = d[0] if d else {}
        for key in ("player_of_the_match", "man_of_the_match", "mom", "potm", "manOfTheMatch"):
            potm_obj = d.get(key)
            if potm_obj:
                if isinstance(potm_obj, dict):
                    pid = str(potm_obj.get("player_id") or potm_obj.get("id") or "").strip()
                    name = str(potm_obj.get("player_name") or potm_obj.get("name") or "").strip()
                else:
                    pid, name = str(potm_obj).strip(), ""
                if pid and pid != "0":
                    print(f"  POTM (detail API): '{name}' (CH:{pid})")
                    return pid
    except Exception:
        pass

    # Try highlights/summary API
    try:
        hl = api_get(f"match/get-match-highlights/{match_id}")
        d = hl.get("data") or {}
        for key in ("player_of_the_match", "man_of_the_match", "mom", "potm"):
            potm_obj = d.get(key)
            if potm_obj and isinstance(potm_obj, dict):
                pid = str(potm_obj.get("player_id") or potm_obj.get("id") or "").strip()
                name = str(potm_obj.get("player_name") or potm_obj.get("name") or "").strip()
                if pid and pid != "0":
                    print(f"  POTM (highlights API): '{name}' (CH:{pid})")
                    return pid
    except Exception:
        pass

    # Fall back to HTML scraping (may be Cloudflare-blocked)
    t_name = scorecard_data.get("tournament_name", "")
    a_name = (scorecard_data.get("team_a") or {}).get("name", "")
    b_name = (scorecard_data.get("team_b") or {}).get("name", "")
    if t_name and a_name and b_name:
        def slugify(s):
            return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
        url = (f"https://cricheroes.com/scorecard/{match_id}"
               f"/{slugify(t_name)}/{slugify(a_name)}-vs-{slugify(b_name)}/scorecard")
        try:
            html_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-Dest": "document",
                "Referer": "https://cricheroes.com/",
            }
            resp = requests.get(url, headers=html_headers, timeout=15)
            if resp.status_code == 200:
                m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
                              resp.text, re.DOTALL)
                if m:
                    page_data = json.loads(m.group(1))
                    summary = (page_data.get("props", {})
                                        .get("pageProps", {})
                                        .get("summaryData", {})
                                        .get("data", {}))
                    potm = summary.get("player_of_the_match") or {}
                    ch_pid = str(potm.get("player_id") or "").strip()
                    potm_name = str(potm.get("player_name") or "").strip()
                    if ch_pid and ch_pid != "0":
                        print(f"  POTM (HTML): '{potm_name}' (CH:{ch_pid})")
                        return ch_pid
            else:
                print(f"  POTM HTML {resp.status_code} for match {match_id}")
        except Exception as e:
            print(f"  POTM HTML failed for {match_id}: {e}")

    return None


def _build_result(session_matches):
    """Format a human-readable result string from one or more match objects."""
    if len(session_matches) == 1:
        m = session_matches[0]
        result = str(m.get("match_result") or "").strip()
        if result:
            return result
        winner = str(m.get("winning_team") or "").strip()
        margin = str(m.get("win_by") or "").strip()
        if winner and margin:
            return f"{winner} won by {margin}"
        return winner or ""
    # Multiple games: tally wins per team
    wins = {}
    for m in session_matches:
        wt = str(m.get("winning_team") or "").strip()
        if wt:
            wins[wt] = wins.get(wt, 0) + 1
    if wins:
        winner = max(wins, key=wins.get)
        wcount  = wins[winner]
        lcount  = len(session_matches) - wcount
        return f"{winner} {wcount}-{lcount}"
    return ""


def _session_winner(session_matches):
    """Return the overall winning team name for a session (team with most match wins)."""
    wins = {}
    for m in session_matches:
        wt = str(m.get("winning_team") or "").strip()
        if wt:
            wins[wt] = wins.get(wt, 0) + 1
    return max(wins, key=wins.get) if wins else ""


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
    """Returns (scorecard_data, potm_ch_pid) where potm_ch_pid may be None."""
    data = api_get(f"scorecard/v2/get-scorecard/{match_id}")
    if not data.get("status"):
        print(f"  Warning: API returned status=false for match {match_id}")
        return {}, None
    inner = data.get("data", {})
    # Check if scorecard API includes POTM directly (field names vary)
    potm_ch_pid = None
    for key in ("player_of_the_match", "man_of_the_match", "mom", "potm"):
        potm_obj = inner.get(key) or data.get(key)
        if potm_obj:
            if isinstance(potm_obj, dict):
                pid = str(potm_obj.get("player_id") or potm_obj.get("id") or "").strip()
                name = str(potm_obj.get("player_name") or potm_obj.get("name") or "").strip()
            else:
                pid = str(potm_obj).strip()
                name = ""
            if pid and pid != "0":
                print(f"  POTM (API scorecard): '{name}' (CH:{pid})")
                potm_ch_pid = pid
                break
    return inner, potm_ch_pid


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


def _empty_perf():
    return {
        "runs": 0, "balls_faced": 0, "fours": 0, "sixes": 0,
        "dismissal": "", "batting_pos": None,
        "wickets": 0, "runs_given": 0, "balls_bowled": 0, "maidens": 0,
        "catches": 0, "run_outs": 0, "stumpings": 0,
        "match_count": 0, "wides": 0, "no_balls": 0, "potm_count": 0, "ducks": 0,
        "bba_count": 0, "bbo_count": 0,
    }


def extract_performances_from_scorecard(scorecard_data, ch_to_internal):
    """Extract per-player batting/bowling stats from one match scorecard.
    Returns {internal_player_id: stats_dict}. Unmapped CricHeroes players are skipped.
    """
    perfs = {}
    for team_key in ("team_a", "team_b"):
        team = scorecard_data.get(team_key, {})
        for innings in team.get("scorecard", []):
            for i, batter in enumerate(innings.get("batting", []), 1):
                ch_pid = str(batter.get("player_id", ""))
                internal_id = ch_to_internal.get(ch_pid)
                if not internal_id:
                    continue
                if internal_id not in perfs:
                    perfs[internal_id] = _empty_perf()
                p = perfs[internal_id]
                innings_runs = int(batter.get("runs", 0) or 0)
                p["runs"]        += innings_runs
                p["balls_faced"] += int(batter.get("balls", batter.get("balls_faced", 0)) or 0)
                p["fours"]       += int(batter.get("fours", batter.get("4s", 0)) or 0)
                p["sixes"]       += int(batter.get("sixes", batter.get("6s", 0)) or 0)
                # CricHeroes uses 'how_to_out'; fallback to legacy field names
                wkt = str(batter.get("how_to_out", batter.get("wicket_type", batter.get("dismissal", ""))) or "").strip()
                if not p["dismissal"]:
                    p["dismissal"] = wkt
                # Count duck: scored 0 AND was dismissed (not a not-out, retired, or DNB)
                NOT_OUT_TYPES = ("not out", "dnb", "did not bat", "absent", "retired hurt",
                                 "absent hurt", "retired not out")
                if innings_runs == 0 and wkt and wkt.lower() not in NOT_OUT_TYPES:
                    p["ducks"] += 1
                if p["batting_pos"] is None:
                    pos = batter.get("batting_position", batter.get("batting_pos", i))
                    p["batting_pos"] = int(pos) if pos is not None else i

            for bowler in innings.get("bowling", []):
                ch_pid = str(bowler.get("player_id", ""))
                internal_id = ch_to_internal.get(ch_pid)
                if not internal_id:
                    continue
                if internal_id not in perfs:
                    perfs[internal_id] = _empty_perf()
                p = perfs[internal_id]
                overs_str = str(bowler.get("overs", "0") or "0")
                parts = overs_str.split(".")
                balls = int(parts[0]) * 6 + (int(parts[1]) if len(parts) > 1 else 0)
                p["wickets"]      += int(bowler.get("wickets", 0) or 0)
                p["runs_given"]   += int(bowler.get("runs", 0) or 0)
                p["balls_bowled"] += balls
                p["maidens"]      += int(bowler.get("maidens", 0) or 0)
                p["wides"]        += int(bowler.get("wides",    bowler.get("wide",    0)) or 0)
                p["no_balls"]     += int(bowler.get("no_balls", bowler.get("noball", bowler.get("no_ball", 0))) or 0)

    # Build name→ch_id lookup from the full scorecard for fielder resolution
    sc_name_to_ch_id = {}
    for tk in ("team_a", "team_b"):
        for inn in scorecard_data.get(tk, {}).get("scorecard", []):
            for entry in inn.get("batting", []) + inn.get("bowling", []):
                _pid  = str(entry.get("player_id", ""))
                _name = re.sub(r"\s*\(c\s*&\s*wk\)|\s*\(wk\)|\s*\(c\)", "",
                               entry.get("name", ""), flags=re.I).strip()
                if _pid and _name:
                    sc_name_to_ch_id[_name.lower()] = _pid

    # Extract fielding (catches, stumpings, run_outs) from batting dismissal strings
    for tk in ("team_a", "team_b"):
        for inn in scorecard_data.get(tk, {}).get("scorecard", []):
            for batter in inn.get("batting", []):
                wkt_text = batter.get("how_to_out", batter.get("wicket_type", batter.get("dismissal", ""))) or ""
                kind, fielder_name = parse_fielder_from_dismissal(wkt_text)
                if not kind or not fielder_name:
                    continue
                ch_fid = sc_name_to_ch_id.get(fielder_name.lower())
                if not ch_fid:
                    best_sc, best_id = 0.0, None
                    for sc_name, sc_pid in sc_name_to_ch_id.items():
                        sc = difflib.SequenceMatcher(None, fielder_name.lower(), sc_name).ratio()
                        if sc > best_sc:
                            best_sc, best_id = sc, sc_pid
                    if best_sc >= 0.7:
                        ch_fid = best_id
                if not ch_fid:
                    continue
                fielder_internal = ch_to_internal.get(ch_fid)
                if not fielder_internal:
                    continue
                if fielder_internal not in perfs:
                    perfs[fielder_internal] = _empty_perf()
                if kind == 'caught':
                    perfs[fielder_internal]["catches"] += 1
                elif kind == 'stumped':
                    perfs[fielder_internal]["stumpings"] += 1
                elif kind == 'run_out':
                    perfs[fielder_internal]["run_outs"] += 1

    return perfs


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

    # Map match_date → actual DB week_id (handles ±1 day timezone offsets)
    date_to_week_id = {w["match_date"]: w["week_id"] for w in weeks}

    # Load existing performance week IDs to support backfill
    try:
        perf_rows = sb_get_all('match_performances', select='week_id')
        existing_perf_week_ids = {r['week_id'] for r in perf_rows}
        print(f"  Existing performance sessions: {len(existing_perf_week_ids)}")
    except Exception as e:
        print(f"  match_performances table not found — performance sync disabled ({e})")
        existing_perf_week_ids = None  # None = skip performance extraction entirely

    def date_already_covered(d):
        from datetime import date as dt_date
        try:
            parsed = dt_date.fromisoformat(d)
        except Exception:
            return False
        for delta in (-1, 0, 1):
            candidate = (parsed + timedelta(days=delta)).isoformat()
            if candidate in existing_session_dates:
                return True
        return False

    def resolve_week_id(match_date):
        """Return the actual DB week_id for this date, handling ±1 day tz offsets."""
        if match_date in date_to_week_id:
            return date_to_week_id[match_date]
        try:
            from datetime import date as dt_date
            parsed = dt_date.fromisoformat(match_date)
            for delta in (-1, 0, 1):
                candidate = (parsed + timedelta(days=delta)).isoformat()
                if candidate in date_to_week_id:
                    return date_to_week_id[candidate]
        except Exception:
            pass
        return f"W_{match_date.replace('-', '_')}"  # fallback: canonical format

    all_matches = get_tournament_matches(tournament_id)

    # Group by session date.
    # Include a session if: (a) it's new, OR (b) it's covered but missing performances.
    sessions = {}
    skipped_dates = set()
    for match in all_matches:
        match_date = match.get("match_start_time", "")[:10]
        if not match_date:
            continue
        covered = date_already_covered(match_date)
        actual_wid = resolve_week_id(match_date)
        needs_perfs = existing_perf_week_ids is not None and actual_wid not in existing_perf_week_ids
        if covered and not needs_perfs:
            if match_date not in skipped_dates:
                print(f"  Skipping {match_date} (already synced)")
                skipped_dates.add(match_date)
            continue
        sessions.setdefault(match_date, []).append(match)

    print(f"\nNew sessions to sync: {len(sessions)} dates — {sorted(sessions.keys())}")

    # Accumulate rows to upsert at the end
    new_players      = []
    new_weeks        = []
    new_attendance   = []
    new_performances = []
    changed          = False

    for match_date, session_matches in sorted(sessions.items()):
        covered   = date_already_covered(match_date)
        actual_wid = resolve_week_id(match_date)
        week_id   = f"W_{match_date.replace('-', '_')}"  # canonical ID for new weeks
        need_performances = existing_perf_week_ids is not None and actual_wid not in existing_perf_week_ids
        label = " — backfilling performances" if covered else ""
        print(f"\nProcessing session {match_date} ({len(session_matches)} game(s)){label}")

        all_session_ch_players = {}
        all_scorecard_data     = []
        all_match_ids = []
        team_a = team_b = ""
        for match in session_matches:
            match_id = str(match["match_id"])
            all_match_ids.append(match_id)
            team_a = match.get("team_a", team_a)
            team_b = match.get("team_b", team_b)
            scorecard_data, potm_from_scorecard = get_match_scorecard(match_id)
            # POTM: pom_player_id is in the match list object directly (most reliable)
            def _resolve_award(raw, label):
                pid = str(raw or "").strip()
                if not pid or pid == "0":
                    return None
                internal = ch_to_internal.get(pid)
                if internal:
                    print(f"  {label}: CH:{pid} -> {internal}")
                else:
                    print(f"  {label}: CH:{pid} not mapped")
                return internal

            potm_internal_id = _resolve_award(
                match.get("pom_player_id") or potm_from_scorecard, "POTM")
            bba_internal_id  = _resolve_award(match.get("bba_player_id"), "BBA")
            bbo_internal_id  = _resolve_award(match.get("bbo_player_id"), "BBO")
            all_scorecard_data.append((scorecard_data, potm_internal_id, bba_internal_id, bbo_internal_id))
            ch_players = extract_players_from_scorecard(scorecard_data)
            all_session_ch_players.update(ch_players)
            print(f"  Match {match_id}: {len(ch_players)} players")
            time.sleep(1)

        print(f"  Total unique players this session: {len(all_session_ch_players)}")

        if not covered and week_id not in existing_week_ids:
            # Brand-new session — create the week row
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
                "result":               _build_result(session_matches),
                "winning_team":         _session_winner(session_matches),
                "players_count":        len(all_session_ch_players),
                "notes":                f"{len(session_matches)} game(s)" if len(session_matches) > 1 else "",
            }
            new_weeks.append(week_row)
            existing_week_ids.add(week_id)
            existing_session_dates.add(match_date)
            changed = True
        elif not covered:
            # Week already exists (e.g. manually pre-created as 'scheduled').
            # Promote it to completed and fill in CricHeroes match IDs so the
            # app shows it and its attendance records become visible.
            existing_week = next((w for w in weeks if w["week_id"] == actual_wid), None)
            if not existing_week and actual_wid != week_id:
                existing_week = next((w for w in weeks if w["week_id"] == week_id), None)
            if not existing_week:
                print(f"  WARNING: no existing week found for {match_date} (tried {actual_wid}, {week_id})")
            if existing_week and (
                existing_week.get("status") != "completed"
                or not existing_week.get("cricheroes_match_id")
            ):
                updated = dict(existing_week)
                updated.update({
                    "status":               "completed",
                    "cricheroes_match_id":  all_match_ids[0],
                    "cricheroes_match_ids": all_match_ids,
                    "team_a":               team_a or existing_week.get("team_a", ""),
                    "team_b":               team_b or existing_week.get("team_b", ""),
                    "result":               _build_result(session_matches) or existing_week.get("result", ""),
                    "winning_team":         _session_winner(session_matches) or existing_week.get("winning_team", ""),
                    "players_count":        len(all_session_ch_players),
                })
                new_weeks.append(updated)
                existing_session_dates.add(match_date)
                changed = True
                print(f"  Promoted existing week {week_id} → completed")

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

        # Build attendance only for new (not previously synced) sessions.
        # Use actual_wid (the real DB week ID) so records link to the correct week row.
        if not covered:
            eff_week_id        = actual_wid  # honours pre-created week IDs (e.g. W_2026_05_17)
            existing_att_ids   = {r["id"] for r in attendance}
            active_player_ids  = {p["id"] for p in players if p.get("status") == "active"}
            active_player_ids |= {p["id"] for p in new_players if p.get("status") == "active"}

            for pid in active_player_ids:
                att_id = f"ATT_{pid}_{eff_week_id}"
                if att_id not in existing_att_ids:
                    new_attendance.append({
                        "id":            att_id,
                        "player_id":     pid,
                        "week_id":       eff_week_id,
                        "tournament_id": active_tournament_id,
                        "status":        "played" if pid in played_internal_ids else "absent",
                        "source":        "cricheroes_sync",
                        "fee_deducted":  False,
                    })
                    changed = True

        # Extract and aggregate batting/bowling stats for this session
        if need_performances and existing_perf_week_ids is not None:
            session_perfs = {}
            for sd_tuple in all_scorecard_data:
                sd, potm_id, bba_id, bbo_id = sd_tuple if len(sd_tuple) == 4 else (*sd_tuple, None, None)
                for internal_id, stats in extract_performances_from_scorecard(sd, ch_to_internal).items():
                    if internal_id not in session_perfs:
                        session_perfs[internal_id] = _empty_perf()
                    sp = session_perfs[internal_id]
                    for k in ("runs", "balls_faced", "fours", "sixes", "wickets",
                              "runs_given", "balls_bowled", "maidens", "catches",
                              "run_outs", "stumpings", "wides", "no_balls", "ducks"):
                        sp[k] += stats[k]
                    if not sp["dismissal"] and stats["dismissal"]:
                        sp["dismissal"] = stats["dismissal"]
                    if sp["batting_pos"] is None and stats["batting_pos"] is not None:
                        sp["batting_pos"] = stats["batting_pos"]
                    sp["match_count"] += 1
                for award_id, award_key in ((potm_id, "potm_count"), (bba_id, "bba_count"), (bbo_id, "bbo_count")):
                    if award_id:
                        if award_id not in session_perfs:
                            session_perfs[award_id] = _empty_perf()
                        session_perfs[award_id][award_key] += 1

            for internal_id, stats in session_perfs.items():
                new_performances.append({
                    "id":            f"PERF_{internal_id}_{actual_wid}",
                    "player_id":     internal_id,
                    "week_id":       actual_wid,  # use actual DB week_id (handles ±1 day offset)
                    "tournament_id": active_tournament_id,
                    **stats,
                })
            if session_perfs:
                print(f"  Extracted performances for {len(session_perfs)} player(s)")
                changed = True

    if not changed:
        print("\nNo changes detected. Everything up to date.")
        return

    # ── Backfill result for existing weeks that have empty result ────────────
    date_to_matches = {}
    for m in all_matches:
        d = m.get("match_start_time", "")[:10]
        if d:
            date_to_matches.setdefault(d, []).append(m)

    result_updates = 0
    for w in weeks:
        if w.get("result") or w.get("status") != "completed":
            continue
        d = w.get("match_date", "")
        matches_for_day = date_to_matches.get(d, [])
        if not matches_for_day:
            for delta in (-1, 1):
                from datetime import date as dt_date
                try:
                    alt = (dt_date.fromisoformat(d) + timedelta(days=delta)).isoformat()
                    matches_for_day = date_to_matches.get(alt, [])
                    if matches_for_day:
                        break
                except Exception:
                    pass
        if not matches_for_day:
            continue
        result_str = _build_result(matches_for_day)
        winner_str = _session_winner(matches_for_day)
        if result_str or winner_str:
            sb_patch('weeks', f'week_id=eq.{w["week_id"]}',
                     {'result': result_str, 'winning_team': winner_str})
            result_updates += 1
    if result_updates:
        print(f"  Backfilled result for {result_updates} week(s)")

    # ── Write all changes to Supabase ────────────────────────────────────────
    print("\nWriting changes to Supabase…")

    if new_players:
        sb_upsert('players', new_players)
        print(f"  Saved {len(new_players)} player(s)")

    if new_weeks:
        sb_upsert('weeks', new_weeks)
        print(f"  Saved {len(new_weeks)} week(s): {[w['week_id'] for w in new_weeks]}")

    if new_attendance:
        sb_upsert('attendance', new_attendance)
        played  = sum(1 for a in new_attendance if a['status'] == 'played')
        absent  = sum(1 for a in new_attendance if a['status'] == 'absent')
        print(f"  Saved {len(new_attendance)} attendance record(s) — {played} played, {absent} absent")

    if new_performances:
        sb_upsert('match_performances', new_performances)
        print(f"  Saved {len(new_performances)} performance record(s)")

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
