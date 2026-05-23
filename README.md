# Modular Furniture ERP

Internal ERP for a modular furniture business (prelam/postlam carcass furniture, architect/dealer channel). Built phase-by-phase against the prompts in [`/specs/PROMPTS_P0.md`](./specs/PROMPTS_P0.md).

> **Status:** Phase 0 — P0-01 (project initialization). No business logic yet; this is the foundation skeleton.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js 20 LTS, TypeScript 5+, Express, Prisma ORM |
| Database | PostgreSQL 16 (multi-schema; `core` schema introduced in P0-02) |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Auth | jsonwebtoken, bcrypt (P0-05) |
| Validation | zod |
| Testing | vitest (unit), supertest (API integration) |
| Logging | pino (+ pino-pretty in development) |

## Repository layout

```
/backend       Node.js + TypeScript API (Express + Prisma)
/frontend      Next.js 14 App Router app
/specs         Phase-by-phase build prompts (PROMPTS_P0.md, etc.)
/docs          Project documentation (ARCHITECTURE.md, ...)
/scripts       Migration helpers, seed scripts
.env.example   Template — copy to .env for local dev
```

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- **PostgreSQL 16** — runs as a portable user-space process from `E:\Apps\PostgreSQL16` (no Windows service, no UAC). Started/stopped via `npm run db:start` / `npm run db:stop`. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#9-portable-postgresql) for why and how.

## Getting started

```bash
# 1. Install dependencies for both workspaces
npm install

# 2. Copy environment template and fill in real values
cp .env.example .env

# 3. Start the local PostgreSQL (portable, runs in user-space)
npm run db:start

# 4. Start backend (4000) and frontend (3100) together
npm run dev
```

Or run each side independently:

```bash
npm run dev:backend     # http://localhost:4000  (health check at /health)
npm run dev:frontend    # http://localhost:3100
```

### Database lifecycle

```bash
npm run db:start        # start postgres on :5432
npm run db:stop         # stop postgres
npm run db:status       # show pg_ctl status
npm run db:check        # connect via Prisma + print version/schemas/rowcount
npm run db:migrate:dev  # create + apply a new dev migration (prompts for name)
npm run db:generate     # regenerate the Prisma client
npm run db:studio       # open Prisma Studio (web UI for the DB)
```

The portable Postgres install lives at `E:\Apps\PostgreSQL16` by default. To relocate, set `$env:PG_HOME` (and optionally `PG_DATA`, `PG_PORT`) before running `db:start`.

## Build phases

Each phase is a numbered prompt in `/specs`. Always finish a prompt before starting the next, and stick to the SCOPE BOUNDARIES section of the active prompt — out-of-scope work is explicitly deferred to a later prompt.

- **Phase 0 — Foundation** (`/specs/PROMPTS_P0.md`): admin, RBAC, communication, compliance, payment, customer-portal foundation. 30 prompts, P0-01 through P0-30.
- Later phases will be added as `PROMPTS_P1.md`, `PROMPTS_P2.md`, ...

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the high-level architecture and conventions used throughout the build.

## Conventions

- **Commit messages:** `[P0-NN] Short summary` — see `/specs/PROMPTS_P0.md` Part 4 for the full list.
- **Response format (API):** `{ success: true, data, meta }` or `{ success: false, error: { code, message, details } }`.
- **Schemas:** Postgres multi-schema, `core` for foundation tables (P0-02+); per-domain schemas added in later phases.
- **Out-of-scope guard:** if a request belongs to a later prompt, defer it explicitly rather than expanding the current prompt's scope.
