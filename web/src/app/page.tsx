import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/Reveal";
import { OFFRES, MOYENS_PAIEMENT } from "@/lib/offres";
import { fcfa } from "@/lib/api";
import s from "./accueil.module.css";

const THEMES = [
  { id: "ivoire", nom: "Ivoire classique", fond: "#f7f1e6", or: "#a8834a" },
  { id: "noir-or", nom: "Noir & or", fond: "#0e0d0b", or: "#d4af6a" },
  { id: "rose-poudre", nom: "Rose poudré", fond: "#f4e1dc", or: "#b0707a" },
  { id: "emeraude", nom: "Émeraude royale", fond: "#0d2a22", or: "#d8b773" },
  { id: "minuit", nom: "Bleu minuit", fond: "#0c1424", or: "#e2c99a" },
];

const ETAPES = [
  { n: "I", titre: "Choisissez votre formule", texte: "Basic, Pro ou Super VIP : selon que vous souhaitez une carte élégante ou un service de réception complet." },
  { n: "II", titre: "Composez dans l'atelier", texte: "Événement, thème, couleurs, typographies : l'aperçu se met à jour à chaque retouche, comme chez un graveur." },
  { n: "III", titre: "Réglez en un geste", texte: "Wave, Orange Money, MTN MoMo, Moov Money ou carte bancaire. La validation déclenche aussitôt la production." },
  { n: "IV", titre: "Recevez, diffusez, suivez", texte: "Téléchargez vos cartes, ou laissez-nous les envoyer et suivez les réponses de vos invités en direct." },
];

const QUESTIONS = [
  {
    q: "Combien de temps faut-il pour recevoir mes cartes ?",
    r: "Quelques minutes après la confirmation du paiement. En formule Super, l'envoi WhatsApp & SMS démarre automatiquement dès que les cartes sont prêtes.",
  },
  {
    q: "Quels moyens de paiement acceptez-vous ?",
    r: "Wave, Orange Money, MTN MoMo, Moov Money ainsi que les cartes VISA et Mastercard, via un agrégateur de paiement agréé en Afrique de l'Ouest.",
  },
  {
    q: "Mes invités doivent-ils installer une application ?",
    r: "Non. Chaque invité reçoit sa carte et un lien personnel ; il confirme sa présence en un toucher depuis son téléphone.",
  },
  {
    q: "Que se passe-t-il pour les invités qui ne répondent pas ?",
    r: "En formule Super, ils apparaissent dans votre liste de relance. Notre équipe peut les appeler pour vous et noter leur réponse, qui s'affiche aussitôt dans votre tableau de bord.",
  },
  {
    q: "Puis-je imprimer les cartes ?",
    r: "Oui. Les cartes sont livrées au format 5 × 7 pouces en haute définition, prêtes pour l'impression comme pour WhatsApp.",
  },
];

export default function Accueil() {
  return (
    <>
      <Header />
      <main>
        {/* ---------------- Ouverture ---------------- */}
        <section className={s.hero}>
          <div className={s.halo} aria-hidden="true" />
          <div className={`conteneur ${s.heroGrille}`}>
            <div className={s.heroTexte}>
              <Reveal>
                <span className="eyebrow">Maison d'invitations · Abidjan</span>
              </Reveal>
              <Reveal delay={0.1}>
                <h1 className={`display ${s.titre}`}>
                  L'art de recevoir,
                  <br />
                  <span className="script or">scellé d'élégance.</span>
                </h1>
              </Reveal>
              <Reveal delay={0.2}>
                <p className={s.chapeau}>
                  Des cartes d'invitation dignes des plus belles réceptions : noms gravés en lettres d'or, envoi WhatsApp &amp; SMS, et réponses de vos invités en temps réel.
                </p>
              </Reveal>
              <Reveal delay={0.3} className={s.actions}>
                <Link href="/commander" className="btn btn-or">
                  Créer mon invitation
                </Link>
                <a href="#offres" className="btn btn-ligne">
                  Voir les offres
                </a>
              </Reveal>
              <Reveal delay={0.4}>
                <ul className={s.paiements} aria-label="Moyens de paiement acceptés">
                  {MOYENS_PAIEMENT.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Reveal>
            </div>

            <div className={s.scene} aria-hidden="true">
              <img src="/echantillons/emeraude.png" alt="" className={`${s.carte} ${s.carteGauche}`} />
              <img src="/echantillons/rose-poudre.png" alt="" className={`${s.carte} ${s.carteDroite}`} />
              <img src="/echantillons/noir-or.png" alt="" className={`${s.carte} ${s.carteCentre}`} />
              <div className={`verre ${s.bulle} ${s.bulleHaut}`}>
                <span className={s.point} />
                <div>
                  <strong>Fatou Bamba</strong>
                  <small>vient de confirmer · 2 places</small>
                </div>
              </div>
              <div className={`verre ${s.bulle} ${s.bulleBas}`}>
                <div className={s.mini}>
                  <b>128</b>
                  <small>présents</small>
                </div>
                <div className={s.mini}>
                  <b>14</b>
                  <small>absents</small>
                </div>
                <div className={s.mini}>
                  <b>38</b>
                  <small>en attente</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Offres ---------------- */}
        <section id="offres" className="section">
          <div className="conteneur">
            <Reveal className="section-tete centre">
              <span className="eyebrow">Trois formules</span>
              <h2 className="display">
                Du faire-part soigné au <em className="or">service d'exception</em>
              </h2>
              <p className="doux">Un tarif unique par événement, sans abonnement. Réglez en Mobile Money ou par carte.</p>
            </Reveal>

            <div className={s.offres}>
              {OFFRES.map((o, i) => (
                <Reveal key={o.id} delay={i * 0.12} className={`verre ${s.offre} ${o.vedette ? s.vedette : ""}`}>
                  {o.vedette && <span className={s.ruban}>Clé en main</span>}
                  <p className="eyebrow">{o.nom}</p>
                  <p className={s.prix}>
                    <span className="display">{new Intl.NumberFormat("fr-FR").format(o.prix).replace(/ /g, " ")}</span>
                    <small>FCFA</small>
                  </p>
                  <p className={`doux ${s.accroche}`}>{o.accroche}</p>
                  <hr className="filet" />
                  <ul className={s.points}>
                    {o.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  <Link href={`/commander?formule=${o.id}`} className={`btn ${o.vedette ? "btn-or" : "btn-ligne"}`}>
                    Choisir {o.nom}
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Atelier ---------------- */}
        <section id="atelier" className={`section ${s.atelier}`}>
          <div className={`conteneur ${s.atelierGrille}`}>
            <Reveal className="section-tete">
              <span className="eyebrow" style={{ color: "#8a6a32" }}>L'atelier</span>
              <h2 className="display">
                Cinq univers,
                <br />
                <span className="script" style={{ color: "#a8834a" }}>une infinité de nuances.</span>
              </h2>
              <p style={{ color: "var(--encre-douce)" }}>
                Filets art déco, sceau monogramme, typographies de graveur. Ajustez la couleur de l'or, choisissez une calligraphie : l'aperçu se compose sous vos yeux. En Super VIP, un fond unique est peint par intelligence artificielle pour votre seul événement.
              </p>
              <Link href="/commander?formule=PRO" className="btn btn-sombre" style={{ marginTop: 28 }}>
                Ouvrir l'atelier
              </Link>
            </Reveal>
            <div className={s.nuancier}>
              {THEMES.map((t, i) => (
                <Reveal key={t.id} delay={i * 0.08} className={s.nuance}>
                  <img src={`/echantillons/${t.id}.png`} alt={`Carte au thème ${t.nom}`} loading="lazy" />
                  <span>
                    <i style={{ background: t.fond, borderColor: t.or }} />
                    {t.nom}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Déroulé ---------------- */}
        <section className="section">
          <div className="conteneur">
            <Reveal className="section-tete centre">
              <span className="eyebrow">Le déroulé</span>
              <h2 className="display">Quatre gestes, aucun souci</h2>
            </Reveal>
            <ol className={s.etapes}>
              {ETAPES.map((e, i) => (
                <Reveal as="li" key={e.n} delay={i * 0.1} className={s.etape}>
                  <span className={`display or ${s.chiffre}`}>{e.n}</span>
                  <h3 className="display">{e.titre}</h3>
                  <p className="doux">{e.texte}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- RSVP ---------------- */}
        <section id="rsvp" className={`section ${s.rsvp}`}>
          <div className={`conteneur ${s.rsvpGrille}`}>
            <Reveal className={s.telephone} aria-hidden="true">
              <div className={s.ecran}>
                <p className="eyebrow" style={{ fontSize: ".58rem" }}>Invitation personnelle</p>
                <p className="display" style={{ fontSize: "1.3rem", fontStyle: "italic", marginTop: 6 }}>
                  Fatou Bamba
                </p>
                <img src="/echantillons/noir-or.png" alt="" className={s.ecranCarte} />
                <div className={s.ecranBoutons}>
                  <span className="btn btn-or btn-petit">Je serai présente</span>
                  <span className="btn btn-ligne btn-petit">Absente</span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.15} className="section-tete">
              <span className="eyebrow">Formule Super VIP</span>
              <h2 className="display">
                Vos invités répondent,
                <br />
                <span className="script or">vous le voyez en direct.</span>
              </h2>
              <p className="doux">
                Chaque invité reçoit sa carte nominative par WhatsApp et SMS, avec un lien vers sa page de réponse. Votre tableau de bord compte en temps réel les présents, les absents et les places réservées.
              </p>
              <ul className={s.liste}>
                <li>Envoi automatique dès le paiement confirmé</li>
                <li>Compteur Présent · Absent · En attente, mis à jour à la seconde</li>
                <li>Liste des non-répondants prête pour la relance téléphonique</li>
                <li>Export CSV pour votre protocole et votre traiteur</li>
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ---------------- Questions ---------------- */}
        <section id="questions" className="section">
          <div className="conteneur" style={{ maxWidth: 860 }}>
            <Reveal className="section-tete centre">
              <span className="eyebrow">Questions</span>
              <h2 className="display">Tout ce qu'il faut savoir</h2>
            </Reveal>
            <div className={s.faq}>
              {QUESTIONS.map((item, i) => (
                <Reveal key={item.q} delay={i * 0.06}>
                  <details className={s.question}>
                    <summary>
                      <span className="display">{item.q}</span>
                      <i aria-hidden="true" />
                    </summary>
                    <p className="doux">{item.r}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Appel final ---------------- */}
        <section className={`section ${s.final}`}>
          <Reveal className="conteneur centre" style={{ maxWidth: 760 }}>
            <div className="ornement">✦</div>
            <h2 className="display" style={{ fontSize: "clamp(2.4rem, 6vw, 4.4rem)", marginTop: 24 }}>
              Votre grand jour mérite
              <br />
              <span className="script or">une première impression inoubliable.</span>
            </h2>
            <div className={s.actions} style={{ justifyContent: "center", marginTop: 40 }}>
              <Link href="/commander?formule=SUPER" className="btn btn-or">
                Super VIP · {fcfa(200_000)}
              </Link>
              <Link href="/commander" className="btn btn-ligne">
                Commencer simplement
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </>
  );
}
