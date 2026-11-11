/**
 * Numéros ivoiriens : 10 chiffres depuis 2021 (07…, 05…, 01…, 27…).
 * Accepte « 07 08 09 10 11 », « +225 0708091011 », « 00225… » → « +2250708091011 ».
 * Les numéros internationaux déjà au format +XXX sont conservés.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s.\-()]/g, "");
  if (/^\+\d{8,15}$/.test(raw)) return raw;
  if (/^00\d{8,15}$/.test(raw)) return `+${raw.slice(2)}`;
  if (/^\d{10}$/.test(raw)) return `+225${raw}`;
  return null;
}

export function displayPhone(e164: string): string {
  const m = /^\+225(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+225 ${m.slice(1).join(" ")}` : e164;
}
