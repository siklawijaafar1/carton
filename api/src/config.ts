import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  publicApiUrl: required("PUBLIC_API_URL", "http://localhost:4000").replace(/\/$/, ""),
  publicWebUrl: required("PUBLIC_WEB_URL", "http://localhost:3300").replace(/\/$/, ""),
  adminToken: required("ADMIN_TOKEN"),
  storageDir: process.env.STORAGE_DIR ?? ".data/storage",
  isProduction: process.env.NODE_ENV === "production",

  cinetpay: {
    apiKey: process.env.CINETPAY_API_KEY ?? "",
    siteId: process.env.CINETPAY_SITE_ID ?? "",
    secretKey: process.env.CINETPAY_SECRET_KEY ?? "",
    baseUrl: process.env.CINETPAY_BASE_URL ?? "https://api-checkout.cinetpay.com/v2",
  },

  ai: {
    falKey: process.env.FAL_KEY ?? "",
    pollinationsKey: process.env.POLLINATIONS_KEY ?? "",
  },

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    template: process.env.WHATSAPP_TEMPLATE ?? "invitation_evenement",
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG ?? "fr",
  },

  sms: {
    // Orange SMS API (Côte d'Ivoire) — https://developer.orange.com
    orangeClientId: process.env.ORANGE_SMS_CLIENT_ID ?? "",
    orangeClientSecret: process.env.ORANGE_SMS_CLIENT_SECRET ?? "",
    orangeSender: process.env.ORANGE_SMS_SENDER ?? "", // ex. tel:+2250700000000
    senderName: process.env.SMS_SENDER_NAME ?? "SCEAU",
  },
};

/** Les paiements passent par la simulation locale tant que les clés CinetPay sont absentes. */
export const paymentMode = config.cinetpay.apiKey && config.cinetpay.siteId ? "cinetpay" : "simulation";

if (config.isProduction && paymentMode === "simulation") {
  throw new Error("Clés CinetPay absentes : la simulation de paiement est interdite en production.");
}
