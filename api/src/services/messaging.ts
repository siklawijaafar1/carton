import { config } from "../config.js";

/**
 * Diffusion des invitations (formule Super).
 * - WhatsApp : API WhatsApp Cloud (Meta). Un message initié par l'entreprise
 *   exige un modèle approuvé ; celui attendu a un en-tête IMAGE et trois
 *   variables : {{1}} nom de l'invité, {{2}} titre de l'événement, {{3}} lien RSVP.
 * - SMS : Orange SMS API Côte d'Ivoire (OAuth2 client credentials).
 * Sans identifiants, chaque canal passe en mode simulation (journal console).
 */

export interface InvitationMessage {
  to: string; // E.164
  guestName: string;
  eventTitle: string;
  cardUrl: string;
  rsvpUrl: string;
}

export interface SendResult {
  channel: "whatsapp" | "sms";
  ok: boolean;
  simulated: boolean;
  detail: string;
}

async function sendWhatsApp(msg: InvitationMessage): Promise<SendResult> {
  const { token, phoneNumberId, template, templateLang } = config.whatsapp;
  if (!token || !phoneNumberId) {
    console.log(`[whatsapp:simulation] → ${msg.to} | ${msg.guestName} | ${msg.rsvpUrl}`);
    return { channel: "whatsapp", ok: true, simulated: true, detail: "simulation" };
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: msg.to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: template,
        language: { code: templateLang },
        components: [
          { type: "header", parameters: [{ type: "image", image: { link: msg.cardUrl } }] },
          {
            type: "body",
            parameters: [
              { type: "text", text: msg.guestName },
              { type: "text", text: msg.eventTitle },
              { type: "text", text: msg.rsvpUrl },
            ],
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  return { channel: "whatsapp", ok: res.ok, simulated: false, detail: res.ok ? "envoyé" : `HTTP ${res.status} ${body.slice(0, 160)}` };
}

let orangeToken: { value: string; expiresAt: number } | null = null;

async function getOrangeToken(): Promise<string> {
  if (orangeToken && orangeToken.expiresAt > Date.now() + 60_000) return orangeToken.value;
  const basic = Buffer.from(`${config.sms.orangeClientId}:${config.sms.orangeClientSecret}`).toString("base64");
  const res = await fetch("https://api.orange.com/oauth/v3/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Orange OAuth : HTTP ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  orangeToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function sendSms(msg: InvitationMessage): Promise<SendResult> {
  const text = `${msg.guestName}, vous êtes invité(e) : ${msg.eventTitle}. Votre carte et votre réponse : ${msg.rsvpUrl}`;
  const { orangeClientId, orangeSender, senderName } = config.sms;
  if (!orangeClientId || !orangeSender) {
    console.log(`[sms:simulation] → ${msg.to} | ${text}`);
    return { channel: "sms", ok: true, simulated: true, detail: "simulation" };
  }
  const token = await getOrangeToken();
  const res = await fetch(`https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(orangeSender)}/requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      outboundSMSMessageRequest: {
        address: `tel:${msg.to}`,
        senderAddress: orangeSender,
        senderName,
        outboundSMSTextMessage: { message: text },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return { channel: "sms", ok: res.ok, simulated: false, detail: res.ok ? "envoyé" : `HTTP ${res.status}` };
}

/** Envoie sur les deux canaux ; réussite si au moins un canal a abouti. */
export async function sendInvitation(msg: InvitationMessage): Promise<{ ok: boolean; results: SendResult[] }> {
  const results = await Promise.all(
    [sendWhatsApp, sendSms].map((send) =>
      send(msg).catch((err: unknown): SendResult => ({
        channel: send === sendWhatsApp ? "whatsapp" : "sms",
        ok: false,
        simulated: false,
        detail: err instanceof Error ? err.message : String(err),
      })),
    ),
  );
  return { ok: results.some((r) => r.ok), results };
}

export function summarize(results: SendResult[]): string {
  return results.map((r) => `${r.channel === "whatsapp" ? "WhatsApp" : "SMS"} : ${r.ok ? (r.simulated ? "simulé" : "envoyé") : r.detail}`).join(" · ");
}
