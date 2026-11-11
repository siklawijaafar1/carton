import { Suspense } from "react";
import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Atelier } from "./Atelier";

export const metadata: Metadata = { title: "Créer mon invitation" };

export default function CommanderPage() {
  return (
    <>
      <Header minimal />
      <Suspense fallback={null}>
        <Atelier />
      </Suspense>
    </>
  );
}
