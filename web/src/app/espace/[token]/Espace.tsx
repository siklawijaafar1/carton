"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, API_URL, ApiError, fcfa, formatEventDate, formatPhone, STATUS_LABEL, type Counts, type GuestView, type OrderView, type RsvpStatus } from "@/lib/api";
import s from "./espace.module.css";

type Filtre = "TOUS" | RsvpStatus | "RELANCE";

const ETAPES_PROD = [
  { id: "PAYE", label: "Paiement" },
  { id: "GENERATING", label: "Création des cartes" },
  { id: "SENDING", label: "Envoi WhatsApp & SMS" },
  { id: "READY", label: "Prêt" },
];

const RANG: Record<string, number> = { WAITING_PAYMENT: -1, QUEUED: 0, GENERATING: 1, SENDING: 2, READY: 3, FAILED: 1 };

const METHODES: Record<string, string> = { WAVECI: "Wave", OMCIV2: "Orange Money", MOMOCI: "MTN MoMo", FLOOZ: "Moov Money", CARD: "Carte bancaire" };

export function Espace({ token }: { token: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [counts, setCounts] = useState<Counts>({ accepted: 0, declined: 0, pending: 0, seats: 0 });
  const [error, setError] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("TOUS");
  const [recherche, setRecherche] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ order: OrderView; counts: Counts }>(`/orders/${token}`);
      setOrder(r.order);
      setCounts(r.counts);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- Temps réel (Server-Sent Events) ---------- */
  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/orders/${token}/stream`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    // Le serveur pousse un instantané complet à chaque changement en base.
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as { type: string; order: OrderView; counts: Counts };
      if (e.type !== "snapshot") return;
      setOrder((prev) => {
        const changed = prev && e.order.guests.find((g) => prev.guests.find((p) => p.id === g.id)?.respondedAt !== g.respondedAt && g.respondedAt);
        if (changed) {
          setFlash(changed.id);
          setTimeout(() => setFlash(null), 2400);
        }
        return e.order;
      });
      setCounts(e.counts);
    };
    return () => es.close();
  }, [token]);

  async function patchGuest(id: string, patch: Partial<Pick<GuestView, "callDone" | "callNote" | "status">>) {
    setOrder((o) => (o ? { ...o, guests: o.guests.map((g) => (g.id === id ? { ...g, ...patch } : g)) } : o));
    try {
      await api(`/orders/${token}/guests/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    } catch (e) {
      setError((e as ApiError).message);
      load();
    }
  }

  async function renvoyer(id: string) {
    try {
      const { guest } = await api<{ guest: GuestView }>(`/orders/${token}/guests/${id}/resend`, { method: "POST" });
      setOrder((o) => (o ? { ...o, guests: o.guests.map((g) => (g.id === id ? guest : g)) } : o));
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  const guests = useMemo(() => {
    if (!order) return [];
    const q = recherche.trim().toLowerCase();
    return order.guests.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q) && !(g.phoneNumber ?? "").includes(q)) return false;
      if (filtre === "TOUS") return true;
      if (filtre === "RELANCE") return g.status === "PENDING";
      return g.status === filtre;
    });
  }, [order, filtre, recherche]);

  if (error && !order) {
    return (
      <main className={s.page}>
        <div className="conteneur centre">
          <h1 className="display">Espace introuvable</h1>
          <p className="doux">{error}</p>
          <Link href="/" className="btn btn-ligne">
            Retour à l'accueil
          </Link>
        </div>
      </main>
    );
  }
  if (!order) {
    return (
      <main className={s.page}>
        <div className="conteneur" style={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
          <span className="chargement" />
        </div>
      </main>
    );
  }

  const pack = order.pack;
  const total = order.guests.length;
  const progress =
    order.fulfillment === "GENERATING" && order.progressTotal > 0
      ? { step: "cards", done: order.progress, total: order.progressTotal }
      : order.fulfillment === "SENDING"
        ? { step: "sending", done: order.guests.filter((g) => g.delivery !== "NOT_SENT").length, total: order.guests.filter((g) => g.phoneNumber).length }
        : null;
  const rang = order.paymentStatus === "PAID" ? RANG[order.fulfillment] ?? 0 : -1;
  const etapes = ETAPES_PROD.filter((e) => e.id !== "SENDING" || pack.autoSend);
  const repondus = counts.accepted + counts.declined;
  const genericCard = order.guests.find((g) => g.cardUrl)?.cardUrl;

  return (
    <main className={s.page}>
      <div className={s.fond} aria-hidden="true" />
      <div className="conteneur">
        {/* ---------- En-tête ---------- */}
        <header className={s.tete}>
          <div>
            <span className="eyebrow">
              {order.eventType} · formule {pack.name}
            </span>
            <h1 className="display">
              <span className="script or">{order.eventTitle}</span>
            </h1>
            <p className="doux">
              {formatEventDate(order.eventDate)} — {order.venue}, {order.city}
            </p>
          </div>
          <div className={s.teteDroite}>
            {order.paymentStatus === "PAID" ? (
              <span className="pastille ok">
                Réglé · {fcfa(order.amountPaid)}
                {order.paymentMethod && ` · ${METHODES[order.paymentMethod] ?? order.paymentMethod}`}
              </span>
            ) : (
              <span className={`pastille ${order.paymentStatus === "FAILED" ? "ko" : "attente"}`}>
                {order.paymentStatus === "FAILED" ? "Paiement refusé" : "En attente de paiement"}
              </span>
            )}
            {pack.rsvp && <span className={`pastille ${live ? "ok" : "attente"}`}>{live ? "En direct" : "Connexion…"}</span>}
          </div>
        </header>

        {order.paymentStatus !== "PAID" && (
          <section className={`verre ${s.bloc}`}>
            <h2 className="display">Votre commande attend son règlement</h2>
            <p className="doux">Dès la confirmation de votre paiement, la création de vos cartes démarre automatiquement.</p>
            <button
              className="btn btn-or"
              onClick={async () => {
                try {
                  const { paymentUrl } = await api<{ paymentUrl: string }>(`/orders/${token}/checkout`, { method: "POST" });
                  window.location.href = paymentUrl;
                } catch (e) {
                  setError((e as ApiError).message);
                }
              }}
            >
              Payer {fcfa(pack.price)}
            </button>
          </section>
        )}

        {/* ---------- Production ---------- */}
        {order.paymentStatus === "PAID" && (
          <section className={`verre ${s.bloc}`}>
            <ol className={s.frise}>
              {etapes.map((e, i) => {
                const r = e.id === "PAYE" ? -0.5 : RANG[e.id]!;
                const state = order.fulfillment === "FAILED" && r === 1 ? "echec" : rang > r || (r === 3 && rang === 3) ? "fait" : rang === r ? "encours" : "";
                return (
                  <li key={e.id} className={s[state] ?? ""}>
                    <span className={s.jalon}>{state === "fait" ? "✓" : state === "echec" ? "!" : i + 1}</span>
                    <em>{e.label}</em>
                  </li>
                );
              })}
            </ol>
            {progress && order.fulfillment !== "READY" && (
              <div className={s.barre} role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
                <span style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }} />
                <small>
                  {progress.step === "cards" ? "Cartes" : "Envois"} : {progress.done} / {progress.total}
                </small>
              </div>
            )}
            {order.fulfillmentNote && <p className={s.note}>{order.fulfillmentNote}</p>}

            {order.fulfillment === "READY" && (
              <div className={s.livraison}>
                {(genericCard || order.backgroundUrl) && <img src={genericCard ?? order.backgroundUrl!} alt="Votre carte" className={s.vignette} />}
                <div>
                  <h2 className="display">Vos cartes sont prêtes</h2>
                  <p className="doux">
                    {pack.personalizedNames
                      ? `${total} cartes nominatives, nommées et numérotées, et la liste de vos invités.`
                      : "Votre carte en haute définition, au format statut WhatsApp, et la liste de vos invités."}
                    {pack.autoSend && " Elles ont été envoyées à vos invités par WhatsApp et SMS."}
                  </p>
                  {order.archiveParts > 1 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {Array.from({ length: order.archiveParts }, (_, i) => (
                        <a key={i} href={`${API_URL}/api/orders/${token}/archive?part=${i + 1}`} className={`btn ${i === 0 ? "btn-or" : "btn-ligne"}`}>
                          ZIP · partie {i + 1} / {order.archiveParts}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <a href={`${API_URL}/api/orders/${token}/archive`} className="btn btn-or">
                      Télécharger le dossier (ZIP)
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ---------- Tableau RSVP en direct ---------- */}
        {pack.rsvp && order.paymentStatus === "PAID" && (
          <>
            <section className={s.compteurs} aria-live="polite">
              <div className={`verre ${s.compteur} ${s.present}`}>
                <b className="display">{counts.accepted}</b>
                <span>Présents</span>
                <small>{counts.seats} place{counts.seats > 1 ? "s" : ""} réservée{counts.seats > 1 ? "s" : ""}</small>
              </div>
              <div className={`verre ${s.compteur} ${s.absent}`}>
                <b className="display">{counts.declined}</b>
                <span>Absents</span>
              </div>
              <div className={`verre ${s.compteur} ${s.attente}`}>
                <b className="display">{counts.pending}</b>
                <span>En attente</span>
              </div>
              <div className={`verre ${s.compteur}`}>
                <div
                  className={s.anneau}
                  style={{
                    background: `conic-gradient(var(--ok) 0 ${(100 * counts.accepted) / Math.max(1, total)}%, var(--ko) 0 ${(100 * repondus) / Math.max(1, total)}%, rgba(255,255,255,.08) 0)`,
                  }}
                >
                  <span>{Math.round((100 * repondus) / Math.max(1, total))}%</span>
                </div>
                <span>de réponses</span>
              </div>
            </section>

            <section className={`verre ${s.bloc}`}>
              <div className={s.outils}>
                <div className={s.onglets} role="tablist">
                  {(
                    [
                      ["TOUS", `Tous · ${total}`],
                      ["ACCEPTED", `Présents · ${counts.accepted}`],
                      ["DECLINED", `Absents · ${counts.declined}`],
                      ["PENDING", `En attente · ${counts.pending}`],
                      ["RELANCE", "Relances"],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} role="tab" aria-selected={filtre === id} className={filtre === id ? s.onglet + " " + s.ongletActif : s.onglet} onClick={() => setFiltre(id)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className={s.outilsDroite}>
                  <input className="saisie" placeholder="Rechercher un invité" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
                  <a className="btn btn-ligne btn-petit" href={`${API_URL}/api/orders/${token}/relances.csv`}>
                    Export relances
                  </a>
                </div>
              </div>

              {filtre === "RELANCE" && (
                <p className={s.note}>
                  Invités sans réponse. Après chaque appel, cochez « appelé », notez l'échange et enregistrez la réponse : les compteurs se mettent à jour pour tout le monde.
                </p>
              )}

              <div className={s.table} role="table">
                {guests.map((g) => (
                  <div key={g.id} role="row" className={`${s.ligne} ${flash === g.id ? s.flash : ""}`}>
                    <div role="cell" className={s.nom}>
                      <strong>{g.name}</strong>
                      <small>{g.phoneNumber ? formatPhone(g.phoneNumber) : "—"}</small>
                    </div>
                    <div role="cell">
                      <span className={`pastille ${g.status === "ACCEPTED" ? "ok" : g.status === "DECLINED" ? "ko" : "attente"}`}>
                        {STATUS_LABEL[g.status]}
                        {g.status === "ACCEPTED" && g.seats > 1 && ` · ${g.seats}`}
                      </span>
                      {g.rsvpNote && <small className={s.mot}>« {g.rsvpNote} »</small>}
                    </div>
                    <div role="cell" className={s.envoi}>
                      <small title={g.deliveryInfo ?? ""}>
                        {g.delivery === "SENT" ? "✓ Invitation envoyée" : g.delivery === "FAILED" ? "⚠ Échec d'envoi" : "Non envoyée"}
                      </small>
                    </div>
                    {filtre === "RELANCE" ? (
                      <div role="cell" className={s.relance}>
                        <label className={s.case}>
                          <input type="checkbox" checked={g.callDone} onChange={(e) => patchGuest(g.id, { callDone: e.target.checked })} />
                          appelé
                        </label>
                        <input
                          className="saisie"
                          defaultValue={g.callNote ?? ""}
                          placeholder="Note d'appel"
                          onBlur={(e) => e.target.value !== (g.callNote ?? "") && patchGuest(g.id, { callNote: e.target.value || null })}
                        />
                        <button className="btn btn-ligne btn-petit" onClick={() => patchGuest(g.id, { status: "ACCEPTED", callDone: true })}>
                          Présent
                        </button>
                        <button className="btn btn-ligne btn-petit" onClick={() => patchGuest(g.id, { status: "DECLINED", callDone: true })}>
                          Absent
                        </button>
                      </div>
                    ) : (
                      <div role="cell" className={s.actions}>
                        {g.rsvpUrl && (
                          <button className="btn btn-ligne btn-petit" onClick={() => navigator.clipboard?.writeText(g.rsvpUrl!)}>
                            Copier le lien
                          </button>
                        )}
                        {g.phoneNumber && (
                          <button className="btn btn-ligne btn-petit" onClick={() => renvoyer(g.id)}>
                            Renvoyer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {!guests.length && <p className="doux centre">Aucun invité dans cette vue.</p>}
              </div>
            </section>
          </>
        )}

        {/* ---------- Galerie (Pro / Super) ---------- */}
        {pack.personalizedNames && order.fulfillment === "READY" && (
          <section className={s.galerie}>
            <h2 className="display">Les cartes de vos invités</h2>
            <div className={s.cartes}>
              {order.guests
                .filter((g) => g.cardUrl)
                .slice(0, 24)
                .map((g) => (
                  <a key={g.id} href={g.cardUrl!} target="_blank" rel="noreferrer" className={s.carte}>
                    <img src={g.cardUrl!} alt={`Carte de ${g.name}`} loading="lazy" />
                    <span>{g.name}</span>
                  </a>
                ))}
            </div>
            {total > 24 && <p className="doux">… et {total - 24} autres dans le dossier ZIP.</p>}
          </section>
        )}

        {error && <p className="erreur">{error}</p>}
        <p className={s.prive}>Ce lien est privé : il donne accès à votre commande. Ne le partagez qu'avec les personnes de confiance.</p>
      </div>
    </main>
  );
}
