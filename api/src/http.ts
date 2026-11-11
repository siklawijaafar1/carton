import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const notFound = (what = "Ressource") => new HttpError(404, `${what} introuvable.`);

/** Limiteur en mémoire par IP (suffisant pour une instance ; Redis sinon). */
export function rateLimit(max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req, res, next) => {
    const key = req.ip ?? "?";
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return next();
    }
    if (++entry.count > max) {
      res.status(429).json({ error: "Trop de requêtes, réessayez dans un instant." });
      return;
    }
    next();
  };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: err.issues[0]?.message ?? "Données invalides",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status >= 500) console.log("[erreur]", err);
  res.status(status).json({ error: status >= 500 ? "Erreur interne du serveur." : err.message });
};
