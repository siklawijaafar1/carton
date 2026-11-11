import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { loadFonts } from "./fonts.js";
import { resolveTheme, type Design, type Theme } from "./themes.js";

const require = createRequire(import.meta.url);

export type CardFormat = "portrait" | "story";
export const FORMATS: Record<CardFormat, { width: number; height: number }> = {
  portrait: { width: 1200, height: 1680 }, // 5 × 7 pouces, impression et WhatsApp
  story: { width: 1080, height: 1920 }, // statut WhatsApp / story Instagram
};

export interface CardData {
  eventType: string;
  eventTitle: string;
  eventDate: Date;
  venue: string;
  city: string;
  message?: string | null;
  dressCode?: string | null;
  guestName?: string | null;
  rsvpHint?: boolean;
  design: Design;
  /** Image de fond (data URI) — formule Super */
  backgroundImage?: string | null;
}

/* ------------------------------------------------------------------ */
/* Mini « JSX » : satori consomme des objets { type, props }            */
/* ------------------------------------------------------------------ */
type Node = { type: string; props: Record<string, unknown> } | string | null | false;
type Style = Record<string, string | number>;

function h(type: string, props: { style?: Style; [k: string]: unknown }, ...children: Node[]): Node {
  const kids = children.filter((c) => c !== null && c !== false);
  return { type, props: { ...props, children: kids.length === 1 ? kids[0] : kids } };
}

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/* ------------------------------------------------------------------ */
/* Ornements vectoriels (art déco)                                      */
/* ------------------------------------------------------------------ */
function cornerSvg(color: string): string {
  const rays = [22.5, 45, 67.5]
    .map((deg) => {
      const r = (deg * Math.PI) / 180;
      const x1 = 4 + 36 * Math.cos(r), y1 = 4 + 36 * Math.sin(r);
      const x2 = 4 + 60 * Math.cos(r), y2 = 4 + 60 * Math.sin(r);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <g fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round">
    <path d="M4 196 V4 H196"/>
    <path d="M16 140 V16 H140" stroke-opacity=".55"/>
    <path d="M4 34 A30 30 0 0 0 34 4"/>
    <path d="M4 64 A60 60 0 0 0 64 4" stroke-opacity=".7"/>
    ${rays}
    <path d="M4 80 A76 76 0 0 0 80 4" stroke-opacity=".35"/>
  </g>
  <rect x="58" y="58" width="9" height="9" transform="rotate(45 62.5 62.5)" fill="${color}"/>
</svg>`;
}

function dividerSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="40" viewBox="0 0 640 40">
  <g stroke="${color}" stroke-width="1.4" fill="none">
    <line x1="0" y1="20" x2="270" y2="20" stroke-opacity=".7"/>
    <line x1="370" y1="20" x2="640" y2="20" stroke-opacity=".7"/>
    <circle cx="284" cy="20" r="3"/>
    <circle cx="356" cy="20" r="3"/>
    <rect x="308" y="8" width="24" height="24" transform="rotate(45 320 20)"/>
  </g>
  <rect x="314" y="14" width="12" height="12" transform="rotate(45 320 20)" fill="${color}"/>
</svg>`;
}

function sealSvg(color: string, background: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="96" fill="${background}" stroke="${color}" stroke-width="2"/>
  <circle cx="100" cy="100" r="86" fill="none" stroke="${color}" stroke-width="1" stroke-opacity=".6" stroke-dasharray="2 5"/>
  <circle cx="100" cy="100" r="78" fill="none" stroke="${color}" stroke-width="1.2" stroke-opacity=".8"/>
</svg>`;
}

/* ------------------------------------------------------------------ */
/* Textes                                                               */
/* ------------------------------------------------------------------ */
const DEFAULT_INTROS: Record<string, string> = {
  mariage: "ont la joie de vous convier à la célébration de leur mariage",
  gala: "vous prie de bien vouloir honorer de votre présence le",
  anniversaire: "vous invite à célébrer avec élégance",
  baptême: "ont le bonheur de vous convier au baptême de",
  dot: "ont l'honneur de vous convier à la cérémonie de dot",
};

export function defaultIntro(eventType: string): string {
  return DEFAULT_INTROS[eventType.trim().toLowerCase()] ?? "ont le plaisir de vous convier";
}

export function monogram(title: string): string {
  const parts = title.split(/\s*(?:&|et|\+)\s*/i).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]!.trim()[0]}&${parts[1]!.trim()[0]}`.toUpperCase();
  const STOP = new Set(["de", "des", "du", "la", "le", "les", "l'", "d'", "et", "a", "à", "au", "aux", "en", "the", "of"]);
  const words = title
    .split(/\s+/)
    .map((w) => w.replace(/^[ld]['’]/i, ""))
    .filter((w) => /^\p{L}/u.test(w) && !STOP.has(w.toLowerCase()) && !/^\d/.test(w));
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "✦";
}

function formatDate(date: Date) {
  const opts = { timeZone: "Africa/Abidjan" } as const;
  const day = new Intl.DateTimeFormat("fr-FR", { ...opts, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { ...opts, hour: "2-digit", minute: "2-digit" }).format(date);
  return { day, time: time.replace(":", " h ") };
}

function fit(text: string, base: number, comfortableLength: number, min: number): number {
  if (text.length <= comfortableLength) return base;
  return Math.max(min, Math.round((base * comfortableLength) / text.length));
}

/* ------------------------------------------------------------------ */
/* Composition                                                          */
/* ------------------------------------------------------------------ */
function compose(data: CardData, format: CardFormat): Node {
  const { width, height } = FORMATS[format];
  const s = width / 1200;
  const theme: Theme = resolveTheme(data.design);
  const { day, time } = formatDate(data.eventDate);
  const script = data.design.titleFont === "GreatVibes";
  const titleFont = data.design.titleFont;
  const titleBase = (script ? 150 : 104) * s;
  const titleSize = fit(data.eventTitle, titleBase, script ? 14 : 16, 64 * s);
  const hasBg = Boolean(data.backgroundImage);
  const intro = data.message?.trim() || defaultIntro(data.eventType);

  const corner = (rotate: number, pos: Style) =>
    h("img", {
      src: svgUri(cornerSvg(theme.primary)),
      width: 200 * s,
      height: 200 * s,
      style: { position: "absolute", transform: `rotate(${rotate}deg)`, ...pos },
    });

  const eyebrow = (text: string, size = 22) =>
    h(
      "div",
      {
        style: {
          fontFamily: "Montserrat",
          fontWeight: 500,
          fontSize: size * s,
          letterSpacing: 7 * s,
          textTransform: "uppercase",
          color: theme.primary,
          display: "flex",
        },
      },
      text,
    );

  const greeting = data.guestName
    ? h(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 26 * s } },
        eyebrow("Invitation personnelle", 18),
        h(
          "div",
          {
            style: {
              fontFamily: "Garamond",
              fontStyle: "italic",
              fontSize: fit(data.guestName, 60, 22, 36) * s,
              color: theme.ink,
              marginTop: 10 * s,
              display: "flex",
            },
          },
          data.guestName,
        ),
      )
    : h(
        "div",
        { style: { display: "flex", marginBottom: 26 * s } },
        eyebrow(`Invitation · ${data.eventType}`, 20),
      );

  const content = h(
    "div",
    {
      style: {
        position: "absolute",
        top: 150 * s,
        bottom: 150 * s,
        left: 130 * s,
        right: 130 * s,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        ...(hasBg
          ? {
              backgroundColor: theme.dark ? "rgba(10,10,10,0.66)" : "rgba(255,252,246,0.8)",
              borderRadius: 18 * s,
              border: `1px solid ${theme.primary}55`,
              padding: `${40 * s}px ${50 * s}px`,
            }
          : {}),
      },
    },
    greeting,
    // Sceau monogramme
    h(
      "div",
      {
        style: {
          width: 150 * s,
          height: 150 * s,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          marginBottom: 30 * s,
        },
      },
      h("img", {
        src: svgUri(sealSvg(theme.primary, theme.dark ? "#00000033" : "#ffffff55")),
        width: 150 * s,
        height: 150 * s,
        style: { position: "absolute", top: 0, left: 0 },
      }),
      h(
        "div",
        { style: { fontFamily: "Cinzel", fontWeight: 600, fontSize: 44 * s, color: theme.primary, letterSpacing: 2 * s, display: "flex" } },
        monogram(data.eventTitle),
      ),
    ),
    h(
      "div",
      {
        style: {
          fontFamily: titleFont,
          fontSize: titleSize,
          lineHeight: 1.05,
          color: theme.primary,
          display: "flex",
          justifyContent: "center",
          textAlign: "center",
          letterSpacing: titleFont === "Cinzel" ? 4 * s : 0,
          maxWidth: 900 * s,
        },
      },
      data.eventTitle,
    ),
    h(
      "div",
      {
        style: {
          fontFamily: "Garamond",
          fontStyle: "italic",
          fontSize: 40 * s,
          lineHeight: 1.3,
          color: theme.ink,
          marginTop: 26 * s,
          maxWidth: 780 * s,
          display: "flex",
          justifyContent: "center",
          textAlign: "center",
        },
      },
      intro,
    ),
    h("img", { src: svgUri(dividerSvg(theme.primary)), width: 480 * s, height: 30 * s, style: { marginTop: 44 * s, marginBottom: 40 * s } }),
    eyebrow(day, 26),
    h(
      "div",
      { style: { fontFamily: "Garamond", fontWeight: 600, fontSize: 46 * s, color: theme.ink, marginTop: 14 * s, display: "flex" } },
      `à ${time}`,
    ),
    h(
      "div",
      {
        style: {
          fontFamily: "Garamond",
          fontSize: 40 * s,
          color: theme.ink,
          marginTop: 30 * s,
          display: "flex",
          maxWidth: 820 * s,
          justifyContent: "center",
          textAlign: "center",
        },
      },
      data.venue,
    ),
    h(
      "div",
      { style: { fontFamily: "Montserrat", fontSize: 20 * s, letterSpacing: 6 * s, textTransform: "uppercase", color: theme.muted, marginTop: 10 * s, display: "flex" } },
      data.city,
    ),
    data.dressCode
      ? h(
          "div",
          { style: { fontFamily: "Garamond", fontStyle: "italic", fontSize: 30 * s, color: theme.muted, marginTop: 34 * s, display: "flex" } },
          `Tenue : ${data.dressCode}`,
        )
      : null,
    data.rsvpHint
      ? h(
          "div",
          {
            style: {
              marginTop: 40 * s,
              padding: `${10 * s}px ${28 * s}px`,
              border: `1px solid ${theme.primary}`,
              borderRadius: 999,
              fontFamily: "Montserrat",
              fontSize: 17 * s,
              letterSpacing: 4 * s,
              textTransform: "uppercase",
              color: theme.primary,
              display: "flex",
            },
          },
          "Confirmez votre présence via votre lien",
        )
      : null,
  );

  return h(
    "div",
    {
      style: {
        width,
        height,
        display: "flex",
        position: "relative",
        backgroundColor: theme.background,
        backgroundImage: `radial-gradient(circle at 50% 38%, ${theme.glow} 0%, ${theme.background} 72%)`,
      },
    },
    hasBg
      ? // Fond agrandi de 8 % et calé en haut : rogne le bas (filigrane éventuel du fournisseur IA).
        h("img", {
          src: data.backgroundImage!,
          width: Math.round(width * 1.08),
          height: Math.round(height * 1.08),
          style: { position: "absolute", top: 0, left: -Math.round(width * 0.04), objectFit: "cover" },
        })
      : null,
    // Double filet
    h("div", { style: { position: "absolute", top: 44 * s, left: 44 * s, right: 44 * s, bottom: 44 * s, border: `${2 * s}px solid ${theme.primary}`, display: "flex" } }),
    h("div", { style: { position: "absolute", top: 60 * s, left: 60 * s, right: 60 * s, bottom: 60 * s, border: `1px solid ${theme.primary}80`, display: "flex" } }),
    corner(0, { top: 30 * s, left: 30 * s }),
    corner(90, { top: 30 * s, right: 30 * s }),
    corner(180, { bottom: 30 * s, right: 30 * s }),
    corner(270, { bottom: 30 * s, left: 30 * s }),
    content,
  );
}

/* ------------------------------------------------------------------ */
/* Rendu SVG / PNG                                                      */
/* ------------------------------------------------------------------ */
let wasmReady: Promise<void> | null = null;
function ensureWasm() {
  wasmReady ??= readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")).then((buf) => initWasm(buf));
  return wasmReady;
}

export async function renderCardSvg(data: CardData, format: CardFormat = "portrait"): Promise<string> {
  const { width, height } = FORMATS[format];
  const fonts = await loadFonts();
  // satori attend des éléments React ; nos objets { type, props } ont la même forme.
  return satori(compose(data, format) as never, { width, height, fonts });
}

export async function renderCardPng(data: CardData, format: CardFormat = "portrait"): Promise<Buffer> {
  const [svg] = await Promise.all([renderCardSvg(data, format), ensureWasm()]);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: FORMATS[format].width } }).render().asPng();
  return Buffer.from(png);
}
