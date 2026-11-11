import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { config } from "../config.js";

/**
 * Stockage fichier local (disque persistant du serveur).
 * Pour un hébergement sans disque, remplacer ces trois fonctions par un
 * client S3 / Supabase Storage : le reste du code ne manipule que des clés.
 */
const ROOT = resolve(config.storageDir);

function safePath(key: string): string {
  const full = resolve(ROOT, key);
  if (!full.startsWith(ROOT + sep)) throw new Error(`Clé de stockage invalide : ${key}`);
  return full;
}

export async function putFile(key: string, data: Buffer | Uint8Array): Promise<string> {
  const full = safePath(key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

export function getFile(key: string): Promise<Buffer> {
  return readFile(safePath(key));
}

export async function removePrefix(prefix: string): Promise<void> {
  await rm(safePath(prefix), { recursive: true, force: true });
}

/** URL publique (servie par express.static sur /files) — clés non devinables. */
export function publicUrl(key: string): string {
  return `${config.publicApiUrl}/files/${key.split(sep).join("/")}`;
}

export const storageRoot = ROOT;
