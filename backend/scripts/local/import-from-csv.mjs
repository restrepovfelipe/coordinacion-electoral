#!/usr/bin/env node
/**
 * import-from-csv.mjs
 * DELETE existing Testigos, insert Testigos + Jurados from CSV.
 *
 * Flags:
 *   --dry-run           Simulate only, no DB writes
 *   --apply-testigos    Execute DELETE + INSERT for Testigos
 *   --apply-jurados     Execute INSERT for Jurados
 *   --csv <path>        Path to CSV (default: data/testigos_ANTIOQUIA_20260525_161923.csv)
 *
 * Puesto mappings (approved by owner):
 *   Alta confianza (auto-accept):
 *     AUDITORIO CC SAN DIEGO TORRE NTE PISO 11 → id:131
 *     SEDE B I. E.R. LA CRUZADA               → id:946
 *   Media confianza (owner approved):
 *     PLACA POLIDEPORTIVA PAVARANDOGRANDE      → id:883
 *     I.E. LAS VEGAS                           → NULL (no match)
 *   Sin match (89 personas, 8 puestos):        → puestoId=NULL
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const args = process.argv.slice(2);
const DRY_RUN       = args.includes('--dry-run');
const DO_TESTIGOS   = args.includes('--apply-testigos');
const DO_JURADOS    = args.includes('--apply-jurados');
const csvIdx        = args.indexOf('--csv');
const CSV_PATH      = csvIdx >= 0
  ? path.resolve(args[csvIdx + 1])
  : path.resolve(process.cwd(), '../data/testigos_ANTIOQUIA_20260525_161923.csv');

const DB_URL = process.env.DATABASE_URL ||
  'postgresql://app_user:nR2rTubtjDyjTizxRHu8X0jEnbbilF%2BVjq52W3cGg2U%3D@localhost:5432/defensores';

// ─── Approved puesto mappings ─────────────────────────────────────────────────
const MANUAL_MAPPINGS = {
  'AUDITORIO CC SAN DIEGO TORRE NTE PISO 11': 131,
  'SEDE B I. E.R. LA CRUZADA':                946,
  'PLACA POLIDEPORTIVA PAVARANDOGRANDE':       883,
  // 'I.E. LAS VEGAS' → NULL intentionally
};

// ─── Normalisation (same as analysis script) ─────────────────────────────────
const ACCENT_MAP = { á:'a',é:'e',í:'i',ó:'o',ú:'u',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',ñ:'n',Ñ:'N',ü:'u',Ü:'U' };
function stripAccents(s) { return s.replace(/[áéíóúÁÉÍÓÚñÑüÜ]/g, c => ACCENT_MAP[c]||c); }
const IE_RE = [/\bI\.E\.?\b/gi,/\bINST\.?\s*EDUC\.?\b/gi,/\bINSTITUCION\s+EDUCATIVA\b/gi,/\bINST\s+EDUC\b/gi,/\bC\.E\.?\b/gi,/\bCOL\b/gi];
function normalizePuesto(n) {
  if (!n) return '';
  let s = n.toUpperCase(); s = stripAccents(s);
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

// ─── CSV parsing ──────────────────────────────────────────────────────────────
function parseCSV(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g,'').trim());
  return lines.slice(1).map(line => {
    const parts = line.split(';');
    const row = {};
    headers.forEach((h,i) => { row[h] = (parts[i]||'').replace(/^"|"$/g,'').trim(); });
    return row;
  });
}

// ─── Puesto lookup ────────────────────────────────────────────────────────────
function findPuesto(csvPuesto, csvMuni, puestos, municipioMap) {
  // Manual mapping first
  if (MANUAL_MAPPINGS[csvPuesto] !== undefined) {
    return { puestoId: MANUAL_MAPPINGS[csvPuesto] || null, method: 'manual' };
  }

  const muniId = municipioMap[csvMuni.toUpperCase().trim()]
    || municipioMap[stripAccents(csvMuni).toUpperCase().trim()];
  const candidates = muniId ? puestos.filter(p => p.municipioId === muniId) : puestos;
  const csvNorm = normalizePuesto(csvPuesto);

  const exactRaw = candidates.find(p => p.name.toUpperCase().trim() === csvPuesto.toUpperCase().trim());
  if (exactRaw) return { puestoId: exactRaw.id, method: 'exact_raw' };

  const exactNorm = candidates.find(p => normalizePuesto(p.name) === csvNorm);
  if (exactNorm) return { puestoId: exactNorm.id, method: 'exact_norm' };

  let best = null, bestSim = 0;
  for (const p of candidates) {
    const sim = similarity(normalizePuesto(p.name), csvNorm);
    if (sim > bestSim) { bestSim = sim; best = p; }
  }
  if (best && bestSim >= 85) return { puestoId: best.id, method: 'fuzzy', sim: bestSim };

  return { puestoId: null, method: 'none' };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== CSV Import ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===`);
  console.log(`CSV: ${CSV_PATH}`);
  console.log(`apply-testigos: ${DO_TESTIGOS}, apply-jurados: ${DO_JURADOS}\n`);

  const rows = parseCSV(CSV_PATH);
  const testigos = rows.filter(r => r['Tipo'] === 'Testigo');
  const jurados  = rows.filter(r => r['Tipo'] === 'Jurado');
  console.log(`CSV rows: ${rows.length} (${testigos.length} testigos, ${jurados.length} jurados)`);

  // Check for duplicate cédulas in CSV
  const testigoCedulas = testigos.map(r => r['Cédula']).filter(Boolean);
  const uniqueTestigoCedulas = new Set(testigoCedulas);
  if (uniqueTestigoCedulas.size < testigoCedulas.length) {
    console.warn(`⚠ WARNING: ${testigoCedulas.length - uniqueTestigoCedulas.size} duplicate cédulas in CSV testigos!`);
  }
  const juradoCedulas = jurados.map(r => r['Cédula']).filter(Boolean);
  const uniqueJuradoCedulas = new Set(juradoCedulas);
  if (uniqueJuradoCedulas.size < juradoCedulas.length) {
    console.warn(`⚠ WARNING: ${juradoCedulas.length - uniqueJuradoCedulas.size} duplicate cédulas in CSV jurados!`);
  }

  const pool = new pg.Pool({ connectionString: DB_URL });
  const c = await pool.connect();

  // Load reference data
  const { rows: dbPuestos }    = await c.query('SELECT id, name, "municipioId" FROM "Puesto"');
  const { rows: dbMunicipios } = await c.query('SELECT id, name FROM "Municipio"');
  const { rows: dbCount }      = await c.query('SELECT COUNT(*) as n FROM "Testigo"');
  const { rows: juradoCount }  = await c.query('SELECT COUNT(*) as n FROM "Jurado"');

  console.log(`DB current: ${dbCount[0].n} testigos, ${juradoCount[0].n} jurados\n`);

  const municipioMap = {};
  dbMunicipios.forEach(m => {
    municipioMap[m.name.toUpperCase().trim()] = m.id;
    municipioMap[stripAccents(m.name).toUpperCase().trim()] = m.id;
  });

  // ── Prepare testigo rows ──
  const testigoRows = [];
  const testigoNoMatch = [];
  const testigoMethodCounts = { exact_raw:0, exact_norm:0, fuzzy:0, manual:0, none:0 };

  for (const row of testigos) {
    const cedula = row['Cédula'].trim();
    if (!cedula) { console.warn(`  SKIP testigo sin cédula: ${row['Nombre Completo']}`); continue; }
    const m = findPuesto(row['Puesto de Votación'], row['Municipio'], dbPuestos, municipioMap);
    testigoMethodCounts[m.method]++;
    if (m.method === 'none') testigoNoMatch.push({ cedula, puesto: row['Puesto de Votación'], municipio: row['Municipio'] });
    testigoRows.push({
      cedula,
      name:   row['Nombre Completo'].trim(),
      phone:  row['Teléfono'].trim() || null,
      correo: row['Correo'].trim() || null,
      status: (row['Estado'] || 'confirmado').trim(),
      puestoId: m.puestoId,
    });
  }

  // ── Prepare jurado rows ──
  const juradoRows = [];
  const juradoNoMatch = [];
  const juradoMethodCounts = { exact_raw:0, exact_norm:0, fuzzy:0, manual:0, none:0 };

  for (const row of jurados) {
    const cedula = row['Cédula'].trim();
    if (!cedula) { console.warn(`  SKIP jurado sin cédula: ${row['Nombre Completo']}`); continue; }
    const m = findPuesto(row['Puesto de Votación'], row['Municipio'], dbPuestos, municipioMap);
    juradoMethodCounts[m.method]++;
    if (m.method === 'none') juradoNoMatch.push({ cedula, puesto: row['Puesto de Votación'], municipio: row['Municipio'] });
    juradoRows.push({
      cedula,
      nombre:          row['Nombre Completo'].trim(),
      telefono:        row['Teléfono'].trim() || null,
      correo:          row['Correo'].trim() || null,
      estado:          (row['Estado'] || 'confirmado').trim(),
      municipio:       row['Municipio'].trim(),
      puestoId:        m.puestoId,
      puestoNombreCsv: row['Puesto de Votación'].trim(),
    });
  }

  // ── Report plan ──
  console.log('─── PLAN ───────────────────────────────────────────');
  console.log(`DELETE FROM "Testigo": ${dbCount[0].n} rows`);
  console.log(`INSERT testigos: ${testigoRows.length}`);
  console.log(`  Mapeo: exact_raw=${testigoMethodCounts.exact_raw} exact_norm=${testigoMethodCounts.exact_norm} fuzzy=${testigoMethodCounts.fuzzy} manual=${testigoMethodCounts.manual} none=${testigoMethodCounts.none}`);
  console.log(`INSERT jurados: ${juradoRows.length}`);
  console.log(`  Mapeo: exact_raw=${juradoMethodCounts.exact_raw} exact_norm=${juradoMethodCounts.exact_norm} fuzzy=${juradoMethodCounts.fuzzy} manual=${juradoMethodCounts.manual} none=${juradoMethodCounts.none}`);

  if (testigoNoMatch.length > 0) {
    console.log(`\n  Testigos sin match de puesto (puestoId=NULL):`);
    const byPuesto = {};
    testigoNoMatch.forEach(r => { byPuesto[r.puesto] = (byPuesto[r.puesto]||0)+1; });
    Object.entries(byPuesto).forEach(([p,n]) => console.log(`    ${n}x "${p}"`));
  }
  if (juradoNoMatch.length > 0) {
    console.log(`\n  Jurados sin match de puesto (puestoId=NULL):`);
    const byPuesto = {};
    juradoNoMatch.forEach(r => { byPuesto[r.puesto] = (byPuesto[r.puesto]||0)+1; });
    Object.entries(byPuesto).forEach(([p,n]) => console.log(`    ${n}x "${p}"`));
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No DB changes made. Run without --dry-run to apply.');
    c.release(); await pool.end(); return;
  }

  // ── Execute ──
  if (!DO_TESTIGOS && !DO_JURADOS) {
    console.log('\nNo action flags set (--apply-testigos / --apply-jurados). Nothing done.');
    c.release(); await pool.end(); return;
  }

  await c.query('BEGIN');
  try {
    if (DO_TESTIGOS) {
      const delResult = await c.query('DELETE FROM "Testigo"');
      console.log(`\n✓ Deleted ${delResult.rowCount} testigos`);

      // Batch insert testigos in chunks of 500
      let inserted = 0;
      const chunk = 500;
      for (let i = 0; i < testigoRows.length; i += chunk) {
        const batch = testigoRows.slice(i, i + chunk);
        const now = new Date();
        const values = batch.map((_, idx) => {
          const base = idx * 7;
          return '($' + (base+1) + ',$' + (base+2) + ',$' + (base+3) + ',$' + (base+4) + ',$' + (base+5) + ',$' + (base+6) + ',$' + (base+7) + ')';
        }).join(',');
        const params = batch.flatMap(r => [r.cedula, r.name, r.phone, r.correo, r.status, r.puestoId, now]);
        await c.query(
          'INSERT INTO "Testigo" (cedula, name, phone, correo, status, "puestoId", "updatedAt") VALUES ' + values,
          params
        );
        inserted += batch.length;
        process.stdout.write(`  Testigos: ${inserted}/${testigoRows.length}\r`);
      }
      console.log(`\n✓ Inserted ${inserted} testigos`);
    }

    if (DO_JURADOS) {
      // Clear jurados first to allow re-run
      await c.query('DELETE FROM "Jurado"');

      let insertedJ = 0;
      const chunk = 500;
      for (let i = 0; i < juradoRows.length; i += chunk) {
        const batch = juradoRows.slice(i, i + chunk);
        // 9 params per row: cedula, nombre, telefono, correo, estado, municipio, puestoId, puestoNombreCsv, updatedAt
        const values = batch.map((_, idx) => {
          const base = idx * 9;
          return '($' + (base+1) + ',$' + (base+2) + ',$' + (base+3) + ',$' + (base+4) + ',$' + (base+5) + ',$' + (base+6) + ',$' + (base+7) + ',$' + (base+8) + ',$' + (base+9) + ')';
        }).join(',');
        const now = new Date();
        const params = batch.flatMap(r => [
          r.cedula, r.nombre, r.telefono, r.correo, r.estado, r.municipio, r.puestoId, r.puestoNombreCsv, now
        ]);
        await c.query(
          'INSERT INTO "Jurado" (cedula, nombre, telefono, correo, estado, municipio, "puestoId", "puestoNombreCsv", "updatedAt") VALUES ' + values,
          params
        );
        insertedJ += batch.length;
        process.stdout.write('  Jurados: ' + insertedJ + '/' + juradoRows.length + '\r');
      }
      console.log('\n✓ Inserted ' + insertedJ + ' jurados');
    }

    await c.query('COMMIT');

    // ── Validation ──
    const { rows: finalT } = await c.query('SELECT COUNT(*) as n FROM "Testigo"');
    const { rows: finalJ } = await c.query('SELECT COUNT(*) as n FROM "Jurado"');
    const { rows: nullPuestoT } = await c.query('SELECT COUNT(*) as n FROM "Testigo" WHERE "puestoId" IS NULL');
    const { rows: nullPuestoJ } = await c.query('SELECT COUNT(*) as n FROM "Jurado" WHERE "puestoId" IS NULL');

    console.log('\n─── VALIDATION ─────────────────────────────────────');
    console.log(`Testigos in DB: ${finalT[0].n} (expected: ${testigoRows.length})`);
    console.log(`Jurados in DB:  ${finalJ[0].n} (expected: ${juradoRows.length})`);
    console.log(`Testigos sin puesto: ${nullPuestoT[0].n}`);
    console.log(`Jurados sin puesto:  ${nullPuestoJ[0].n}`);

    // Write no-match report
    const noMatchReport = [
      'tipo;cedula;puesto_csv;municipio',
      ...testigoNoMatch.map(r => `Testigo;${r.cedula};"${r.puesto}";${r.municipio}`),
      ...juradoNoMatch.map(r =>  `Jurado;${r.cedula};"${r.puesto}";${r.municipio}`),
    ].join('\n');
    fs.writeFileSync('C:/tmp/puestos-faltantes-en-bd.csv', noMatchReport, 'utf8');
    console.log(`\nPuestos sin match: C:/tmp/puestos-faltantes-en-bd.csv`);
    console.log('\n✓ Import complete.');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('\n✗ Error — rolled back:', err.message);
    throw err;
  }

  c.release(); await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
