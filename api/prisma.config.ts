import "dotenv/config";
import { defineConfig } from "prisma/config";

// Les migrations passent par une connexion directe / session (pas le pooler
// transactionnel). Noms acceptés : DIRECT_URL, ceux de l'intégration
// Vercel ↔ Supabase, ou DATABASE_URL.
const url =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "postgresql://localhost:5433/postgres";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
