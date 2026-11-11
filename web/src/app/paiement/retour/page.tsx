"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError, type OrderView } from "@/lib/api";
import { SealMark } from "@/components/Logo";
import s from "../paiement.module.css";

function Retour() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("commande") ?? "";
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);

  useEffect(() => {
    if (!token) return setError("Lien de commande incomplet.");
    let stop = false;
    let n = 0;
    const tick = async () => {
      try {
        // reconcile=1 : interroge l'agrégateur si sa notification n'est pas encore arrivée
        const { order } = await api<{ order: OrderView }>(`/orders/${token}?reconcile=${n % 3 === 0 ? 1 : 0}`);
        if (stop) return;
        setOrder(order);
        if (order.paymentStatus === "PAID") {
          setTimeout(() => router.replace(`/espace/${token}`), 1600);
          return;
        }
        if (order.paymentStatus === "FAILED") return;
      } catch (e) {
        if (!stop) setError((e as ApiError).message);
        return;
      }
      if (++n < 40) setTimeout(tick, 2500);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [token, router, retry]);

  async function reessayer() {
    try {
      const { paymentUrl } = await api<{ paymentUrl: string }>(`/orders/${token}/checkout`, { method: "POST" });
      window.location.href = paymentUrl;
    } catch (e) {
      setError((e as ApiError).message);
      setRetry((r) => !r);
    }
  }

  const statut = order?.paymentStatus;
  return (
    <main className={s.page}>
      <div className={`verre ${s.boite} ${s.centre}`}>
        <div className={`${s.sceau} ${statut === "PAID" ? s.scelle : ""}`}>
          <SealMark size={88} />
        </div>
        {error ? (
          <>
            <h1 className="display">Un instant…</h1>
            <p className="erreur">{error}</p>
          </>
        ) : statut === "PAID" ? (
          <>
            <p className="eyebrow">Paiement confirmé</p>
            <h1 className="display">
              Merci, <span className="script or">c'est scellé.</span>
            </h1>
            <p className="doux">Vos cartes sont en préparation. Ouverture de votre espace…</p>
          </>
        ) : statut === "FAILED" ? (
          <>
            <p className="eyebrow">Paiement non abouti</p>
            <h1 className="display">Le paiement n'a pas été validé</h1>
            <p className="doux">Aucun montant n'a été prélevé. Vous pouvez réessayer avec le moyen de votre choix.</p>
            <button className="btn btn-or" onClick={reessayer}>
              Réessayer le paiement
            </button>
          </>
        ) : (
          <>
            <p className="eyebrow">Vérification</p>
            <h1 className="display">Confirmation de votre paiement</h1>
            <p className="doux">Nous attendons la validation de votre opérateur. Gardez cette page ouverte.</p>
            <span className="chargement" style={{ margin: "8px auto 0" }} />
          </>
        )}
        <Link href={`/espace/${token}`} className="lien-or" style={{ fontSize: ".85rem" }}>
          Accéder à mon espace
        </Link>
      </div>
    </main>
  );
}

export default function RetourPage() {
  return (
    <Suspense fallback={null}>
      <Retour />
    </Suspense>
  );
}
