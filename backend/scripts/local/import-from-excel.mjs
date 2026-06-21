#!/usr/bin/env node
/**
 * import-from-excel.mjs
 * Import missing testigos from Consolidado_Valle_Aburra_agrupado.xlsx
 *
 * Flags:
 *   --dry-run    Simulate only, no DB writes
 *   --apply      Execute INSERT for missing testigos
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import ExcelJS from 'exceljs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || !args.includes('--apply');
const EXCEL_PATH = path.resolve('/Users/feliperestrepo/Desktop/Consolidado_Valle_Aburra_agrupado.xlsx');

const DB_URL = process.env.DATABASE_URL ||
  'postgresql://app_user:nR2rTubtjDyjTizxRHu8X0jEnbbilF%2BVjq52W3cGg2U%3D@localhost:5432/defensores';

const AMVA_NAMES = ['MEDELLIN','BELLO','ITAGUI','ENVIGADO','SABANETA','LA ESTRELLA','CALDAS','COPACABANA','GIRARDOTA','BARBOSA'];

// ─── Normalisation ────────────────────────────────────────────────────────────
const ACCENT_MAP = { á:'a',é:'e',í:'i',ó:'o',ú:'u',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',ñ:'n',Ñ:'N',ü:'u',Ü:'U' };
function stripAccents(s) { return s.replace(/[áéíóúÁÉÍÓÚñÑüÜ]/g, c => ACCENT_MAP[c]||c); }
const IE_RE = [/\bI\.E\.?\b/gi,/\bINST\.?\s*EDUC\.?\b/gi,/\bINSTITUCION\s+EDUCATIVA\b/gi,/\bINST\s+EDUC\b/gi,/\bC\.E\.?\b/gi,/\bCOL\b/gi,/\bSEC\.?\s*ESC\.?\b/gi];
function normalizePuesto(n) {
  if (!n) return '';
  let s = n.toUpperCase();
  s = stripAccents(s);
  IE_RE.forEach(re => { s = s.replace(re, ''); });
  return s.replace(/[^A-Z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
function levenshtein(a,b) {
  if (!a.length) return b.length; if (!b.length) return a.length;
  const dp = Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[a.length][b.length];
}
function similarity(a,b) { const m=Math.max(a.length,b.length); return m===0?100:Math.round((1-levenshtein(a,b)/m)*100); }

// Exact name overrides (Excel name → DB puesto id)
const MANUAL_MAPPINGS = {
  'AUDITORIO CC SAN DIEGO TORRE NTE PISO 11': 131,
};

// ─── Find best matching puesto ────────────────────────────────────────────────
function findPuesto(name, muniId, dbPuestos) {
  if (MANUAL_MAPPINGS[name] !== undefined) {
    const p = dbPuestos.find(p => p.id === MANUAL_MAPPINGS[name]);
    return p ? { puesto: p, score: 100 } : null;
  }
  const norm = normalizePuesto(name);
  const candidates = dbPuestos.filter(p => p.municipioId === muniId);
  let best = null, bestScore = 0;
  for (const p of candidates) {
    const score = similarity(norm, normalizePuesto(p.name));
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 70 ? { puesto: best, score: bestScore } : null;
}

// ─── Read Excel ───────────────────────────────────────────────────────────────
async function readExcel() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.getWorksheet('CONSOLIDADO');
  const headers = [];
  const rows = [];
  ws.eachRow((row, ri) => {
    if (ri === 1) {
      row.eachCell((cell, ci) => { headers[ci] = String(cell.value||'').trim(); });
      return;
    }
    const obj = {};
    row.eachCell((cell, ci) => {
      const h = headers[ci];
      if (h) obj[h] = cell.value != null ? String(cell.value).trim() : '';
    });
    if (obj['CEDULA']) rows.push(obj);
  });
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== import-from-excel.mjs [${DRY_RUN ? 'DRY RUN' : 'APPLY'}] ===\n`);

  // 1. Load Excel
  console.log('Reading Excel...');
  const excelRows = await readExcel();
  const amvaRows = excelRows.filter(r => AMVA_NAMES.includes(r['MUNICIPIO']));
  console.log(`Excel CONSOLIDADO total: ${excelRows.length}, AMVA: ${amvaRows.length}`);

  // 2. Connect DB
  const pool = new pg.Pool({ connectionString: DB_URL });
  const c = await pool.connect();

  // 3. Load reference data
  const { rows: dbMunis } = await c.query('SELECT id, name FROM "Municipio" WHERE name = ANY($1)', [AMVA_NAMES]);
  const muniMap = {};
  dbMunis.forEach(m => { muniMap[m.name] = m.id; });
  console.log('Municipios:', Object.entries(muniMap).map(([k,v]) => `${k}=${v}`).join(', '));

  const muniIds = Object.values(muniMap);
  const { rows: dbPuestos } = await c.query('SELECT id, name, "municipioId" FROM "Puesto" WHERE "municipioId" = ANY($1)', [muniIds]);
  console.log(`DB puestos for AMVA: ${dbPuestos.length}`);

  const { rows: existingTestigos } = await c.query('SELECT cedula FROM "Testigo"');
  const existingCedulas = new Set(existingTestigos.map(t => t.cedula));
  console.log(`Existing testigos in DB: ${existingCedulas.size}`);

  // 4. Find missing rows
  const toInsert = [];
  const unmatched = [];
  const skippedDupCedula = [];
  const seenCedulas = new Set(existingCedulas); // track within-batch dups too

  for (const row of amvaRows) {
    const cedula = row['CEDULA'];
    if (!cedula) continue;
    if (seenCedulas.has(cedula)) {
      skippedDupCedula.push({ cedula, name: row['NOMBRE COMPLETO'] });
      continue;
    }
    seenCedulas.add(cedula);

    const muniName = row['MUNICIPIO'];
    const muniId = muniMap[muniName];
    if (!muniId) { unmatched.push({ row, reason: 'municipio not found' }); continue; }

    const puestoName = row['PUESTO'];
    const match = findPuesto(puestoName, muniId, dbPuestos);
    if (!match) {
      unmatched.push({ row, reason: `no puesto match for "${puestoName}"` });
      continue;
    }

    toInsert.push({
      puestoId: match.puesto.id,
      name: row['NOMBRE COMPLETO'] || '',
      cedula,
      phone: row['TELEFONO'] || null,
      correo: row['CORREO'] || null,
      status: 'pendiente',
      score: match.score,
      excelPuesto: puestoName,
      dbPuesto: match.puesto.name,
    });
  }

  console.log(`\nTo insert: ${toInsert.length}`);
  console.log(`Skipped (already in DB or dup cedula): ${skippedDupCedula.length}`);
  console.log(`Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched rows (first 20):');
    unmatched.slice(0, 20).forEach(u => console.log(`  [${u.row['MUNICIPIO']}] ${u.reason}`));
  }

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: no changes made. Pass --apply to insert. ---');
    console.log('\nSample insertions (first 5):');
    toInsert.slice(0,5).forEach(t => {
      console.log(`  ${t.name} (${t.cedula}) → puesto ${t.puestoId} "${t.dbPuesto}" [score=${t.score}]`);
    });
    c.release(); await pool.end(); return;
  }

  // 5. Insert
  console.log(`\nInserting ${toInsert.length} testigos...`);
  let inserted = 0, failed = 0;
  for (const t of toInsert) {
    try {
      await c.query(
        `INSERT INTO "Testigo" ("puestoId", name, cedula, phone, correo, status, token, "createdById", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,gen_random_uuid(),$7,NOW(),NOW())`,
        [t.puestoId, t.name, t.cedula, t.phone||null, t.correo||null, t.status, 14]
      );
      inserted++;
    } catch (e) {
      failed++;
      if (failed <= 5) console.error(`  Failed ${t.cedula}: ${e.message}`);
    }
  }
  console.log(`\nDone: ${inserted} inserted, ${failed} failed`);

  c.release(); await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
