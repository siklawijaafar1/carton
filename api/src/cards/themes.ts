import { z } from "zod";

export const THEME_IDS = ["ivoire", "noir-or", "rose-poudre", "emeraude", "minuit"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const TITLE_FONTS = ["GreatVibes", "Garamond", "Playfair", "Cinzel"] as const;

export interface Theme {
  id: ThemeId;
  label: string;
  /** Fond : couleur unie + dégradé radial de lumière */
  background: string;
  glow: string;
  /** Couleur des filets, ornements et titres */
  primary: string;
  /** Texte courant */
  ink: string;
  /** Texte secondaire */
  muted: string;
  dark: boolean;
}

export const THEMES: Record<ThemeId, Theme> = {
  ivoire: {
    id: "ivoire",
    label: "Ivoire classique",
    background: "#f7f1e6",
    glow: "#fffaf0",
    primary: "#a8834a",
    ink: "#3b2f22",
    muted: "#8a7a64",
    dark: false,
  },
  "noir-or": {
    id: "noir-or",
    label: "Noir & or",
    background: "#0e0d0b",
    glow: "#2a2418",
    primary: "#d4af6a",
    ink: "#f3e9d6",
    muted: "#b6a684",
    dark: true,
  },
  "rose-poudre": {
    id: "rose-poudre",
    label: "Rose poudré",
    background: "#f4e1dc",
    glow: "#fdf3f0",
    primary: "#b0707a",
    ink: "#4d3036",
    muted: "#94737a",
    dark: false,
  },
  emeraude: {
    id: "emeraude",
    label: "Émeraude royale",
    background: "#0d2a22",
    glow: "#1d4a3c",
    primary: "#d8b773",
    ink: "#f1ead8",
    muted: "#b4c1b2",
    dark: true,
  },
  minuit: {
    id: "minuit",
    label: "Bleu minuit",
    background: "#0c1424",
    glow: "#1e2c4a",
    primary: "#e2c99a",
    ink: "#eef0f6",
    muted: "#a6afc4",
    dark: true,
  },
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale attendue (#RRGGBB)");

export const designSchema = z.object({
  theme: z.enum(THEME_IDS).default("ivoire"),
  primary: hex.optional(),
  ink: hex.optional(),
  background: hex.optional(),
  titleFont: z.enum(TITLE_FONTS).default("GreatVibes"),
  aiPrompt: z.string().trim().max(400).optional(),
});

export type Design = z.infer<typeof designSchema>;

/** Le Basic est verrouillé sur le modèle standard. */
export const STANDARD_DESIGN: Design = { theme: "ivoire", titleFont: "GreatVibes" };

export function resolveTheme(design: Design): Theme {
  const base = THEMES[design.theme];
  return {
    ...base,
    primary: design.primary ?? base.primary,
    ink: design.ink ?? base.ink,
    background: design.background ?? base.background,
  };
}
