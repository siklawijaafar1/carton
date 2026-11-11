import { waitUntil } from "@vercel/functions";
import { config } from "../config.js";

/**
 * Prolonge une tâche au-delà de la réponse HTTP.
 * Sur Vercel, `waitUntil` garde la fonction en vie jusqu'à la fin de la
 * promesse (dans la limite de maxDuration). Ailleurs, le processus Node vit
 * de toute façon : la promesse continue simplement.
 */
export function inBackground(task: Promise<unknown>): void {
  const safe = task.catch((err) => console.log("[background]", err instanceof Error ? err.message : err));
  if (config.isVercel) waitUntil(safe);
}
