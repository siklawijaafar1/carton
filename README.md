# Sceau — invitations d'exception · Abidjan

Service SaaS de cartes d'invitation haut de gamme et de gestion d'invités :
création en ligne, paiement Mobile Money / carte, génération automatique des
cartes, envoi WhatsApp & SMS et RSVP en temps réel.

```
sceau/
├── api/   Node.js · Express 5 · Prisma 7 · PostgreSQL — paiement, rendu des cartes, RSVP
└── web/   Next.js 16 (App Router) · React 19 · CSS pur — vitrine, atelier, espaces
```

## Les offres

| Formule | Prix | Ce que produit l'API |
|---|---|---|
| **Basic** | 15 000 FCFA | Modèle « Ivoire classique » imposé · ZIP : carte HD + format story + `liste-invites.csv` |
| **Pro** | 50 000 FCFA | 5 thèmes, couleurs et polices libres · une carte **nominative** par invité, nommée `001-Nom.png` · ZIP |
| **Super VIP** | 200 000 FCFA | ≤ 200 invités · fond peint par IA · envoi WhatsApp + SMS · page RSVP par invité · tableau de bord temps réel · relances |

Les prix et limites font foi dans [api/src/packs.ts](api/src/packs.ts).

## Parcours

1. **Atelier** (`/commander`) — 5 étapes ; l'aperçu est rendu par l'API avec le
   même moteur que les cartes finales.
2. `POST /api/orders` crée la commande (`PENDING`), puis
   `POST /api/orders/:token/checkout` ouvre une transaction CinetPay
   (Wave, Orange Money, MTN MoMo, Moov Money, VISA/Mastercard).
3. **Webhook** `POST /api/webhooks/cinetpay` : journalise la notification,
   vérifie le HMAC `x-token`, **re-vérifie** le statut et le montant via
   `/v2/payment/check`, puis passe la commande en `PAID` de façon atomique et
   idempotente → mise en file de production.
4. **Production** ([fulfillment.ts](api/src/services/fulfillment.ts)) : fond IA
   (Super) → cartes PNG (satori + resvg WASM) → ZIP → envoi WhatsApp/SMS (Super).
   Les commandes interrompues reprennent au redémarrage.
5. **Espace client** (`/espace/:token`, lien privé sans compte) : avancement en
   direct, téléchargement du ZIP, compteurs Présent / Absent / En attente,
   liste des invités, relances (appelé, note, réponse saisie au téléphone),
   export CSV.
6. **Page invité** (`/rsvp/:token`) : enveloppe à ouvrir, carte nominative,
   réponse + nombre de places, ajout à l'agenda, itinéraire, compteur public.
7. **Back-office** (`/admin`, jeton `ADMIN_TOKEN`) : commandes, chiffre
   d'affaires, file d'appels du centre de relance (`GET /api/admin/followups`).

Le temps réel passe par des Server-Sent Events (`/api/orders/:token/stream`,
`/api/rsvp/:token/stream`).

## Lancer en local

Prérequis : Node 22+. Aucune base à installer : PGlite (Postgres en WASM) sert
de base locale sur le port 5433.

```bash
cd sceau/api && npm install && npx prisma generate && npm run dev
```

```bash
cd sceau/web && npm install && npm run dev
```

- API : http://localhost:4000 · Site : http://localhost:3300
- Sans clés CinetPay, le paiement passe par `/paiement/simulation` (choix de
  l'opérateur, succès ou refus) qui emprunte le même chemin que le webhook.
- Sans identifiants WhatsApp / SMS, les envois sont simulés (journal console).
- Sans clé IA, le palier gratuit de Pollinations est utilisé (lent, filigrane
  rogné) ; en cas d'échec la carte garde le fond du thème.

Sur un PC où Windows bloque les modules natifs : `npm run dev:local` côté web
(Webpack + SWC WASM). L'API n'utilise aucun module natif ; la migration est
appliquée par `scripts/db-local.mjs` à la place du moteur Prisma.

## Mise en production

Deux projets Vercel sur le même dépôt, et un projet Supabase.

1. **Supabase** (base + fichiers) : de préférence via l'intégration Vercel ↔
   Supabase sur le projet API, qui injecte `POSTGRES_PRISMA_URL`,
   `POSTGRES_URL_NON_POOLING`, `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`
   (noms reconnus par l'API). Créer un bucket **privé** `sceau`.
2. **API** (projet Vercel, dossier racine `api`) : [api/vercel.json](api/vercel.json)
   compile le TypeScript, applique les migrations (`npm run vercel-build`) et
   sert toute l'API Express depuis une fonction ([api/api/index.js](api/api/index.js),
   durée max 300 s). Variables à ajouter : `PUBLIC_WEB_URL`, `ADMIN_TOKEN`
   (≥ 24 caractères), `NODE_ENV=production`, et `ALLOW_PAYMENT_SIMULATION=true`
   tant que CinetPay n'est pas branché.
3. **Web** (projet Vercel, dossier racine `web`, préréglage Next.js) :
   `NEXT_PUBLIC_API_URL` = URL de l'API.

Fonctionnement serverless : la production des cartes continue après la
réponse (`waitUntil`), se met en pause avant la limite de temps et se relance
elle-même ; le temps réel est un flux SSE qui interroge la base (aucun état en
mémoire partagé). Sur un serveur classique, `npm run build && npm run start:prod`
fonctionne aussi.

4. **CinetPay** : renseigner `notify_url` = `https://api…/api/webhooks/cinetpay`
   (envoyé automatiquement à chaque transaction) et la clé secrète HMAC.
4. **CinetPay** : renseigner `notify_url` = `https://api…/api/webhooks/cinetpay`
   (envoyé automatiquement à chaque transaction) et la clé secrète HMAC.

5. **WhatsApp** : faire approuver le modèle `invitation_evenement`
   (en-tête image, 3 variables). **SMS** : souscrire l'offre Orange SMS CI.

## Écarts assumés par rapport au schéma de référence

Les modèles `Order` / `Guest` et les trois enums sont repris tels quels ; les
ajouts sont annotés `+` dans [schema.prisma](api/prisma/schema.prisma) :

- `Order` : jeton d'accès client, détails de l'événement, design (JSON), état
  de production, chemin du ZIP, date et moyen de paiement ; `transactionId`
  rendu unique (une nouvelle référence par tentative de paiement).
- `Guest.phoneNumber` devient **facultatif** (inutile en Basic/Pro, exigé en
  Super par la validation) ; ajout du jeton RSVP, nombre de places, mot de
  l'invité, état d'envoi, note d'appel.
- `amountPaid` contient le montant dû à la création puis le montant confirmé
  par l'agrégateur.
- Nouveau modèle `PaymentEvent` : journal brut des notifications (audit).
