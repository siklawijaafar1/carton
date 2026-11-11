export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export type PackId = "BASIC" | "PRO" | "SUPER";
export type RsvpStatus = "PENDING" | "ACCEPTED" | "DECLINED";
export type Fulfillment = "WAITING_PAYMENT" | "QUEUED" | "GENERATING" | "SENDING" | "READY" | "FAILED";

export interface Pack {
  id: PackId;
  name: string;
  price: number;
  maxGuests: number;
  personalizedNames: boolean;
  customDesign: boolean;
  aiBackground: boolean;
  autoSend: boolean;
  rsvp: boolean;
}

export interface Design {
  theme: string;
  primary?: string;
  ink?: string;
  background?: string;
  titleFont: string;
  aiPrompt?: string;
}

export interface GuestView {
  id: string;
  name: string;
  phoneNumber: string | null;
  status: RsvpStatus;
  seats: number;
  rsvpNote: string | null;
  respondedAt: string | null;
  callDone: boolean;
  callNote: string | null;
  delivery: "NOT_SENT" | "SENT" | "FAILED";
  deliveryInfo: string | null;
  sentAt: string | null;
  cardUrl: string | null;
  rsvpUrl: string | null;
}

export interface OrderView {
  id: string;
  accessToken: string;
  pack: Pack;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  eventType: string;
  eventTitle: string;
  eventDate: string;
  venue: string;
  city: string;
  message: string | null;
  dressCode: string | null;
  design: Design;
  amountPaid: number;
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  paymentMethod: string | null;
  paidAt: string | null;
  fulfillment: Fulfillment;
  fulfillmentNote: string | null;
  progress: number;
  progressTotal: number;
  archiveReady: boolean;
  backgroundUrl: string | null;
  createdAt: string;
  guests: GuestView[];
}

export interface Counts {
  accepted: number;
  declined: number;
  pending: number;
  seats: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError("Serveur injoignable. Vérifiez votre connexion.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Erreur ${res.status}`, res.status, body.issues);
  return body as T;
}

export const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ")} FCFA`;

export function formatEventDate(iso: string, withTime = true) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Abidjan" }).format(d);
  if (!withTime) return day;
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" }).format(d);
  return `${day} · ${time.replace(":", " h ")}`;
}

/** « +2250708091011 » → « +225 07 08 09 10 11 » */
export function formatPhone(e164: string) {
  const m = /^\+225(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+225 ${m.slice(1).join(" ")}` : e164;
}

export const STATUS_LABEL: Record<RsvpStatus, string> = {
  ACCEPTED: "Présent",
  DECLINED: "Absent",
  PENDING: "En attente",
};
