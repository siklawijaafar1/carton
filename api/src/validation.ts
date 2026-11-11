import { z } from "zod";
import { designSchema } from "./cards/themes.js";
import { PACKS } from "./packs.js";
import { normalizePhone } from "./services/phone.js";

const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) ctx.addIssue({ code: "custom", message: `Numéro invalide : « ${v} »` });
    return n ?? v;
  });

/** Date saisie à Abidjan (UTC+0, sans heure d'été) : « 2026-12-12T18:00 ». */
const eventDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Date attendue au format AAAA-MM-JJTHH:MM")
  .transform((v) => new Date(`${v}:00Z`));

export const eventSchema = z.object({
  eventType: z.string().trim().min(2).max(40),
  eventTitle: z.string().trim().min(2, "Titre trop court").max(60, "Titre trop long (60 caractères max.)"),
  eventDate,
  venue: z.string().trim().min(2).max(90),
  city: z.string().trim().min(2).max(40).default("Abidjan"),
  message: z.string().trim().max(160).optional().transform((v) => v || undefined),
  dressCode: z.string().trim().max(40).optional().transform((v) => v || undefined),
});

export const guestInput = z.object({
  name: z.string().trim().min(2, "Nom d'invité trop court").max(60),
  phoneNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(phone.optional()),
});

export const createOrderSchema = eventSchema
  .extend({
    pack: z.enum(["BASIC", "PRO", "SUPER"]),
    clientName: z.string().trim().min(2).max(80),
    clientPhone: phone,
    clientEmail: z.email("E-mail invalide").max(120),
    design: designSchema.default({ theme: "ivoire", titleFont: "GreatVibes" }),
    guests: z.array(guestInput).min(1, "Ajoutez au moins un invité"),
  })
  .superRefine((o, ctx) => {
    const pack = PACKS[o.pack];
    if (o.guests.length > pack.maxGuests) {
      ctx.addIssue({ code: "custom", path: ["guests"], message: `La formule ${pack.name} couvre ${pack.maxGuests} invités maximum.` });
    }
    if (pack.autoSend) {
      o.guests.forEach((g, i) => {
        if (!g.phoneNumber) ctx.addIssue({ code: "custom", path: ["guests", i, "phoneNumber"], message: `Numéro requis pour ${g.name} (envoi WhatsApp / SMS)` });
      });
    }
  });

export const previewSchema = eventSchema.extend({
  pack: z.enum(["BASIC", "PRO", "SUPER"]).default("PRO"),
  design: designSchema.default({ theme: "ivoire", titleFont: "GreatVibes" }),
  guestName: z.string().trim().max(60).optional(),
  format: z.enum(["portrait", "story"]).default("portrait"),
});

export const rsvpSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"]),
  seats: z.coerce.number().int().min(1).max(10).default(1),
  note: z.string().trim().max(280).optional(),
});

export const guestPatchSchema = z.object({
  callDone: z.boolean().optional(),
  callNote: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["PENDING", "ACCEPTED", "DECLINED"]).optional(),
  seats: z.number().int().min(1).max(10).optional(),
});
