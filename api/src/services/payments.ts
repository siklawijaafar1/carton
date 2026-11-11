import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { config, paymentMode } from "../config.js";
import { PACKS } from "../packs.js";
import { checkPayment, initPayment } from "./cinetpay.js";
import { enqueueFulfillment } from "./fulfillment.js";
import { publish } from "./events.js";
import type { Order } from "../generated/prisma/client.js";

export class PaymentError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Identifiant de transaction unique par tentative (CinetPay refuse les doublons). */
function newTransactionId(): string {
  return `SCX${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function startCheckout(order: Order): Promise<{ paymentUrl: string; transactionId: string; mode: string }> {
  if (order.paymentStatus === "PAID") throw new PaymentError("Cette commande est déjà réglée.", 409);
  const transactionId = newTransactionId();
  await prisma.order.update({ where: { id: order.id }, data: { transactionId, paymentStatus: "PENDING" } });

  const returnUrl = `${config.publicWebUrl}/paiement/retour?commande=${order.accessToken}`;
  if (paymentMode === "simulation") {
    const url = new URL(`${config.publicWebUrl}/paiement/simulation`);
    url.searchParams.set("tx", transactionId);
    url.searchParams.set("commande", order.accessToken);
    return { paymentUrl: url.toString(), transactionId, mode: paymentMode };
  }

  const { paymentUrl } = await initPayment({
    transactionId,
    amount: PACKS[order.pack].price,
    description: `Sceau ${PACKS[order.pack].name} ${order.eventTitle}`,
    customerName: order.clientName,
    customerEmail: order.clientEmail,
    customerPhone: order.clientPhone,
    notifyUrl: `${config.publicApiUrl}/api/webhooks/cinetpay`,
    returnUrl,
    metadata: order.id,
  });
  return { paymentUrl, transactionId, mode: paymentMode };
}

export interface ConfirmedPayment {
  transactionId: string;
  status: "ACCEPTED" | "REFUSED" | "PENDING" | "UNKNOWN";
  amount: number;
  currency: string;
  paymentMethod: string | null;
}

/**
 * Applique un résultat de paiement **vérifié** à la commande. Idempotent :
 * les notifications répétées de l'agrégateur ne relancent pas la production.
 */
export async function applyPaymentResult(result: ConfirmedPayment): Promise<{ orderId: string | null; changed: boolean }> {
  const order = await prisma.order.findUnique({ where: { transactionId: result.transactionId } });
  if (!order) return { orderId: null, changed: false };

  if (result.status === "ACCEPTED") {
    const expected = PACKS[order.pack].price;
    if (result.currency !== "XOF" || result.amount < expected) {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED", fulfillmentNote: `Montant incohérent : ${result.amount} ${result.currency} (attendu ${expected} XOF)` },
      });
      return { orderId: order.id, changed: true };
    }
    // Transition PENDING/FAILED → PAID atomique : un seul gagnant en cas de notifications concurrentes.
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, paymentStatus: { not: "PAID" } },
      data: {
        paymentStatus: "PAID",
        paidAt: new Date(),
        paymentMethod: result.paymentMethod,
        amountPaid: result.amount,
        fulfillment: "QUEUED",
      },
    });
    if (count === 1) {
      publish(order.id, { type: "fulfillment", status: "QUEUED" });
      enqueueFulfillment(order.id);
    }
    return { orderId: order.id, changed: count === 1 };
  }

  if (result.status === "REFUSED" && order.paymentStatus !== "PAID") {
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
    return { orderId: order.id, changed: true };
  }
  return { orderId: order.id, changed: false };
}

/** Rattrapage : interroge CinetPay quand le client revient sans que la notification soit arrivée. */
export async function reconcile(order: Order): Promise<void> {
  if (paymentMode !== "cinetpay" || !order.transactionId || order.paymentStatus === "PAID") return;
  const check = await checkPayment(order.transactionId);
  await applyPaymentResult({ transactionId: order.transactionId, ...check });
}
