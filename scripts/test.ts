// Runs test/*.test.ts with node --test, each bundled first by esbuild: the kit (@paperboatlab/ui) ships
// TypeScript, and Node strips types everywhere but under node_modules.
import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "articula-test-"));
const tests = fs.readdirSync(path.join(root, "test")).filter((f) => f.endsWith(".test.ts"));
await esbuild.build({
  entryPoints: tests.map((f) => path.join(root, "test", f)), outdir: out, bundle: true, platform: "node", format: "esm",
  jsx: "automatic", packages: "bundle", external: ["node:*"], loader: { ".css": "empty", ".woff2": "empty", ".woff": "empty", ".ttf": "empty" }, logLevel: "error",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const r = spawnSync(process.execPath, ["--test", ...tests.map((f) => path.join(out, f.replace(/\.ts$/, ".js")))], { stdio: "inherit", cwd: root });
fs.rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
