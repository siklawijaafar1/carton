import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

/** Sur Vercel, l'URL de déploiement sert d'URL publique par défaut. */
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // DATABASE_URL, ou les variables injectées par l'intégration Vercel ↔ Supabase
  databaseUrl: required("DATABASE_URL", process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL),
  isVercel: Boolean(process.env.VERCEL),
  publicApiUrl: required("PUBLIC_API_URL", vercelUrl ?? "http://localhost:4000").replace(/\/$/, ""),
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

  supabase: {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    bucket: process.env.SUPABASE_BUCKET ?? "sceau",
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

// En production sans clés CinetPay, il faut l'accepter explicitement (démo) :
// n'importe qui pourrait sinon « payer » une commande avec la simulation.
if (config.isProduction && paymentMode === "simulation" && process.env.ALLOW_PAYMENT_SIMULATION !== "true") {
  throw new Error("Clés CinetPay absentes : définissez-les, ou ALLOW_PAYMENT_SIMULATION=true pour une démo.");
}
if (config.isProduction && config.adminToken.length < 24) {
  throw new Error("ADMIN_TOKEN trop court pour la production (24 caractères minimum).");
}
