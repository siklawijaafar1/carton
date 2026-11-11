import type { PackId } from "./api";

/** Contenu éditorial des offres (les prix et limites font foi côté API). */
export const OFFRES: {
  id: PackId;
  nom: string;
  prix: number;
  accroche: string;
  points: string[];
  vedette?: boolean;
}[] = [
  {
    id: "BASIC",
    nom: "Basic",
    prix: 15_000,
    accroche: "L'essentiel, avec élégance.",
    points: [
      "Modèle standard « Ivoire classique »",
      "Saisie de l'événement et de la liste d'invités",
      "Carte HD + format statut WhatsApp",
      "Téléchargement immédiat en ZIP",
    ],
  },
  {
    id: "PRO",
    nom: "Pro",
    prix: 50_000,
    accroche: "Chaque invité, nommé en lettres d'or.",
    points: [
      "5 thèmes de luxe, couleurs et polices sur mesure",
      "Nom de chaque invité incrusté sur sa carte",
      "Dossier d'images propres, nommées et numérotées",
      "Prêt à diffuser vous-même sur WhatsApp",
    ],
  },
  {
    id: "SUPER",
    nom: "Super VIP",
    prix: 200_000,
    accroche: "Le service clé en main des grandes réceptions.",
    vedette: true,
    points: [
      "Jusqu'à 200 invités, design unique assisté par IA",
      "Envoi automatique par WhatsApp & SMS",
      "Page RSVP personnelle pour chaque invité",
      "Tableau de bord en direct : Présent · Absent · En attente",
      "Suivi des non-répondants et relance téléphonique",
    ],
  },
];

export const MOYENS_PAIEMENT = ["Wave", "Orange Money", "MTN MoMo", "Moov Money", "Visa", "Mastercard"];

export const TYPES_EVENEMENT = ["Mariage", "Dot", "Gala", "Anniversaire", "Baptême", "Soirée privée", "Séminaire"];
