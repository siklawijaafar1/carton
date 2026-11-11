#!/usr/bin/env node
/**
 * Développement : base PGlite locale (si DATABASE_URL vise 127.0.0.1:5433 et
 * qu'elle ne tourne pas déjà) + compilation TypeScript en continu + serveur
 * relancé à chaque build.
 */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const children = [];
const run = (args, name) => {
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
  child.on("exit", (code) => code && console.log(`[${name}] arrêté (code ${code})`));
  children.push(child);
  return child;
};

const portOpen = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => (socket.end(), resolve(true)));
    socket.on("error", () => resolve(false));
  });

if (/127\.0\.0\.1:5433|localhost:5433/.test(process.env.DATABASE_URL ?? "") && !(await portOpen(5433))) {
  run(["scripts/db-local.mjs"], "db");
  for (let i = 0; i < 50 && !(await portOpen(5433)); i++) await new Promise((r) => setTimeout(r, 200));
}

const tsc = join(ROOT, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(join(ROOT, "dist", "main.js"))) {
  await new Promise((r) => spawn(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: ROOT, stdio: "inherit" }).on("exit", r));
}
run([tsc, "-p", "tsconfig.json", "--watch", "--preserveWatchOutput"], "tsc");
run(["--watch-path=dist", "--enable-source-maps", "dist/main.js"], "api");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    children.forEach((c) => c.kill());
    process.exit(0);
  });
}
