# CLAUDE.md — MatchBook Codebase Guide

## Project Overview

**MatchBook** is a cricket team management web app for *Machaxi Box Cricket*.  
It handles payment tracking, attendance management, match performance analytics, and CricHeroes integration.

**Stack:** React 18 + Vite + Supabase (PostgreSQL + Auth + Edge Functions) + Tailwind CSS  
**Hosting:** GitHub Pages at `/matchbook/` subdirectory path  
**Type:** PWA (Progressive Web App with service worker)

---

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server → http://localhost:5173/matchbook/
npm run build        # Production build → /dist
npm run preview      # Preview production build locally
npm run migrate      # Run Excel → JSON migration script
```

No test suite exists. Verification is manual via the Vite dev server.

---

## Environment Setup

Copy `.env.example` to `.env` and fill in values:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_VAPID_PUBLIC_KEY=        # Web push VAPID key
```

These are injected at build time by Vite and exposed on the client. The GitHub Actions deploy workflow reads them from repository secrets.

---

## Directory Structure

```
src/
├── App.jsx                 # Root router — 40+ route definitions
├── main.jsx                # Entry point, service worker registration
├── index.css               # Tailwind CSS entry
├── api/
│   ├── dataReader.js       # All Supabase SELECT operations (161 lines)
│   └── dataWriter.js       # All Supabase INSERT/UPDATE/DELETE ops (281 lines)
├── auth/
│   ├── ProtectedRoute.jsx  # Role-based route guard
│   └── DeviceFlowLogin.jsx # Device flow OAuth
├── components/
│   ├── ui/                 # Modals, badges, spinners, toasts
│   └── layout/             # Navbar, AdminSidebar
├── hooks/
│   ├── useData.js          # React Query wrappers for all API calls
│   ├── useIsAdmin.js       # Admin role check
│   ├── useCanWrite.js      # Write permission check
│   ├── useAdminNotifications.js
│   └── usePushSubscription.js
├── lib/
│   └── supabase.js         # Supabase client singleton
├── pages/
│   ├── public/             # Lazy-loaded public pages (7 files)
│   ├── admin/              # Lazy-loaded admin panel (12 files)
│   ├── player/             # Lazy-loaded player portal (1 file)
│   └── auth/               # Login, signup, forgot-password
├── store/
│   └── authStore.js        # Zustand auth store
└── utils/
    ├── balanceCalculator.js # Balance status/threshold logic
    └── csvExport.js         # CSV export utilities

supabase/
├── schema.sql              # Full PostgreSQL schema (289 lines)
├── migrations/             # RLS policy patches, trigger additions
└── functions/
    ├── reset-password/     # Password reset edge function
    └── send-push/index.ts  # Web push notifications (Deno)

scripts/
├── migrate-excel.js        # Excel workbook → JSON migration
├── migrate_json_to_supabase.py
├── sync_cricheroes.py      # CricHeroes API sync (990 lines, runs weekly)
└── repair_transactions_v4.py

public/
├── manifest.json           # PWA manifest (app: "Machaxi Box Cricket")
├── sw.js                   # Service worker
├── data/*.json             # Legacy JSON data (pre-Supabase, kept for reference)
└── icon-*.png              # PWA icons

.github/workflows/
├── deploy.yml              # Build + deploy to GitHub Pages (triggers on main)
└── sync-cricheroes.yml     # Weekly CricHeroes sync (Sunday 9 PM IST)
```

---

## Architecture & Data Flow

### Data Layer Pattern
All database access is routed through two thin modules:

- **`src/api/dataReader.js`** — pure SELECT functions (no side effects)
- **`src/api/dataWriter.js`** — all mutations; every write appends an audit log entry

These are consumed exclusively through **`src/hooks/useData.js`**, which wraps each operation in React Query for caching, deduplication, and invalidation.

**Never call Supabase directly from page components.** Always go through `dataReader`/`dataWriter` → `useData` hook.

### Supabase Client Singleton
`src/lib/supabase.js` exports a single `supabase` instance. This prevents HMR race conditions during development. Import it from there, do not create new instances elsewhere.

### Auth & Role System
- Auth state lives in **Zustand** (`src/store/authStore.js`)
- Three roles: `admin`, `host`, `player`
- `ProtectedRoute.jsx` wraps routes that require a role
- `useIsAdmin()` and `useCanWrite()` hooks for conditional rendering
- RLS policies enforce roles server-side via the Supabase `is_admin()` JWT function

---

## Database Schema

### Tables

| Table | Purpose |
|---|---|
| `players` | Roster; types: corpus, PPM, new, guest |
| `weeks` | Match weeks with attendance cost |
| `transactions` | Financial ledger (credits & debits per player) |
| `expenses` | Shared expenses split across players |
| `attendance` | Per-player attendance per week |
| `tournaments` | Tournament metadata + CricHeroes integration |
| `match_performances` | Individual stats per match |
| `config` | Single-row team config (thresholds, defaults) |
| `audit_log` | Every mutation: who, what, before/after |
| `announcements` | Team announcements (pinned/expiring) |
| `guest_visits` | Guest attendance tracking |
| `payment_requests` | Player payment submissions pending approval |
| `cricheroes_mapping` | CricHeroes ID → internal player ID |
| `user_signups` | Signup requests with admin approval workflow |
| `user_roles` | Role assignments |
| `push_subscriptions` | Web push notification endpoints |

### Key View
`player_balances` — computed view deriving `corpus_balance`, `total_paid`, `total_deducted` from transactions.

### ID Conventions
| Type | Format |
|---|---|
| Players | `PLY_001` |
| Weeks | `W_2026_02_22` |
| Transactions | `TXN_*` |
| Tournaments | `TRN_001` |

### RLS Policy Principle
- Public SELECT on all tables (team data is non-sensitive)
- Admin/host WRITE via `is_admin()` JWT function check
- Players can insert/update only their own records

**Modifying schema:** Add a new `.sql` file under `supabase/migrations/` and apply it via the Supabase dashboard or CLI. Do not edit `schema.sql` directly for incremental changes.

---

## Routing

Routes are defined in `src/App.jsx`. All page components are **lazy-loaded** via `React.lazy` + `Suspense` for code splitting.

### Public Routes
| Path | Component |
|---|---|
| `/` | `Dashboard.jsx` |
| `/players` | `Players.jsx` |
| `/player/:id` | `PlayerDetail.jsx` |
| `/leaderboard` | `Leaderboard.jsx` |
| `/compare` | `Compare.jsx` |
| `/timeline` | `Timeline.jsx` |
| `/login` | `DeviceFlowLogin.jsx` |
| `/signup` | `Signup.jsx` |
| `/forgot-password` | `ForgotPassword.jsx` |

### Player Portal (role: player)
| Path | Component |
|---|---|
| `/my` | `MyDashboard.jsx` |
| `/my/pay/:playerId` | Payment submission |

### Admin Panel (role: admin or host)
| Path | Notes |
|---|---|
| `/admin` | Overview (admin + host) |
| `/admin/weeks` | Match weeks (host view, admin edit) |
| `/admin/expenses` | Shared expenses |
| `/admin/players` | Roster (admin only) |
| `/admin/transactions` | Payment ledger (admin only) |
| `/admin/audit` | Audit log (admin only) |
| `/admin/mapping` | CricHeroes mapping (admin only) |
| `/admin/settings` | Team config (admin only) |
| `/admin/guests` | Guest management (admin only) |
| `/admin/announcements` | Post announcements (admin only) |
| `/admin/signups` | Approve/reject signups (admin only) |
| `/admin/payments` | Review payment requests (admin only) |

---

## Key Conventions

### Component Patterns
- Functional components with hooks — no class components
- Lazy-loaded pages with `React.lazy` + `<Suspense>`
- Custom hooks for all data access (prefix `use*`)
- No global client state other than auth (Zustand) and server cache (React Query)

### Naming
- Components: `PascalCase.jsx`
- Hooks: `useXxx.js`
- Utilities: `camelCase.js`
- Database IDs: prefixed strings (`PLY_`, `W_`, `TXN_`, `TRN_`)

### Styling
- Tailwind utility classes throughout — no CSS modules or styled-components
- Brand color: `#1D9E75` (teal-green), configured as `brand` in `tailwind.config.js`
- Balance badge colors for `good` / `urgent` / `overdue` statuses are in the Tailwind config

### State Management
- **Server state** → React Query (caching, 30s stale time, invalidation on mutation)
- **Auth state** → Zustand (`authStore.js`)
- **No Redux** — keep it this way

### Audit Logging
Every write in `dataWriter.js` must log to `audit_log` with `before` and `after` snapshots. Do not skip this when adding new write operations.

### Soft Deletes
Weeks use `status = 'deleted'` instead of hard deletes to allow recovery. Follow this pattern for any new soft-deletable entities.

---

## PWA & Service Worker

- Service worker registered in `main.jsx`, served from `/matchbook/sw.js`
- PWA manifest at `public/manifest.json`
- Web push via Deno edge function in `supabase/functions/send-push/`
- VAPID key required in environment for push to work

---

## CricHeroes Integration

`scripts/sync_cricheroes.py` runs every Sunday at 9 PM IST via GitHub Actions:
1. Fetches match results from `api.cricheroes.in`
2. Maps CricHeroes player IDs → internal IDs via `cricheroes_mapping` table
3. Inserts `match_performances` records
4. Auto-deducts match fees based on attendance

Do not modify sync logic without understanding the ID mapping table and auto-deduction trigger.

---

## Deployment

**GitHub Pages** via `.github/workflows/deploy.yml`:
- Triggers on push to `main`
- Node 20, builds with Vite
- Injects Supabase credentials from repository secrets
- Deploys `/dist` to `gh-pages` branch
- Base path `/matchbook/` is baked into `vite.config.js`

**Do not change `base` in `vite.config.js`** without also updating the GitHub Pages settings and any hardcoded paths in `public/sw.js` and `public/manifest.json`.

---

## Common Tasks

### Adding a new page
1. Create `src/pages/<area>/MyPage.jsx`
2. Add a lazy import and route in `src/App.jsx`
3. Wrap with `<ProtectedRoute role="..." />` if auth is required

### Adding a new database query
1. Add a fetch function to `src/api/dataReader.js`
2. Add a React Query hook to `src/hooks/useData.js`
3. Call the hook from your component

### Adding a new mutation
1. Add a write function to `src/api/dataWriter.js` (include audit log entry)
2. Add a `useMutation` wrapper to `src/hooks/useData.js` with `onSuccess` query invalidation
3. Call the mutation hook from your component

### Adding a new Tailwind color/token
Edit `tailwind.config.js` — do not use arbitrary `[#hex]` values for recurring brand colors.
