import Link from "next/link";

/** Sceau de cire stylisé + logotype. */
export function SealMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="cire" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#f6e7bf" />
          <stop offset=".45" stopColor="#c9a35c" />
          <stop offset="1" stopColor="#7d5f2c" />
        </radialGradient>
      </defs>
      <path
        d="M32 3c4 0 5 3 8.5 3.6S47 5 50 7.6s1.4 6 3.6 8.8 5.9 3 6.9 6.6-2.2 5.4-2.2 9 3.2 5.6 2.2 9-4.7 3.8-6.9 6.6-.6 6.2-3.6 8.8-6.5 0-10 .9S36 61 32 61s-5-3-8.5-3.6S17 59 14 56.4s-1.4-6-3.6-8.8S4.5 44.6 3.5 41s2.2-5.4 2.2-9-3.2-5.6-2.2-9 4.7-3.8 6.9-6.6.6-6.2 3.6-8.8S20.5 7.6 24 6.6 28 3 32 3z"
        fill="url(#cire)"
      />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#5c4420" strokeOpacity=".55" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="15.5" fill="none" stroke="#fff6dc" strokeOpacity=".35" strokeWidth=".8" strokeDasharray="1.5 2.5" />
      <text x="32" y="40" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="23" fill="#4a3618" fillOpacity=".85">
        C
      </text>
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="Carton — accueil">
      <SealMark />
      <span className="logo-mot">Carton</span>
      <style>{`
        .logo { display: inline-flex; align-items: center; gap: 12px; }
        .logo svg { transition: transform .8s var(--ease); }
        .logo:hover svg { transform: rotate(-14deg) scale(1.05); }
        .logo-mot { font-family: var(--font-display), serif; font-size: 1.7rem; letter-spacing: .06em; line-height: 1; }
      `}</style>
    </Link>
  );
}
