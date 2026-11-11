import type { Metadata } from "next";
import { Invitation } from "./Invitation";

export const metadata: Metadata = { title: "Votre invitation", robots: { index: false } };

export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Invitation token={token} />;
}
