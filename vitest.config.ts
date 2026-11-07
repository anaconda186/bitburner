import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.ts", "test/**/*.test.ts"],
    // The publish tests shell out to git many times; Windows process spawns are slow.
    testTimeout: 30_000,
  },
});
