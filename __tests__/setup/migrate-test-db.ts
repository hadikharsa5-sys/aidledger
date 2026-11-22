// Vitest global setup: bring the test database up to the latest migration
// before any test runs. Uses `migrate deploy`, which only applies pending
// migrations and never drops data.
import { execSync } from "node:child_process";
import "dotenv/config";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("TEST_DATABASE_URL not set: database tests will be skipped.");
    return;
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
