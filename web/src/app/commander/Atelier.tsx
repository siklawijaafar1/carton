"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, API_URL, ApiError, fcfa, type Design, type Pack, type PackId } from "@/lib/api";
import { OFFRES, TYPES_EVENEMENT, MOYENS_PAIEMENT } from "@/lib/offres";
import s from "./atelier.module.css";

interface Theme {
  id: string;
  label: string;
  background: string;
  primary: string;
  ink: string;
  dark: boolean;
}

interface Catalog {
  packs: Pack[];
  themes: Theme[];
  titleFonts: string[];
  paymentMode: "simulation" | "cinetpay";
}

interface GuestRow {
  key: number;
  name: string;
  phoneNumber: string;
}

const ETAPES = ["Formule", "Événement", "Design", "Invités", "Validation"] as const;

const POLICES: Record<string, { label: string; css: string }> = {
  GreatVibes: { label: "Calligraphie", css: "var(--font-script)" },
  Garamond: { label: "Garamond", css: "var(--font-display)" },
  Playfair: { label: "Playfair", css: "Georgia, serif" },
  Cinzel: { label: "Capitales romaines", css: "var(--font-display)" },
};

let keySeq = 0;
const newRow = (name = "", phoneNumber = ""): GuestRow => ({ key: ++keySeq, name, phoneNumber });

/** « Nom ; 07 00 00 00 00 » ou « Nom, +225… » ou « Nom<TAB>numéro », une ligne par invité. */
function parseList(text: string): GuestRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, i) => !(i === 0 && /^(nom|name)\b/i.test(line)))
    .map((line) => {
      const m = /^(.*?)[;,\t]\s*([+\d][\d\s.\-()]{7,})\s*$/.exec(line);
      return m ? newRow(m[1]!.replace(/^"|"$/g, "").trim(), m[2]!.trim()) : newRow(line.replace(/^"|"$/g, ""));
    })
    .filter((r) => r.name.length >= 2);
}

export function Atelier() {
  const params = useSearchParams();
  const initialPack = (["BASIC", "PRO", "SUPER"].includes(params.get("formule") ?? "") ? params.get("formule") : "PRO") as PackId;

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [etape, setEtape] = useState(0);
  const [packId, setPackId] = useState<PackId>(initialPack);
  const [evt, setEvt] = useState({
    eventType: "Mariage",
    eventTitle: "",
    date: "",
    time: "18:00",
    venue: "",
    city: "Abidjan",
    message: "",
    dressCode: "",
  });
  const [design, setDesign] = useState<Design>({ theme: "noir-or", titleFont: "GreatVibes" });
  const [guests, setGuests] = useState<GuestRow[]>([newRow()]);
  const [bulk, setBulk] = useState("");
  const [client, setClient] = useState({ clientName: "", clientPhone: "", clientEmail: "" });
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Catalog>("/catalog").then(setCatalog).catch((e: ApiError) => setError(e.message));
  }, []);

  const pack = catalog?.packs.find((p) => p.id === packId);
  const offre = OFFRES.find((o) => o.id === packId)!;
  const custom = pack?.customDesign ?? packId !== "BASIC";
  const filledGuests = guests.filter((g) => g.name.trim());
  const firstGuest = filledGuests[0]?.name.trim();

  /* ---------- Aperçu en direct (SVG rendu par l'API, même moteur que les cartes finales) ---------- */
  const previewBody = useMemo(
    () =>
      JSON.stringify({
        pack: packId,
        eventType: evt.eventType || "Mariage",
        eventTitle: evt.eventTitle.trim() || "Aïcha & Karim",
        eventDate: `${evt.date || "2026-12-12"}T${evt.time || "18:00"}`,
        venue: evt.venue.trim() || "Hôtel Ivoire, salle des Ambassadeurs",
        city: evt.city.trim() || "Abidjan",
        message: evt.message.trim() || undefined,
        dressCode: evt.dressCode.trim() || undefined,
        design: custom ? { ...design, aiPrompt: undefined } : { theme: "ivoire", titleFont: "GreatVibes" },
        guestName: firstGuest || undefined,
      }),
    [packId, evt, design, custom, firstGuest],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await fetch(`${API_URL}/api/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: previewBody,
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const url = URL.createObjectURL(new Blob([await res.text()], { type: "image/svg+xml" }));
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      } catch {
        /* aperçu facultatif */
      } finally {
        if (!ctrl.signal.aborted) setPreviewing(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [previewBody]);

  /* ---------- Validation par étape ---------- */
  function stepError(i: number): string | null {
    if (i === 1) {
      if (evt.eventTitle.trim().length < 2) return "Indiquez le titre de votre événement (ex. « Aïcha & Karim »).";
      if (!evt.date) return "Choisissez la date de l'événement.";
      if (evt.venue.trim().length < 2) return "Indiquez le lieu de réception.";
    }
    if (i === 3) {
      if (!filledGuests.length) return "Ajoutez au moins un invité.";
      if (pack && filledGuests.length > pack.maxGuests) return `La formule ${pack.name} couvre ${pack.maxGuests} invités maximum.`;
      if (pack?.autoSend && filledGuests.some((g) => !g.phoneNumber.trim())) return "En Super VIP, chaque invité doit avoir un numéro WhatsApp / SMS.";
    }
    if (i === 4) {
      if (client.clientName.trim().length < 2) return "Indiquez votre nom.";
      if (client.clientPhone.trim().length < 8) return "Indiquez votre numéro de téléphone.";
      if (!/^\S+@\S+\.\S+$/.test(client.clientEmail)) return "Indiquez une adresse e-mail valide.";
    }
    return null;
  }

  function go(next: number) {
    if (next > etape) {
      for (let i = etape; i < next; i++) {
        const err = stepError(i);
        if (err) {
          setError(err);
          setEtape(i);
          return;
        }
      }
    }
    setError(null);
    setIssues([]);
    setEtape(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function payer() {
    const err = stepError(4);
    if (err) return setError(err);
    setSubmitting(true);
    setError(null);
    setIssues([]);
    try {
      const { accessToken } = await api<{ accessToken: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          pack: packId,
          ...client,
          eventType: evt.eventType,
          eventTitle: evt.eventTitle,
          eventDate: `${evt.date}T${evt.time || "18:00"}`,
          venue: evt.venue,
          city: evt.city,
          message: evt.message,
          dressCode: evt.dressCode,
          design: custom ? design : { theme: "ivoire", titleFont: "GreatVibes" },
          guests: filledGuests.map((g) => ({ name: g.name, phoneNumber: g.phoneNumber || undefined })),
        }),
      });
      try {
        localStorage.setItem("sceau:derniere-commande", accessToken);
      } catch {}
      const { paymentUrl } = await api<{ paymentUrl: string }>(`/orders/${accessToken}/checkout`, { method: "POST" });
      window.location.href = paymentUrl;
    } catch (e) {
      const apiErr = e as ApiError;
      setError(apiErr.message);
      setIssues(apiErr.issues ?? []);
      setSubmitting(false);
    }
  }

  function importFile(file: File) {
    file.text().then((text) => {
      const rows = parseList(text);
      if (rows.length) setGuests((g) => [...g.filter((r) => r.name.trim()), ...rows]);
    });
  }

  const setE = (k: keyof typeof evt) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEvt((v) => ({ ...v, [k]: e.target.value }));

  const theme = catalog?.themes.find((t) => t.id === design.theme);

  return (
    <main className={s.page}>
      <div className={s.fond} aria-hidden="true" />
      <div className={`conteneur ${s.grille}`}>
        {/* ======================= Formulaire ======================= */}
        <section className={s.colonne}>
          <header className={s.tete}>
            <span className="eyebrow">L'atelier</span>
            <h1 className="display">
              Composez votre <span className="script or">invitation</span>
            </h1>
          </header>

          <ol className={s.etapes} aria-label="Étapes">
            {ETAPES.map((label, i) => (
              <li key={label} className={i === etape ? s.actif : i < etape ? s.fait : ""}>
                <button type="button" onClick={() => go(i)} aria-current={i === etape ? "step" : undefined}>
                  <span>{i < etape ? "✓" : i + 1}</span>
                  <em>{label}</em>
                </button>
              </li>
            ))}
          </ol>

          <div className={`verre ${s.panneau}`} key={etape}>
            {/* ---------- 1. Formule ---------- */}
            {etape === 0 && (
              <div className={s.formules}>
                {OFFRES.map((o) => (
                  <label key={o.id} className={`${s.formule} ${packId === o.id ? s.choisie : ""}`}>
                    <input type="radio" name="formule" value={o.id} checked={packId === o.id} onChange={() => setPackId(o.id)} className="sr-only" />
                    <div className={s.formuleTete}>
                      <span className="eyebrow">{o.nom}</span>
                      <strong className="display">{fcfa(o.prix)}</strong>
                    </div>
                    <p className={s.formuleAccroche}>{o.accroche}</p>
                    <ul>
                      {o.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </label>
                ))}
              </div>
            )}

            {/* ---------- 2. Événement ---------- */}
            {etape === 1 && (
              <div className={s.pile}>
                <div className="grille-2">
                  <label className="champ">
                    <span>Type d'événement</span>
                    <select className="saisie" value={evt.eventType} onChange={setE("eventType")}>
                      {TYPES_EVENEMENT.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="champ">
                    <span>Titre sur la carte</span>
                    <input className="saisie" value={evt.eventTitle} onChange={setE("eventTitle")} placeholder="Aïcha & Karim" maxLength={60} />
                  </label>
                  <label className="champ">
                    <span>Date</span>
                    <input className="saisie" type="date" value={evt.date} onChange={setE("date")} min={new Date().toISOString().slice(0, 10)} />
                  </label>
                  <label className="champ">
                    <span>Heure</span>
                    <input className="saisie" type="time" value={evt.time} onChange={setE("time")} />
                  </label>
                  <label className="champ">
                    <span>Lieu de réception</span>
                    <input className="saisie" value={evt.venue} onChange={setE("venue")} placeholder="Hôtel Ivoire, salle des Ambassadeurs" maxLength={90} />
                  </label>
                  <label className="champ">
                    <span>Ville / quartier</span>
                    <input className="saisie" value={evt.city} onChange={setE("city")} placeholder="Abidjan · Cocody" maxLength={40} />
                  </label>
                </div>
                <label className="champ">
                  <span>Phrase d'invitation (facultatif)</span>
                  <textarea
                    className="saisie"
                    value={evt.message}
                    onChange={setE("message")}
                    maxLength={160}
                    placeholder="ont la joie de vous convier à la célébration de leur mariage"
                  />
                  <small>{evt.message.length} / 160 · laissez vide pour la formule classique adaptée à l'événement</small>
                </label>
                <label className="champ">
                  <span>Code vestimentaire (facultatif)</span>
                  <input className="saisie" value={evt.dressCode} onChange={setE("dressCode")} placeholder="Blanc & or" maxLength={40} />
                </label>
              </div>
            )}

            {/* ---------- 3. Design ---------- */}
            {etape === 2 && (
              <div className={s.pile}>
                {!custom && (
                  <div className={s.notice}>
                    La formule Basic utilise notre modèle standard « Ivoire classique ». Passez en <button type="button" className="lien-or" onClick={() => setPackId("PRO")}>Pro</button> pour choisir votre thème, vos couleurs et vos polices.
                  </div>
                )}
                <fieldset className={s.groupe} disabled={!custom}>
                  <legend>Thème</legend>
                  <div className={s.themes}>
                    {(catalog?.themes ?? []).map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        className={`${s.theme} ${design.theme === t.id ? s.choisie : ""}`}
                        onClick={() => setDesign((d) => ({ ...d, theme: t.id, primary: undefined, ink: undefined, background: undefined }))}
                        aria-pressed={design.theme === t.id}
                      >
                        <span className={s.pastilleTheme} style={{ background: t.background, borderColor: t.primary }}>
                          <i style={{ background: t.primary }} />
                        </span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className={s.groupe} disabled={!custom}>
                  <legend>Couleurs</legend>
                  <div className={s.couleurs}>
                    {(
                      [
                        ["primary", "Or & ornements"],
                        ["ink", "Texte"],
                        ["background", "Fond"],
                      ] as const
                    ).map(([k, label]) => (
                      <label key={k} className={s.couleur}>
                        <input
                          type="color"
                          value={design[k] ?? (theme ? (k === "primary" ? theme.primary : k === "ink" ? theme.ink : theme.background) : "#c9a35c")}
                          onChange={(e) => setDesign((d) => ({ ...d, [k]: e.target.value }))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                    <button
                      type="button"
                      className="btn btn-ligne btn-petit"
                      onClick={() => setDesign((d) => ({ ...d, primary: undefined, ink: undefined, background: undefined }))}
                    >
                      Couleurs du thème
                    </button>
                  </div>
                </fieldset>

                <fieldset className={s.groupe} disabled={!custom}>
                  <legend>Typographie du titre</legend>
                  <div className={s.polices}>
                    {(catalog?.titleFonts ?? Object.keys(POLICES)).map((f) => (
                      <button
                        type="button"
                        key={f}
                        className={`${s.police} ${design.titleFont === f ? s.choisie : ""}`}
                        onClick={() => setDesign((d) => ({ ...d, titleFont: f }))}
                        aria-pressed={design.titleFont === f}
                      >
                        <span style={{ fontFamily: POLICES[f]?.css, textTransform: f === "Cinzel" ? "uppercase" : undefined, fontSize: f === "GreatVibes" ? "1.9rem" : "1.35rem" }}>
                          Aa
                        </span>
                        <small>{POLICES[f]?.label ?? f}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {pack?.aiBackground && (
                  <label className="champ">
                    <span>✦ Fond unique par IA — votre inspiration (facultatif)</span>
                    <textarea
                      className="saisie"
                      value={design.aiPrompt ?? ""}
                      onChange={(e) => setDesign((d) => ({ ...d, aiPrompt: e.target.value || undefined }))}
                      maxLength={400}
                      placeholder="Orchidées blanches et feuilles de palmier dorées, motifs wax subtils…"
                    />
                    <small>Le fond est peint après votre paiement, puis appliqué à toutes vos cartes.</small>
                  </label>
                )}
              </div>
            )}

            {/* ---------- 4. Invités ---------- */}
            {etape === 3 && (
              <div className={s.pile}>
                <div className={s.compteur}>
                  <strong className="display">{filledGuests.length}</strong>
                  <span>
                    invité{filledGuests.length > 1 ? "s" : ""} {pack && <>/ {pack.maxGuests} max.</>}
                  </span>
                  {!pack?.personalizedNames && <small className="doux">En Basic, la liste vous est remise en CSV ; les cartes ne portent pas de nom.</small>}
                </div>

                <div className={s.invites}>
                  {guests.map((g, i) => (
                    <div key={g.key} className={s.invite}>
                      <span className={s.num}>{String(i + 1).padStart(2, "0")}</span>
                      <input
                        className="saisie"
                        value={g.name}
                        placeholder="M. et Mme Kouassi"
                        aria-label={`Nom de l'invité ${i + 1}`}
                        onChange={(e) => setGuests((list) => list.map((r) => (r.key === g.key ? { ...r, name: e.target.value } : r)))}
                      />
                      <input
                        className="saisie"
                        value={g.phoneNumber}
                        placeholder={pack?.autoSend ? "07 00 00 00 00" : "Téléphone (facultatif)"}
                        inputMode="tel"
                        aria-label={`Téléphone de l'invité ${i + 1}`}
                        onChange={(e) => setGuests((list) => list.map((r) => (r.key === g.key ? { ...r, phoneNumber: e.target.value } : r)))}
                      />
                      <button
                        type="button"
                        className={s.retirer}
                        aria-label={`Retirer l'invité ${i + 1}`}
                        onClick={() => setGuests((list) => (list.length > 1 ? list.filter((r) => r.key !== g.key) : [newRow()]))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className={s.rangee}>
                  <button type="button" className="btn btn-ligne btn-petit" onClick={() => setGuests((g) => [...g, newRow()])}>
                    + Ajouter un invité
                  </button>
                  <button type="button" className="btn btn-ligne btn-petit" onClick={() => fileInput.current?.click()}>
                    Importer un CSV
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    hidden
                    onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
                  />
                </div>
                <details className={s.coller}>
                  <summary>Coller une liste depuis Excel ou WhatsApp</summary>
                  <textarea
                    className="saisie"
                    value={bulk}
                    onChange={(e) => setBulk(e.target.value)}
                    placeholder={"Fatou Bamba ; 07 08 09 10 11\nDr Yao Serge ; 05 06 07 08 09\nM. et Mme Koné"}
                    rows={6}
                  />
                  <button
                    type="button"
                    className="btn btn-or btn-petit"
                    onClick={() => {
                      const rows = parseList(bulk);
                      if (rows.length) {
                        setGuests((g) => [...g.filter((r) => r.name.trim()), ...rows]);
                        setBulk("");
                      }
                    }}
                  >
                    Ajouter ces invités
                  </button>
                </details>
              </div>
            )}

            {/* ---------- 5. Validation ---------- */}
            {etape === 4 && (
              <div className={s.pile}>
                <div className="grille-2">
                  <label className="champ">
                    <span>Votre nom</span>
                    <input className="saisie" value={client.clientName} onChange={(e) => setClient((c) => ({ ...c, clientName: e.target.value }))} placeholder="Aïcha Koné" autoComplete="name" />
                  </label>
                  <label className="champ">
                    <span>Téléphone (Mobile Money)</span>
                    <input
                      className="saisie"
                      value={client.clientPhone}
                      onChange={(e) => setClient((c) => ({ ...c, clientPhone: e.target.value }))}
                      placeholder="07 00 00 00 00"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </label>
                </div>
                <label className="champ">
                  <span>E-mail</span>
                  <input
                    className="saisie"
                    type="email"
                    value={client.clientEmail}
                    onChange={(e) => setClient((c) => ({ ...c, clientEmail: e.target.value }))}
                    placeholder="vous@exemple.com"
                    autoComplete="email"
                  />
                  <small>Vous y recevrez le lien privé de votre espace.</small>
                </label>

                <dl className={s.recap}>
                  <div>
                    <dt>Formule</dt>
                    <dd>{offre.nom}</dd>
                  </div>
                  <div>
                    <dt>Événement</dt>
                    <dd>
                      {evt.eventType} · {evt.eventTitle || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>
                      {evt.date ? new Date(`${evt.date}T12:00`).toLocaleDateString("fr-FR", { dateStyle: "long" }) : "—"} · {evt.time}
                    </dd>
                  </div>
                  <div>
                    <dt>Invités</dt>
                    <dd>{filledGuests.length}</dd>
                  </div>
                  <div className={s.total}>
                    <dt>Total</dt>
                    <dd className="display">{fcfa(offre.prix)}</dd>
                  </div>
                </dl>
                <p className={s.moyens}>
                  {MOYENS_PAIEMENT.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </p>
              </div>
            )}

            {error && (
              <div className={s.alerte} role="alert">
                <p>{error}</p>
                {issues.length > 1 && (
                  <ul>
                    {issues.slice(0, 6).map((i) => (
                      <li key={i.path + i.message}>{i.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className={s.navigation}>
              {etape > 0 ? (
                <button type="button" className="btn btn-ligne" onClick={() => go(etape - 1)}>
                  Retour
                </button>
              ) : (
                <span />
              )}
              {etape < ETAPES.length - 1 ? (
                <button type="button" className="btn btn-or" onClick={() => go(etape + 1)}>
                  Continuer
                </button>
              ) : (
                <button type="button" className="btn btn-or" onClick={payer} disabled={submitting}>
                  {submitting ? <span className="chargement" /> : <>Payer {fcfa(offre.prix)}</>}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ======================= Aperçu ======================= */}
        <aside className={s.apercu} aria-label="Aperçu de la carte">
          <div className={s.apercuCadre}>
            <div className={s.apercuTete}>
              <span className="eyebrow">Aperçu en direct</span>
              {previewing && <span className="chargement" aria-label="Mise à jour" />}
            </div>
            <div className={s.chevalet}>
              {preview ? <img src={preview} alt="Aperçu de votre carte d'invitation" className={s.carte} /> : <div className={s.carteVide} />}
            </div>
            <p className={s.legende}>
              {pack?.personalizedNames
                ? firstGuest
                  ? `Carte de ${firstGuest}`
                  : "Le nom de chaque invité sera incrusté ici"
                : "Modèle standard, identique pour tous vos invités"}
              {pack?.aiBackground && " · fond IA peint après paiement"}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
