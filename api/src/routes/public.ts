import { Router } from "express";
import { PACKS } from "../packs.js";
import { THEMES, TITLE_FONTS, STANDARD_DESIGN } from "../cards/themes.js";
import { renderCardPng, renderCardSvg, defaultIntro } from "../cards/render.js";
import { previewSchema } from "../validation.js";
import { paymentMode } from "../config.js";
import { rateLimit } from "../http.js";

export const publicRouter = Router();

publicRouter.get("/health", (_req, res) => {
  res.json({ ok: true, paymentMode });
});

publicRouter.get("/catalog", (_req, res) => {
  res.json({
    packs: Object.values(PACKS),
    themes: Object.values(THEMES).map(({ id, label, background, primary, ink, dark }) => ({ id, label, background, primary, ink, dark })),
    titleFonts: TITLE_FONTS,
    paymentMode,
  });
});

/** Aperçu en direct pour l'atelier de création (SVG léger, ou PNG avec ?format=png). */
publicRouter.post("/preview", rateLimit(120, 60_000), async (req, res) => {
  const input = previewSchema.parse(req.body);
  const pack = PACKS[input.pack];
  const data = {
    ...input,
    message: input.message ?? defaultIntro(input.eventType),
    guestName: pack.personalizedNames ? input.guestName || "Mme Aya Konan" : null,
    rsvpHint: pack.rsvp,
    design: pack.customDesign ? { ...input.design, aiPrompt: undefined } : STANDARD_DESIGN,
  };
  if (req.query.format === "png") {
    res.type("image/png").send(await renderCardPng(data, input.format));
  } else {
    res.type("image/svg+xml").set("Cache-Control", "no-store").send(await renderCardSvg(data, input.format));
  }
});
