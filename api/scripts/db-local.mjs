#!/usr/bin/env node
/**
 * Postgres local sans installation : PGlite (Postgres compilé en WASM) exposé
 * sur 127.0.0.1:5433 avec le protocole Postgres, puis application des
 * migrations de prisma/migrations (équivalent de `prisma migrate deploy`,
 * dont le moteur natif est bloqué sur ce PC).
 *
 * En production : vrai PostgreSQL + `npx prisma migrate deploy`.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = join(ROOT, ".data", "pglite");
const PORT = Number(process.env.PGLITE_PORT ?? 5433);

await mkdir(DATA_DIR, { recursive: true });
const db = await PGlite.create(DATA_DIR);

await db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);

const migrationsDir = join(ROOT, "prisma", "migrations");
const names = (await readdir(migrationsDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const { rows } = await db.query(`SELECT migration_name FROM "_prisma_migrations"`);
const applied = new Set(rows.map((r) => r.migration_name));

for (const name of names) {
  if (applied.has(name)) continue;
  const sql = await readFile(join(migrationsDir, name, "migration.sql"), "utf8");
  const { createHash, randomUUID } = await import("node:crypto");
  await db.transaction(async (tx) => {
    await tx.exec(sql);
    await tx.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES ($1, $2, now(), $3, 1)`,
      [randomUUID(), createHash("sha256").update(sql).digest("hex"), name],
    );
  });
  console.log(`✓ migration appliquée : ${name}`);
}

const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
await server.start();
console.log(`PGlite prêt sur postgresql://postgres@127.0.0.1:${PORT}/postgres`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
