/** Rendu d'essai des cinq thèmes : `node dist/dev-render.js <dossier>` */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderCardPng } from "./cards/render.js";
import { THEME_IDS } from "./cards/themes.js";

const out = process.argv[2] ?? ".data/preview";
await mkdir(out, { recursive: true });
for (const theme of THEME_IDS) {
  const t0 = performance.now();
  const png = await renderCardPng({
    eventType: "Mariage",
    eventTitle: "Aïcha & Karim",
    eventDate: new Date("2026-12-12T18:00:00Z"),
    venue: "Hôtel Ivoire, salle des Ambassadeurs",
    city: "Abidjan · Cocody",
    dressCode: "Blanc & or",
    guestName: theme === "ivoire" ? null : "M. et Mme Kouassi N'Guessan",
    rsvpHint: theme === "emeraude",
    design: { theme, titleFont: theme === "minuit" ? "Cinzel" : "GreatVibes" },
  });
  await writeFile(join(out, `${theme}.png`), png);
  console.log(`${theme}.png  ${(png.length / 1024).toFixed(0)} Ko  ${(performance.now() - t0).toFixed(0)} ms`);
}
