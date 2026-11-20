import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    // Applies pending migrations to TEST_DATABASE_URL before the tests run.
    globalSetup: ["./__tests__/setup/migrate-test-db.ts"],
    // Only real test files, not the helpers next to them.
    include: ["__tests__/**/*.test.{ts,tsx}"],
  },
});
