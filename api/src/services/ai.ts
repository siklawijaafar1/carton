import { config } from "../config.js";
import { THEMES, type Design } from "../cards/themes.js";

/**
 * Fonds de carte générés par IA (formule Super).
 * Fournisseurs, par ordre de préférence :
 *   1. fal.ai (FLUX schnell)   — FAL_KEY
 *   2. Pollinations avec clé   — POLLINATIONS_KEY
 *   3. Pollinations gratuit    — sans clé, ~1 image / 45 s par IP, côté serveur uniquement
 * Toute erreur est remontée : l'appelant retombe sur le fond vectoriel du thème.
 */

const THEME_MOODS: Record<string, string> = {
  ivoire: "ivory cotton paper texture, delicate gold foil botanical line art in the corners",
  "noir-or": "deep black velvet texture, art deco gold foil geometric ornaments in the corners",
  "rose-poudre": "powder pink watercolor wash, soft blush peonies and gold leaf in the corners",
  emeraude: "deep emerald green silk texture, gold filigree and tropical palm leaves in the corners",
  minuit: "midnight blue night sky with subtle gold stars, champagne gold art deco corners",
};

export function buildPrompt(design: Design, eventType: string): string {
  const mood = THEME_MOODS[design.theme] ?? THEMES.ivoire.label;
  const custom = design.aiPrompt ? `, ${design.aiPrompt}` : "";
  return (
    `Luxury ${eventType.toLowerCase()} invitation card background, ${mood}${custom}, ` +
    "large empty clean area in the center for text, symmetrical, elegant, editorial, high-end stationery, " +
    "soft natural light, ultra detailed, no text, no letters, no watermark"
  );
}

async function fetchImage(url: string, init?: RequestInit): Promise<Buffer> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Génération IA : HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`Génération IA : réponse inattendue (${type})`);
  return Buffer.from(await res.arrayBuffer());
}

async function viaFal(prompt: string, width: number, height: number): Promise<Buffer> {
  const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: { Authorization: `Key ${config.ai.falKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_size: { width, height }, num_images: 1, enable_safety_checker: true }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`fal.ai : HTTP ${res.status}`);
  const json = (await res.json()) as { images?: { url: string }[] };
  const url = json.images?.[0]?.url;
  if (!url) throw new Error("fal.ai : aucune image renvoyée");
  return fetchImage(url);
}

function viaPollinations(prompt: string, width: number, height: number): Promise<Buffer> {
  const params = new URLSearchParams({ width: String(width), height: String(height), model: "flux", nologo: "true", seed: String(Date.now() % 1e6) });
  const encoded = encodeURIComponent(prompt);
  if (config.ai.pollinationsKey) {
    return fetchImage(`https://gen.pollinations.ai/image/${encoded}?${params}`, {
      headers: { Authorization: `Bearer ${config.ai.pollinationsKey}` },
    });
  }
  // Palier gratuit : 1 image / 45 s par IP → un second essai après la pause imposée.
  const url = `https://image.pollinations.ai/prompt/${encoded}?${params}`;
  return fetchImage(url).catch(async (err: Error) => {
    if (!/HTTP (402|429)/.test(err.message)) throw err;
    await new Promise((r) => setTimeout(r, 46_000));
    return fetchImage(url);
  });
}

export async function generateBackground(design: Design, eventType: string): Promise<{ image: Buffer; provider: string }> {
  const prompt = buildPrompt(design, eventType);
  const [w, h] = [896, 1254]; // ratio 5:7, multiple de 16
  if (config.ai.falKey) return { image: await viaFal(prompt, w, h), provider: "fal.ai" };
  return { image: await viaPollinations(prompt, w, h), provider: "pollinations" };
}

export function toDataUri(image: Buffer): string {
  const isPng = image[0] === 0x89 && image[1] === 0x50;
  return `data:image/${isPng ? "png" : "jpeg"};base64,${image.toString("base64")}`;
}
