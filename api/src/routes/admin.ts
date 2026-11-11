import { Router, type RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { HttpError } from "../http.js";
import { guestPatchSchema } from "../validation.js";
import { enqueueFulfillment } from "../services/fulfillment.js";
import { publish } from "../services/events.js";
import { rsvpCounts } from "../services/rsvp.js";

export const adminRouter = Router();

const requireAdmin: RequestHandler = (req, _res, next) => {
  const given = Buffer.from(req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(config.adminToken);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, "Accès refusé.");
  next();
};
adminRouter.use(requireAdmin);

adminRouter.get("/orders", async (_req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { guests: true } } },
  });
  const revenue = orders.filter((o) => o.paymentStatus === "PAID").reduce((sum, o) => sum + o.amountPaid, 0);
  res.json({
    revenue,
    orders: orders.map((o) => ({
      id: o.id,
      accessToken: o.accessToken,
      clientName: o.clientName,
      clientPhone: o.clientPhone,
      eventTitle: o.eventTitle,
      eventDate: o.eventDate,
      pack: o.pack,
      amountPaid: o.amountPaid,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      fulfillment: o.fulfillment,
      fulfillmentNote: o.fulfillmentNote,
      guests: o._count.guests,
      createdAt: o.createdAt,
    })),
  });
});

/**
 * File de relance du centre d'appels : invités sans réponse des commandes
 * Super payées dont l'événement est à venir, invitation envoyée depuis 48 h.
 */
adminRouter.get("/followups", async (req, res) => {
  const minHours = Number(req.query.hours ?? 48);
  const guests = await prisma.guest.findMany({
    where: {
      status: "PENDING",
      callDone: false,
      phoneNumber: { not: null },
      order: { pack: "SUPER", paymentStatus: "PAID", eventDate: { gt: new Date() } },
      OR: [{ sentAt: { lt: new Date(Date.now() - minHours * 3600_000) } }, { delivery: "FAILED" }],
    },
    include: { order: { select: { eventTitle: true, eventDate: true, clientName: true } } },
    orderBy: [{ order: { eventDate: "asc" } }, { position: "asc" }],
    take: 500,
  });
  res.json({
    followups: guests.map((g) => ({
      guestId: g.id,
      name: g.name,
      phoneNumber: g.phoneNumber,
      delivery: g.delivery,
      sentAt: g.sentAt,
      callNote: g.callNote,
      event: g.order.eventTitle,
      eventDate: g.order.eventDate,
      host: g.order.clientName,
    })),
  });
});

adminRouter.patch("/guests/:id", async (req, res) => {
  const patch = guestPatchSchema.parse(req.body);
  const guest = await prisma.guest.update({
    where: { id: req.params.id },
    data: { ...patch, ...(patch.status ? { respondedAt: patch.status === "PENDING" ? null : new Date() } : {}) },
  });
  publish(guest.orderId, { type: "guest", guestId: guest.id, patch });
  if (patch.status) publish(guest.orderId, { type: "counts", counts: await rsvpCounts(guest.orderId) });
  res.json({ ok: true });
});

adminRouter.post("/orders/:id/regenerate", async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order || order.paymentStatus !== "PAID") throw new HttpError(409, "Commande non payée.");
  await prisma.order.update({ where: { id: order.id }, data: { fulfillment: "QUEUED", fulfillmentNote: null } });
  enqueueFulfillment(order.id);
  res.json({ ok: true });
});
