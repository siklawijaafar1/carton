"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import styles from "./Header.module.css";

export function Header({ minimal = false }: { minimal?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}>
      <div className={`conteneur ${styles.inner}`}>
        <Logo />
        {!minimal && (
          <>
            <nav className={`${styles.nav} ${open ? styles.open : ""}`} aria-label="Navigation principale">
              <a href="/#offres" onClick={() => setOpen(false)}>Offres</a>
              <a href="/#atelier" onClick={() => setOpen(false)}>L'atelier</a>
              <a href="/#rsvp" onClick={() => setOpen(false)}>RSVP en direct</a>
              <a href="/#questions" onClick={() => setOpen(false)}>Questions</a>
              <Link href="/commander" className="btn btn-or btn-petit" onClick={() => setOpen(false)}>
                Créer mon invitation
              </Link>
            </nav>
            <button className={styles.burger} aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <span />
              <span />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
