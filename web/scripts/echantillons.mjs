#!/usr/bin/env node
/** Régénère les cartes d'exemple de la vitrine (API locale requise) : node scripts/echantillons.mjs */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const OUT = fileURLToPath(new URL("../public/echantillons/", import.meta.url));

const SAMPLES = [
  { theme: "ivoire", pack: "BASIC", eventType: "Mariage", eventTitle: "Aïcha & Karim", venue: "Hôtel Ivoire, salle des Ambassadeurs", city: "Abidjan · Cocody", dressCode: "Blanc & or" },
  { theme: "noir-or", pack: "SUPER", eventType: "Gala", eventTitle: "Gala des Lumières", venue: "Sofitel Abidjan Hôtel Ivoire", city: "Abidjan · Cocody", dressCode: "Black tie", guestName: "M. et Mme Kouassi N'Guessan", titleFont: "Cinzel", message: "La Fondation Akwaba vous prie de lui faire l'honneur de sa présence" },
  { theme: "rose-poudre", pack: "PRO", eventType: "Anniversaire", eventTitle: "Les 30 ans de Mariam", venue: "Villa Assinie, bord de lagune", city: "Assinie-Mafia", dressCode: "Rose & blanc", guestName: "Fatou Bamba", titleFont: "GreatVibes" },
  { theme: "emeraude", pack: "PRO", eventType: "Dot", eventTitle: "Yannick & Grâce", venue: "Résidence familiale Yao", city: "Yamoussoukro", dressCode: "Pagne émeraude", guestName: "Dr Yao Serge" },
  { theme: "minuit", pack: "PRO", eventType: "Soirée privée", eventTitle: "Nuit Étoilée", venue: "Rooftop Plateau, Tour D", city: "Abidjan · Plateau", guestName: "Mme Aya Konan", titleFont: "Playfair", message: "Un dîner sous les étoiles, en petit comité" },
];

await mkdir(OUT, { recursive: true });
for (const { theme, titleFont = "GreatVibes", ...rest } of SAMPLES) {
  const res = await fetch(`${API}/api/preview?format=png`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, eventDate: "2026-12-12T19:30", design: { theme, titleFont } }),
  });
  if (!res.ok) throw new Error(`${theme} : ${res.status} ${await res.text()}`);
  await writeFile(`${OUT}${theme}.png`, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${theme}.png`);
}
