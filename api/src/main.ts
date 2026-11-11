import { app } from "./application.js";
import { config, paymentMode } from "./config.js";
import { prisma } from "./db.js";
import { storageMode } from "./services/storage.js";
import { resumePending } from "./services/fulfillment.js";

/** Serveur Node classique (développement, Render, VPS). Sur Vercel : api/index.js. */
const server = app.listen(config.port, async () => {
  console.log(`Sceau API → ${config.publicApiUrl}  (paiement : ${paymentMode} · stockage : ${storageMode})`);
  await resumePending().catch((err) => console.log("[resume]", err));
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
