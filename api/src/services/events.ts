import { EventEmitter } from "node:events";
import type { Response } from "express";

/**
 * Bus d'événements temps réel (Server-Sent Events), par commande.
 * Mono-instance : pour plusieurs instances, brancher ce bus sur
 * Postgres LISTEN/NOTIFY ou Redis pub/sub.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);

export type LiveEvent =
  | { type: "fulfillment"; status: string; note?: string | null }
  | { type: "progress"; step: "cards" | "sending"; done: number; total: number }
  | { type: "rsvp"; guestId: string; status: string; seats: number; rsvpNote: string | null; respondedAt: string | null }
  | { type: "guest"; guestId: string; patch: Record<string, unknown> }
  | { type: "counts"; counts: RsvpCounts };

export interface RsvpCounts {
  accepted: number;
  declined: number;
  pending: number;
  seats: number;
}

export function publish(orderId: string, event: LiveEvent) {
  bus.emit(orderId, event);
}

/** Ouvre un flux SSE ; `filter` permet de ne pousser qu'une partie des événements (page publique). */
export function openStream(res: Response, orderId: string, filter: (e: LiveEvent) => boolean = () => true, initial?: LiveEvent[]) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (e: LiveEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  initial?.forEach(send);
  const listener = (e: LiveEvent) => filter(e) && send(e);
  bus.on(orderId, listener);
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  res.on("close", () => {
    clearInterval(ping);
    bus.off(orderId, listener);
  });
}
