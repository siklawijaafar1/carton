import type { Response } from "express";

/**
 * Temps réel par Server-Sent Events alimentés par la base.
 * Chaque flux interroge Postgres à intervalle court et ne pousse un message
 * que lorsque l'empreinte de l'état change. Aucun état en mémoire partagé :
 * fonctionne avec plusieurs instances (Vercel, autoscaling).
 * Le flux se ferme de lui-même avant la durée maximale d'une fonction
 * serverless ; EventSource se reconnecte automatiquement.
 */

export interface RsvpCounts {
  accepted: number;
  declined: number;
  pending: number;
  seats: number;
}

export interface Tick {
  /** Empreinte de l'état : un message n'est envoyé que si elle change. */
  key: string;
  /** Construit le message (appelé seulement en cas de changement). */
  build: () => Promise<unknown>;
}

export function openPollingStream(
  res: Response,
  tick: () => Promise<Tick>,
  { intervalMs = 2000, maxMs = 240_000 }: { intervalMs?: number; maxMs?: number } = {},
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");

  let closed = false;
  let lastKey = "";
  let lastWrite = Date.now();
  const started = Date.now();
  res.on("close", () => {
    closed = true;
  });

  (async () => {
    while (!closed && Date.now() - started < maxMs) {
      try {
        const t = await tick();
        if (t.key !== lastKey) {
          lastKey = t.key;
          res.write(`data: ${JSON.stringify(await t.build())}\n\n`);
          lastWrite = Date.now();
        } else if (Date.now() - lastWrite > 20_000) {
          res.write(": ping\n\n");
          lastWrite = Date.now();
        }
      } catch (err) {
        console.log("[stream]", err instanceof Error ? err.message : err);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    if (!closed) res.end();
  })();
}
