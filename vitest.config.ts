import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // the bonus logic stays tested; production has bonuses off (no MAXMA_BONUSES) — see lib/maxma.ts
    env: { MAXMA_BONUSES: "on" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
