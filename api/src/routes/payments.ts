import { json, Router, urlencoded } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { paymentMode } from "../config.js";
import { HttpError, rateLimit } from "../http.js";
import { checkPayment, verifyNotificationToken } from "../services/cinetpay.js";
import { applyPaymentResult } from "../services/payments.js";
import { PACKS } from "../packs.js";

export const paymentsRouter = Router();

/**
 * Notification serveur-à-serveur de CinetPay (notify_url).
 * 1. Journalise la notification brute.
 * 2. Vérifie le jeton HMAC « x-token ».
 * 3. Interroge /payment/check — seule source de vérité du statut et du montant.
 * 4. Applique le résultat (idempotent) → déclenche la production.
 * Répond toujours 200 pour que CinetPay n'insiste pas sur une erreur de notre côté.
 */
paymentsRouter.post("/webhooks/cinetpay", urlencoded({ extended: false }), async (req, res) => {
  const body = (req.body ?? {}) as Record<string, string>;
  const transactionId = body.cpm_trans_id;
  if (!transactionId) {
    res.status(200).send("ignored");
    return;
  }
  const tokenOk = verifyNotificationToken(body, req.header("x-token") ?? undefined);
  const order = await prisma.order.findUnique({ where: { transactionId }, select: { id: true } });

  let status = "UNVERIFIED";
  if (tokenOk && order) {
    try {
      const check = await checkPayment(transactionId);
      status = check.status;
      await applyPaymentResult({ transactionId, ...check });
    } catch (err) {
      status = `CHECK_ERROR ${err instanceof Error ? err.message : err}`.slice(0, 200);
    }
  }
  await prisma.paymentEvent.create({
    data: { orderId: order?.id ?? null, provider: "cinetpay", reference: transactionId, verified: tokenOk, status, payload: body },
  });
  res.status(200).send("ok");
});

/* ------------------------------------------------------------------ */
/* Simulation locale (sans clés CinetPay) — désactivée en production   */
/* ------------------------------------------------------------------ */
const simulateSchema = z.object({
  transactionId: z.string().min(6),
  outcome: z.enum(["ACCEPTED", "REFUSED"]),
  method: z.enum(["WAVECI", "OMCIV2", "MOMOCI", "FLOOZ", "CARD"]),
});

paymentsRouter.post("/payments/simulate", json(), rateLimit(60, 60_000), async (req, res) => {
  if (paymentMode !== "simulation") throw new HttpError(404, "Introuvable.");
  const input = simulateSchema.parse(req.body);
  const order = await prisma.order.findUnique({ where: { transactionId: input.transactionId } });
  if (!order) throw new HttpError(404, "Transaction inconnue.");
  const result = {
    transactionId: input.transactionId,
    status: input.outcome,
    amount: PACKS[order.pack].price,
    currency: "XOF",
    paymentMethod: input.method,
  } as const;
  await prisma.paymentEvent.create({
    data: { orderId: order.id, provider: "simulation", reference: input.transactionId, verified: true, status: input.outcome, payload: result },
  });
  await applyPaymentResult(result);
  res.json({ ok: true, accessToken: order.accessToken });
});
