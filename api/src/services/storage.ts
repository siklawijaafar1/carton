import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { config } from "../config.js";

/**
 * Stockage des cartes, fonds IA et ZIP.
 * - Supabase Storage (bucket privé) si SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
 *   sont définis : aucun disque persistant requis chez l'hébergeur de l'API.
 * - Sinon, disque local (développement).
 * Les fichiers publics (cartes) restent servis par l'API sur /files/…,
 * qui les lit ici : les URL ne changent pas d'un mode à l'autre.
 */

interface Backend {
  put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  removePrefix(prefix: string): Promise<void>;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  zip: "application/zip",
  csv: "text/csv",
};

export class StorageNotFound extends Error {
  readonly status = 404;
  constructor(key: string) {
    super(`Fichier introuvable : ${key}`);
  }
}

function checkKey(key: string): string {
  if (!/^[\w./-]+$/.test(key) || key.includes("..") || key.startsWith("/")) throw new Error(`Clé de stockage invalide : ${key}`);
  return key;
}

/* ---------------- Disque local ---------------- */
const ROOT = resolve(config.storageDir);

function localPath(key: string): string {
  const full = resolve(ROOT, checkKey(key));
  if (!full.startsWith(ROOT + sep)) throw new Error(`Clé de stockage invalide : ${key}`);
  return full;
}

const local: Backend = {
  async put(key, data) {
    const full = localPath(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  },
  async get(key) {
    try {
      return await readFile(localPath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new StorageNotFound(key);
      throw err;
    }
  },
  async removePrefix(prefix) {
    await rm(localPath(prefix), { recursive: true, force: true });
  },
};

/* ---------------- Supabase Storage (API REST) ---------------- */
function supabase(url: string, serviceKey: string, bucket: string): Backend {
  const base = `${url.replace(/\/$/, "")}/storage/v1`;
  const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  const objectUrl = (key: string) => `${base}/object/${bucket}/${checkKey(key).split("/").map(encodeURIComponent).join("/")}`;

  return {
    async put(key, data, contentType) {
      const res = await fetch(objectUrl(key), {
        method: "POST",
        headers: { ...headers, "Content-Type": contentType, "x-upsert": "true", "Cache-Control": "max-age=604800" },
        body: data,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`Supabase Storage (envoi ${key}) : HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    },
    async get(key) {
      const res = await fetch(objectUrl(key), { headers, signal: AbortSignal.timeout(60_000) });
      if (res.status === 400 || res.status === 404) throw new StorageNotFound(key);
      if (!res.ok) throw new Error(`Supabase Storage (lecture ${key}) : HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async removePrefix(prefix) {
      const list = await fetch(`${base}/object/list/${bucket}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: checkKey(prefix), limit: 1000 }),
      });
      if (!list.ok) return;
      const items = (await list.json()) as { name: string }[];
      if (!items.length) return;
      await fetch(`${base}/object/${bucket}`, {
        method: "DELETE",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: items.map((i) => `${prefix.replace(/\/$/, "")}/${i.name}`) }),
      });
    },
  };
}

const backend: Backend =
  config.supabase.url && config.supabase.serviceRoleKey
    ? supabase(config.supabase.url, config.supabase.serviceRoleKey, config.supabase.bucket)
    : local;

export const storageMode = backend === local ? "disque local" : `Supabase Storage (${config.supabase.bucket})`;

export async function putFile(key: string, data: Buffer | Uint8Array): Promise<string> {
  const ext = key.split(".").pop() ?? "";
  await backend.put(key, data, CONTENT_TYPES[ext] ?? "application/octet-stream");
  return key;
}

export function getFile(key: string): Promise<Buffer> {
  return backend.get(key);
}

export function removePrefix(prefix: string): Promise<void> {
  return backend.removePrefix(prefix);
}

/** URL publique (servie par l'API sur /files) — clés non devinables. */
export function publicUrl(key: string): string {
  return `${config.publicApiUrl}/files/${key}`;
}

export function contentTypeFor(key: string): string {
  return CONTENT_TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream";
}
