#!/usr/bin/env python3
"""
One-time migration: import all JSON data files into Supabase.

Usage:
    SUPABASE_URL=https://xxx.supabase.co \
    SUPABASE_SERVICE_KEY=eyJ... \
    python scripts/migrate_json_to_supabase.py

Requires: pip install requests
The SERVICE KEY (not anon key) is used so RLS policies are bypassed.
"""

import json
import os
import sys
from pathlib import Path

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

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',  # upsert behaviour
}

DATA_DIR = Path(__file__).parent.parent / 'public' / 'data'

COMPUTED_PLAYER_FIELDS = {'corpus_balance', 'total_paid', 'total_deducted', 'balance_status'}

# Fields in config.json that are GitHub-specific and not stored in Supabase
CONFIG_SKIP = {
    'schema_version', 'repo_owner', 'repo_name', 'data_branch',
    'github_oauth_client_id', 'github_oauth_proxy_url',
}


def load(filename):
    path = DATA_DIR / filename
    if not path.exists():
        print(f"  SKIP {filename} (file not found)")
        return None
    return json.loads(path.read_text(encoding='utf-8'))


def upsert(table, rows, chunk=500):
    if not rows:
        print(f"  {table}: 0 rows (skipped)")
        return
    total = 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i + chunk]
        r = requests.post(
            f'{SUPABASE_URL}/rest/v1/{table}',
            headers=HEADERS,
            json=batch,
        )
        if not r.ok:
            print(f"  ERROR inserting into {table}: {r.status_code} {r.text[:300]}")
            sys.exit(1)
        total += len(batch)
    print(f"  {table}: {total} rows inserted/updated")


def run():
    print("=== Matchbook -> Supabase migration ===\n")

    # 1. Tournaments (no FKs pointing inward — insert first)
    data = load('tournaments.json')
    if data:
        upsert('tournaments', data['tournaments'])

    # 2. Players (FK: sponsored_by_player_id → players.id — self-ref; insert in two passes if needed)
    data = load('players.json')
    if data:
        clean = [
            {k: v for k, v in p.items() if k not in COMPUTED_PLAYER_FIELDS}
            for p in data['players']
        ]
        # First pass: insert without the self-FK to avoid circular dependency
        no_sponsor = [{**p, 'sponsored_by_player_id': None} for p in clean]
        upsert('players', no_sponsor)
        # Second pass: set sponsored_by_player_id where it was populated
        sponsored = [p for p in clean if p.get('sponsored_by_player_id')]
        if sponsored:
            upsert('players', sponsored)

    # 3. Weeks (FK: tournament_id)
    # Normalize: all rows must have identical keys for PostgREST batch upsert
    data = load('weeks.json')
    if data:
        WEEK_DEFAULTS = {
            'cricheroes_match_ids': [],
            'corpus_present': 0,
            'total_present': 0,
            'total_cost': None,
        }
        weeks = [dict({**WEEK_DEFAULTS, **w}) for w in data['weeks']]
        upsert('weeks', weeks)

    # 4. Transactions (FK: player_id, week_id, tournament_id)
    data = load('transactions.json')
    if data:
        upsert('transactions', data['transactions'])

    # 5. Expenses (FK: tournament_id, week_id, paid_by_player_id)
    data = load('expenses.json')
    if data:
        EXPENSE_DEFAULTS = {'week_id': None, 'paid_by_player_id': None, 'recorded_by': ''}
        expenses = []
        for e in data['expenses']:
            row = dict({**EXPENSE_DEFAULTS, **e})
            if 'distribution' in row and 'split_among' not in row:
                row['split_among'] = row.pop('distribution')
            expenses.append(row)
        upsert('expenses', expenses)

    # 6. Attendance (FK: player_id, week_id, tournament_id)
    data = load('attendance.json')
    if data:
        upsert('attendance', data['records'])

    # 7. Config (single row, drop GitHub-specific fields)
    data = load('config.json')
    if data:
        cfg_row = {k: v for k, v in data.items() if k not in CONFIG_SKIP}
        cfg_row['id'] = 1
        upsert('config', [cfg_row])

    # 8. Announcements
    data = load('announcements.json')
    if data and data.get('announcements'):
        upsert('announcements', data['announcements'])

    # 9. Guest visits
    data = load('guest_visits.json')
    if data and data.get('guest_visits'):
        upsert('guest_visits', data['guest_visits'])

    # 10. Payment requests
    data = load('payment_requests.json')
    if data and data.get('requests'):
        upsert('payment_requests', data['requests'])

    # 11. CricHeroes mapping — stored as a single JSONB row
    data = load('cricheroes_mapping.json')
    if data:
        r = requests.post(
            f'{SUPABASE_URL}/rest/v1/cricheroes_mapping',
            headers=HEADERS,
            json={'id': 1, 'mapping': data},
        )
        if not r.ok:
            print(f"  ERROR inserting cricheroes_mapping: {r.status_code} {r.text[:300]}")
        else:
            print('  cricheroes_mapping: 1 row inserted/updated')

    print("\n=== Migration complete ===")
    print("Next: open Supabase Table Editor and verify row counts.")


if __name__ == '__main__':
    run()
