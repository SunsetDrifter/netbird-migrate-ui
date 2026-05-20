import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "lib/**/*.test.ts",
      "tests/**/*.test.ts",
      "app/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/**/*.test.ts",
        "lib/**/*.d.ts",
      ],
      thresholds: {
        // Reflects current honest baseline. Uncovered code is mostly
        // per-record/per-router defensive error swallowing inside the
        // migration engine. The critical correctness paths — ordering,
        // ID mapping, conflict resolution, 409 short-circuit, retries —
        // are all explicitly tested.
        lines: 75,
        functions: 90,
        branches: 60,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
