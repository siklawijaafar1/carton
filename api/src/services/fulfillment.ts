import JSZip from "jszip";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { PACKS } from "../packs.js";
import { renderCardPng, type CardData } from "../cards/render.js";
import { designSchema, STANDARD_DESIGN, type Design } from "../cards/themes.js";
import { generateBackground, toDataUri } from "./ai.js";
import { putFile, getFile, publicUrl } from "./storage.js";
import { sendInvitation, summarize } from "./messaging.js";
import { publish } from "./events.js";
import { rsvpCounts } from "./rsvp.js";
import type { Guest, Order } from "../generated/prisma/client.js";

/**
 * Production d'une commande payée : fond IA → cartes → ZIP → envoi.
 * File d'attente en mémoire, une commande à la fois ; les commandes
 * interrompues (redémarrage) sont reprises au démarrage par resumePending().
 */
let chain: Promise<void> = Promise.resolve();
const queued = new Set<string>();

export function enqueueFulfillment(orderId: string): void {
  if (queued.has(orderId)) return;
  queued.add(orderId);
  chain = chain
    .then(() => fulfill(orderId))
    .catch(async (err: unknown) => {
      const note = err instanceof Error ? err.message : String(err);
      console.log(`[fulfillment] échec ${orderId} : ${note}`);
      await prisma.order.update({ where: { id: orderId }, data: { fulfillment: "FAILED", fulfillmentNote: note } }).catch(() => {});
      publish(orderId, { type: "fulfillment", status: "FAILED", note });
    })
    .finally(() => queued.delete(orderId));
}

export async function resumePending(): Promise<void> {
  const pending = await prisma.order.findMany({
    where: { paymentStatus: "PAID", fulfillment: { in: ["QUEUED", "GENERATING", "SENDING"] } },
    select: { id: true },
    orderBy: { paidAt: "asc" },
  });
  pending.forEach((o) => enqueueFulfillment(o.id));
  if (pending.length) console.log(`[fulfillment] ${pending.length} commande(s) reprise(s)`);
}

export function orderDesign(order: Pick<Order, "pack" | "design">): Design {
  if (!PACKS[order.pack].customDesign) return STANDARD_DESIGN;
  const design = designSchema.parse(order.design);
  return PACKS[order.pack].aiBackground ? design : { ...design, aiPrompt: undefined };
}

export function cardDataFor(order: Order, design: Design, guestName: string | null, backgroundImage: string | null): CardData {
  return {
    eventType: order.eventType,
    eventTitle: order.eventTitle,
    eventDate: order.eventDate,
    venue: order.venue,
    city: order.city,
    message: order.message,
    dressCode: order.dressCode,
    guestName,
    rsvpHint: PACKS[order.pack].rsvp,
    design,
    backgroundImage,
  };
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "invite";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function rsvpUrl(guest: Pick<Guest, "rsvpToken">) {
  return `${config.publicWebUrl}/rsvp/${guest.rsvpToken}`;
}

async function setStatus(orderId: string, fulfillment: Order["fulfillment"], fulfillmentNote: string | null = null) {
  await prisma.order.update({ where: { id: orderId }, data: { fulfillment, fulfillmentNote } });
  publish(orderId, { type: "fulfillment", status: fulfillment, note: fulfillmentNote });
}

async function fulfill(orderId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { guests: { orderBy: { position: "asc" } } } });
  if (order.paymentStatus !== "PAID") return;
  const pack = PACKS[order.pack];
  const design = orderDesign(order);
  const base = `orders/${order.id}`;
  const notes: string[] = [];
  await setStatus(order.id, "GENERATING");

  // 1. Fond IA (Super) — on réutilise celui déjà produit en cas de reprise
  let background: string | null = null;
  if (pack.aiBackground) {
    try {
      if (order.backgroundUrl) {
        background = toDataUri(await getFile(order.backgroundUrl));
      } else {
        const { image, provider } = await generateBackground(design, order.eventType);
        const key = await putFile(`${base}/fond-ia.jpg`, image);
        await prisma.order.update({ where: { id: order.id }, data: { backgroundUrl: key } });
        background = toDataUri(image);
        notes.push(`Fond généré par IA (${provider})`);
      }
    } catch (err) {
      console.log(`[ai] ${order.id} : ${err instanceof Error ? err.message : err}`);
      notes.push(`Fond IA indisponible pour le moment : fond du thème utilisé`);
    }
  }

  // 2. Cartes
  const zip = new JSZip();
  const folder = zip.folder(slug(`Invitations ${order.eventTitle}`))!;
  const generic = await renderCardPng(cardDataFor(order, design, null, background), "portrait");
  folder.file("00-invitation.png", generic);

  if (!pack.personalizedNames) {
    folder.file("00-invitation-story.png", await renderCardPng(cardDataFor(order, design, null, background), "story"));
  } else {
    const total = order.guests.length;
    let done = 0;
    for (const guest of order.guests) {
      const png = await renderCardPng(cardDataFor(order, design, guest.name, background), "portrait");
      // Nom de fichier aléatoire : l'URL publique sert d'image à WhatsApp.
      const key = guest.cardPath ?? `${base}/cartes/${randomBytes(12).toString("hex")}.png`;
      await putFile(key, png);
      await prisma.guest.update({ where: { id: guest.id }, data: { cardPath: key } });
      guest.cardPath = key;
      folder.file(`${String(guest.position + 1).padStart(3, "0")}-${slug(guest.name)}.png`, png);
      done++;
      if (done % 5 === 0 || done === total) publish(order.id, { type: "progress", step: "cards", done, total });
    }
  }

  const header = ["N°", "Nom", "Téléphone", ...(pack.rsvp ? ["Lien RSVP"] : [])];
  const rows = order.guests.map((g) => [g.position + 1, g.name, g.phoneNumber ?? "", ...(pack.rsvp ? [rsvpUrl(g)] : [])]);
  folder.file("liste-invites.csv", "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n"));

  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const archivePath = await putFile(`${base}/${slug(order.eventTitle)}-invitations.zip`, archive);
  await prisma.order.update({ where: { id: order.id }, data: { archivePath } });

  // 3. Envoi automatique (Super)
  if (pack.autoSend) {
    await setStatus(order.id, "SENDING", notes.join(" · ") || null);
    const toSend = order.guests.filter((g) => g.phoneNumber && g.delivery !== "SENT");
    let done = 0;
    for (const guest of toSend) {
      await deliverInvitation(order, guest);
      done++;
      publish(order.id, { type: "progress", step: "sending", done, total: toSend.length });
      await new Promise((r) => setTimeout(r, 250)); // ménage les quotas des fournisseurs
    }
  }

  await setStatus(order.id, "READY", notes.join(" · ") || null);
  publish(order.id, { type: "counts", counts: await rsvpCounts(order.id) });
}

export async function deliverInvitation(order: Pick<Order, "id" | "eventTitle">, guest: Guest): Promise<void> {
  if (!guest.phoneNumber || !guest.cardPath) return;
  const { ok, results } = await sendInvitation({
    to: guest.phoneNumber,
    guestName: guest.name,
    eventTitle: order.eventTitle,
    cardUrl: publicUrl(guest.cardPath),
    rsvpUrl: rsvpUrl(guest),
  });
  const patch = { delivery: ok ? ("SENT" as const) : ("FAILED" as const), deliveryInfo: summarize(results), sentAt: ok ? new Date() : null };
  await prisma.guest.update({ where: { id: guest.id }, data: patch });
  publish(order.id, { type: "guest", guestId: guest.id, patch });
}
