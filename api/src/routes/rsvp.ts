import { Router } from "express";
import { prisma } from "../db.js";
import { PACKS } from "../packs.js";
import { rsvpSchema } from "../validation.js";
import { HttpError, notFound, rateLimit } from "../http.js";
import { publicUrl } from "../services/storage.js";
import { openPollingStream } from "../services/events.js";
import { rsvpCounts } from "../services/rsvp.js";
import { orderDesign } from "../services/fulfillment.js";

export const rsvpRouter = Router();

async function findGuest(token: unknown) {
  const guest = await prisma.guest.findUnique({ where: { rsvpToken: String(token) }, include: { order: true } });
  if (!guest || guest.order.paymentStatus !== "PAID" || !PACKS[guest.order.pack].rsvp) throw notFound("Invitation");
  return guest;
}

rsvpRouter.get("/:token", async (req, res) => {
  const guest = await findGuest(req.params.token);
  const o = guest.order;
  res.json({
    guest: { name: guest.name, status: guest.status, seats: guest.seats, note: guest.rsvpNote, respondedAt: guest.respondedAt },
    event: {
      type: o.eventType,
      title: o.eventTitle,
      date: o.eventDate,
      venue: o.venue,
      city: o.city,
      message: o.message,
      dressCode: o.dressCode,
      hosts: o.clientName,
      design: orderDesign(o),
    },
    cardUrl: guest.cardPath ? publicUrl(guest.cardPath) : null,
    counts: await rsvpCounts(o.id),
    closed: o.eventDate.getTime() < Date.now(),
  });
});

rsvpRouter.post("/:token", rateLimit(20, 10 * 60_000), async (req, res) => {
  const guest = await findGuest(req.params.token);
  if (guest.order.eventDate.getTime() < Date.now()) throw new HttpError(410, "L'événement est passé : les réponses sont closes.");
  const input = rsvpSchema.parse(req.body);
  const updated = await prisma.guest.update({
    where: { id: guest.id },
    data: { status: input.status, seats: input.status === "ACCEPTED" ? input.seats : 1, rsvpNote: input.note ?? null, respondedAt: new Date() },
  });
  const counts = await rsvpCounts(guest.orderId);
  res.json({ status: updated.status, seats: updated.seats, counts });
});

/** Compteur public en direct : uniquement les totaux, jamais les noms. */
rsvpRouter.get("/:token/stream", async (req, res) => {
  const guest = await findGuest(req.params.token);
  openPollingStream(
    res,
    async () => {
      const counts = await rsvpCounts(guest.orderId);
      return { key: JSON.stringify(counts), build: async () => ({ type: "counts", counts }) };
    },
    { intervalMs: 4000 },
  );
});
