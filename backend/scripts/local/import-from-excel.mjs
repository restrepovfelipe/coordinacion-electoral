#!/usr/bin/env node
/**
 * import-from-excel.mjs
 * Import missing testigos from a Consolidado xlsx file (AMVA or full Antioquia).
 * Pass --excel <path> to specify a different file.
 *
 * Flags:
 *   --dry-run       Simulate only, no DB writes
 *   --apply         Execute INSERT for missing testigos
 *   --excel <path>  Path to xlsx (default: Consolidado_Valle_Aburra_agrupado.xlsx)
 *   --all           Import all municipalities (default: AMVA only)
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import ExcelJS from 'exceljs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || !args.includes('--apply');
const ALL_MUNIS = args.includes('--all');
const excelIdx = args.indexOf('--excel');
const EXCEL_PATH = excelIdx >= 0
  ? path.resolve(args[excelIdx + 1])
  : path.resolve('/Users/feliperestrepo/Desktop/Consolidado_Valle_Aburra_agrupado.xlsx');

const DB_URL = process.env.DATABASE_URL ||
  'postgresql://app_user:nR2rTubtjDyjTizxRHu8X0jEnbbilF%2BVjq52W3cGg2U%3D@localhost:5432/defensores';

const AMVA_NAMES = ['MEDELLIN','BELLO','ITAGUI','ENVIGADO','SABANETA','LA ESTRELLA','CALDAS','COPACABANA','GIRARDOTA','BARBOSA'];

// Excel municipio name → DB municipio name (when they differ)
const MUNI_NAME_MAP = {
  'PEÑOL': 'EL PEÑOL',
  'PUERTO NARE-LA MAGDALENA': 'PUERTO NARE',
};

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
  const scopeRows = ALL_MUNIS ? excelRows : excelRows.filter(r => AMVA_NAMES.includes(r['MUNICIPIO']));
  console.log(`Excel CONSOLIDADO total: ${excelRows.length}, scope: ${scopeRows.length}`);

  // 2. Connect DB
  const pool = new pg.Pool({ connectionString: DB_URL });
  const c = await pool.connect();

  // 3. Load reference data — all municipios if --all, else AMVA only
  const { rows: dbMunis } = await c.query('SELECT id, name FROM "Municipio"');
  const muniMap = {};
  dbMunis.forEach(m => { muniMap[m.name] = m.id; });
  // Apply Excel→DB name aliases
  Object.entries(MUNI_NAME_MAP).forEach(([excelName, dbName]) => {
    if (muniMap[dbName]) muniMap[excelName] = muniMap[dbName];
  });

  const muniIds = [...new Set(Object.values(muniMap))];
  const { rows: dbPuestos } = await c.query('SELECT id, name, "municipioId" FROM "Puesto"');
  console.log(`DB puestos total: ${dbPuestos.length}`);

  // How many times each cedula appears in the scope municipios of DB
  const scopeMuniIds = ALL_MUNIS ? muniIds : muniIds.filter(id => Object.entries(muniMap).some(([n,i]) => i===id && AMVA_NAMES.includes(n)));
  const { rows: scopeTestigos } = await c.query(`
    SELECT t.cedula FROM "Testigo" t
    JOIN "Puesto" p ON t."puestoId" = p.id
    WHERE p."municipioId" = ANY($1)
  `, [scopeMuniIds]);
  const dbCedulaCount = {};
  scopeTestigos.forEach(t => { dbCedulaCount[t.cedula] = (dbCedulaCount[t.cedula] || 0) + 1; });
  console.log(`Scope testigos in DB: ${scopeTestigos.length}`);

  // 4. Find missing rows: rows where Excel has more occurrences than DB
  // Track how many times we've seen each cedula while iterating Excel
  const excelCedulaSeen = {};
  const toInsert = [];
  const unmatched = [];

  for (const row of scopeRows) {
    const cedula = row['CEDULA'];
    if (!cedula) continue;

    excelCedulaSeen[cedula] = (excelCedulaSeen[cedula] || 0) + 1;
    const occurrence = excelCedulaSeen[cedula];
    const inDb = dbCedulaCount[cedula] || 0;

    // Skip this occurrence if DB already has as many (or more) entries for this cedula
    if (occurrence <= inDb) continue;

    const muniName = row['MUNICIPIO'];
    const muniId = muniMap[muniName];
    if (!muniId) { unmatched.push({ row, reason: 'municipio not found' }); continue; }

    const puestoName = row['PUESTO'];
    const match = findPuesto(puestoName, muniId, dbPuestos);
    const puestoId = match ? match.puesto.id : null;

    toInsert.push({
      puestoId,
      name: row['NOMBRE COMPLETO'] || '',
      cedula,
      phone: row['TELEFONO'] || null,
      correo: row['CORREO'] || null,
      status: 'pendiente',
      notes: match ? null : `Puesto sin match: ${puestoName}`,
      score: match ? match.score : 0,
      excelPuesto: puestoName,
      dbPuesto: match ? match.puesto.name : '(sin match)',
    });
  }

  console.log(`\nTo insert: ${toInsert.length}`);
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
        `INSERT INTO "Testigo" ("puestoId", name, cedula, phone, correo, status, notes, token, "createdById", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,gen_random_uuid(),$8,NOW(),NOW())`,
        [t.puestoId||null, t.name, t.cedula, t.phone||null, t.correo||null, t.status, t.notes||null, 14]
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
