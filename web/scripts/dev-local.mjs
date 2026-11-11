#!/usr/bin/env node
/**
 * Lancement local sur un PC Windows où « Smart App Control » bloque les modules
 * natifs (.node) : Next.js passe par Webpack (+ SWC WASM) au lieu de Turbopack.
 * Inutile sur Vercel : utilisez `npm run dev` / `npm run build`.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const mode = process.argv[2] === "build" ? "build" : "dev";
const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, mode, "--webpack", ...process.argv.slice(3)], {
  cwd: ROOT,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    child.kill();
    process.exit(0);
  });
}
child.on("exit", (code) => process.exit(code ?? 0));
