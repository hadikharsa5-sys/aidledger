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

You need [Node.js](https://nodejs.org) 20 or newer (LTS recommended) and [Git](https://git-scm.com).

```bash
git clone https://github.com/hadikharsa5-sys/aidledger.git
cd aidledger
npm install
npm run dev
```

Open http://localhost:3000. Edit `app/page.tsx` and the page reloads automatically.

| Command         | What it does                     |
| --------------- | -------------------------------- |
| `npm run dev`   | Start the dev server             |
| `npm run lint`  | Run ESLint                       |
| `npm run build` | Production build (run before PR) |
| `npm start`     | Serve the production build       |

## How we work

`main` is protected. Nobody (including the lead) pushes to it directly.

1. Update your local main: `git checkout main && git pull`
2. Create a branch named after the Jira ticket: `git checkout -b KAN-12-beneficiary-form`
3. Commit your work and push the branch: `git push -u origin KAN-12-beneficiary-form`
4. Open a Pull Request into `main` on GitHub and fill in the template.
5. Automatic checks run: **CI** (lint + build) and a **Claude code review** that comments on the PR.
6. At least **one teammate must approve** the PR, and CI must pass, before it can be merged.
7. Address review comments by pushing more commits to the same branch. Merge with "Squash and merge".

Rules of thumb: keep PRs small (one ticket each), never commit secrets or `.env` files, and use synthetic data only (no real beneficiary data).
