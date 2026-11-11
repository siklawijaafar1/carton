import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { config } from "./config.js";

/**
 * Connexion Postgres via le driver `pg`.
 * - Les paramètres propres à Prisma (pgbouncer, connect_timeout…) sont retirés :
 *   `pg` les transmettrait au serveur, qui les refuserait.
 * - Supabase : TLS sans vérification de la chaîne (certificat de leur pooler),
 *   comme le fait la documentation Supabase pour node-postgres.
 */
const url = new URL(config.databaseUrl);
const isLocal = ["127.0.0.1", "localhost"].includes(url.hostname);
for (const p of ["pgbouncer", "connect_timeout", "sslmode", "schema", "connection_limit", "supa"]) url.searchParams.delete(p);

const adapter = new PrismaPg({
  connectionString: url.toString(),
  ssl: isLocal ? false : { rejectUnauthorized: false },
  // PGlite (dev) ne sert qu'une connexion ; en serverless, petit pool par instance.
  max: isLocal && url.port === "5433" ? 1 : config.isVercel ? 3 : 10,
  idleTimeoutMillis: 10_000,
});

export const prisma = new PrismaClient({ adapter });
