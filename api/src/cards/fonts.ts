import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

type Weight = 400 | 500 | 600;
type Style = "normal" | "italic";

interface FontSpec {
  pkg: string;
  family: string;
  file: string;
  weight: Weight;
  style: Style;
}

// NB : Cormorant (fontsource) affiche mal les circonflexes dans satori
// (« Hôtel » → accent décalé) ; EB Garamond les compose correctement.
const SPECS: FontSpec[] = [
  { pkg: "eb-garamond", family: "Garamond", file: "eb-garamond-latin-400-normal.woff", weight: 400, style: "normal" },
  { pkg: "eb-garamond", family: "Garamond", file: "eb-garamond-latin-500-normal.woff", weight: 500, style: "normal" },
  { pkg: "eb-garamond", family: "Garamond", file: "eb-garamond-latin-400-italic.woff", weight: 400, style: "italic" },
  { pkg: "playfair-display", family: "Playfair", file: "playfair-display-latin-400-normal.woff", weight: 400, style: "normal" },
  { pkg: "playfair-display", family: "Playfair", file: "playfair-display-latin-400-italic.woff", weight: 400, style: "italic" },
  { pkg: "cinzel", family: "Cinzel", file: "cinzel-latin-400-normal.woff", weight: 400, style: "normal" },
  { pkg: "cinzel", family: "Cinzel", file: "cinzel-latin-600-normal.woff", weight: 600, style: "normal" },
  { pkg: "great-vibes", family: "GreatVibes", file: "great-vibes-latin-400-normal.woff", weight: 400, style: "normal" },
  { pkg: "montserrat", family: "Montserrat", file: "montserrat-latin-400-normal.woff", weight: 400, style: "normal" },
  { pkg: "montserrat", family: "Montserrat", file: "montserrat-latin-500-normal.woff", weight: 500, style: "normal" },
];

export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: Weight;
  style: Style;
}

let cache: Promise<SatoriFont[]> | null = null;

export function loadFonts(): Promise<SatoriFont[]> {
  cache ??= Promise.all(
    SPECS.map(async (spec) => {
      const pkgDir = dirname(require.resolve(`@fontsource/${spec.pkg}/package.json`));
      const data = await readFile(join(pkgDir, "files", spec.file));
      return { name: spec.family, data, weight: spec.weight, style: spec.style };
    }),
  );
  return cache;
}
