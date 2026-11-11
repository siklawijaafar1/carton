import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Great_Vibes, Jost } from "next/font/google";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const script = Great_Vibes({ subsets: ["latin"], weight: "400", variable: "--font-script", display: "swap" });
const sans = Jost({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Sceau — Invitations d'exception · Abidjan", template: "%s · Sceau" },
  description:
    "Cartes d'invitation de luxe pour mariages, galas et anniversaires à Abidjan. Noms personnalisés, envoi WhatsApp & SMS, RSVP en temps réel. Paiement Wave, Orange Money, MTN, Moov, carte.",
};

export const viewport: Viewport = {
  themeColor: "#0b0a08",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${script.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
