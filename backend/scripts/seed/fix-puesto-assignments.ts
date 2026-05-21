/**
 * fix-puesto-assignments.ts
 *
 * Fixes testigos in the DB that have puestoId = NULL because the original seed
 * could not match them to a puesto. Works by cross-referencing the clean CSV
 * (name + phone as natural key) to recover the original municipio/puesto_normalized
 * for each unmatched testigo, then looks up the matching Puesto row in the DB.
 *
 * Run with:
 *   npx tsx scripts/seed/fix-puesto-assignments.ts
 *
 * Reads DATABASE_URL from .env.local (or environment).
 * Safe to run multiple times (idempotent — skips testigos that already have puestoId).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { PrismaClient } from '@prisma/client';

// ── Load env ──────────────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  const candidates = [
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, 'utf-8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        const k = t.slice(0, eq).trim();
        const v = t.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
      break;
    }
  }
}

const prisma = new PrismaClient();

// ── Types ─────────────────────────────────────────────────────────────────────

interface CsvRow {
  departamento: string;
  municipio: string;
  puesto_raw: string;
  puesto_normalized: string;
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  telefono_std: string;
  telefono_cat: string;
  telefono_raw: string;
  correo: string;
  quality_flag: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function buildFullName(row: CsvRow): string {
  return [row.primer_nombre, row.segundo_nombre, row.primer_apellido, row.segundo_apellido]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
}

/** Normalize phone: strip all non-digits, strip leading +57 or 57 */
function normalizePhone(raw: string): string {
  let p = raw.replace(/\D/g, '');
  if (p.startsWith('57') && p.length > 10) p = p.slice(2);
  return p;
}

async function readCsv(filePath: string): Promise<CsvRow[]> {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  const rows: CsvRow[] = [];
  let headers: string[] = [];
  let isFirst = true;
  for await (const line of rl) {
    if (isFirst) {
      headers = line.split(',').map((h) => h.trim());
      isFirst = false;
      continue;
    }
    if (!line.trim()) continue;
    const values = line.split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (values[i] ?? '').trim(); });
    rows.push(obj as unknown as CsvRow);
  }
  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const csvPath = path.resolve(__dirname, '../../../data/testigos_clean.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`ERROR: CSV not found at ${csvPath}`);
    process.exit(1);
  }

  // 1. Build lookup maps from the CSV
  //    Key A (preferred): normalize(name) + '::' + normalizePhone(phone)
  //    Key B (fallback):  normalize(name) + '::' + normalize(municipio)
  //    Value: { municipio, puesto_normalized }

  const csvRows = await readCsv(csvPath);
  console.log(`CSV rows loaded: ${csvRows.length}`);

  type CsvInfo = { municipio: string; puestoNorm: string };
  const byNamePhone = new Map<string, CsvInfo>();
  const byNameMuni = new Map<string, CsvInfo>();

  for (const row of csvRows) {
    const name = buildFullName(row);
    const normName = normalize(name);
    const phone = row.telefono_std || row.telefono_raw || '';
    const normPhone = normalizePhone(phone);
    const info: CsvInfo = {
      municipio: row.municipio,
      puestoNorm: row.puesto_normalized,
    };

    if (normPhone) {
      const keyA = `${normName}::${normPhone}`;
      if (!byNamePhone.has(keyA)) byNamePhone.set(keyA, info);
    }

    const keyB = `${normName}::${normalize(row.municipio)}`;
    if (!byNameMuni.has(keyB)) byNameMuni.set(keyB, info);
  }

  console.log(`CSV lookup maps built — by name+phone: ${byNamePhone.size}, by name+muni: ${byNameMuni.size}`);

  // 2. Load all puestos from DB → build (municipioId :: normalizedName) → puestoId
  const puestosDb = await prisma.puesto.findMany({
    select: { id: true, name: true, municipioId: true, mesas: true },
  });
  const municipiosDb = await prisma.municipio.findMany({
    select: { id: true, name: true },
  });

  const municipioNomToId = new Map<string, number>();
  for (const m of municipiosDb) municipioNomToId.set(normalize(m.name), m.id);

  const puestoKey = (municipioId: number, puestoNorm: string) =>
    `${municipioId}::${normalize(puestoNorm)}`;

  const puestoPorMuniYNombre = new Map<string, number>();
  // municipioId → puesto id with most mesas (fallback for municipality-level testigos)
  const principalPuestoPorMuni = new Map<number, number>();

  for (const p of puestosDb) {
    puestoPorMuniYNombre.set(puestoKey(p.municipioId, p.name), p.id);
  }
  // Build principal puesto per municipio (highest mesas count)
  const puestosPorMuni = new Map<number, typeof puestosDb[0][]>();
  for (const p of puestosDb) {
    if (!puestosPorMuni.has(p.municipioId)) puestosPorMuni.set(p.municipioId, []);
    puestosPorMuni.get(p.municipioId)!.push(p);
  }
  for (const [municipioId, puestos] of puestosPorMuni) {
    const principal = puestos.reduce((best, p) => (p.mesas > best.mesas ? p : best));
    principalPuestoPorMuni.set(municipioId, principal.id);
  }

  console.log(`DB: ${municipiosDb.length} municipios, ${puestosDb.length} puestos`);

  // 3. Load all testigos with puestoId = null
  const nullTestigos = await prisma.testigo.findMany({
    where: { puestoId: null },
    select: { id: true, name: true, phone: true },
  });

  console.log(`Testigos with puestoId = NULL: ${nullTestigos.length}`);

  if (nullTestigos.length === 0) {
    console.log('Nothing to fix. All testigos already have a puestoId.');
    return;
  }

  // 4. For each null testigo, try to resolve puestoId
  let fixedViaPhone = 0;
  let fixedViaMuni = 0;
  let stillUnresolved = 0;
  const updates: { id: number; puestoId: number }[] = [];
  const unresolved: { id: number; name: string; reason: string }[] = [];

  for (const t of nullTestigos) {
    const normName = normalize(t.name || '');
    const normPhone = normalizePhone(t.phone || '');

    let info: CsvInfo | undefined;
    let method = '';

    // Try key A: name + phone
    if (normPhone) {
      info = byNamePhone.get(`${normName}::${normPhone}`);
      if (info) method = 'name+phone';
    }

    // Fallback: name + normalized municipio (less precise — only use if unique match)
    // We don't know the municipio from DB alone, so we try all municipios via name scan
    if (!info) {
      // Scan all byNameMuni entries matching the name prefix
      const prefix = normName + '::';
      for (const [k, v] of byNameMuni) {
        if (k.startsWith(prefix)) {
          info = v;
          method = 'name+muni';
          break;
        }
      }
    }

    if (!info) {
      stillUnresolved++;
      unresolved.push({ id: t.id, name: t.name || '', reason: 'not_in_csv' });
      continue;
    }

    // Resolve puesto from the info
    const municipioId = municipioNomToId.get(normalize(info.municipio));
    if (municipioId === undefined) {
      stillUnresolved++;
      unresolved.push({ id: t.id, name: t.name || '', reason: `municipio_not_found: ${info.municipio}` });
      continue;
    }

    let pid = puestoPorMuniYNombre.get(puestoKey(municipioId, info.puestoNorm));
    let fixedViaFallback = false;

    // If no exact puesto match, assign to the puesto with the most mesas
    // in that municipality (covers both "puesto = municipality name" and
    // "puesto name not in DB" cases).
    if (pid === undefined) {
      pid = principalPuestoPorMuni.get(municipioId);
      if (pid !== undefined) fixedViaFallback = true;
    }

    if (pid === undefined) {
      stillUnresolved++;
      unresolved.push({ id: t.id, name: t.name || '', reason: `puesto_not_in_db: ${info.municipio} / ${info.puestoNorm}` });
      continue;
    }

    updates.push({ id: t.id, puestoId: pid });
    if (fixedViaFallback) fixedViaMuni++; // count under muni bucket
    else if (method === 'name+phone') fixedViaPhone++;
    else fixedViaMuni++;
  }

  console.log(`\nResolution plan:`);
  console.log(`  Fixed via name+phone:     ${fixedViaPhone}`);
  console.log(`  Fixed via name+municipio: ${fixedViaMuni}`);
  console.log(`  Still unresolvable:       ${stillUnresolved}`);
  console.log(`  Total to update:          ${updates.length}`);

  // 5. Batch UPDATE
  if (updates.length > 0) {
    console.log('\nApplying updates...');
    const BATCH = 50;
    let done = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      await prisma.$transaction(
        batch.map((u) =>
          prisma.testigo.update({
            where: { id: u.id },
            data: { puestoId: u.puestoId },
          }),
        ),
      );
      done += batch.length;
      process.stdout.write(`\r  ${done}/${updates.length}`);
    }
    console.log('\nUpdates applied.');
  }

  // 6. Report unresolved
  if (unresolved.length > 0) {
    console.log(`\nUnresolved testigos (${unresolved.length}):`);
    // Group by reason
    const byReason = new Map<string, number>();
    for (const u of unresolved) {
      const key = u.reason.split(':')[0];
      byReason.set(key, (byReason.get(key) ?? 0) + 1);
    }
    for (const [reason, count] of byReason) {
      console.log(`  ${reason}: ${count}`);
    }
    console.log('\nFirst 10 unresolved:');
    for (const u of unresolved.slice(0, 10)) {
      console.log(`  id=${u.id} name="${u.name}" reason="${u.reason}"`);
    }
  }

  // 7. Final count
  const remaining = await prisma.testigo.count({ where: { puestoId: null } });
  const total = await prisma.testigo.count();
  console.log(`\n=== FINAL STATE ===`);
  console.log(`Total testigos:        ${total}`);
  console.log(`With valid puestoId:   ${total - remaining}`);
  console.log(`Still puestoId=NULL:   ${remaining}`);
  console.log(`===================`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
