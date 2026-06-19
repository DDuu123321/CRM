# Bluven CRM

Phase 1 "walking skeleton" of an in-house CRM for **Bluven Energy** (Australian
residential solar + battery). It receives leads, tracks them through a sales
pipeline, and keeps an **append-only activity log**.

**Stack:** Next.js 14 (App Router) · TypeScript · Prisma 6 + PostgreSQL ·
Auth.js v5 (credentials) · Tailwind.

## Local setup

Requires Node 20+ and a local PostgreSQL with a `bluven_crm` database on
`localhost:5432` (this repo's dev DB lives in the `bluven-pg` Docker container).

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL + AUTH_SECRET
npx prisma migrate dev      # create tables
npx prisma db seed          # seed admin + sample leads
npm run dev                 # http://localhost:3002
```

Seeded login: `admin@bluven.org.au` / `Bluven123`.

## Layout

- `prisma/schema.prisma` — `User` (auth + role), `Lead` (pipeline), `Activity`
  (append-only log).
- `src/auth.config.ts` / `src/auth.ts` — Auth.js split config (Edge-safe vs Node).
- `src/middleware.ts` — gates every route except `/login`.
- `src/app/(app)/leads` — list + detail pages and their server actions.

## Roadmap

This is Phase 1 (sales tracking). Planned next: Contact/Site model + lead
dedup, RBAC ownership enforcement, quoting/CPQ, install jobs, STC/rebate
engine, Xero. See the concept map in the website repo:
`docs/crm-concept-2026-06-17.md`.
