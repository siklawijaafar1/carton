import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

/**
 * CinetPay — agrégateur ouest-africain : Wave, Orange Money, MTN MoMo,
 * Moov Money (Flooz) et cartes VISA / Mastercard sur une même page.
 * Doc : https://docs.cinetpay.com/api/1.0-fr/
 */

export interface InitPaymentInput {
  transactionId: string;
  amount: number;
  description: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notifyUrl: string;
  returnUrl: string;
  metadata: string;
}

export async function initPayment(input: InitPaymentInput): Promise<{ paymentUrl: string; paymentToken: string }> {
  const [first, ...rest] = input.customerName.trim().split(/\s+/);
  const res = await fetch(`${config.cinetpay.baseUrl}/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: config.cinetpay.apiKey,
      site_id: config.cinetpay.siteId,
      transaction_id: input.transactionId,
      amount: input.amount, // XOF : multiple de 5
      currency: "XOF",
      description: input.description.replace(/[^\p{L}\p{N} .,'-]/gu, " ").slice(0, 120),
      notify_url: input.notifyUrl,
      return_url: input.returnUrl,
      channels: "ALL", // MOBILE_MONEY + CREDIT_CARD + WALLET (Wave)
      lang: "fr",
      metadata: input.metadata,
      // Champs client exigés pour le paiement par carte
      customer_name: rest.join(" ") || first,
      customer_surname: first,
      customer_email: input.customerEmail,
      customer_phone_number: input.customerPhone,
      customer_address: "Abidjan",
      customer_city: "Abidjan",
      customer_country: "CI",
      customer_state: "CI",
      customer_zip_code: "00225",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as { code: string; message: string; description?: string; data?: { payment_url: string; payment_token: string } };
  if (json.code !== "201" || !json.data) {
    throw new Error(`CinetPay a refusé l'initialisation : ${json.message} ${json.description ?? ""}`.trim());
  }
  return { paymentUrl: json.data.payment_url, paymentToken: json.data.payment_token };
}

export interface CheckResult {
  status: "ACCEPTED" | "REFUSED" | "PENDING" | "UNKNOWN";
  amount: number;
  currency: string;
  paymentMethod: string | null;
  raw: unknown;
}

/** Source de vérité : on ne se fie jamais au seul contenu de la notification. */
export async function checkPayment(transactionId: string): Promise<CheckResult> {
  const res = await fetch(`${config.cinetpay.baseUrl}/payment/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: config.cinetpay.apiKey, site_id: config.cinetpay.siteId, transaction_id: transactionId }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as {
    code: string;
    data?: { status?: string; amount?: string; currency?: string; payment_method?: string };
  };
  const s = json.data?.status;
  const status: CheckResult["status"] =
    json.code === "00" && s === "ACCEPTED" ? "ACCEPTED" : s === "REFUSED" ? "REFUSED" : s === "PENDING" || json.code === "662" ? "PENDING" : "UNKNOWN";
  return {
    status,
    amount: Number(json.data?.amount ?? 0),
    currency: json.data?.currency ?? "",
    paymentMethod: json.data?.payment_method ?? null,
    raw: json,
  };
}

/** Champs concaténés (dans cet ordre) pour le jeton HMAC « x-token » de CinetPay. */
const HMAC_FIELDS = [
  "cpm_site_id",
  "cpm_trans_id",
  "cpm_trans_date",
  "cpm_amount",
  "cpm_currency",
  "signature",
  "payment_method",
  "cel_phone_num",
  "cpm_phone_prefixe",
  "cpm_language",
  "cpm_version",
  "cpm_payment_config",
  "cpm_page_action",
  "cpm_custom",
  "cpm_designation",
  "cpm_error_message",
] as const;

export function verifyNotificationToken(body: Record<string, unknown>, received: string | undefined): boolean {
  if (!config.cinetpay.secretKey || !received) return false;
  const data = HMAC_FIELDS.map((f) => String(body[f] ?? "")).join("");
  const expected = createHmac("sha256", config.cinetpay.secretKey).update(data).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
