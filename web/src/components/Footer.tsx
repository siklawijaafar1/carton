import Link from "next/link";
import { Logo } from "./Logo";
import { MOYENS_PAIEMENT } from "@/lib/offres";

export function Footer() {
  return (
    <footer className="pied">
      <div className="conteneur pied-grille">
        <div>
          <Logo />
          <p className="doux" style={{ maxWidth: 340, marginTop: 18 }}>
            Maison de papeterie numérique à Abidjan. Invitations de mariage, de gala et de réception, conçues comme des objets précieux.
          </p>
        </div>
        <div>
          <p className="eyebrow">Créer</p>
          <ul>
            <li><Link href="/commander?formule=BASIC">Formule Basic</Link></li>
            <li><Link href="/commander?formule=PRO">Formule Pro</Link></li>
            <li><Link href="/commander?formule=SUPER">Formule Super VIP</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">Paiement</p>
          <ul className="doux">
            {MOYENS_PAIEMENT.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow">Contact</p>
          <ul className="doux">
            <li>Abidjan · Cocody</li>
            <li>Lun – Sam · 9 h – 19 h</li>
          </ul>
        </div>
      </div>
      <div className="conteneur pied-bas">
        <span>© {new Date().getFullYear()} Sceau · Côte d'Ivoire</span>
        <span className="script or" style={{ fontSize: "1.6rem" }}>L'art de recevoir</span>
      </div>
      <style>{`
        .pied { border-top: 1px solid var(--filet); padding-top: 72px; background: linear-gradient(180deg, transparent, rgba(201,163,92,.04)); }
        .pied-grille { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 40px; }
        .pied ul { list-style: none; padding: 0; margin: 18px 0 0; display: grid; gap: 10px; font-size: .95rem; }
        .pied ul a { color: var(--texte-doux); transition: color .3s; }
        .pied ul a:hover { color: var(--or-clair); }
        .pied-bas { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-block: 28px; margin-top: 56px; border-top: 1px solid var(--filet); font-size: .8rem; color: var(--texte-doux); letter-spacing: .08em; }
        @media (max-width: 860px) { .pied-grille { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 520px) { .pied-grille { grid-template-columns: 1fr; } .pied-bas { flex-direction: column; } }
      `}</style>
    </footer>
  );
}
