import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Downloaded Claude Code / agent skills — not project source.
    ".claude/**",
    ".agents/**",
    // Admin snapshots of data/projects.ts — data, not source.
    "backups/**",
    // Hand-written service worker (plain browser JS).
    "public/sw.js",
  ]),
]);

export default eslintConfig;
