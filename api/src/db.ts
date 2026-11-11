import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { config } from "./config.js";

const isLocalPglite = /127\.0\.0\.1:5433|localhost:5433/.test(config.databaseUrl);

const adapter = new PrismaPg({
  connectionString: config.databaseUrl,
  // PGlite (dev) ne sert qu'une connexion à la fois.
  ...(isLocalPglite ? { max: 1 } : {}),
});

export const prisma = new PrismaClient({ adapter });
