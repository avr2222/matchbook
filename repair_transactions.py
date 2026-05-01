#!/usr/bin/env python3
"""
Supabase transaction repair script.
Generates and inserts missing match_deduction and expense_deduction transactions.
"""

import json
import requests

BASE_URL = "https://tzcernzuwtwgrsattjaw.supabase.co/rest/v1"
API_KEY = "sb_secret_nyfXWpX2nEWP8azMu-Ip5A_iON9D5if"
HEADERS = {
    "apikey": API_KEY,
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}
TOURNAMENT_ID = "TRN_001"

# ─── Ground-truth from Excel (Corpus Summary sheet rows 6-40) ───────────────
EXCEL_DATA = {
    # player_name: (total_paid, match_deducted, expense_deducted, balance)
    "Vinod":          (1000,   923.1784456,   45.28571429,  31.53584008),
    "Pavan":          (1000,   997.82,        45.28571429, -43.10571429),
    "Venkat":         (2000,  1077.084182,    45.28571429, 877.6301035),
    "Leela":          (2000,  1445.396541,    45.28571429, 509.3177448),
    "Sudheer(Raaga)": (1180,   644.4423058,   45.28571429, 490.2719799),
    "Mahesh Amaran":  (1000,   976.4742351,   45.28571429, -21.75994939),
    "Jithin":         (1000,   901.5641822,   45.28571429,  53.15010352),
    "Mithun":         (1000,   970.8965409,   45.28571429, -16.18225515),
    "Kranthi":        (1500,   698.0102975,   45.28571429, 756.7039882),
    "Azeed":          (1000,   771.82,        45.28571429, 182.8942857),
    "Srikanta":       (6880,  1620.916541,    45.28571429, 5213.797745),
    "Arun":           (2000,  1417.090454,    45.28571429,  537.6238318),
    "Vinay":          (3850,  1620.916541,    45.28571429, 2183.797745),
    "Sreenu":         (1000,   424.02,        45.28571429,  530.6942857),
    "Balaji":         (2000,   925.9942351,   45.28571429, 1028.720051),
    "Arun(Raaga)":    (1000,   925.9942351,   45.28571429,   28.72005061),
    "Subbu":          (1000,  1375.23233,     45.28571429, -420.5180446),
    "Satyam":         (1000,   677.4942351,   45.28571429,  277.2200506),
    "Mahesh Reddy":   (1000,   624.7580952,   45.28571429,  329.9561905),
    "Murali":         (1000,  1417.090454,    45.28571429, -462.3761682),
    "Ashok":          (2000,  1015.570454,    45.28571429,  939.1438318),
    "Vishwa":         (1000,   175.52,        45.28571429,  779.1942857),
    "Raj":            (2000,  1151.994235,    45.28571429,  802.7200506),
    "Pabitra":        (1000,  1322.768393,    45.28571429, -368.054107),
    "Ashiq":          (1000,   501.9742351,   45.28571429,  452.7400506),
    "Lokesh":         (3500,  1715.242306,    45.28571429, 1739.47198),
    "Srinivas":       (2000,  1620.916541,    45.28571429,  333.7977448),
    "Deepak":         (1000,   401.52,        45.28571429,  553.1942857),
    "Firoz":          (2000,   993.0704539,   45.28571429,  961.6438318),
    "Sudheer":        (2000,  1397.678446,    45.28571429,  557.0358401),
    "Gopi":           (2000,  1394.916541,    45.28571429,  559.7977448),
    "Manjunath":      (2000,  1394.916541,    45.28571429,  559.7977448),
    "Ashok adapala":  (2000,   921.2483927,   45.28571429, 1033.465893),   # "Ashok(Raaga)" in Excel row 38
    "RK":             (2000,  1077.084182,    45.28571429,  877.6301035),
    "Vijay":          (1000,   720.1842105,   45.28571429,  234.5300752),
}

# ─── Data fetched from Supabase ──────────────────────────────────────────────

weeks = [
    {"week_id": "W_2026_04_25", "match_date": "2026-04-25", "match_fee": 500.00,  "label": "Apr 25"},
    {"week_id": "W_2026_04_05", "match_date": "2026-04-05", "match_fee": 246.00,  "label": "05-Apr-2026"},
    {"week_id": "W_2026_03_29", "match_date": "2026-03-29", "match_fee": 350.00,  "label": "29-Mar-2026"},
    {"week_id": "W_2026_03_22", "match_date": "2026-03-22", "match_fee": 213.00,  "label": "22-Mar-2026"},
    {"week_id": "W_2026_03_15", "match_date": "2026-03-15", "match_fee": 269.00,  "label": "15-Mar-2026"},
    {"week_id": "W_2026_03_08", "match_date": "2026-03-08", "match_fee": 234.00,  "label": "08-Mar-2026"},
    {"week_id": "W_2026_03_01", "match_date": "2026-03-01", "match_fee": 237.00,  "label": "01-Mar-2026"},
    {"week_id": "W_2026_02_22", "match_date": "2026-02-22", "match_fee": 176.00,  "label": "22-Feb-2026"},
]

players = [
    {"id": "PLY_001", "display_name": "Vinod",          "type": "corpus"},
    {"id": "PLY_002", "display_name": "Pavan",          "type": "corpus"},
    {"id": "PLY_003", "display_name": "Venkat",         "type": "corpus"},
    {"id": "PLY_004", "display_name": "Leela",          "type": "corpus"},
    {"id": "PLY_005", "display_name": "Sudheer(Raaga)", "type": "corpus"},
    {"id": "PLY_006", "display_name": "Mahesh Amaran",  "type": "corpus"},
    {"id": "PLY_007", "display_name": "Jithin",         "type": "corpus"},
    {"id": "PLY_008", "display_name": "Mithun",         "type": "corpus"},
    {"id": "PLY_009", "display_name": "Kranthi",        "type": "corpus"},
    {"id": "PLY_010", "display_name": "Azeed",          "type": "corpus"},
    {"id": "PLY_011", "display_name": "Srikanta",       "type": "corpus"},
    {"id": "PLY_012", "display_name": "Arun",           "type": "corpus"},
    {"id": "PLY_013", "display_name": "Vinay",          "type": "corpus"},
    {"id": "PLY_014", "display_name": "Sreenu",         "type": "corpus"},
    {"id": "PLY_015", "display_name": "Balaji",         "type": "corpus"},
    {"id": "PLY_016", "display_name": "Arun(Raaga)",    "type": "corpus"},
    {"id": "PLY_017", "display_name": "Subbu",          "type": "corpus"},
    {"id": "PLY_018", "display_name": "Satyam",         "type": "corpus"},
    {"id": "PLY_019", "display_name": "Mahesh Reddy",   "type": "corpus"},
    {"id": "PLY_020", "display_name": "Murali",         "type": "corpus"},
    {"id": "PLY_021", "display_name": "Ashok",          "type": "corpus"},
    {"id": "PLY_022", "display_name": "Vishwa",         "type": "corpus"},
    {"id": "PLY_023", "display_name": "Raj",            "type": "corpus"},
    {"id": "PLY_024", "display_name": "Pabitra",        "type": "corpus"},
    {"id": "PLY_025", "display_name": "Ashiq",          "type": "corpus"},
    {"id": "PLY_026", "display_name": "Lokesh",         "type": "corpus"},
    {"id": "PLY_027", "display_name": "Srinivas",       "type": "corpus"},
    {"id": "PLY_028", "display_name": "Deepak",         "type": "corpus"},
    {"id": "PLY_029", "display_name": "Firoz",          "type": "corpus"},
    {"id": "PLY_030", "display_name": "Sudheer",        "type": "corpus"},
    {"id": "PLY_031", "display_name": "Gopi",           "type": "corpus"},
    {"id": "PLY_032", "display_name": "Manjunath",      "type": "corpus"},
    {"id": "PLY_033", "display_name": "Ashok adapala",  "type": "corpus"},
    {"id": "PLY_034", "display_name": "RK",             "type": "corpus"},
    {"id": "PLY_035", "display_name": "Vijay",          "type": "corpus"},
    {"id": "PLY_036", "display_name": "Girish",         "type": "ppm"},
    {"id": "PLY_037", "display_name": "Sharath",        "type": "ppm"},
    {"id": "PLY_038", "display_name": "Puneet(Pavan Bro)", "type": "ppm"},
    {"id": "PLY_039", "display_name": "Azeed Friend",   "type": "ppm"},
    {"id": "PLY_040", "display_name": "Karthik Reddy",  "type": "ppm"},
    {"id": "PLY_G_ABHISHIKTH", "display_name": "Abhishikth Reddy", "type": "guest"},
    {"id": "PLY_G_PHANINDRA",  "display_name": "Phanindra Y",       "type": "guest"},
]

# attendance: list of {player_id, week_id, status}
attendance_raw = [
    # W_2026_02_22
    ("PLY_001","W_2026_02_22","played"),("PLY_002","W_2026_02_22","played"),("PLY_003","W_2026_02_22","played"),
    ("PLY_004","W_2026_02_22","absent"),("PLY_005","W_2026_02_22","played"),("PLY_006","W_2026_02_22","absent"),
    ("PLY_007","W_2026_02_22","absent"),("PLY_008","W_2026_02_22","absent"),("PLY_009","W_2026_02_22","absent"),
    ("PLY_010","W_2026_02_22","played"),("PLY_011","W_2026_02_22","played"),("PLY_012","W_2026_02_22","played"),
    ("PLY_013","W_2026_02_22","played"),("PLY_014","W_2026_02_22","played"),("PLY_015","W_2026_02_22","played"),
    ("PLY_016","W_2026_02_22","played"),("PLY_017","W_2026_02_22","played"),("PLY_018","W_2026_02_22","played"),
    ("PLY_019","W_2026_02_22","played"),("PLY_020","W_2026_02_22","played"),("PLY_021","W_2026_02_22","absent"),
    ("PLY_022","W_2026_02_22","played"),("PLY_023","W_2026_02_22","played"),("PLY_024","W_2026_02_22","played"),
    ("PLY_025","W_2026_02_22","absent"),("PLY_026","W_2026_02_22","played"),("PLY_027","W_2026_02_22","played"),
    ("PLY_028","W_2026_02_22","played"),("PLY_029","W_2026_02_22","absent"),("PLY_030","W_2026_02_22","played"),
    ("PLY_031","W_2026_02_22","played"),("PLY_032","W_2026_02_22","played"),("PLY_033","W_2026_02_22","absent"),
    ("PLY_034","W_2026_02_22","played"),("PLY_035","W_2026_02_22","absent"),
    # W_2026_03_01
    ("PLY_001","W_2026_03_01","absent"),("PLY_002","W_2026_03_01","played"),("PLY_003","W_2026_03_01","played"),
    ("PLY_004","W_2026_03_01","played"),("PLY_005","W_2026_03_01","absent"),("PLY_006","W_2026_03_01","played"),
    ("PLY_007","W_2026_03_01","played"),("PLY_008","W_2026_03_01","absent"),("PLY_009","W_2026_03_01","absent"),
    ("PLY_010","W_2026_03_01","absent"),("PLY_011","W_2026_03_01","played"),("PLY_012","W_2026_03_01","played"),
    ("PLY_013","W_2026_03_01","played"),("PLY_014","W_2026_03_01","absent"),("PLY_015","W_2026_03_01","absent"),
    ("PLY_016","W_2026_03_01","absent"),("PLY_017","W_2026_03_01","played"),("PLY_018","W_2026_03_01","absent"),
    ("PLY_019","W_2026_03_01","played"),("PLY_020","W_2026_03_01","played"),("PLY_021","W_2026_03_01","absent"),
    ("PLY_022","W_2026_03_01","absent"),("PLY_023","W_2026_03_01","played"),("PLY_024","W_2026_03_01","played"),
    ("PLY_025","W_2026_03_01","absent"),("PLY_026","W_2026_03_01","played"),("PLY_027","W_2026_03_01","played"),
    ("PLY_028","W_2026_03_01","played"),("PLY_029","W_2026_03_01","played"),("PLY_030","W_2026_03_01","played"),
    ("PLY_031","W_2026_03_01","absent"),("PLY_032","W_2026_03_01","absent"),("PLY_033","W_2026_03_01","absent"),
    ("PLY_034","W_2026_03_01","played"),("PLY_035","W_2026_03_01","played"),
    # W_2026_03_08
    ("PLY_001","W_2026_03_08","absent"),("PLY_002","W_2026_03_08","absent"),("PLY_003","W_2026_03_08","played"),
    ("PLY_004","W_2026_03_08","played"),("PLY_005","W_2026_03_08","played"),("PLY_006","W_2026_03_08","absent"),
    ("PLY_007","W_2026_03_08","played"),("PLY_008","W_2026_03_08","played"),("PLY_009","W_2026_03_08","absent"),
    ("PLY_010","W_2026_03_08","absent"),("PLY_011","W_2026_03_08","played"),("PLY_012","W_2026_03_08","played"),
    ("PLY_013","W_2026_03_08","played"),("PLY_014","W_2026_03_08","absent"),("PLY_015","W_2026_03_08","absent"),
    ("PLY_016","W_2026_03_08","absent"),("PLY_017","W_2026_03_08","played"),("PLY_018","W_2026_03_08","absent"),
    ("PLY_019","W_2026_03_08","played"),("PLY_020","W_2026_03_08","played"),("PLY_021","W_2026_03_08","played"),
    ("PLY_022","W_2026_03_08","absent"),("PLY_023","W_2026_03_08","absent"),("PLY_024","W_2026_03_08","played"),
    ("PLY_025","W_2026_03_08","absent"),("PLY_026","W_2026_03_08","played"),("PLY_027","W_2026_03_08","played"),
    ("PLY_028","W_2026_03_08","absent"),("PLY_029","W_2026_03_08","played"),("PLY_030","W_2026_03_08","absent"),
    ("PLY_031","W_2026_03_08","played"),("PLY_032","W_2026_03_08","played"),("PLY_033","W_2026_03_08","played"),
    ("PLY_034","W_2026_03_08","played"),("PLY_035","W_2026_03_08","absent"),
    # W_2026_03_15
    ("PLY_001","W_2026_03_15","absent"),("PLY_002","W_2026_03_15","absent"),("PLY_003","W_2026_03_15","played"),
    ("PLY_004","W_2026_03_15","played"),("PLY_005","W_2026_03_15","absent"),("PLY_006","W_2026_03_15","played"),
    ("PLY_007","W_2026_03_15","played"),("PLY_008","W_2026_03_15","absent"),("PLY_009","W_2026_03_15","played"),
    ("PLY_010","W_2026_03_15","absent"),("PLY_011","W_2026_03_15","played"),("PLY_012","W_2026_03_15","played"),
    ("PLY_013","W_2026_03_15","played"),("PLY_014","W_2026_03_15","played"),("PLY_015","W_2026_03_15","played"),
    ("PLY_016","W_2026_03_15","played"),("PLY_017","W_2026_03_15","played"),("PLY_018","W_2026_03_15","absent"),
    ("PLY_019","W_2026_03_15","absent"),("PLY_020","W_2026_03_15","played"),("PLY_021","W_2026_03_15","played"),
    ("PLY_022","W_2026_03_15","absent"),("PLY_023","W_2026_03_15","played"),("PLY_024","W_2026_03_15","played"),
    ("PLY_025","W_2026_03_15","absent"),("PLY_026","W_2026_03_15","played"),("PLY_027","W_2026_03_15","played"),
    ("PLY_028","W_2026_03_15","absent"),("PLY_029","W_2026_03_15","absent"),("PLY_030","W_2026_03_15","played"),
    ("PLY_031","W_2026_03_15","played"),("PLY_032","W_2026_03_15","played"),("PLY_033","W_2026_03_15","played"),
    ("PLY_034","W_2026_03_15","played"),("PLY_035","W_2026_03_15","played"),
    # W_2026_03_22
    ("PLY_001","W_2026_03_22","played"),("PLY_002","W_2026_03_22","absent"),("PLY_003","W_2026_03_22","played"),
    ("PLY_004","W_2026_03_22","played"),("PLY_005","W_2026_03_22","absent"),("PLY_006","W_2026_03_22","played"),
    ("PLY_007","W_2026_03_22","played"),("PLY_008","W_2026_03_22","played"),("PLY_009","W_2026_03_22","played"),
    ("PLY_010","W_2026_03_22","absent"),("PLY_011","W_2026_03_22","played"),("PLY_012","W_2026_03_22","absent"),
    ("PLY_013","W_2026_03_22","played"),("PLY_014","W_2026_03_22","absent"),("PLY_015","W_2026_03_22","played"),
    ("PLY_016","W_2026_03_22","played"),("PLY_017","W_2026_03_22","played"),("PLY_018","W_2026_03_22","played"),
    ("PLY_019","W_2026_03_22","absent"),("PLY_020","W_2026_03_22","absent"),("PLY_021","W_2026_03_22","absent"),
    ("PLY_022","W_2026_03_22","absent"),("PLY_023","W_2026_03_22","played"),("PLY_024","W_2026_03_22","played"),
    ("PLY_025","W_2026_03_22","played"),("PLY_026","W_2026_03_22","absent"),("PLY_027","W_2026_03_22","played"),
    ("PLY_028","W_2026_03_22","absent"),("PLY_029","W_2026_03_22","absent"),("PLY_030","W_2026_03_22","played"),
    ("PLY_031","W_2026_03_22","played"),("PLY_032","W_2026_03_22","played"),("PLY_033","W_2026_03_22","played"),
    ("PLY_034","W_2026_03_22","played"),("PLY_035","W_2026_03_22","absent"),
    # W_2026_03_29
    ("PLY_001","W_2026_03_29","played"),("PLY_002","W_2026_03_29","played"),("PLY_003","W_2026_03_29","absent"),
    ("PLY_004","W_2026_03_29","played"),("PLY_005","W_2026_03_29","absent"),("PLY_006","W_2026_03_29","played"),
    ("PLY_007","W_2026_03_29","absent"),("PLY_008","W_2026_03_29","played"),("PLY_009","W_2026_03_29","absent"),
    ("PLY_010","W_2026_03_29","played"),("PLY_011","W_2026_03_29","played"),("PLY_012","W_2026_03_29","played"),
    ("PLY_013","W_2026_03_29","played"),("PLY_014","W_2026_03_29","absent"),("PLY_015","W_2026_03_29","played"),
    ("PLY_016","W_2026_03_29","played"),("PLY_017","W_2026_03_29","played"),("PLY_018","W_2026_03_29","played"),
    ("PLY_019","W_2026_03_29","absent"),("PLY_020","W_2026_03_29","played"),("PLY_021","W_2026_03_29","played"),
    ("PLY_022","W_2026_03_29","absent"),("PLY_023","W_2026_03_29","played"),("PLY_024","W_2026_03_29","absent"),
    ("PLY_025","W_2026_03_29","played"),("PLY_026","W_2026_03_29","played"),("PLY_027","W_2026_03_29","played"),
    ("PLY_028","W_2026_03_29","absent"),("PLY_029","W_2026_03_29","played"),("PLY_030","W_2026_03_29","played"),
    ("PLY_031","W_2026_03_29","played"),("PLY_032","W_2026_03_29","played"),("PLY_033","W_2026_03_29","absent"),
    ("PLY_034","W_2026_03_29","absent"),("PLY_035","W_2026_03_29","absent"),
    # W_2026_04_05
    ("PLY_001","W_2026_04_05","played"),("PLY_002","W_2026_04_05","absent"),("PLY_003","W_2026_04_05","absent"),
    ("PLY_004","W_2026_04_05","played"),("PLY_005","W_2026_04_05","played"),("PLY_006","W_2026_04_05","absent"),
    ("PLY_007","W_2026_04_05","absent"),("PLY_008","W_2026_04_05","played"),("PLY_009","W_2026_04_05","played"),
    ("PLY_010","W_2026_04_05","absent"),("PLY_011","W_2026_04_05","played"),("PLY_012","W_2026_04_05","played"),
    ("PLY_013","W_2026_04_05","played"),("PLY_014","W_2026_04_05","absent"),("PLY_015","W_2026_04_05","absent"),
    ("PLY_016","W_2026_04_05","absent"),("PLY_017","W_2026_04_05","absent"),("PLY_018","W_2026_04_05","absent"),
    ("PLY_019","W_2026_04_05","absent"),("PLY_020","W_2026_04_05","played"),("PLY_021","W_2026_04_05","played"),
    ("PLY_022","W_2026_04_05","absent"),("PLY_023","W_2026_04_05","absent"),("PLY_024","W_2026_04_05","played"),
    ("PLY_025","W_2026_04_05","absent"),("PLY_026","W_2026_04_05","played"),("PLY_027","W_2026_04_05","played"),
    ("PLY_028","W_2026_04_05","absent"),("PLY_029","W_2026_04_05","played"),("PLY_030","W_2026_04_05","played"),
    ("PLY_031","W_2026_04_05","played"),("PLY_032","W_2026_04_05","played"),("PLY_033","W_2026_04_05","played"),
    ("PLY_034","W_2026_04_05","absent"),("PLY_035","W_2026_04_05","played"),
    # W_2026_04_25
    ("PLY_040","W_2026_04_25","played"),("PLY_036","W_2026_04_25","absent"),("PLY_027","W_2026_04_25","absent"),
    ("PLY_012","W_2026_04_25","played"),("PLY_029","W_2026_04_25","played"),("PLY_015","W_2026_04_25","absent"),
    ("PLY_020","W_2026_04_25","absent"),("PLY_018","W_2026_04_25","absent"),("PLY_023","W_2026_04_25","played"),
    ("PLY_022","W_2026_04_25","absent"),("PLY_028","W_2026_04_25","absent"),("PLY_033","W_2026_04_25","absent"),
    ("PLY_037","W_2026_04_25","absent"),("PLY_006","W_2026_04_25","played"),("PLY_039","W_2026_04_25","absent"),
    ("PLY_004","W_2026_04_25","played"),("PLY_034","W_2026_04_25","played"),("PLY_008","W_2026_04_25","absent"),
    ("PLY_010","W_2026_04_25","played"),("PLY_024","W_2026_04_25","played"),("PLY_009","W_2026_04_25","absent"),
    ("PLY_025","W_2026_04_25","absent"),("PLY_021","W_2026_04_25","absent"),("PLY_014","W_2026_04_25","played"),
    ("PLY_035","W_2026_04_25","absent"),("PLY_013","W_2026_04_25","played"),("PLY_003","W_2026_04_25","absent"),
    ("PLY_002","W_2026_04_25","played"),("PLY_032","W_2026_04_25","played"),("PLY_005","W_2026_04_25","absent"),
    ("PLY_007","W_2026_04_25","played"),("PLY_030","W_2026_04_25","played"),("PLY_038","W_2026_04_25","absent"),
    ("PLY_031","W_2026_04_25","absent"),("PLY_026","W_2026_04_25","played"),("PLY_019","W_2026_04_25","absent"),
    ("PLY_016","W_2026_04_25","absent"),("PLY_017","W_2026_04_25","played"),("PLY_011","W_2026_04_25","played"),
    ("PLY_001","W_2026_04_25","absent"),
    ("PLY_G_ABHISHIKTH","W_2026_04_25","played"),("PLY_G_PHANINDRA","W_2026_04_25","played"),
]

# expenses from Supabase (only those split_among='all_corpus' that need per-player deductions)
expenses = [
    {"id": "EXP_1",  "date": "2026-03-08", "amount": 700.00,  "description": "Cricket Bat — 700",         "share_per_player": 20.00,    "split_among": "all_corpus"},
    {"id": "EXP_2",  "date": "2026-03-08", "amount": 440.00,  "description": "Vickey Balls 440",          "share_per_player": 12.57,    "split_among": "all_corpus"},
    {"id": "EXP_3",  "date": "2026-03-28", "amount": 445.00,  "description": "Vicky Balls By Srini",      "share_per_player": 12.71,    "split_among": "all_corpus"},
    {"id": "EXP_4",  "date": "2026-04-10", "amount": 1585.00, "description": "Misc expenses",             "share_per_player": 45.29,    "split_among": "all_corpus"},
    # week-based expenses (split_among='week_present') -- match_deduction handles these via match_fee
    # We do NOT generate separate expense_deduction for week_present -- those are already baked into match_fee
]

# existing transaction IDs (all are corpus_payment credits -- no deductions exist yet)
existing_txn_ids = {
    "TXN_PAY_PLY_001_0","TXN_PAY_PLY_002_1","TXN_PAY_PLY_003_2","TXN_PAY_PLY_004_3",
    "TXN_PAY_PLY_005_4","TXN_PAY_PLY_006_5","TXN_PAY_PLY_007_6","TXN_PAY_PLY_008_7",
    "TXN_PAY_PLY_009_8","TXN_PAY_PLY_010_9","TXN_PAY_PLY_011_10","TXN_PAY_PLY_012_11",
    "TXN_PAY_PLY_013_12","TXN_PAY_PLY_014_13","TXN_PAY_PLY_015_14","TXN_PAY_PLY_016_15",
    "TXN_PAY_PLY_017_16","TXN_PAY_PLY_018_17","TXN_PAY_PLY_019_18","TXN_PAY_PLY_020_19",
    "TXN_PAY_PLY_021_20","TXN_PAY_PLY_022_21","TXN_PAY_PLY_023_22","TXN_PAY_PLY_024_23",
    "TXN_PAY_PLY_025_24","TXN_PAY_PLY_026_25","TXN_PAY_PLY_027_26","TXN_PAY_PLY_028_27",
    "TXN_PAY_PLY_029_28","TXN_PAY_PLY_030_29","TXN_PAY_PLY_031_30","TXN_PAY_PLY_032_31",
    "TXN_PAY_PLY_033_32","TXN_PAY_PLY_034_33","TXN_PAY_PLY_035_34",
}

# ─── Build lookup maps ───────────────────────────────────────────────────────
player_map = {p["id"]: p for p in players}
week_map   = {w["week_id"]: w for w in weeks}

corpus_player_ids = {p["id"] for p in players if p["type"] in ("corpus", "new")}

# ─── STEP 3: Generate match_deduction transactions ──────────────────────────
new_txns = []

for pid, wid, status in attendance_raw:
    if status != "played":
        continue
    if pid not in corpus_player_ids:
        continue  # skip ppm/guest
    week = week_map[wid]
    txn_id = f"TXN_DEDUCT_{wid}_{pid}"
    if txn_id in existing_txn_ids:
        print(f"  SKIP (exists): {txn_id}")
        continue
    new_txns.append({
        "id":            txn_id,
        "player_id":     pid,
        "tournament_id": TOURNAMENT_ID,
        "type":          "match_deduction",
        "direction":     "debit",
        "amount":        week["match_fee"],
        "date":          week["match_date"],
        "week_id":       wid,
        "description":   f"Match fee - {week['label']}",
        "recorded_by":   "migration",
    })

print(f"\nMatch deduction transactions to insert: {len(new_txns)}")

# ─── Generate expense_deduction transactions (all_corpus split) ─────────────
exp_txns = []

for exp in expenses:
    if exp["split_among"] != "all_corpus":
        continue
    share = round(exp["share_per_player"], 2)
    for pid in corpus_player_ids:
        txn_id = f"TXN_EXPD_{exp['id']}_{pid}"
        if txn_id in existing_txn_ids:
            continue
        exp_txns.append({
            "id":            txn_id,
            "player_id":     pid,
            "tournament_id": TOURNAMENT_ID,
            "type":          "expense_deduction",
            "direction":     "debit",
            "amount":        share,
            "date":          exp["date"],
            "week_id":       None,
            "description":   exp["description"],
            "recorded_by":   "migration",
        })

print(f"Expense deduction transactions to insert: {len(exp_txns)}")

all_new = new_txns + exp_txns
print(f"Total new transactions: {len(all_new)}")

# ─── STEP 4: Insert into Supabase in batches ────────────────────────────────
BATCH_SIZE = 50

def insert_batch(batch):
    resp = requests.post(
        f"{BASE_URL}/transactions",
        headers=HEADERS,
        json=batch,
        timeout=30,
    )
    return resp

total_inserted = 0
errors = []

for i in range(0, len(all_new), BATCH_SIZE):
    batch = all_new[i:i+BATCH_SIZE]
    resp = insert_batch(batch)
    if resp.status_code in (200, 201):
        total_inserted += len(batch)
        print(f"  Batch {i//BATCH_SIZE+1}: inserted {len(batch)} rows (HTTP {resp.status_code})")
    elif resp.status_code == 204:
        total_inserted += len(batch)
        print(f"  Batch {i//BATCH_SIZE+1}: upserted {len(batch)} rows (HTTP 204)")
    else:
        errors.append((i, resp.status_code, resp.text[:300]))
        print(f"  Batch {i//BATCH_SIZE+1}: ERROR {resp.status_code}: {resp.text[:300]}")

print(f"\nTotal inserted: {total_inserted}, Errors: {len(errors)}")

# ─── STEP 5: Verify — re-fetch player_balances and compare with Excel ────────
print("\n=== STEP 5: VERIFICATION ===")

resp = requests.get(
    f"{BASE_URL}/player_balances",
    headers={"apikey": API_KEY, "Authorization": f"Bearer {API_KEY}"},
    params={"select": "id,display_name,type,corpus_balance,total_paid,total_deducted"},
    timeout=30,
)
balances = resp.json()

print(f"\nFetched {len(balances)} player balance rows")
print(f"\n{'Player':<20} {'Excel Bal':>12} {'SB Bal':>12} {'Diff':>10} {'Status'}")
print("-" * 70)

mismatches = []
matches = 0

for row in sorted(balances, key=lambda x: x["display_name"]):
    name = row["display_name"]
    if name not in EXCEL_DATA:
        continue
    excel_paid, excel_match_ded, excel_exp_ded, excel_bal = EXCEL_DATA[name]
    sb_bal = float(row["corpus_balance"])
    diff = abs(sb_bal - excel_bal)
    status = "OK" if diff <= 50 else "MISMATCH"
    if diff > 50:
        mismatches.append((name, excel_bal, sb_bal, diff))
    else:
        matches += 1
    print(f"{name:<20} {excel_bal:>12.2f} {sb_bal:>12.2f} {diff:>10.2f}  {status}")

total_checked = matches + len(mismatches)
pct = 100.0 * matches / total_checked if total_checked else 0

print(f"\n{'='*70}")
print(f"Match rate: {matches}/{total_checked} = {pct:.1f}%")
if mismatches:
    print(f"\nPlayers with |diff| > 50:")
    for name, ex, sb, d in sorted(mismatches, key=lambda x: -x[3]):
        print(f"  {name:<20}  Excel={ex:>10.2f}  SB={sb:>10.2f}  diff={d:>8.2f}")
else:
    print("All players match within Rs 50!")
