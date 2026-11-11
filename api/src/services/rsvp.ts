import { prisma } from "../db.js";
import type { RsvpCounts } from "./events.js";

export async function rsvpCounts(orderId: string): Promise<RsvpCounts> {
  const groups = await prisma.guest.groupBy({
    by: ["status"],
    where: { orderId },
    _count: { _all: true },
    _sum: { seats: true },
  });
  const counts: RsvpCounts = { accepted: 0, declined: 0, pending: 0, seats: 0 };
  for (const g of groups) {
    if (g.status === "ACCEPTED") {
      counts.accepted = g._count._all;
      counts.seats = g._sum.seats ?? 0;
    } else if (g.status === "DECLINED") counts.declined = g._count._all;
    else counts.pending = g._count._all;
  }
  return counts;
}

/** Empreinte légère de l'état d'une commande (statut de production + dernière modification d'invité). */
export async function orderFingerprint(orderId: string): Promise<string> {
  const [order, latest] = await Promise.all([
    prisma.order.findUnique({ where: { id: orderId }, select: { updatedAt: true, fulfillment: true, progress: true, paymentStatus: true } }),
    prisma.guest.aggregate({ where: { orderId }, _max: { updatedAt: true } }),
  ]);
  return `${order?.paymentStatus}|${order?.fulfillment}|${order?.progress}|${order?.updatedAt.getTime()}|${latest._max.updatedAt?.getTime()}`;
}
