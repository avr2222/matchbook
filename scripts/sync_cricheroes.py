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


def fetch_commentary(match_id, team_id, inning_num):
    """Fetch ball-by-ball commentary for one innings from CricHeroes."""
    path = f"scorecard/v2/get-commentary/{match_id}?inning={inning_num}&teamId={team_id}"
    try:
        data = api_get(path)
        commentary = data.get("data", {}).get("commentary", [])
        if not commentary:
            # Show response structure to help diagnose API changes
            keys = list(data.keys()) if isinstance(data, dict) else type(data).__name__
            data_val = data.get("data") if isinstance(data, dict) else None
            data_keys = list(data_val.keys()) if isinstance(data_val, dict) else repr(data_val)[:120]
            print(f"  [commentary] match={match_id} inn={inning_num} teamId={team_id} → top_keys={keys} data_keys={data_keys}")
        return commentary
    except Exception as e:
        print(f"  Commentary fetch failed for match {match_id} inning {inning_num}: {e}")
        return []


def build_sc_name_to_ch_id(scorecard_data):
    """Build name→CricHeroes-player-id lookup from a scorecard."""
    lookup = {}
    for tk in ("team_a", "team_b"):
        for inn in scorecard_data.get(tk, {}).get("scorecard", []):
            for entry in inn.get("batting", []) + inn.get("bowling", []):
                pid  = str(entry.get("player_id", ""))
                name = re.sub(r"\s*\(c\s*&\s*wk\)|\s*\(wk\)|\s*\(c\)", "",
                               entry.get("name", ""), flags=re.I).strip()
                if pid and name:
                    lookup[name.lower()] = pid
    return lookup


def parse_ball_deliveries(commentary_list, match_id, week_id, tournament_id,
                           innings, batting_team, ch_to_internal, sc_name_to_ch_id):
    """Convert a CricHeroes commentary list into ball_deliveries rows."""
    rows = []
    for item in commentary_list:
        ob  = str(item.get("ball", "") or "")
        txt = str(item.get("commentary", "") or "")
        parts   = ob.split(".")
        over_n  = int(parts[0]) if parts and parts[0].isdigit() else 0
        ball_n  = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
        bowler_name  = str(item.get("bowler_name", "") or "").strip()
        batsman_name = str(item.get("batsman_name", "") or "").strip()
        bowler_ch  = sc_name_to_ch_id.get(bowler_name.lower(), "")
        batsman_ch = sc_name_to_ch_id.get(batsman_name.lower(), "")
        bowler_id  = ch_to_internal.get(bowler_ch) or None
        batsman_id = ch_to_internal.get(batsman_ch) or None
        extra      = str(item.get("extra_type_code", "") or "").upper()
        run_val    = int(item.get("run", 0) or 0)
        extra_val  = int(item.get("extra_run", 0) or 0)
        rows.append({
            "id":                  f"BALL_{match_id}_{innings}_{over_n}_{ball_n}",
            "cricheroes_match_id": str(match_id),
            "week_id":             week_id,
            "tournament_id":       tournament_id,
            "innings":             innings,
            "batting_team":        batting_team,
            "over_ball":           ob,
            "over_num":            over_n,
            "ball_num":            ball_n,
            "bowler_name":         bowler_name,
            "bowler_id":           bowler_id,
            "batsman_name":        batsman_name,
            "batsman_id":          batsman_id,
            "runs":                run_val,
            "extra_type":          extra,
            "extra_runs":          extra_val,
            "is_wicket":           int(bool(item.get("is_out", 0))),
            "is_boundary":         int(bool(item.get("is_boundry", 0))),
            "is_dot_ball":         1 if run_val == 0 and extra_val == 0 and not extra else 0,
            "commentary":          txt,
        })
    return rows


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
        wcount = wins[winner]
        loser_teams = [t for t in wins if t != winner]
        lcount = wins[loser_teams[0]] if loser_teams else 0
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
        "match_count": 1, "wides": 0, "no_balls": 0, "potm_count": 0,
        "ducks": 0, "bba_count": 0, "bbo_count": 0,
        "won_match": 0, "times_run_out": 0,
    }


def extract_performances_from_scorecard(scorecard_data, ch_to_internal, winning_team=""):
    """Extract per-player batting/bowling stats from one match scorecard.
    Returns {internal_player_id: stats_dict}. Unmapped CricHeroes players are skipped.
    winning_team: name of the winning team (used to set won_match=1 for that team's players).
    """
    NOT_OUT_TYPES = ("not out", "dnb", "did not bat", "absent", "retired hurt",
                     "absent hurt", "retired not out")
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
                # Count duck: scored 0 AND was dismissed
                if innings_runs == 0 and wkt and wkt.lower() not in NOT_OUT_TYPES:
                    p["ducks"] += 1
                # Times run-out from the batsman's perspective
                if "run out" in wkt.lower():
                    p["times_run_out"] += 1
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

    # Build name→ch_id lookup (shared helper reused for ball deliveries)
    sc_name_to_ch_id = build_sc_name_to_ch_id(scorecard_data)

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

    # Tag won_match=1 for all players on the winning team
    if winning_team:
        team_a_name = (scorecard_data.get("team_a") or {}).get("name", "")
        team_b_name = (scorecard_data.get("team_b") or {}).get("name", "")
        winner_key = ("team_a" if winning_team == team_a_name
                      else "team_b" if winning_team == team_b_name else None)
        if winner_key:
            for inn in scorecard_data.get(winner_key, {}).get("scorecard", []):
                for entry in inn.get("batting", []) + inn.get("bowling", []):
                    iid = ch_to_internal.get(str(entry.get("player_id", "")))
                    if iid and iid in perfs:
                        perfs[iid]["won_match"] = 1

    return perfs, sc_name_to_ch_id


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

    # Deduplicate mappings: for each CricHeroes player ID, keep the confirmed entry
    # if one exists, otherwise keep the last entry. Prevents UI showing the same
    # player multiple times when the sync runs repeatedly.
    _seen: dict = {}
    for m_ in mappings:
        pid = m_["cricheroes_player_id"]
        if pid not in _seen or m_.get("confirmed"):
            _seen[pid] = m_
    mappings = list(_seen.values())

    active_tournament_id = config["active_tournament_id"]
    match_fee            = config.get("default_match_fee", 500)
    tournament_url       = config.get("cricheroes_tournament_url", "")
    auto_deduct          = bool(config.get("auto_deduct_on_sync", False))

    existing_deduct_ids = set()
    if auto_deduct:
        deduct_rows = sb_get_all('transactions', select='id', filters='type=eq.match_deduction')
        existing_deduct_ids = {r['id'] for r in (deduct_rows or [])}
        print(f"  Auto-deduct enabled — {len(existing_deduct_ids)} existing match_deduction txn(s) loaded")

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

    # Load existing ball_deliveries match IDs once (used for skip-check and inner fetch)
    try:
        _ball_rows = sb_get_all('ball_deliveries', select='cricheroes_match_id')
        all_existing_ball_match_ids = {b["cricheroes_match_id"] for b in _ball_rows}
        print(f"  Existing ball delivery matches: {len(all_existing_ball_match_ids)}")
    except Exception as e:
        print(f"  ball_deliveries table not found — ball sync disabled ({e})")
        all_existing_ball_match_ids = None

    # Group by session date.
    # Include a session if: (a) it's new, OR (b) covered but missing performances,
    # OR (c) covered but missing ball deliveries, OR (d) covered but recent (last 7 days).
    from datetime import date as _dt_date
    _today = _dt_date.today()

    def _is_recent(d):
        try:
            return (_today - _dt_date.fromisoformat(d)).days <= 7
        except Exception:
            return False

    sessions = {}
    skipped_dates = set()
    for match in all_matches:
        match_date = match.get("match_start_time", "")[:10]
        if not match_date:
            continue
        covered = date_already_covered(match_date)
        actual_wid = resolve_week_id(match_date)
        needs_perfs = existing_perf_week_ids is not None and actual_wid not in existing_perf_week_ids
        needs_balls = (all_existing_ball_match_ids is not None and
                       str(match.get("match_id", "")) not in all_existing_ball_match_ids)
        if covered and not needs_perfs and not needs_balls and not _is_recent(match_date):
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
    new_balls        = []
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
                    "tournament_id":        active_tournament_id,
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
        print(f"  Mapping {len(all_session_ch_players)} CH players (covered={covered}, recent={_is_recent(match_date)})")
        for ch_pid, ch_name in all_session_ch_players.items():
            internal_id = ch_to_internal.get(ch_pid)
            if internal_id:
                print(f"  Already mapped: '{ch_name}' (CH:{ch_pid}) -> {internal_id}")
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
                    # Not confident enough to auto-confirm — save the suggestion for
                    # admin review AND create a guest so the player appears in the roster
                    # and is marked as played. Admin can confirm/merge later.
                    print(f"  Low-confidence: '{ch_name}' (CH:{ch_pid}) -> {best_id} (conf={confidence:.2f}) — creating guest, needs review")
                    mappings.append({
                        "cricheroes_player_id": ch_pid,
                        "cricheroes_name":      ch_name,
                        "player_id":            best_id,   # suggested match for admin
                        "match_confidence":     confidence,
                        "match_method":         "auto_fuzzy",
                        "confirmed":            False,
                    })
                    existing_ids = {p["id"] for p in players} | {p["id"] for p in new_players}
                    guest_id = f"PLY_G_{ch_pid}"
                    if guest_id not in existing_ids:
                        print(f"  Auto-creating guest for unconfirmed player: '{ch_name}' -> {guest_id}")
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
                            "notes":                 f"Auto-created (low-confidence match to {best_id}, conf={confidence:.2f})",
                        }
                        new_players.append(guest_row)
                        players.append(guest_row)
                        ch_to_internal[ch_pid] = guest_id
                    played_internal_ids.add(ch_to_internal.get(ch_pid, guest_id))
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

        # Build attendance for new sessions, AND re-run reconciliation for recent
        # covered sessions so newly-created guests get a 'played' record.
        if not covered or _is_recent(match_date):
            eff_week_id        = actual_wid  # honours pre-created week IDs (e.g. W_2026_05_17)
            existing_att_ids   = {r["id"] for r in attendance}
            active_player_ids  = {p["id"] for p in players if p.get("status") == "active"}
            active_player_ids |= {p["id"] for p in new_players if p.get("status") == "active"}

            att_by_id = {r["id"]: r for r in attendance}
            for pid in active_player_ids:
                att_id = f"ATT_{pid}_{eff_week_id}"
                status = "played" if pid in played_internal_ids else "absent"
                if att_id not in existing_att_ids:
                    new_attendance.append({
                        "id":            att_id,
                        "player_id":     pid,
                        "week_id":       eff_week_id,
                        "tournament_id": active_tournament_id,
                        "status":        status,
                        "source":        "cricheroes_sync",
                        "fee_deducted":  False,
                    })
                    changed = True
                elif status == "played":
                    # Record exists — update absent→played if it was sync-written and is now wrong
                    existing_rec = att_by_id.get(att_id)
                    if existing_rec and existing_rec.get("status") == "absent" and existing_rec.get("source") == "cricheroes_sync":
                        new_attendance.append({
                            "id":            att_id,
                            "player_id":     pid,
                            "week_id":       eff_week_id,
                            "tournament_id": active_tournament_id,
                            "status":        "played",
                            "source":        "cricheroes_sync",
                            "fee_deducted":  False,
                        })
                        changed = True

        # Extract per-game batting/bowling stats (one row per player per game)
        if need_performances and existing_perf_week_ids is not None:
            for game_idx, sd_tuple in enumerate(all_scorecard_data):
                sd, potm_id, bba_id, bbo_id = sd_tuple if len(sd_tuple) == 4 else (*sd_tuple, None, None)
                ch_match_id = all_match_ids[game_idx]
                match_winner = str(all_matches[game_idx].get("winning_team", "") or "")
                game_perfs, _sc_name_map = extract_performances_from_scorecard(
                    sd, ch_to_internal, winning_team=match_winner)
                for award_id, award_key in ((potm_id, "potm_count"), (bba_id, "bba_count"), (bbo_id, "bbo_count")):
                    if award_id:
                        if award_id not in game_perfs:
                            game_perfs[award_id] = _empty_perf()
                        game_perfs[award_id][award_key] = 1
                for internal_id, stats in game_perfs.items():
                    new_performances.append({
                        "id":                  f"PERF_{internal_id}_{ch_match_id}",
                        "player_id":           internal_id,
                        "week_id":             actual_wid,
                        "tournament_id":       active_tournament_id,
                        "cricheroes_match_id": ch_match_id,
                        **stats,
                    })

            if new_performances:
                print(f"  Extracted {len(new_performances)} per-game performance row(s)")
                changed = True

        # Fetch ball-by-ball commentary (runs independently of need_performances so that
        # sessions with existing match_performances still get their delivery data populated)
        if all_existing_ball_match_ids is not None and all_scorecard_data:
            for game_idx, sd_tuple in enumerate(all_scorecard_data):
                sd, _potm_id, _bba_id, _bbo_id = sd_tuple if len(sd_tuple) == 4 else (*sd_tuple, None, None)
                ch_match_id = all_match_ids[game_idx]
                if str(ch_match_id) in all_existing_ball_match_ids:
                    continue
                sc_name_map = build_sc_name_to_ch_id(sd)
                team_a_id = str((sd.get("team_a") or {}).get("team_id", "") or "")
                team_b_id = str((sd.get("team_b") or {}).get("team_id", "") or "")
                for inn_num, team_key, team_id in ((1, "team_a", team_a_id), (2, "team_b", team_b_id)):
                    batting_team_name = str((sd.get(team_key) or {}).get("name", "") or "")
                    if not team_id:
                        continue
                    commentary = fetch_commentary(ch_match_id, team_id, inn_num)
                    if commentary:
                        new_balls.extend(parse_ball_deliveries(
                            commentary, ch_match_id, actual_wid,
                            active_tournament_id, inn_num,
                            batting_team_name, ch_to_internal, sc_name_map))
            if new_balls:
                print(f"  Fetched {len(new_balls)} ball delivery record(s)")
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

    if auto_deduct and new_attendance:
        corpus_types = {'corpus', 'new'}
        player_map = {p['id']: p for p in players}
        for p in new_players:
            player_map[p['id']] = p

        # Merge existing + new attendance; new records take precedence
        all_att = {r['id']: r for r in attendance}
        for a in new_attendance:
            all_att[a['id']] = a

        affected_week_ids = {a['week_id'] for a in new_attendance if a['status'] == 'played'}

        new_deduct_txns = []
        balance_deltas  = {}  # player_id -> total to subtract

        for wid in affected_week_ids:
            week_obj  = next((w for w in weeks + new_weeks if w['week_id'] == wid), None)
            week_date = week_obj['match_date'] if week_obj else ''

            played_corpus = [
                r for r in all_att.values()
                if r['week_id'] == wid
                and r['status'] == 'played'
                and not r.get('fee_deducted')   # skip players marked free
                and player_map.get(r['player_id'], {}).get('type') in corpus_types
                and player_map.get(r['player_id'], {}).get('status') == 'active'
            ]
            if not played_corpus:
                continue

            per_fee = round(match_fee / len(played_corpus), 2)

            for rec in played_corpus:
                pid    = rec['player_id']
                txn_id = f"TXN_DEDUCT_{wid}_{pid}"
                if txn_id in existing_deduct_ids:
                    continue  # already deducted — idempotent

                new_deduct_txns.append({
                    'id':            txn_id,
                    'player_id':     pid,
                    'tournament_id': active_tournament_id,
                    'type':          'match_deduction',
                    'amount':        per_fee,
                    'direction':     'debit',
                    'date':          week_date,
                    'week_id':       wid,
                    'description':   f'Auto match fee - {wid}',
                    'recorded_by':   'cricheroes_sync',
                    'receipt_ref':   '',
                })
                balance_deltas[pid] = balance_deltas.get(pid, 0) - per_fee

        if new_deduct_txns:
            sb_upsert('transactions', new_deduct_txns)
            print(f"  Auto-deducted {len(new_deduct_txns)} match fee transaction(s)")
            # corpus_balance is computed live by the player_balances VIEW — no manual patch needed.
        else:
            print("  Auto-deduct: no new deductions needed (already up to date)")

    if new_performances:
        sb_upsert('match_performances', new_performances)
        print(f"  Saved {len(new_performances)} performance record(s)")

    if new_balls:
        sb_upsert('ball_deliveries', new_balls)
        print(f"  Saved {len(new_balls)} ball delivery record(s)")

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
