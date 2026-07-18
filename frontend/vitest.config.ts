import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    // The functions under test are pure — no DOM, no React. Keeping the node environment
    // means the suite stays fast and cannot accidentally depend on browser globals.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
