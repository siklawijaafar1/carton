"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, fcfa, formatEventDate, formatPhone } from "@/lib/api";
import { Header } from "@/components/Header";
import s from "./admin.module.css";

interface AdminOrder {
  id: string;
  accessToken: string;
  clientName: string;
  clientPhone: string;
  eventTitle: string;
  eventDate: string;
  pack: string;
  amountPaid: number;
  paymentStatus: string;
  paymentMethod: string | null;
  fulfillment: string;
  fulfillmentNote: string | null;
  guests: number;
  createdAt: string;
}

interface Followup {
  guestId: string;
  name: string;
  phoneNumber: string;
  delivery: string;
  sentAt: string | null;
  callNote: string | null;
  event: string;
  eventDate: string;
  host: string;
}

const PROD: Record<string, string> = {
  WAITING_PAYMENT: "—",
  QUEUED: "En file",
  GENERATING: "Création",
  SENDING: "Envoi",
  READY: "Prêt",
  FAILED: "Échec",
};

export default function AdminPage() {
  const [jeton, setJeton] = useState("");
  const [saisie, setSaisie] = useState("");
  const [vue, setVue] = useState<"commandes" | "relances">("commandes");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setJeton(sessionStorage.getItem("carton:admin") ?? "");
    } catch {}
  }, []);

  const auth = useCallback((init: RequestInit = {}) => ({ ...init, headers: { Authorization: `Bearer ${jeton}` } }), [jeton]);

  const load = useCallback(async () => {
    if (!jeton) return;
    try {
      const [o, f] = await Promise.all([
        api<{ orders: AdminOrder[]; revenue: number }>("/admin/orders", auth()),
        api<{ followups: Followup[] }>("/admin/followups?hours=0", auth()),
      ]);
      setOrders(o.orders);
      setRevenue(o.revenue);
      setFollowups(f.followups);
      setError(null);
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.status === 401) {
        setJeton("");
        try {
          sessionStorage.removeItem("carton:admin");
        } catch {}
      }
    }
  }, [jeton, auth]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function appel(guestId: string, patch: Record<string, unknown>) {
    try {
      await api(`/admin/guests/${guestId}`, { ...auth(), method: "PATCH", body: JSON.stringify(patch), headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" } });
      load();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  if (!jeton) {
    return (
      <>
        <Header minimal />
        <main className={s.page}>
          <form
            className={`verre ${s.connexion}`}
            onSubmit={(e) => {
              e.preventDefault();
              try {
                sessionStorage.setItem("carton:admin", saisie);
              } catch {}
              setJeton(saisie);
            }}
          >
            <p className="eyebrow">Back-office</p>
            <h1 className="display">Accès réservé</h1>
            <label className="champ">
              <span>Jeton administrateur</span>
              <input className="saisie" type="password" value={saisie} onChange={(e) => setSaisie(e.target.value)} autoComplete="off" />
            </label>
            {error && <p className="erreur">{error}</p>}
            <button className="btn btn-or">Entrer</button>
          </form>
        </main>
      </>
    );
  }

  const payees = orders.filter((o) => o.paymentStatus === "PAID");
  return (
    <>
      <Header minimal />
      <main className={s.page}>
        <div className="conteneur">
          <div className={s.kpis}>
            <div className="verre">
              <span>Chiffre d'affaires</span>
              <b className="display">{fcfa(revenue)}</b>
            </div>
            <div className="verre">
              <span>Commandes payées</span>
              <b className="display">{payees.length}</b>
            </div>
            <div className="verre">
              <span>En attente de paiement</span>
              <b className="display">{orders.filter((o) => o.paymentStatus === "PENDING").length}</b>
            </div>
            <div className="verre">
              <span>Appels à passer</span>
              <b className="display">{followups.length}</b>
            </div>
          </div>

          <div className={s.onglets}>
            <button className={vue === "commandes" ? s.actif : ""} onClick={() => setVue("commandes")}>
              Commandes
            </button>
            <button className={vue === "relances" ? s.actif : ""} onClick={() => setVue("relances")}>
              Relances téléphoniques
            </button>
          </div>
          {error && <p className="erreur">{error}</p>}

          {vue === "commandes" ? (
            <div className={`verre ${s.table}`}>
              <div className={`${s.ligne} ${s.entete}`}>
                <span>Événement</span>
                <span>Client</span>
                <span>Formule</span>
                <span>Paiement</span>
                <span>Production</span>
                <span />
              </div>
              {orders.map((o) => (
                <div key={o.id} className={s.ligne}>
                  <span>
                    <strong>{o.eventTitle}</strong>
                    <small>{formatEventDate(o.eventDate, false)} · {o.guests} invités</small>
                  </span>
                  <span>
                    {o.clientName}
                    <small>{o.clientPhone}</small>
                  </span>
                  <span>{o.pack}</span>
                  <span>
                    <span className={`pastille ${o.paymentStatus === "PAID" ? "ok" : o.paymentStatus === "FAILED" ? "ko" : "attente"}`}>
                      {o.paymentStatus === "PAID" ? fcfa(o.amountPaid) : o.paymentStatus === "FAILED" ? "Refusé" : "En attente"}
                    </span>
                    {o.paymentMethod && <small>{o.paymentMethod}</small>}
                  </span>
                  <span title={o.fulfillmentNote ?? ""}>{PROD[o.fulfillment] ?? o.fulfillment}</span>
                  <span className={s.actions}>
                    <Link className="lien-or" href={`/espace/${o.accessToken}`} target="_blank">
                      Espace
                    </Link>
                    {o.paymentStatus === "PAID" && (
                      <button className="lien-or" onClick={() => api(`/admin/orders/${o.id}/regenerate`, { ...auth(), method: "POST" }).then(load)}>
                        Régénérer
                      </button>
                    )}
                  </span>
                </div>
              ))}
              {!orders.length && <p className="doux" style={{ padding: 20 }}>Aucune commande pour l'instant.</p>}
            </div>
          ) : (
            <div className={`verre ${s.table}`}>
              {followups.map((f) => (
                <div key={f.guestId} className={`${s.ligne} ${s.ligneRelance}`}>
                  <span>
                    <strong>{f.name}</strong>
                    <small>
                      <a href={`tel:${f.phoneNumber}`} className="lien-or">
                        {formatPhone(f.phoneNumber)}
                      </a>
                    </small>
                  </span>
                  <span>
                    {f.event}
                    <small>
                      {formatEventDate(f.eventDate, false)} · chez {f.host}
                    </small>
                  </span>
                  <input className="saisie" defaultValue={f.callNote ?? ""} placeholder="Note d'appel" onBlur={(e) => e.target.value !== (f.callNote ?? "") && appel(f.guestId, { callNote: e.target.value || null })} />
                  <span className={s.actions}>
                    <button className="btn btn-ligne btn-petit" onClick={() => appel(f.guestId, { status: "ACCEPTED", callDone: true })}>
                      Présent
                    </button>
                    <button className="btn btn-ligne btn-petit" onClick={() => appel(f.guestId, { status: "DECLINED", callDone: true })}>
                      Absent
                    </button>
                    <button className="btn btn-ligne btn-petit" onClick={() => appel(f.guestId, { callDone: true })}>
                      Injoignable
                    </button>
                  </span>
                </div>
              ))}
              {!followups.length && <p className="doux" style={{ padding: 20 }}>Aucun invité à relancer.</p>}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
