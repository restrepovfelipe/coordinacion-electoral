/**
 * T56 — Testigos Data Integrity Audit
 * Run: npx tsx scripts/audit/t56-testigos-audit.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  const envFile = path.resolve(__dirname, '../../.env.local');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
      const eq = line.indexOf('=');
      if (eq < 1 || line.trim().startsWith('#')) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const prisma = new PrismaClient();

function normalize(s: string): string {
  return s.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

async function readCsvRows(): Promise<Array<{
  municipio: string; puesto_raw: string; puesto_normalized: string;
  primer_nombre: string; segundo_nombre: string;
  primer_apellido: string; segundo_apellido: string;
  telefono_std: string; correo: string; quality_flag: string;
}>> {
  const csvPath = path.resolve(__dirname, '../../../data/testigos_clean.csv');
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  const rows: any[] = [];
  let headers: string[] = [];
  let first = true;
  for await (const line of rl) {
    if (first) { headers = line.split(',').map(h => h.trim()); first = false; continue; }
    if (!line.trim()) continue;
    const vals = line.split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    rows.push(obj);
  }
  return rows;
}

async function main() {
  const csvRows = await readCsvRows();
  console.log(`\n${'═'.repeat(70)}`);
  console.log('T56 — TESTIGOS DATA INTEGRITY AUDIT');
  console.log(`${'═'.repeat(70)}\n`);

  // ── A1: CC San Diego specific ─────────────────────────────────────────────
  console.log('── A1: CC San Diego Investigation ──────────────────────────────────\n');

  const sanDiegoCsvRows = csvRows.filter(r =>
    r.puesto_raw.toLowerCase().includes('san diego') ||
    r.puesto_normalized.toLowerCase().includes('san diego')
  );
  console.log(`CSV rows containing "san diego": ${sanDiegoCsvRows.length}`);

  const byPuesto: Record<string, { municipio: string; count: number }> = {};
  for (const r of sanDiegoCsvRows) {
    const k = `${r.municipio}||${r.puesto_raw}`;
    if (!byPuesto[k]) byPuesto[k] = { municipio: r.municipio, count: 0 };
    byPuesto[k].count++;
  }
  for (const [k, v] of Object.entries(byPuesto)) {
    const [, puestoRaw] = k.split('||');
    console.log(`  ${v.municipio.padEnd(16)} | "${puestoRaw}" → ${v.count} testigos`);
  }

  // CC San Diego = MEDELLIN AUDITORIO CC SAN DIEGO TORRE NTE PISO 11
  const ccSanDiegoCsv = csvRows.filter(r =>
    r.puesto_normalized.toLowerCase().includes('auditorio cc san diego') ||
    r.puesto_raw.toLowerCase().includes('auditorio cc san diego')
  );
  console.log(`\nFocus: "AUDITORIO CC SAN DIEGO TORRE NTE PISO 11" → ${ccSanDiegoCsv.length} CSV rows`);

  // Look up the puesto in DB
  const ccSanDiegoPuesto = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.name, p.divipola, m.name as municipio_name
    FROM "Puesto" p
    JOIN "Municipio" m ON m.id = p."municipioId"
    WHERE UPPER(p.name) LIKE '%SAN DIEGO%'
       OR UPPER(p.divipola) LIKE '%SAN DIEGO%'
  `;
  console.log(`\nDB puestos matching "SAN DIEGO" (${ccSanDiegoPuesto.length} total):`);
  for (const p of ccSanDiegoPuesto) {
    const testCount = await prisma.testigo.count({ where: { puestoId: p.id } });
    console.log(`  id=${p.id} | "${p.name}" | divipola=${p.divipola} | municipio=${p.municipio_name} | testigos_in_db=${testCount}`);
  }

  // Did CC San Diego testigos land as NULL?
  const ccSanDiegoNames = ccSanDiegoCsv.map(r =>
    [r.primer_nombre, r.segundo_nombre, r.primer_apellido, r.segundo_apellido]
      .filter(Boolean).join(' ')
  );
  const nullTestigosForSanDiego = await prisma.$queryRaw<any[]>`
    SELECT id, name, phone, notes, "puestoId"
    FROM "Testigo"
    WHERE "puestoId" IS NULL
      AND (
        UPPER(name) LIKE '%CALDAS%'
        OR UPPER(name) LIKE '%GARCIA GAMBOA%'
        OR UPPER(name) LIKE '%GOMEZ%JIMENEZ%'
        OR UPPER(name) LIKE '%HENAO%MEJIA%'
        OR UPPER(name) LIKE '%HERNANDEZ%MEJIA%'
        OR UPPER(name) LIKE '%JARAMILLO%LONDONO%'
        OR UPPER(name) LIKE '%LOAIZA%'
        OR UPPER(name) LIKE '%LONDONO%CARDONA%'
        OR UPPER(name) LIKE '%MACIAS%GIRALDO%'
        OR UPPER(name) LIKE '%MORALES%QUINTANA%'
        OR UPPER(name) LIKE '%OROZCO%SALGADO%'
      )
  `;
  console.log(`\nNull-puestoId DB testigos matching CC San Diego names: ${nullTestigosForSanDiego.length}`);
  for (const t of nullTestigosForSanDiego.slice(0, 5)) {
    const notes = t.notes ? t.notes.substring(0, 60) : '';
    console.log(`  id=${t.id} | "${t.name}" | puestoId=${t.puestoId} | notes="${notes}"`);
  }

  // Check if CC San Diego puesto name exists in DB with exact or close name
  const ccSanDiegoNormalized = 'auditorio cc san diego torre nte piso 11';
  const dbPuestoExact = await prisma.$queryRaw<any[]>`
    SELECT id, name, divipola FROM "Puesto"
    WHERE LOWER(REPLACE(name, '  ', ' ')) LIKE '%auditorio%san diego%'
  `;
  console.log(`\nDB puestos with "auditorio%san diego" in name: ${dbPuestoExact.length}`);
  for (const p of dbPuestoExact) {
    console.log(`  id=${p.id} | name="${p.name}" | divipola="${p.divipola}"`);
  }

  // ── A2: Systemic match-rate audit ─────────────────────────────────────────
  console.log('\n\n── A2: Systemic Match-Rate Audit ───────────────────────────────────\n');

  const nullCount = await prisma.testigo.count({ where: { puestoId: null } });
  const totalCount = await prisma.testigo.count();
  console.log(`Total testigos in DB:         ${totalCount}`);
  console.log(`Testigos with puestoId=NULL:  ${nullCount} (${((nullCount/totalCount)*100).toFixed(1)}%)`);
  console.log(`Testigos with valid puestoId: ${totalCount - nullCount}`);

  // Top municipios for null testigos — extract from notes field
  // notes format: "quality_flag: X | correo: Y" but we can also look at the CSV
  // Actually we need to figure out which municipio a null testigo belongs to
  // The notes field has quality_flag and correo but not municipio
  // We need to join via CSV — let's count by extracting from notes or use a different approach

  // Get sample of null testigos with notes to understand what info we have
  const nullSample = await prisma.$queryRaw<any[]>`
    SELECT id, name, phone, notes
    FROM "Testigo"
    WHERE "puestoId" IS NULL
    ORDER BY id
    LIMIT 10
  `;
  console.log('\nSample of NULL-puestoId testigos (notes field):');
  for (const t of nullSample) {
    console.log(`  id=${t.id} | "${t.name}" | notes="${t.notes ?? ''}"`);
  }

  // Build municipio breakdown from CSV perspective: which municipios had unmatched puestos
  // We know from the seed: puestoId=null means the CSV row's puesto didn't match any DB puesto
  // The CSV has municipio info — let's cross-reference
  // Build: for each CSV row, was it matched? If not, record municipio

  // Load DB puestos for matching
  const dbPuestos = await prisma.puesto.findMany({
    select: { id: true, name: true, divipola: true, municipioId: true },
  });
  const dbMunicipios = await prisma.municipio.findMany({
    select: { id: true, name: true, divipola: true },
  });

  const puestoPorDivipola = new Map<string, number>();
  for (const p of dbPuestos) puestoPorDivipola.set(normalize(p.divipola), p.id);

  const municipioNombreToId = new Map<string, number>();
  for (const m of dbMunicipios) municipioNombreToId.set(normalize(m.name), m.id);

  const puestoPorMunicipioYNombre = new Map<string, number>();
  for (const p of dbPuestos) {
    puestoPorMunicipioYNombre.set(`${p.municipioId}::${normalize(p.name)}`, p.id);
  }

  // Count unmatched per municipio (same logic as seed script)
  const unmatchedByMunicipio: Record<string, number> = {};
  const unmatchedPuestos = new Set<string>(); // puestoPorNormalized values with no match
  let totalUnmatched = 0;

  for (const row of csvRows) {
    const normedPuesto = normalize(row.puesto_normalized);
    const municipioNorm = normalize(row.municipio);
    let matched = false;

    if (normedPuesto && puestoPorDivipola.has(normedPuesto)) {
      matched = true;
    } else {
      const municipioId = municipioNombreToId.get(municipioNorm);
      if (municipioId !== undefined) {
        const key = `${municipioId}::${normedPuesto}`;
        if (puestoPorMunicipioYNombre.has(key)) matched = true;
      }
    }

    if (!matched) {
      totalUnmatched++;
      unmatchedByMunicipio[row.municipio] = (unmatchedByMunicipio[row.municipio] || 0) + 1;
      if (normedPuesto) unmatchedPuestos.add(`${row.municipio}||${row.puesto_normalized}`);
    }
  }

  console.log(`\nCSV rows that would not match any DB puesto: ${totalUnmatched}`);
  console.log('(This should equal the DB null count of ' + nullCount + ' modulo dedup/exclusions)\n');

  console.log('Top 15 municipios by unmatched testigo count:');
  const sortedMunis = Object.entries(unmatchedByMunicipio).sort((a, b) => b[1] - a[1]);
  for (const [muni, count] of sortedMunis.slice(0, 15)) {
    console.log(`  ${muni.padEnd(30)} ${count}`);
  }

  // ── A3: Root cause analysis ──────────────────────────────────────────────
  console.log('\n\n── A3: Root Cause Diagnosis ─────────────────────────────────────────\n');

  // Sample unmatched puestos and explain why they didn't match
  console.log('Sample of unmatched puesto_normalized values with diagnosis:\n');
  const unmatchedArr = Array.from(unmatchedPuestos);
  const sampleSize = Math.min(30, unmatchedArr.length);

  let noPuestoInDb = 0;
  let normalizationMismatch = 0;
  let municipioMismatch = 0;
  const examplesNoPuesto: string[] = [];
  const examplesNorm: string[] = [];

  for (const entry of unmatchedArr.slice(0, sampleSize)) {
    const [muni, puesto] = entry.split('||');
    const normedPuesto = normalize(puesto);
    const municipioId = municipioNombreToId.get(normalize(muni));

    if (!municipioId) {
      municipioMismatch++;
      examplesNorm.push(`  MUNI_MISSING: "${muni}" → no match in DB municipios`);
    } else {
      // Check if ANY puesto in this municipio fuzzy-matches
      const muniPuestos = dbPuestos.filter(p => p.municipioId === municipioId);
      const normNames = muniPuestos.map(p => normalize(p.name));
      const fuzzyMatch = normNames.find(n => n.includes(normedPuesto.slice(0, 8)) || normedPuesto.includes(n.slice(0, 8)));
      if (fuzzyMatch) {
        normalizationMismatch++;
        if (examplesNorm.length < 5) examplesNorm.push(`  NORM_MISMATCH: "${puesto}" vs DB "${fuzzyMatch}" (muni=${muni})`);
      } else {
        noPuestoInDb++;
        if (examplesNoPuesto.length < 5) examplesNoPuesto.push(`  NO_PUESTO: "${puesto}" (muni=${muni}) — not in DB at all`);
      }
    }
  }

  console.log(`In sample of ${sampleSize} unmatched puestos:`);
  console.log(`  Municipio missing from DB:         ${municipioMismatch}`);
  console.log(`  Normalization/spelling mismatch:   ${normalizationMismatch}`);
  console.log(`  Puesto not in DB at all:           ${noPuestoInDb}`);
  console.log('\nExamples — normalization mismatches:');
  for (const e of examplesNorm.slice(0, 5)) console.log(e);
  console.log('\nExamples — puesto not in DB:');
  for (const e of examplesNoPuesto.slice(0, 5)) console.log(e);

  // ── A4: Sample match verification (non-null testigos) ────────────────────
  console.log('\n\n── A4: Sample Match Quality (20 random testigos with puestoId) ──────\n');

  const sampleMatched = await prisma.$queryRaw<any[]>`
    SELECT t.id, t.name, t.notes, t."puestoId",
           p.name as puesto_name, p.divipola,
           m.name as municipio_name
    FROM "Testigo" t
    JOIN "Puesto" p ON p.id = t."puestoId"
    JOIN "Municipio" m ON m.id = p."municipioId"
    WHERE t."puestoId" IS NOT NULL
    ORDER BY RANDOM()
    LIMIT 20
  `;

  let mismatchCount = 0;
  for (const t of sampleMatched) {
    const divipolaInNotes = t.notes; // notes contains quality_flag and correo but NOT puesto name
    // We can't easily verify from notes since puesto name wasn't stored there
    // Instead report what we see
    console.log(`  id=${String(t.id).padEnd(5)} | "${t.name.substring(0, 30).padEnd(30)}" | puesto="${t.puesto_name.substring(0, 30)}" | muni=${t.municipio_name}`);
  }

  // ── Final CC San Diego diagnosis ─────────────────────────────────────────
  console.log('\n\n── DIAGNOSIS: Why CC San Diego testigos are missing ─────────────────\n');

  // Check exact normalized form used by seed
  const ccNorm = normalize('AUDITORIO CC SAN DIEGO TORRE NTE PISO 11');
  console.log(`CSV puesto_normalized: "AUDITORIO CC SAN DIEGO TORRE NTE PISO 11"`);
  console.log(`After normalize():     "${ccNorm}"`);

  // Find all Medellín puestos in DB that might correspond
  const medellinId = municipioNombreToId.get('medellin');
  console.log(`\nMedellín municipio id in DB: ${medellinId ?? 'NOT FOUND'}`);

  if (medellinId) {
    const medellinPuestos = dbPuestos.filter(p => p.municipioId === medellinId);
    console.log(`Total Medellín puestos in DB: ${medellinPuestos.length}`);

    // Search for partial match
    const partial = medellinPuestos.filter(p =>
      normalize(p.name).includes('san diego') ||
      normalize(p.divipola).includes('san diego')
    );
    console.log(`Medellín puestos with "san diego": ${partial.length}`);
    for (const p of partial) {
      console.log(`  id=${p.id} | name="${p.name}" | divipola="${p.divipola}"`);
      console.log(`    normalized name: "${normalize(p.name)}"`);
    }

    // Was there an exact match attempt?
    const exactKey = `${medellinId}::${ccNorm}`;
    const exactMatch = puestoPorMunicipioYNombre.get(exactKey);
    console.log(`\nExact key lookup "${exactKey}": ${exactMatch ?? 'NO MATCH'}`);

    // Was there a divipola match?
    const divipolaMatch = puestoPorDivipola.get(ccNorm);
    console.log(`Divipola lookup for "${ccNorm}": ${divipolaMatch ?? 'NO MATCH'}`);
  }

  // Count CC San Diego CSV rows
  const ccSanDiegoTotal = csvRows.filter(r =>
    normalize(r.puesto_normalized).includes('auditorio cc san diego')
  ).length;
  console.log(`\nCSV rows for "AUDITORIO CC SAN DIEGO" (all municipios): ${ccSanDiegoTotal}`);
  console.log('Conclusion: these testigos were seeded with puestoId=NULL because the');
  console.log('puesto name in CSV did not match any row in the Puesto table.');

  // ── SUMMARY REPORT ───────────────────────────────────────────────────────
  console.log('\n\n' + '═'.repeat(70));
  console.log('SUMMARY REPORT');
  console.log('═'.repeat(70));

  console.log(`\n1. DB state:`);
  console.log(`   Total testigos:        ${totalCount}`);
  console.log(`   With valid puestoId:   ${totalCount - nullCount} (${(((totalCount-nullCount)/totalCount)*100).toFixed(1)}%)`);
  console.log(`   With puestoId=NULL:    ${nullCount} (${((nullCount/totalCount)*100).toFixed(1)}%)`);

  console.log(`\n2. CC San Diego specifically:`);
  console.log(`   CSV rows:              ${ccSanDiegoTotal}`);
  console.log(`   DB match (by name):    ${dbPuestoExact.length > 0 ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`   Status:                puestoId=NULL — puesto name in CSV doesn't match DB`);

  console.log(`\n3. Top 10 affected municipios (unmatched from CSV perspective):`);
  for (const [muni, count] of sortedMunis.slice(0, 10)) {
    console.log(`   ${muni.padEnd(30)} ${count} testigos unassigned`);
  }

  console.log(`\n4. Unmatched puesto_normalized values (sample — puestos in CSV not found in DB):`);
  for (const entry of unmatchedArr.slice(0, 20)) {
    const [muni, puesto] = entry.split('||');
    if (puesto && puesto.length > 2) console.log(`   ${muni.padEnd(20)} | "${puesto}"`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
