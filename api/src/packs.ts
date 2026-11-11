import type { PackType } from "./generated/prisma/enums.js";

export interface PackDefinition {
  id: PackType;
  name: string;
  price: number; // FCFA (XOF)
  maxGuests: number;
  personalizedNames: boolean;
  customDesign: boolean;
  aiBackground: boolean;
  autoSend: boolean;
  rsvp: boolean;
}

/** Source unique des offres : le front les lit via GET /api/packs. */
export const PACKS: Record<PackType, PackDefinition> = {
  BASIC: {
    id: "BASIC",
    name: "Basic",
    price: 15_000,
    maxGuests: 500,
    personalizedNames: false,
    customDesign: false,
    aiBackground: false,
    autoSend: false,
    rsvp: false,
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    price: 50_000,
    maxGuests: 500,
    personalizedNames: true,
    customDesign: true,
    aiBackground: false,
    autoSend: false,
    rsvp: false,
  },
  SUPER: {
    id: "SUPER",
    name: "Super VIP",
    price: 200_000,
    maxGuests: 200,
    personalizedNames: true,
    customDesign: true,
    aiBackground: true,
    autoSend: true,
    rsvp: true,
  },
};
