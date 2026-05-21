/**
 * fix-atanasio-overflow.ts
 *
 * Testigos incorrectamente asignados al Estadio Atanasio Girardot (puesto 246)
 * como fallback. Este script los cruza con el CSV para encontrar su puesto real
 * y los reasigna usando matching exacto y fuzzy contra los puestos en DB.
 *
 * Run: DATABASE_URL=... npx tsx scripts/seed/fix-atanasio-overflow.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  for (const f of ['../../.env.local', '../../.env'].map(p => path.resolve(__dirname, p))) {
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, 'utf-8').split('\n')) {
        const t = line.trim(); if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('='); if (eq === -1) continue;
        const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
      break;
    }
  }
}

const prisma = new PrismaClient();
const ATANASIO_PUESTO_ID = 246;

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}
function normalizePhone(raw: string): string {
  let p = raw.replace(/\D/g, '');
  if (p.startsWith('57') && p.length > 10) p = p.slice(2);
  return p;
}

interface CsvRow { municipio: string; puesto_normalized: string; primer_nombre: string; segundo_nombre: string; primer_apellido: string; segundo_apellido: string; telefono_std: string; telefono_raw: string; }

async function readCsv(filePath: string): Promise<CsvRow[]> {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath, { encoding: 'utf-8' }), crlfDelay: Infinity });
  const rows: CsvRow[] = []; let headers: string[] = []; let first = true;
  for await (const line of rl) {
    if (first) { headers = line.split(',').map(h => h.trim()); first = false; continue; }
    if (!line.trim()) continue;
    const vals = line.split(','); const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    rows.push(obj as unknown as CsvRow);
  }
  return rows;
}

function buildName(r: CsvRow): string {
  return [r.primer_nombre, r.segundo_nombre, r.primer_apellido, r.segundo_apellido].map(s => s.trim()).filter(Boolean).join(' ');
}

async function main() {
  const csvPath = path.resolve(__dirname, '../../../data/testigos_clean.csv');
  if (!fs.existsSync(csvPath)) { console.error('CSV not found:', csvPath); process.exit(1); }

  const csvRows = await readCsv(csvPath);
  console.log(`CSV rows: ${csvRows.length}`);

  // Build lookup: normName+normPhone → { municipio, puesto_normalized }
  type Info = { municipio: string; puestoNorm: string };
  const byNamePhone = new Map<string, Info>();
  const byName = new Map<string, Info>();

  for (const row of csvRows) {
    const name = normalize(buildName(row));
    const phone = normalizePhone(row.telefono_std || row.telefono_raw || '');
    const info: Info = { municipio: row.municipio, puestoNorm: row.puesto_normalized };
    if (phone) { const k = `${name}::${phone}`; if (!byNamePhone.has(k)) byNamePhone.set(k, info); }
    if (!byName.has(name)) byName.set(name, info);
  }

  // Load all puestos for MEDELLIN (municipioId=1)
  const puestosDb = await prisma.puesto.findMany({ where: { municipioId: 1 }, select: { id: true, name: true } });
  console.log(`Puestos Medellín en DB: ${puestosDb.length}`);

  // Build lookup maps for puestos
  const exactMap = new Map<string, number>(); // normalize(name) → id
  for (const p of puestosDb) exactMap.set(normalize(p.name), p.id);

  function findPuesto(puestoNorm: string): number | undefined {
    const norm = normalize(puestoNorm);
    // 1. Exact match
    if (exactMap.has(norm)) return exactMap.get(norm);
    // 2. DB name contains CSV norm
    for (const p of puestosDb) {
      if (normalize(p.name).includes(norm) || norm.includes(normalize(p.name))) return p.id;
    }
    // 3. First 25 chars match
    const prefix = norm.slice(0, 25);
    for (const p of puestosDb) {
      if (normalize(p.name).startsWith(prefix)) return p.id;
    }
    return undefined;
  }

  // Load all testigos at Atanasio
  const testigos = await prisma.testigo.findMany({ where: { puestoId: ATANASIO_PUESTO_ID }, select: { id: true, name: true, phone: true } });
  console.log(`Testigos en Atanasio: ${testigos.length}`);

  let keepCount = 0, reassignCount = 0, notFoundCount = 0;
  const updates: { id: number; puestoId: number }[] = [];
  const unresolved: { id: number; name: string; reason: string }[] = [];

  for (const t of testigos) {
    const normName = normalize(t.name || '');
    const normPhone = normalizePhone(t.phone || '');

    let info: Info | undefined;
    // Try name+phone first
    if (normPhone) info = byNamePhone.get(`${normName}::${normPhone}`);
    // Fallback: name only
    if (!info) info = byName.get(normName);

    if (!info) {
      notFoundCount++;
      unresolved.push({ id: t.id, name: t.name || '', reason: 'not_in_csv' });
      continue;
    }

    // Check if municipio is MEDELLIN (could be different muni with same name)
    if (normalize(info.municipio) !== 'medellin') {
      // Different municipality — skip for now (shouldn't happen for Atanasio overflow)
      notFoundCount++;
      unresolved.push({ id: t.id, name: t.name || '', reason: `wrong_muni:${info.municipio}` });
      continue;
    }

    const pid = findPuesto(info.puestoNorm);

    if (!pid) {
      notFoundCount++;
      unresolved.push({ id: t.id, name: t.name || '', reason: `puesto_not_found:${info.puestoNorm}` });
      continue;
    }

    if (pid === ATANASIO_PUESTO_ID) {
      keepCount++;
      continue;
    }

    updates.push({ id: t.id, puestoId: pid });
    reassignCount++;
  }

  console.log(`\nPlan:`);
  console.log(`  Quedan en Atanasio (correcto):  ${keepCount}`);
  console.log(`  Se reasignan a su puesto real:  ${reassignCount}`);
  console.log(`  No resolubles (quedan donde están): ${notFoundCount}`);

  if (unresolved.length > 0) {
    const byReason = new Map<string, number>();
    for (const u of unresolved) { const k = u.reason.split(':')[0]; byReason.set(k, (byReason.get(k) ?? 0) + 1); }
    console.log('\nMotivos no resolubles:');
    for (const [r, c] of byReason) console.log(`  ${r}: ${c}`);
    const puestosNoEncontrados = new Set(unresolved.filter(u => u.reason.startsWith('puesto_not_found')).map(u => u.reason.replace('puesto_not_found:', '')));
    if (puestosNoEncontrados.size) {
      console.log('\nPuestos CSV sin coincidencia en DB:');
      for (const p of puestosNoEncontrados) console.log(' ', p);
    }
  }

  if (updates.length === 0) { console.log('\nNada que actualizar.'); return; }

  console.log('\nAplicando reasignaciones...');
  const BATCH = 50; let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await prisma.$transaction(batch.map(u => prisma.testigo.update({ where: { id: u.id }, data: { puestoId: u.puestoId } })));
    done += batch.length;
    process.stdout.write(`\r  ${done}/${updates.length}`);
  }
  console.log('\nListo.');

  const remaining = await prisma.testigo.count({ where: { puestoId: ATANASIO_PUESTO_ID } });
  console.log(`\nAtanasio ahora tiene: ${remaining} testigos`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
