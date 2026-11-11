import { Router } from "express";
import { prisma } from "../db.js";
import { PACKS } from "../packs.js";
import { createOrderSchema, guestPatchSchema } from "../validation.js";
import { HttpError, notFound, rateLimit } from "../http.js";
import { startCheckout, reconcile } from "../services/payments.js";
import { getFile, publicUrl, signedUrl } from "../services/storage.js";
import { openPollingStream } from "../services/events.js";
import { orderFingerprint, rsvpCounts } from "../services/rsvp.js";
import { archiveKeys, deliverInvitation, orderDesign, resumeIfStalled, rsvpUrl } from "../services/fulfillment.js";
import type { Guest, Order } from "../generated/prisma/client.js";

export const ordersRouter = Router();

function serializeGuest(g: Guest, withLinks: boolean) {
  return {
    id: g.id,
    name: g.name,
    phoneNumber: g.phoneNumber,
    status: g.status,
    seats: g.seats,
    rsvpNote: g.rsvpNote,
    respondedAt: g.respondedAt,
    callDone: g.callDone,
    callNote: g.callNote,
    delivery: g.delivery,
    deliveryInfo: g.deliveryInfo,
    sentAt: g.sentAt,
    cardUrl: g.cardPath ? publicUrl(g.cardPath) : null,
    rsvpUrl: withLinks ? rsvpUrl(g) : null,
  };
}

function serializeOrder(o: Order & { guests: Guest[] }) {
  const pack = PACKS[o.pack];
  return {
    id: o.id,
    accessToken: o.accessToken,
    pack,
    clientName: o.clientName,
    clientEmail: o.clientEmail,
    clientPhone: o.clientPhone,
    eventType: o.eventType,
    eventTitle: o.eventTitle,
    eventDate: o.eventDate,
    venue: o.venue,
    city: o.city,
    message: o.message,
    dressCode: o.dressCode,
    design: orderDesign(o),
    amountPaid: o.amountPaid,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    paidAt: o.paidAt,
    fulfillment: o.fulfillment,
    fulfillmentNote: o.fulfillmentNote,
    progress: o.progress,
    progressTotal: o.progressTotal,
    archiveReady: Boolean(o.archivePath),
    archiveParts: archiveKeys(o).length,
    backgroundUrl: o.backgroundUrl ? publicUrl(o.backgroundUrl) : null,
    createdAt: o.createdAt,
    guests: o.guests.map((g) => serializeGuest(g, pack.rsvp)),
  };
}

async function findByToken(token: unknown) {
  const order = await prisma.order.findUnique({ where: { accessToken: String(token) }, include: { guests: { orderBy: { position: "asc" } } } });
  if (!order) throw notFound("Commande");
  return order;
}

/* Création de la commande (avant paiement) */
ordersRouter.post("/", rateLimit(20, 60 * 60_000), async (req, res) => {
  const input = createOrderSchema.parse(req.body);
  const pack = PACKS[input.pack];
  const order = await prisma.order.create({
    data: {
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      clientEmail: input.clientEmail,
      eventType: input.eventType,
      pack: input.pack,
      amountPaid: pack.price, // montant dû ; remplacé par le montant confirmé par l'agrégateur
      eventTitle: input.eventTitle,
      eventDate: input.eventDate,
      venue: input.venue,
      city: input.city,
      message: input.message,
      dressCode: input.dressCode,
      design: input.design,
      guests: {
        create: input.guests.map((g, position) => ({ name: g.name, phoneNumber: g.phoneNumber, position })),
      },
    },
  });
  res.status(201).json({ accessToken: order.accessToken, amount: pack.price });
});

ordersRouter.get("/:token", async (req, res) => {
  let order = await findByToken(req.params.token);
  if (order.paymentStatus === "PENDING" && order.transactionId && req.query.reconcile === "1") {
    await reconcile(order).catch((err) => console.log("[reconcile]", err instanceof Error ? err.message : err));
    order = await findByToken(req.params.token);
  }
  resumeIfStalled(order);
  res.json({ order: serializeOrder(order), counts: await rsvpCounts(order.id) });
});

ordersRouter.post("/:token/checkout", rateLimit(30, 60 * 60_000), async (req, res) => {
  const order = await findByToken(req.params.token);
  res.json(await startCheckout(order));
});

/** Téléchargement d'une partie du ZIP : lien signé direct vers le stockage (aucune limite de taille côté API). */
ordersRouter.get("/:token/archive", async (req, res) => {
  const order = await findByToken(req.params.token);
  const keys = archiveKeys(order);
  if (!keys.length) throw new HttpError(409, "Les cartes ne sont pas encore prêtes.");
  const part = Math.max(1, Number(req.query.part ?? 1) || 1);
  const key = keys[part - 1];
  if (!key) throw notFound("Partie d'archive");
  const name = key.split("/").pop()!;
  const direct = await signedUrl(key, 600, name);
  if (direct) {
    res.redirect(302, direct);
    return;
  }
  res
    .type("application/zip")
    .set("Content-Disposition", `attachment; filename="${name}"`)
    .send(await getFile(key));
});

ordersRouter.get("/:token/stream", async (req, res) => {
  const { id } = await findByToken(req.params.token);
  let lastResumeCheck = 0;
  // Instantané complet de la commande à chaque changement (production, réponses, envois).
  openPollingStream(res, async () => {
    if (Date.now() - lastResumeCheck > 30_000) {
      lastResumeCheck = Date.now();
      const o = await prisma.order.findUnique({ where: { id }, select: { id: true, paymentStatus: true, fulfillment: true, updatedAt: true } });
      if (o) resumeIfStalled(o);
    }
    return {
      key: await orderFingerprint(id),
      build: async () => {
        const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: { guests: { orderBy: { position: "asc" } } } });
        return { type: "snapshot", order: serializeOrder(order), counts: await rsvpCounts(id) };
      },
    };
  });
});

/* Suivi des invités (formule Super) : relance téléphonique, correction manuelle */
ordersRouter.patch("/:token/guests/:guestId", async (req, res) => {
  const order = await findByToken(req.params.token);
  const patch = guestPatchSchema.parse(req.body);
  const guest = order.guests.find((g) => g.id === req.params.guestId);
  if (!guest) throw notFound("Invité");
  const updated = await prisma.guest.update({
    where: { id: guest.id },
    data: {
      ...patch,
      ...(patch.status && patch.status !== guest.status ? { respondedAt: patch.status === "PENDING" ? null : new Date() } : {}),
    },
  });
  res.json({ guest: serializeGuest(updated, true) });
});

ordersRouter.post("/:token/guests/:guestId/resend", rateLimit(30, 60 * 60_000), async (req, res) => {
  const order = await findByToken(req.params.token);
  if (!order.pack || !PACKS[order.pack].autoSend) throw new HttpError(403, "Envoi automatique réservé à la formule Super.");
  const guest = order.guests.find((g) => g.id === req.params.guestId);
  if (!guest) throw notFound("Invité");
  await deliverInvitation(order, guest);
  const fresh = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
  res.json({ guest: serializeGuest(fresh, true) });
});

/** Export CSV des non-répondants pour le service de relance téléphonique. */
ordersRouter.get("/:token/relances.csv", async (req, res) => {
  const order = await findByToken(req.params.token);
  const rows = order.guests.filter((g) => g.status === "PENDING");
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["Nom", "Téléphone", "Invitation", "Appel effectué", "Note"],
    ...rows.map((g) => [g.name, g.phoneNumber, g.delivery === "SENT" ? "envoyée" : "non envoyée", g.callDone ? "oui" : "non", g.callNote]),
  ]
    .map((r) => r.map(cell).join(";"))
    .join("\r\n");
  res
    .type("text/csv; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="relances.csv"`)
    .send("﻿" + csv);
});
