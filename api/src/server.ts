import express from "express";
import cors from "cors";
import { config, paymentMode } from "./config.js";
import { prisma } from "./db.js";
import { errorHandler, notFound } from "./http.js";
import { publicRouter } from "./routes/public.js";
import { ordersRouter } from "./routes/orders.js";
import { rsvpRouter } from "./routes/rsvp.js";
import { paymentsRouter } from "./routes/payments.js";
import { adminRouter } from "./routes/admin.js";
import { contentTypeFor, getFile, storageMode } from "./services/storage.js";
import { resumePending } from "./services/fulfillment.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors({ origin: config.publicWebUrl }));
app.use(express.json({ limit: "1mb" }));
// Webhook CinetPay (corps urlencoded, appel serveur-à-serveur) + simulation locale
app.use("/api", paymentsRouter);

// Cartes publiques (noms de fichiers aléatoires) — servies à WhatsApp et aux pages RSVP.
// Seules les cartes et le fond IA sont publics ; le ZIP passe par le jeton client.
const PUBLIC_FILE = /^\/orders\/[0-9a-f-]{36}\/(cartes\/[0-9a-f]{24}\.png|fond-ia\.jpg)$/;
app.get("/files/*path", async (req, res) => {
  const path = `/${(req.params as { path: string[] }).path.join("/")}`;
  if (!PUBLIC_FILE.test(path)) {
    res.status(404).end();
    return;
  }
  const key = path.slice(1);
  res
    .type(contentTypeFor(key))
    .set("Cache-Control", "public, max-age=604800, immutable")
    .send(await getFile(key));
});

// Sonde de santé pour l'hébergeur (vérifie aussi la base)
app.get("/healthz", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});

app.use("/api", publicRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/rsvp", rsvpRouter);
app.use("/api/admin", adminRouter);
app.use((_req, _res, next) => next(notFound("Route")));
app.use(errorHandler);

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
