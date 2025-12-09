import fs from "fs/promises";
import path from "path";

import type { WrkActionCatalog } from "@/lib/pricing/engine";

const REMOTE_URL = "https://storage.googleapis.com/wrkactions-public-api/wrkactions.json";
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const CACHE_PATH = path.join(process.cwd(), ".wrkactions-cache.json");

type RemoteSheet = {
  data?: {
    wrkactions?: Array<{ id: number; name: string; price: string | number | null }>;
  };
};

let cachedCatalog: WrkActionCatalog | null = null;
let cachedAt: number | null = null;

function isFresh() {
  return cachedCatalog && cachedAt !== null && Date.now() - cachedAt < CACHE_TTL_MS;
}

function toCatalog(sheet: RemoteSheet): WrkActionCatalog {
  const actions = sheet?.data?.wrkactions ?? [];
  const catalog: WrkActionCatalog = {};
  for (const action of actions) {
    const key = `wrkaction-${action.id}`;
    const price = typeof action.price === "string" ? Number(action.price) : Number(action.price ?? 0);
    const listPrice = Number.isFinite(price) ? price : 0;
    catalog[key] = { listPrice };
  }
  return catalog;
}

async function readCacheFromDisk(): Promise<WrkActionCatalog | null> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as WrkActionCatalog;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCacheToDisk(catalog: WrkActionCatalog) {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(catalog), "utf8");
  } catch {
    // Best effort; ignore failures
  }
}

async function fetchRemote(): Promise<WrkActionCatalog> {
  const res = await fetch(REMOTE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Wrk Actions catalog: ${res.status}`);
  }
  const json = (await res.json()) as RemoteSheet;
  return toCatalog(json);
}

/**
 * Load Wrk Action catalog with in-memory + disk cache fallback.
 */
export async function loadWrkActionCatalog(): Promise<WrkActionCatalog> {
  if (isFresh()) {
    return cachedCatalog as WrkActionCatalog;
  }

  // Try remote first
  try {
    const catalog = await fetchRemote();
    cachedCatalog = catalog;
    cachedAt = Date.now();
    await writeCacheToDisk(catalog);
    return catalog;
  } catch {
    // Fallback to disk cache
    const cached = await readCacheFromDisk();
    if (cached) {
      cachedCatalog = cached;
      cachedAt = Date.now();
      return cached;
    }
    // Last resort: empty catalog
    cachedCatalog = {};
    cachedAt = Date.now();
    return cachedCatalog;
  }
}

