# AidLedger

NGO beneficiary registry with QR-based aid distribution. TechTalks internship project (React.js / Next.js track).

**Team:** Hadi Kharsa (lead), Mohamad Hussein, Mahmoud Rammal, Ahmad Hajj Diab

## Stack

Created with `npx create-next-app@latest` using the recommended defaults:

- Next.js (App Router) + React
- TypeScript
- Tailwind CSS
- ESLint

## Getting started

You need [Node.js](https://nodejs.org) 22 or newer, [Git](https://git-scm.com) and [Docker](https://www.docker.com) (for the local database).

```bash
git clone https://github.com/hadikharsa5-sys/aidledger.git
cd aidledger
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

`npm install` also generates the Prisma client into `generated/prisma` (git-ignored).
`db:migrate` creates the tables, `db:seed` adds a demo organisation and one user per role
(`admin@`, `manager@`, `coordinator@`, `volunteer@aidledger.test`, password `password123`).

`docker compose up -d` starts Postgres 16 with two databases: `aidledger_dev` for the app and `aidledger_test` for tests. The connection strings in `.env.example` already point at them.

Open http://localhost:3000. Edit `app/page.tsx` and the page reloads automatically.

| Command              | What it does                     |
| -------------------- | -------------------------------- |
| `npm run dev`        | Start the dev server             |
| `npm run lint`       | Run ESLint                       |
| `npm run typecheck`  | Type-check with TypeScript       |
| `npm test`           | Run the Vitest tests once        |
| `npm run test:watch` | Run Vitest in watch mode         |
| `npm run build`      | Production build (run before PR) |
| `npm start`          | Serve the production build       |
| `npm run db:migrate` | Apply migrations / create a new one after editing the schema |
| `npm run db:seed`    | Add the demo organisation and users |

## Database

Prisma 7 with PostgreSQL. Schema: `prisma/schema.prisma`, config: `prisma.config.ts`, client: `lib/db.ts`.

- Models (MVP Plan section 7): Organisation, User, Household, Member, Consent, DuplicateCandidate, Round, RoundItem,
  Pickup, AuditLog.
- Import the client with `import { prisma } from "@/lib/db"` and types from `@/generated/prisma/client`.
- `pg_trgm` is enabled in the first migration, with a trigram index on `Household.headNameNormalized` for fuzzy matching.
- After changing the schema run `npm run db:migrate -- --name what-changed` and commit the new folder in `prisma/migrations`.
- **One pickup per household per round** is enforced by the partial unique index
  `Pickup_one_per_household_per_round`, hand-written in
  `prisma/migrations/*_init/migration.sql` (Prisma's schema file can't express it). Voided pickups don't count, so a
  household can collect again after a coordinator voids a mistake. Don't replace it with `@@unique`.
- Tests that need the database run against `TEST_DATABASE_URL`; pending migrations are applied to it automatically
  before the tests start (`__tests__/setup/migrate-test-db.ts`).

## How we work

`main` is protected. Nobody (including the lead) pushes to it directly.

1. Update your local main: `git checkout main && git pull`
2. Create a branch named after the Jira ticket: `git checkout -b KAN-12-beneficiary-form`
3. Commit your work and push the branch: `git push -u origin KAN-12-beneficiary-form`
4. Open a Pull Request into `main` on GitHub and fill in the template.
5. Automatic checks run: **CI** (lint, typecheck, tests and build against a Postgres service), a **Netlify deploy preview** and a **Claude code review** that comments on the PR.
6. Hadi (code owner, `.github/CODEOWNERS`) must approve the PR, and CI must pass, before it can be merged.
7. Address review comments by pushing more commits to the same branch. Merge with "Squash and merge".

## Environments

| Environment | Where                                  | Database                   |
| ----------- | -------------------------------------- | -------------------------- |
| Local       | `npm run dev`                          | `aidledger_dev` in Docker  |
| CI          | GitHub Actions                         | Postgres service container |
| Preview     | Netlify deploy preview, one URL per PR | Neon `dev` branch          |
| Production  | Netlify, from `main`                   | Neon `main` branch         |

Hosted database URLs live only in Netlify environment variables, never in the repo.

Rules of thumb: keep PRs small (one ticket each), never commit secrets or `.env` files, and use synthetic data only (no real beneficiary data).
