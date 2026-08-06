# Phantom Snack Record

Production-ready Angular 20 + Supabase snack management baseline with standalone components, Angular Material, Supabase Auth, RLS, role guards, audit logging, month close/carry-forward logic, exports, backup/restore, and Prisma schema support.

## Stack

- Angular 20 standalone components
- Angular Material
- RxJS and Signals
- Supabase Auth, PostgreSQL, RLS, RPC functions
- Prisma schema for typed database tooling
- Chart.js, jsPDF, CSV, Excel-compatible export

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Supabase project and run SQL in this order:

```sql
-- Supabase SQL editor
-- 1. supabase/schema.sql
-- 2. supabase/sample-data.sql
```

3. Update these files with your Supabase anon config:

- `src/environments/environment.ts`
- `src/environments/environment.prod.ts`

4. Seed the requested admin user:

```bash
copy .env.example .env
# fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run db:seed
```

Seed login:

- Email: `adnan@gmail.com`
- Password: `adnan123`
- Role: `admin`

## Development

```bash
npm start
```

Open `http://localhost:4200`.

## Production Build

```bash
npm run build
```

Deploy `dist/phantom-snack-record/browser` to Vercel, Netlify, Cloudflare Pages, Firebase Hosting, or any static host. Configure the host to rewrite all routes to `index.html`.

## Database Security

RLS is enabled on all application tables.

- Unauthenticated users: no access.
- Admin: full access, including Settings, Delete Month, Force Delete Member, Unlock Month.
- Manager: operational access, but no Settings, no Delete Month, no permanent Member delete.

Month closing and deletion are database RPC operations:

- `close_month(p_month_id uuid)`
- `delete_month(p_month_id uuid)`

Locked month triggers prevent edits to expenses, collections, and daily entries.

## Verification

Current verification performed:

```bash
npm run build
npm audit --audit-level=moderate
```

Build passes. Audit reports only an Angular CLI dev dependency advisory under `@angular/cli@20`; npm's fix upgrades to Angular 21, so it was not applied because the requirement is Angular 20.

## Notes

PDF export uses `jsPDF`, whose optional rendering stack emits Angular CommonJS optimization warnings. The feature is lazy-loaded under Monthly Report and does not block production builds.
