# Snack Record

A multi-tenant SaaS platform for managing a shared **snack / canteen accounting system** inside a team. Every team gets its own isolated workspace where it can track members, daily snack consumption, payments (collections), expenses, monthly balances, and daily food orders.

Each team is a separate tenant. Teams register and start using the platform immediately. A platform-level **Super Admin** monitors and manages all teams. Team **Admins** run the day-to-day accounting. Regular **Members** order their food, see their own balance, and view reports.

---

## Table of Contents

1. [Core Concept](#core-concept)
2. [Roles & Permissions](#roles--permissions)
3. [Feature Overview](#feature-overview)
4. [User Use Cases](#user-use-cases)
5. [Monthly Accounting Cycle](#monthly-accounting-cycle)
6. [Ordering Workflow](#ordering-workflow)
7. [Balances Explained](#balances-explained)
8. [User Interface](#user-interface)
9. [Technology Stack](#technology-stack)
10. [Getting Started](#getting-started)
11. [Configuration](#configuration)
12. [API Reference](#api-reference)
13. [Security Model](#security-model)
14. [Project Structure](#project-structure)

---

## Core Concept

The system runs on a simple per-member money equation, tracked **per month**:

```
Balance = Opening Balance + Money Given (collections) − Money Used (daily snack consumption)
```

Each team:

- Opens **one month at a time**.
- Records **daily entries** — how much each member consumed (used) that day.
- Records **collections** — money each member paid into the snack fund.
- Records **expenses** — shared/misc costs (e.g. gas, sugar, tea).
- **Closes** the month when done. Balances roll forward into the next month automatically and a **monthly report** is generated per member.
- Members place their **daily order** via an order page with a configurable cutoff time and optional minimum-balance gate.

---

## Roles & Permissions

| Role | Who | What they can do |
|------|-----|------------------|
| **SUPER_ADMIN** | Platform operator | Review / suspend / delete / manage all teams. View all teams and their stats. No day-to-day accounting. |
| **TEAM_ADMIN** | Team manager (first account created on registration) | Full accounting suite: members, menu, daily entries, collections, expenses, months, orders management, monthly reports, settings. |
| **MEMBER** | Regular team member | Place their daily order, see their own balance, view the menu, submit daily entries, view the monthly report, change password. |

Permission is enforced on **three layers**: navigation menu visibility, route guards, and backend role checks on every request. The frontend can never bypass backend authorization.

| Feature area | Member | Team Admin | Super Admin |
|--------------|:------:|:----------:|:-----------:|
| Dashboard | ✅ | ✅ | – |
| Daily Order (place) | ✅ | – | – |
| Manage Orders (all members + approvals) | – | ✅ | – |
| Menu | ✅ | ✅ | – |
| Members | ✅ | ✅ | – |
| Daily Entry | ✅ | ✅ | – |
| Collections | – | ✅ | – |
| Expenses | – | ✅ | – |
| Months | – | ✅ | – |
| Monthly Report | ✅ | ✅ | – |
| Settings | – | ✅ | – |
| Team Management (all tenants) | – | – | ✅ |

---

## Feature Overview

### Authentication & Team Registration

- **Team sign-up**: A team registers with a team name, admin name, email and password. The team is created as **ACTIVE** and can sign in **immediately** — no approval step.
- **Login**: Email + password. JWT token is stored in the browser and attached to every API call.
- **Super Admin redirect**: Super Admins are sent straight to the Registered Teams console; everyone else goes to the Dashboard.
- **Password change**: Logged-in users can change their password (password strength meter + min-length validation).
- **Account status checks**: Pending, rejected, and suspended teams are blocked from signing in with a clear message.

### Team & Member Management

- Team profile and member list (name, email, phone, status).
- **Add member** — creates both a member record and a **login account** (default password `Welcome123` unless one is provided when adding).
- **Edit member** — updates the member record and, where linked, the underlying user account.
- **Delete member = Archive** — the member's history and balances are preserved; they simply stop appearing in new entries. Archives are irreversible by design.
- Search across name/email/phone, pagination.
- Per-member **live balance** lookup (opening balance + given − used for the open month).

### Menu (Snack Items)

- Add / edit / delete menu items (name-based).
- Search and pagination.
- Menu items are the catalog of snacks available to the team.

### Daily Entry

- Records **how much each member consumed** on a given day (used amount).
- Requires an **open month**; entries must fall inside the open month (otherwise warned).
- Per-member amount grid with a live running total, plus optional remarks.
- Saving again for the same date **updates** the existing entry (edit/resume behavior).
- Members and admins can both submit daily entries.

### Collections (Payments Received)

- Record money received from a member (member, amount, date, optional remarks).
- Requires an open month; the collection is attributed to the month matching the date.
- Table shows the last 50 collections with a running total of the visible amounts and member avatars.

### Expenses

- A full CRUD screen (add / edit / delete) for shared monthly costs: date, item, amount, remarks — with server-side search and pagination.
- > **Note:** The Expenses page and `Expense` data model exist, but the backend CRUD endpoints are not currently mounted, so this page is not yet fully wired end-to-end. Everything else (months, collections, daily entries) is fully operational.

### Months (Accounting Periods)

- Only **one open month** per team at a time.
- **Create month** — if a month is already open, you are prompted to close it first; the next month is created with opening cash = the closing cash of the previous one.
- **Close / lock month** — finalizes the period; the **next month is auto-created** with balances carried forward.
- **Unlock** — reopens a locked month for corrections.
- **Delete month** — destructive (requires typing `DELETE`); removes the month along with its collections, daily entries, entry items, expense shares and balances.

### Daily Orders

- **Member page**: place today's order (free-text, max 500 characters, live character counter).
- **Cutoff time**: ordering closes at the time configured in Settings (`orderClosingTime`, default `16:20`). A live clock shows remaining time.
- **After-cutoff**: members can still submit a **permission request**; admins approve or reject it. Approved requests let the member order after hours.
- **Minimum balance gate** (optional, via Settings): if enabled, members with a balance below the minimum are blocked from ordering and told to pay first.
- **Admin page**: view all orders for any date, search by text, edit or delete any order, and approve/reject pending after-cutoff requests.
- Re-ordering on the same day **updates** the existing order.

### Dashboard

- Summary totals (total given, total used, total left).
- Per-member balance table (given / used / left) with avatar initials; members see their own row highlighted.
- Recent daily entries preview (date, remarks, itemized people + amounts, total).
- **Chart.js charts**:
  - Bar chart — spend trend over the last 10 daily entries.
  - Doughnut chart — each member's share of consumption with percentage tooltips.

### Monthly Report

- Per-member statement for any month/year: **Opening (previous left), Given, Used, Left** with a column totals row.
- **Export to PDF** — branded, auto-formatted via jsPDF (`monthly-report-YYYY-M.pdf`).
- **Export to Excel (.xls)** — downloadable spreadsheet of the same table.

### Settings

Team-level configuration (admin only):

| Setting | Purpose | Default |
|---------|---------|---------|
| `managerName` | Displayed manager/owner name | – |
| `companyName` | Brand name shown in exports/reports | `Phantom Snack Record` |
| `currency` | Currency code used in reports | `BDT` |
| `minBalanceEnabled` | Turn the order minimum-balance gate on/off | `false` |
| `minBalanceAmount` | Minimum balance required to order | `20` |
| `orderClosingTime` | Cutoff time (HH:MM, 24h) after which orders need approval | `16:20` |

### Super Admin Console (Registered Teams)

- Full listing of every registered team with status (PENDING / ACTIVE / SUSPENDED / REJECTED), admin contact and member counts.
- **Approve** a pending registration.
- **Reject** a registration.
- **Suspend** / **reactivate** a team — suspended teams cannot sign in.
- **Delete** a team permanently (requires typing `DELETE`) — wipes all team data in a single transaction.
- Client-side search/filter by name or slug.

---

## User Use Cases

### A Super Admin (platform operator)

1. Receives a new team registration.
2. Opens **Registered Teams**, reviews the team, and clicks **Approve**.
3. Monitors all tenants; **suspends** a team that has gone inactive.
4. **Permanently deletes** a team on request (confirmation required).

### A Team Admin (day-to-day manager)

1. **Registers the team** and signs in right away.
2. **Adds members** — each gets a login account so they can order and view their own balance.
3. **Sets up the menu**, and adjusts **Settings** (order cutoff time, minimum balance).
4. Opens a month, then each day:
   - Records the **daily entry** (what each member consumed).
   - Logs any **collections** members paid in.
   - Adds **expenses** for shared/misc costs.
5. Manages the day's **orders**: reviews member orders, approves after-cutoff permission requests, edits/removes mistakes.
6. At month end **closes the month**; the next month opens with balances carried over.
7. Returns a **Monthly Report** — exports **PDF/Excel** statements to share with members.

### A Team Member

1. Receives their login (email + default password), logs in, changes password.
2. Views the **Dashboard** to check their balance (given vs used vs left).
3. Places their **daily order** before the cutoff; after cutoff, they request permission from the admin.
4. If the minimum-balance rule is on and they are low, they pay (the admin records a **collection**) and then order.
5. Views the **Monthly Report** to see their own statement.

---

## Monthly Accounting Cycle

```
1. CREATE MONTH            (only one open month allowed)
        │
2. DAILY ENTRIES           (per-day, per-member consumption → "used")
        │
3. COLLECTIONS             (member payments → "given")
        │
4. EXPENSES                (shared/misc costs)
        │
5. CLOSE MONTH             (locks the month)
        │   ├─ balances & opening cash roll forward
        │   └─ next month auto-created (open)
        │
6. MONTHLY REPORT          (opening / given / used / left per member)
        │   └─ Export PDF + Excel
        │
7. (OPTIONAL) UNLOCK       (reopen a closed month to fix data)
        │
8. (OPTIONAL) DELETE       (requires typing DELETE — removes the full month)
```

---

## Ordering Workflow

```
Member opens Order page
        │
        ├─ Is current time before orderClosingTime?  (default 16:20)
        │      ├─ YES → place order → saved
        │      └─ NO  → "Ordering closed at <time>"
        │                │
        │                └─ Was my order request already APPROVED?
        │                       ├─ YES → order is placed
        │                       └─ NO  → request permission
        │                                   │
        │                                   └─ Admin approves/rejects
        │
        └─ Is minimum balance gate enabled?
               ├─ Balance >= min → proceed
               └─ Balance < min  → blocked: "pay first" warning
```

Re-ordering the same day **updates** the existing order instead of duplicating it.

---

## Balances Explained

- **Given** = sum of that member's **collections** in the current month.
- **Used** = sum of that member's **daily entry** amounts in the current month.
- **Left** = `given − used` (for the open month; dashboards show the running total).
- **Monthly report** adds an **Opening** column = the member's carried-forward balance from the previous month, so:

  `Left = Opening + Given − Used`

---

## User Interface

- **Framework**: Angular 20 (standalone components, signals).
- **Component library**: PrimeNG + PrimeIcons, Lucide icons.
- **Charts**: Chart.js (dashboard bar + doughnut).
- **Exports**: jsPDF + autoTable (PDF), HTML-table blob (Excel .xls).
- **Layout**: responsive sidebar (collapsible desktop / drawer mobile), top bar with quick-search, profile menu.
- **Roles drive the menu**: Super Admin sees only the teams console; Members get an `Order` item; Admins get `Manage Orders`, `Collections`, `Months`, `Settings`.
- **Destructive actions** (delete month/team, reject/suspend) require typing `DELETE` in a confirmation dialog.

---

## Technology Stack

**Backend** (`backend/`)

- Node.js + Express + TypeScript (`tsx` for dev)
- Prisma ORM (PostgreSQL)
- JWT authentication (`jsonwebtoken`)
- Password hashing (`bcryptjs`, cost factor 12)
- Input validation (`express-validator`)
- Security headers (`helmet`), CORS restrictions

**Frontend** (`frontend/`)

- Angular 20 standalone components
- PrimeNG / PrimeIcons / Lucide icons
- Chart.js, jsPDF + jspdf-autotable
- RxJS and signals, date-fns

**Infrastructure**

- PostgreSQL database (multi-tenant via `teamId` scoping on every query)
- Fully separated backend and frontend; the frontend contains **no database libraries**.

---

## Getting Started

### Prerequisites

- Node.js (18+) and npm
- PostgreSQL database

### 1. Backend

```bash
cd backend
npm ci

# Configure environment
copy .env.example .env        # fill in DATABASE_URL, DIRECT_URL, JWT_SECRET

# Create the database schema
npx prisma migrate dev

# Optional: seed an admin + super admin account
npm run prisma:seed           # admin@gmail.com / adnan123
                              # superadmin@gmail.com / Adnan@123

# Start the API on http://localhost:5000
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm ci

# Point the app at the backend (public/app-config.js already targets http://localhost:5000/api)
ng serve --open               # http://localhost:4200
```

### 3. Verify

```bash
curl http://localhost:5000/health
# {"success":true,"message":"API healthy"}
```

### 4. First login

1. Register a new team (or use a seeded admin account) — you can sign in right away.
2. Add members, open a month, and start tracking.

---

## Configuration

### Backend environment (`.env`) — 🔐 secret

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default `5000`) |
| `DATABASE_URL` | Prisma connection string |
| `DIRECT_URL` | Direct connection string for migrations |
| `JWT_SECRET` | Token signing secret (must be strong/random) |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `FRONTEND_URL` | Frontend origin (default `http://localhost:4200`) |
| `CORS_ORIGIN` | Allowed CORS origin (default `http://localhost:4200`) |

### Frontend configuration

- `frontend/public/app-config.js` → `window.__APP_CONFIG__.apiUrl` (default `http://localhost:5000/api`).
- The frontend holds **no secrets**.

---

## API Reference

All endpoints require `Authorization: Bearer <token>` unless noted (auth endpoints).

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register a new team (ACTIVE status, immediate login) |
| POST | `/api/auth/login` | Login → JWT token |
| GET | `/api/auth/me` | Current user + team info |
| PUT | `/api/auth/update-password` | Change password |

### Team & Members
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/team` | Team info + users |
| GET | `/api/team/members` | List members (search/pagination) |
| POST | `/api/team/members` | Create member (+ login account) |
| PUT | `/api/team/members/:id` | Update member |
| DELETE | `/api/team/members/:id` | Archive member |
| GET | `/api/members` | List members |
| GET | `/api/members/:id/balance` | Member's live balance for open month |

### Menu
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/snacks` | List snacks |
| POST | `/api/snacks` | Create snack (admin) |
| PATCH | `/api/snacks/:id` | Update snack (admin) |
| DELETE | `/api/snacks/:id` | Delete snack (admin) |

### Daily Entries
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/daily-entries` | Get entry + items for a date |
| POST | `/api/daily-entries` | Create/update daily entry |
| GET | `/api/daily-entries/open-month` | Current open month |

### Months
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/months` | List months |
| POST | `/api/months` | Create month (admin) |
| POST | `/api/months/:id/close` | Close month, auto-create next |
| PUT | `/api/months/:id` | Update month (e.g. unlock) |
| DELETE | `/api/months/:id` | Delete month + all children |

### Collections
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/collections` | List collections + members |
| POST | `/api/collections` | Record a collection (admin) |

### Orders
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orders` | Orders for a date (admin) |
| POST | `/api/orders` | Place/update own order |
| PUT | `/api/orders/:id` | Edit order (admin) |
| DELETE | `/api/orders/:id` | Delete order (admin) |
| GET | `/api/orders/member-info` | Member + settings + today's order/request |
| GET | `/api/order-requests` | Permission requests for a date |
| POST | `/api/order-requests` | Request after-cutoff permission |
| PUT | `/api/order-requests/:id` | Approve/reject request (admin) |

### Expenses
> Not currently exposed — see the note in [Feature Overview](#feature-overview).

### Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reports/summary` | Snack/record/member counts |
| GET | `/api/reports/monthly` | Per-member monthly statement |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Member balances + recent entries |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/:id` | Team settings |
| PUT | `/api/settings/:id` | Update settings (admin) |

### Super Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/super-admin/teams` | All teams + admin + counts |
| POST | `/api/super-admin/teams` | Create a team directly |
| GET | `/api/super-admin/teams/:id` | Team detail |
| PATCH | `/api/super-admin/teams/:id/status` | Approve/reject/suspend/reactivate |
| DELETE | `/api/super-admin/teams/:id` | Permanently delete a team + all data |

---

## Security Model

- **JWT authentication** — short-lived tokens verified on every request; the user is re-loaded from the database per request (role changes take effect immediately).
- **Role authorization** — `requireRole` guards on the backend; route guards + role-based menu on the frontend.
- **Tenant isolation** — every query is scoped by `teamId` from the verified token; cross-team data access is impossible.
- **Password handling** — bcrypt (cost 12); hashes never leave the backend; the frontend stores no secrets.
- **Input validation** — `express-validator` on all write endpoints.
- **Hardened HTTP** — `helmet` security headers, restricted CORS, JSON body limit.
- **Anti-bypass** — the frontend is treated as untrusted: permissions, balance math and ownership checks are all re-computed on the server.
- **Server-side account gating** — pending/rejected/suspended teams cannot log in.

---

## Project Structure

```
snack_saas/
├── backend/                      # Express + Prisma API (business logic + secrets)
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema (multi-tenant models)
│   │   └── seed.ts              # Seeds admin + super admin accounts
│   └── src/
│       ├── config/              # env + prisma client
│       ├── middleware/          # JWT auth + role guards
│       ├── routes/              # All REST endpoints
│       ├── services/            # Business logic (auth)
│       ├── validators/          # Input validation
│       └── app.ts / server.ts   # App setup & startup
│
└── frontend/                     # Angular 20 SPA (pure UI layer)
    ├── public/app-config.js     # Runtime config (apiUrl)
    └── src/app/
        ├── core/                # API client, auth state, repos, guards, models
        ├── features/            # auth, teams, dashboard, orders, daily-entry,
        │                        # collections, expenses, months, menu, members,
        │                        # monthly-report, settings
        ├── layout/              # Responsive sidebar shell
        └── shared/              # Reusable CRUD base + dialogs
```

## Deployment (Vercel)

The project is split into two independent Vercel projects:

| Project | Root directory | Notes |
|---------|----------------|-------|
| **API** | `backend/` | Express app exposed as a serverless function via `api/index.ts` + `vercel.json`. Requires `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CORS_ORIGIN` (your frontend URL) and `JWT_EXPIRES_IN` env vars. |
| **Web** | `frontend/` | Angular SPA. Set `NG_APP_API_URL` to the deployed API URL (e.g. `https://<api-project>.vercel.app/api`); the build generates `public/app-config.js` from it. |

Environment variables are configured in the Vercel project settings. Never commit real secrets.