"use client";

import { useEffect, useState } from "react";
import { api, API_URL, ApiError, formatEventDate, type Counts, type Design, type RsvpStatus } from "@/lib/api";
import { SealMark } from "@/components/Logo";
import s from "./rsvp.module.css";

interface InvitationData {
  guest: { name: string; status: RsvpStatus; seats: number; note: string | null; respondedAt: string | null };
  event: { type: string; title: string; date: string; venue: string; city: string; message: string | null; dressCode: string | null; hosts: string; design: Design };
  cardUrl: string | null;
  counts: Counts;
  closed: boolean;
}

const TEINTES: Record<string, { fond: string; or: string }> = {
  ivoire: { fond: "#1a160f", or: "#c9a35c" },
  "noir-or": { fond: "#0e0d0b", or: "#d4af6a" },
  "rose-poudre": { fond: "#1d1214", or: "#d79aa2" },
  emeraude: { fond: "#0a1f19", or: "#d8b773" },
  minuit: { fond: "#0a1120", or: "#e2c99a" },
};

function icsFile(d: InvitationData) {
  const start = new Date(d.event.date);
  const end = new Date(start.getTime() + 5 * 3600_000);
  const fmt = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (t: string) => t.replace(/([,;\\])/g, "\\$1");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Carton//Invitation//FR",
    "BEGIN:VEVENT",
    `UID:${fmt(start)}-${encodeURIComponent(d.event.title)}@carton`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(`${d.event.type} · ${d.event.title}`)}`,
    `LOCATION:${esc(`${d.event.venue}, ${d.event.city}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function Invitation({ token }: { token: string }) {
  const [data, setData] = useState<InvitationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState(false);
  const [choix, setChoix] = useState<RsvpStatus | null>(null);
  const [seats, setSeats] = useState(1);
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [modifier, setModifier] = useState(false);

  useEffect(() => {
    api<InvitationData>(`/rsvp/${token}`)
      .then((d) => {
        setData(d);
        setSeats(d.guest.seats);
        setNote(d.guest.note ?? "");
        if (d.guest.status !== "PENDING") setOuverte(true);
      })
      .catch((e: ApiError) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (!data) return;
    const es = new EventSource(`${API_URL}/api/rsvp/${token}/stream`);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data);
      if (e.type === "counts") setData((d) => (d ? { ...d, counts: e.counts } : d));
    };
    return () => es.close();
  }, [token, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function repondre(status: RsvpStatus) {
    setEnvoi(true);
    setError(null);
    try {
      const r = await api<{ status: RsvpStatus; seats: number; counts: Counts }>(`/rsvp/${token}`, {
        method: "POST",
        body: JSON.stringify({ status, seats, note: note.trim() || undefined }),
      });
      setData((d) => (d ? { ...d, counts: r.counts, guest: { ...d.guest, status: r.status, seats: r.seats, note: note.trim() || null, respondedAt: new Date().toISOString() } } : d));
      setModifier(false);
      setChoix(null);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setEnvoi(false);
    }
  }

  const teinte = TEINTES[data?.event.design.theme ?? "noir-or"] ?? TEINTES["noir-or"]!;
  const style = { "--teinte": data?.event.design.primary ?? teinte.or, "--fond-theme": teinte.fond } as React.CSSProperties;

  if (error && !data) {
    return (
      <main className={s.page} style={style}>
        <div className={s.message}>
          <SealMark size={64} />
          <h1 className="display">Invitation introuvable</h1>
          <p className="doux">Ce lien n'est pas valide ou a expiré. Contactez la personne qui vous a invité.</p>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className={s.page} style={style}>
        <span className="chargement" />
      </main>
    );
  }

  const { guest, event, counts } = data;
  const repondu = guest.status !== "PENDING" && !modifier;
  const accord = /^(mme|mademoiselle|madame|mlle)\b/i.test(guest.name) ? "e" : /^(m\.|monsieur|mr|dr)\s/i.test(guest.name) ? "" : "(e)";
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue}, ${event.city}, Côte d'Ivoire`)}`;

  return (
    <main className={s.page} style={style}>
      <div className={s.lumiere} aria-hidden="true" />

      {/* ---------- Enveloppe ---------- */}
      {!ouverte && (
        <section className={s.scene}>
          <p className="eyebrow">Une invitation pour vous</p>
          <p className={`script ${s.destinataire}`}>{guest.name}</p>
          <button className={s.enveloppe} onClick={() => setOuverte(true)} aria-label="Ouvrir l'invitation">
            <span className={s.dos} />
            <span className={s.rabat} />
            <span className={s.cachet}>
              <SealMark size={74} />
            </span>
          </button>
          <p className={s.indice}>Touchez le sceau pour ouvrir</p>
        </section>
      )}

      {/* ---------- Invitation ouverte ---------- */}
      {ouverte && (
        <section className={s.ouverte}>
          <div className={s.carteZone}>
            {data.cardUrl ? <img src={data.cardUrl} alt={`Carte d'invitation — ${event.title}`} className={s.carte} /> : <div className={s.carte} />}
          </div>

          <div className={`verre ${s.panneau}`}>
            <p className="eyebrow">
              {event.type} · {event.hosts}
            </p>
            <h1 className={`script ${s.titre}`}>{event.title}</h1>
            <dl className={s.infos}>
              <div>
                <dt>Quand</dt>
                <dd>{formatEventDate(event.date)}</dd>
              </div>
              <div>
                <dt>Où</dt>
                <dd>
                  {event.venue}
                  <br />
                  <span className="doux">{event.city}</span>
                </dd>
              </div>
              {event.dressCode && (
                <div>
                  <dt>Tenue</dt>
                  <dd>{event.dressCode}</dd>
                </div>
              )}
            </dl>
            <div className={s.liens}>
              <a href={maps} target="_blank" rel="noreferrer" className="btn btn-ligne btn-petit">
                Itinéraire
              </a>
              <a href={`data:text/calendar;charset=utf-8,${encodeURIComponent(icsFile(data))}`} download="invitation.ics" className="btn btn-ligne btn-petit">
                Ajouter à mon agenda
              </a>
            </div>

            <hr className="filet" />

            {data.closed ? (
              <p className="doux">L'événement est passé, les réponses sont closes. Merci !</p>
            ) : repondu ? (
              <div className={s.merci}>
                <p className="eyebrow">Réponse enregistrée</p>
                <p className="display">
                  {guest.status === "ACCEPTED" ? (
                    <>
                      Merci, à très bientôt <span className="script">!</span>
                    </>
                  ) : (
                    "Vous nous manquerez."
                  )}
                </p>
                <p className="doux">
                  {guest.status === "ACCEPTED"
                    ? `${guest.seats} place${guest.seats > 1 ? "s" : ""} réservée${guest.seats > 1 ? "s" : ""} à votre nom.`
                    : "Votre absence a bien été notée."}
                </p>
                <button className="lien-or" style={{ background: "none", cursor: "pointer", justifySelf: "start" }} onClick={() => setModifier(true)}>
                  Modifier ma réponse
                </button>
              </div>
            ) : (
              <div className={s.reponse}>
                <p className="display" style={{ fontSize: "1.6rem" }}>
                  Serez-vous des nôtres ?
                </p>
                <div className={s.choix}>
                  <button className={`${s.option} ${choix === "ACCEPTED" ? s.optionOui : ""}`} onClick={() => setChoix("ACCEPTED")} aria-pressed={choix === "ACCEPTED"}>
                    <span>✓</span>Je serai présent{accord}
                  </button>
                  <button className={`${s.option} ${choix === "DECLINED" ? s.optionNon : ""}`} onClick={() => setChoix("DECLINED")} aria-pressed={choix === "DECLINED"}>
                    <span>✕</span>Je ne pourrai pas venir
                  </button>
                </div>
                {choix === "ACCEPTED" && (
                  <div className={s.places}>
                    <span>Nombre de places</span>
                    <div className={s.stepper}>
                      <button onClick={() => setSeats((n) => Math.max(1, n - 1))} aria-label="Moins">
                        −
                      </button>
                      <b>{seats}</b>
                      <button onClick={() => setSeats((n) => Math.min(10, n + 1))} aria-label="Plus">
                        +
                      </button>
                    </div>
                  </div>
                )}
                {choix && (
                  <>
                    <textarea
                      className="saisie"
                      rows={3}
                      maxLength={280}
                      placeholder={choix === "ACCEPTED" ? "Un mot pour les hôtes (facultatif)" : "Un mot d'excuse (facultatif)"}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <button className="btn btn-or" disabled={envoi} onClick={() => repondre(choix)}>
                      {envoi ? <span className="chargement" /> : "Envoyer ma réponse"}
                    </button>
                  </>
                )}
                {error && <p className="erreur">{error}</p>}
              </div>
            )}

            {counts.accepted > 0 && (
              <p className={s.direct}>
                <i />
                {counts.accepted} invité{counts.accepted > 1 ? "s ont" : " a"} déjà confirmé {counts.accepted > 1 ? "leur" : "sa"} présence
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
