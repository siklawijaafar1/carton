"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError, fcfa, type OrderView } from "@/lib/api";
import { SealMark } from "@/components/Logo";
import s from "../paiement.module.css";

const METHODES = [
  { id: "WAVECI", nom: "Wave", teinte: "#1dc8ff" },
  { id: "OMCIV2", nom: "Orange Money", teinte: "#ff7900" },
  { id: "MOMOCI", nom: "MTN MoMo", teinte: "#ffcc00" },
  { id: "FLOOZ", nom: "Moov Money", teinte: "#0066b3" },
  { id: "CARD", nom: "Carte VISA / Mastercard", teinte: "#e6cf9a" },
] as const;

function Simulation() {
  const params = useSearchParams();
  const tx = params.get("tx") ?? "";
  const token = params.get("commande") ?? "";
  const [order, setOrder] = useState<OrderView | null>(null);
  const [methode, setMethode] = useState<string>("WAVECI");
  const [busy, setBusy] = useState<"ACCEPTED" | "REFUSED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) api<{ order: OrderView }>(`/orders/${token}`).then((r) => setOrder(r.order)).catch((e: ApiError) => setError(e.message));
  }, [token]);

  async function conclure(outcome: "ACCEPTED" | "REFUSED") {
    setBusy(outcome);
    setError(null);
    try {
      await api("/payments/simulate", { method: "POST", body: JSON.stringify({ transactionId: tx, outcome, method: methode }) });
      await new Promise((r) => setTimeout(r, 900)); // le temps d'un « paiement »
      window.location.href = `/paiement/retour?commande=${token}`;
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(null);
    }
  }

  return (
    <main className={s.page}>
      <div className={`verre ${s.boite}`}>
        <div className={s.bandeau}>Mode développement · aucun débit réel</div>
        <div className={s.entete}>
          <SealMark size={42} />
          <div>
            <p className="eyebrow">Paiement sécurisé</p>
            <p className="display" style={{ fontSize: "1.6rem" }}>
              {order ? `${order.pack.name} · ${order.eventTitle}` : "Commande"}
            </p>
          </div>
        </div>
        <p className={s.montant}>
          <span className="display">{order ? fcfa(order.pack.price) : "—"}</span>
        </p>

        <fieldset className={s.methodes}>
          <legend className="sr-only">Moyen de paiement</legend>
          {METHODES.map((m) => (
            <label key={m.id} className={`${s.methode} ${methode === m.id ? s.choisi : ""}`}>
              <input type="radio" name="m" value={m.id} checked={methode === m.id} onChange={() => setMethode(m.id)} className="sr-only" />
              <i style={{ background: m.teinte }} />
              {m.nom}
            </label>
          ))}
        </fieldset>

        {error && <p className="erreur">{error}</p>}

        <button className="btn btn-or" style={{ width: "100%" }} disabled={!order || busy !== null || order.paymentStatus === "PAID"} onClick={() => conclure("ACCEPTED")}>
          {busy === "ACCEPTED" ? <span className="chargement" /> : "Confirmer le paiement"}
        </button>
        <button className={s.refus} disabled={!order || busy !== null} onClick={() => conclure("REFUSED")}>
          Simuler un paiement refusé
        </button>
        <p className={s.note}>
          En production, cette étape est la page de l'agrégateur (CinetPay) ; sa notification serveur déclenche ensuite la génération des cartes.
        </p>
      </div>
    </main>
  );
}

export default function SimulationPage() {
  return (
    <Suspense fallback={null}>
      <Simulation />
    </Suspense>
  );
}
