// Downloads the D&D SRD 5.2 (CC-BY-4.0) from the Open5e v2 API into data/srd/raw/<date>/<endpoint>.json.
// The raw snapshot is committed, so builds never depend on the API being up. Run: node scripts/srd/fetch.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.open5e.com/v2';
const DOC = 'srd-2024';
const ENDPOINTS = ['classes', 'species', 'backgrounds', 'feats', 'spells', 'weapons', 'armor', 'skills', 'items'];

async function all(endpoint: string): Promise<unknown[]> {
  const out: unknown[] = [];
  let url: string | null = `${API}/${endpoint}/?document__key=${DOC}&format=json&limit=100`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const page = (await res.json()) as { results: unknown[]; next: string | null };
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

const date = new Date().toISOString().slice(0, 10);
const dir = join(import.meta.dirname, '..', '..', 'data', 'srd', 'raw', date);
mkdirSync(dir, { recursive: true });
for (const ep of ENDPOINTS) {
  const rows = await all(ep);
  writeFileSync(join(dir, `${ep}.json`), JSON.stringify(rows, null, 1));
  console.log(`${ep}: ${rows.length}`);
}
console.log(`saved to ${dir}`);
