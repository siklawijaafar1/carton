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
import { inBackground } from "./background.js";
import type { Guest, Order } from "../generated/prisma/client.js";

/**
 * Production d'une commande payée : fond IA → cartes → ZIP → envoi.
 *
 * Conçue pour tourner aussi bien sur un serveur classique qu'en serverless :
 * - « réservation » atomique en base : une seule instance traite une commande ;
 * - pulsation (progress / updatedAt) : une production sans nouvelles depuis
 *   STALE_MS est considérée interrompue et peut être reprise ;
 * - budget de temps : avant la limite d'une fonction, la passe s'arrête,
 *   enregistre sa progression et relance la suite par un appel HTTP.
 *   Les cartes déjà produites sont relues depuis le stockage.
 */
const STALE_MS = 90_000;
const BUDGET_MS = Number(process.env.FULFILLMENT_BUDGET_MS) || (config.isVercel ? 230_000 : Number.POSITIVE_INFINITY);
const running = new Set<string>();

/** Lance (ou reprend) la production sans bloquer la réponse HTTP. */
export function startFulfillment(orderId: string): void {
  inBackground(runFulfillment(orderId));
}

export async function runFulfillment(orderId: string): Promise<void> {
  if (running.has(orderId)) return;
  running.add(orderId);
  try {
    if (!(await claim(orderId))) return;
    await fulfill(orderId);
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err);
    console.log(`[fulfillment] échec ${orderId} : ${note}`);
    await prisma.order.update({ where: { id: orderId }, data: { fulfillment: "FAILED", fulfillmentNote: note.slice(0, 300) } }).catch(() => {});
  } finally {
    running.delete(orderId);
  }
}

async function claim(orderId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const { count } = await prisma.order.updateMany({
    where: {
      id: orderId,
      paymentStatus: "PAID",
      OR: [{ fulfillment: "QUEUED" }, { fulfillment: { in: ["GENERATING", "SENDING"] }, updatedAt: { lt: staleBefore } }],
    },
    data: { fulfillment: "GENERATING" },
  });
  return count === 1;
}

/** Appelé à la lecture d'une commande : relance une production en attente ou interrompue. */
export function resumeIfStalled(order: Pick<Order, "id" | "paymentStatus" | "fulfillment" | "updatedAt">): void {
  if (order.paymentStatus !== "PAID") return;
  const stalled =
    order.fulfillment === "QUEUED" ||
    ((order.fulfillment === "GENERATING" || order.fulfillment === "SENDING") && Date.now() - order.updatedAt.getTime() > STALE_MS);
  if (stalled) startFulfillment(order.id);
}

/** Serveur classique : reprend au démarrage les productions interrompues. */
export async function resumePending(): Promise<void> {
  const pending = await prisma.order.findMany({
    where: { paymentStatus: "PAID", fulfillment: { in: ["QUEUED", "GENERATING", "SENDING"] } },
    select: { id: true, paymentStatus: true, fulfillment: true, updatedAt: true },
    orderBy: { paidAt: "asc" },
  });
  for (const o of pending) await runFulfillment(o.id);
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

class Paused extends Error {}

async function fulfill(orderId: string): Promise<void> {
  const t0 = Date.now();
  const checkBudget = async (progress?: number) => {
    if (Date.now() - t0 < BUDGET_MS) return;
    console.log(`[fulfillment] ${orderId} : pause à ${progress ?? "l'envoi"}, reprise dans une nouvelle invocation`);
    await prisma.order.update({
      where: { id: orderId },
      data: { fulfillment: "QUEUED", fulfillmentNote: "Production en cours…", ...(progress !== undefined ? { progress } : {}) },
    });
    throw new Paused();
  };

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { guests: { orderBy: { position: "asc" } } } });
    const pack = PACKS[order.pack];
    const notes: string[] = order.fulfillmentNote?.startsWith("Fond") ? [order.fulfillmentNote] : [];
    const total = order.guests.length;
    const cardsDone = order.archivePath && order.progressTotal > 0 && order.progress >= order.progressTotal;

    if (!cardsDone) await produceCards(order, notes, checkBudget);

    // Envoi automatique (Super)
    if (pack.autoSend) {
      await prisma.order.update({ where: { id: order.id }, data: { fulfillment: "SENDING", fulfillmentNote: notes.join(" · ") || null } });
      const guests = await prisma.guest.findMany({ where: { orderId: order.id }, orderBy: { position: "asc" } });
      for (const guest of guests) {
        if (!guest.phoneNumber || guest.delivery === "SENT") continue;
        await deliverInvitation(order, guest);
        await prisma.order.update({ where: { id: order.id }, data: { progressTotal: total } }); // pulsation
        await checkBudget();
        await new Promise((r) => setTimeout(r, 250)); // ménage les quotas des fournisseurs
      }
    }

    await prisma.order.update({ where: { id: order.id }, data: { fulfillment: "READY", fulfillmentNote: notes.join(" · ") || null } });
  } catch (err) {
    if (!(err instanceof Paused)) throw err;
    // Suite dans une nouvelle invocation (nouvelle fenêtre de temps).
    await fetch(`${config.publicApiUrl}/api/admin/orders/${orderId}/continue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.adminToken}` },
      signal: AbortSignal.timeout(10_000),
    }).catch((e) => console.log("[fulfillment] relance différée :", e instanceof Error ? e.message : e));
  }
}

async function produceCards(
  order: Order & { guests: Guest[] },
  notes: string[],
  checkBudget: (progress?: number) => Promise<void>,
): Promise<void> {
  const pack = PACKS[order.pack];
  const design = orderDesign(order);
  const base = `orders/${order.id}`;
  const total = order.guests.length;

  // 1. Fond IA (Super) — réutilisé s'il existe déjà
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
      notes.push("Fond IA indisponible pour le moment : fond du thème utilisé");
    }
  }

  // 2. Cartes
  const zip = new JSZip();
  const folder = zip.folder(slug(`Invitations ${order.eventTitle}`))!;
  folder.file("00-invitation.png", await renderCardPng(cardDataFor(order, design, null, background), "portrait"));

  if (!pack.personalizedNames) {
    folder.file("00-invitation-story.png", await renderCardPng(cardDataFor(order, design, null, background), "story"));
  } else {
    await prisma.order.update({ where: { id: order.id }, data: { progressTotal: total } });
    for (const [i, guest] of order.guests.entries()) {
      let png: Buffer | null = null;
      if (i < order.progress && guest.cardPath) png = await getFile(guest.cardPath).catch(() => null);
      if (!png) {
        png = await renderCardPng(cardDataFor(order, design, guest.name, background), "portrait");
        // Nom de fichier aléatoire : l'URL publique sert d'image à WhatsApp. Réutilisé en cas de régénération.
        const key = guest.cardPath ?? `${base}/cartes/${randomBytes(12).toString("hex")}.png`;
        await putFile(key, png);
        if (!guest.cardPath) await prisma.guest.update({ where: { id: guest.id }, data: { cardPath: key } });
        guest.cardPath = key;
      }
      folder.file(`${String(guest.position + 1).padStart(3, "0")}-${slug(guest.name)}.png`, png);
      const done = i + 1;
      if (done % 5 === 0 || done === total) await prisma.order.update({ where: { id: order.id }, data: { progress: done } });
      if (done < total) await checkBudget(done);
    }
  }

  const header = ["N°", "Nom", "Téléphone", ...(pack.rsvp ? ["Lien RSVP"] : [])];
  const rows = order.guests.map((g) => [g.position + 1, g.name, g.phoneNumber ?? "", ...(pack.rsvp ? [rsvpUrl(g)] : [])]);
  folder.file("liste-invites.csv", "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n"));

  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const archivePath = await putFile(`${base}/${slug(order.eventTitle)}-invitations.zip`, archive);
  const size = Math.max(total, 1);
  await prisma.order.update({ where: { id: order.id }, data: { archivePath, progress: size, progressTotal: size } });
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
  await prisma.guest.update({
    where: { id: guest.id },
    data: { delivery: ok ? "SENT" : "FAILED", deliveryInfo: summarize(results), sentAt: ok ? new Date() : null },
  });
}
