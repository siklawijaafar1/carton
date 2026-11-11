import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Espace } from "./Espace";

export const metadata: Metadata = { title: "Mon espace", robots: { index: false } };

export default async function EspacePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <Header minimal />
      <Espace token={token} />
    </>
  );
}
