#!/usr/bin/env node
/**
 * Phase 1 analysis script — CSV vs DB reconciliation (READ-ONLY).
 * Generates /tmp/reconciliation-report.md and /tmp/puestos-revisar-manualmente.csv
 * Does NOT modify the database.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import pg from 'pg';

const require = createRequire(import.meta.url);

const CSV_PATH = path.resolve(process.cwd(), '../data/testigos_ANTIOQUIA_20260525_161923.csv');
const REPORT_PATH = '/tmp/reconciliation-report.md';
const MANUAL_REVIEW_PATH = '/tmp/puestos-revisar-manualmente.csv';

// DB connection — uses same DATABASE_URL as the backend
const DB_URL = process.env.DATABASE_URL || 'postgresql://app_user:nR2rTubtjDyjTizxRHu8X0jEnbbilF%2BVjq52W3cGg2U%3D@localhost:5432/defensores';

const pool = new pg.Pool({ connectionString: DB_URL });

// ─── Normalisation helpers ────────────────────────────────────────────────────

const ACCENT_MAP = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U',
  ñ: 'n', Ñ: 'N', ü: 'u', Ü: 'U',
};

function stripAccents(s) {
  return s.replace(/[áéíóúÁÉÍÓÚñÑüÜ]/g, c => ACCENT_MAP[c] || c);
}

const IE_PREFIXES = [
  /\bI\.E\.?\b/gi, /\bINST\.?\s*EDUC\.?\b/gi, /\bINSTITUCION\s+EDUCATIVA\b/gi,
  /\bINST\s+EDUC\b/gi, /\bC\.E\.?\b/gi, /\bCOLEGIO\s+PUBLICO\b/gi,
  /\bCOL\b/gi,
];

function normalizePuesto(name) {
  if (!name) return '';
  let n = name.toUpperCase();
  n = stripAccents(n);
  for (const re of IE_PREFIXES) n = n.replace(re, '');
  // Collapse punctuation and multiple spaces
  n = n.replace(/[^A-Z0-9\s]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

// ─── CSV parsing ─────────────────────────────────────────────────────────────

function parseCSV(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (parts[idx] || '').replace(/^"|"$/g, '').trim();
    });
    rows.push(row);
  }
  return rows;
}

// ─── Puesto matching ─────────────────────────────────────────────────────────

function matchPuesto(csvPuesto, csvMunicipio, puestos, municipioMap) {
  const mKey = csvMunicipio.toUpperCase().trim();
  const municipioId = municipioMap[mKey];
  const candidatos = municipioId
    ? puestos.filter(p => p.municipioId === municipioId)
    : puestos;

  const csvNorm = normalizePuesto(csvPuesto);

  // 1. Exact match by raw name + municipio
  const exactRaw = candidatos.find(
    p => p.name.toUpperCase().trim() === csvPuesto.toUpperCase().trim()
  );
  if (exactRaw) return { puestoId: exactRaw.id, method: 'exact_raw', sim: 100 };

  // 2. Exact normalised
  const exactNorm = candidatos.find(p => normalizePuesto(p.name) === csvNorm);
  if (exactNorm) return { puestoId: exactNorm.id, method: 'exact_norm', sim: 100 };

  // 3. Fuzzy ≥ 85%
  let best = null, bestSim = 0;
  for (const p of candidatos) {
    const sim = similarity(normalizePuesto(p.name), csvNorm);
    if (sim > bestSim) { bestSim = sim; best = p; }
  }
  if (best && bestSim >= 85) {
    return { puestoId: best.id, puestoName: best.name, method: 'fuzzy', sim: bestSim };
  }

  // 4. No match
  return {
    puestoId: null,
    puestoName: best ? best.name : null,
    method: 'none',
    sim: bestSim,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 1 Analysis: CSV vs DB (read-only) ===\n');

  // 1. Parse CSV
  console.log('Reading CSV...');
  const allRows = parseCSV(CSV_PATH);
  console.log(`  Total rows: ${allRows.length}`);

  const csvTestigos = allRows.filter(r => r['Tipo'] === 'Testigo');
  const csvJurados  = allRows.filter(r => r['Tipo'] === 'Jurado');
  console.log(`  Testigos: ${csvTestigos.length}`);
  console.log(`  Jurados:  ${csvJurados.length}`);

  // Validate CSV rows
  const badRows = allRows.filter(r => !r['Cédula'] || !r['Nombre Completo']);
  console.log(`  Rows with missing cédula or name: ${badRows.length}`);

  // Municipio counts
  const muniCounts = {};
  allRows.forEach(r => {
    const m = r['Municipio'] || 'UNKNOWN';
    muniCounts[m] = (muniCounts[m] || 0) + 1;
  });
  const muniList = Object.entries(muniCounts).sort((a, b) => b[1] - a[1]);

  // 2. Load DB
  console.log('\nLoading DB data...');
  const client = await pool.connect();

  const { rows: dbTestigos } = await client.query(
    `SELECT id, cedula, name, phone, status, "puestoId" FROM "Testigo"`
  );
  console.log(`  DB testigos: ${dbTestigos.length}`);

  const { rows: dbPuestos } = await client.query(
    `SELECT id, name, "municipioId" FROM "Puesto"`
  );
  console.log(`  DB puestos: ${dbPuestos.length}`);

  const { rows: dbMunicipios } = await client.query(
    `SELECT id, name FROM "Municipio"`
  );
  console.log(`  DB municipios: ${dbMunicipios.length}`);

  // Check for active field on Testigo
  const { rows: testigo_cols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Testigo' AND table_schema = 'public'
  `);
  const testigoColNames = testigo_cols.map(c => c.column_name);
  const hasActive = testigoColNames.includes('active');
  const hasEmail  = testigoColNames.includes('correo') || testigoColNames.includes('email');
  console.log(`  Testigo.active field exists: ${hasActive}`);
  console.log(`  Testigo.correo/email field exists: ${hasEmail}`);
  console.log(`  Testigo columns: ${testigoColNames.join(', ')}`);

  client.release();

  // 3. Build lookup maps
  const dbTestigoByCedula = {};
  dbTestigos.forEach(t => { if (t.cedula) dbTestigoByCedula[t.cedula.trim()] = t; });

  const municipioMap = {};
  dbMunicipios.forEach(m => {
    municipioMap[m.name.toUpperCase().trim()] = m.id;
    // Also without accents
    municipioMap[stripAccents(m.name).toUpperCase().trim()] = m.id;
  });

  // 4. Reconcile testigos
  console.log('\nReconciling testigos...');
  const nuevos = [], modificados = [], sinCambios = [], ausentes = [];
  const puestosNoMatch = [];
  const puestosMatch = { exact_raw: 0, exact_norm: 0, fuzzy: 0, none: 0 };

  const csvCedulas = new Set();

  for (const row of csvTestigos) {
    const cedula = row['Cédula'].trim();
    if (!cedula) continue;
    csvCedulas.add(cedula);

    const csvName  = row['Nombre Completo'].trim();
    const csvPhone = row['Teléfono'].trim();
    const csvStatus = row['Estado'].trim();
    const csvPuesto = row['Puesto de Votación'].trim();
    const csvMuni   = row['Municipio'].trim();

    const matchResult = matchPuesto(csvPuesto, csvMuni, dbPuestos, municipioMap);
    puestosMatch[matchResult.method]++;

    if (matchResult.method === 'none') {
      puestosNoMatch.push({
        csvPuesto,
        csvMunicipio: csvMuni,
        sugerencia_bd: matchResult.puestoName || '',
        similitud: matchResult.sim,
        tipo: 'Testigo',
        cedula,
      });
    }

    const existing = dbTestigoByCedula[cedula];
    if (!existing) {
      nuevos.push({ cedula, name: csvName, puestoMatch: matchResult });
    } else {
      const diffs = [];
      if (existing.name !== csvName) diffs.push(`name: "${existing.name}" → "${csvName}"`);
      if ((existing.phone || '') !== csvPhone) diffs.push(`phone: "${existing.phone}" → "${csvPhone}"`);
      if ((existing.status || 'pendiente') !== csvStatus) diffs.push(`status: "${existing.status}" → "${csvStatus}"`);
      if (existing.puestoId !== matchResult.puestoId && matchResult.puestoId) {
        diffs.push(`puestoId: ${existing.puestoId} → ${matchResult.puestoId}`);
      }

      if (diffs.length > 0) {
        modificados.push({ cedula, name: csvName, diffs, puestoMatch: matchResult });
      } else {
        sinCambios.push(cedula);
      }
    }
  }

  // Ausentes: in DB but not in CSV
  for (const t of dbTestigos) {
    if (t.cedula && !csvCedulas.has(t.cedula.trim())) {
      ausentes.push({ cedula: t.cedula, name: t.name, id: t.id });
    }
  }

  // 5. Reconcile jurados (all new)
  console.log('Reconciling jurados...');
  const juradoNuevos = [];
  for (const row of csvJurados) {
    const cedula = row['Cédula'].trim();
    if (!cedula) continue;
    const matchResult = matchPuesto(row['Puesto de Votación'], row['Municipio'], dbPuestos, municipioMap);
    puestosMatch[matchResult.method]++;
    if (matchResult.method === 'none') {
      puestosNoMatch.push({
        csvPuesto: row['Puesto de Votación'],
        csvMunicipio: row['Municipio'],
        sugerencia_bd: matchResult.puestoName || '',
        similitud: matchResult.sim,
        tipo: 'Jurado',
        cedula,
      });
    }
    juradoNuevos.push({ cedula, name: row['Nombre Completo'], puestoMatch: matchResult });
  }

  console.log('\n=== RESULTS ===');
  console.log(`Testigos nuevos:      ${nuevos.length}`);
  console.log(`Testigos modificados: ${modificados.length}`);
  console.log(`Testigos sin cambios: ${sinCambios.length}`);
  console.log(`Ausentes en CSV:      ${ausentes.length}`);
  console.log(`Jurados a insertar:   ${juradoNuevos.length}`);
  console.log(`\nMapeo puestos (testigos + jurados):`);
  console.log(`  exact_raw:  ${puestosMatch.exact_raw}`);
  console.log(`  exact_norm: ${puestosMatch.exact_norm}`);
  console.log(`  fuzzy:      ${puestosMatch.fuzzy}`);
  console.log(`  sin_match:  ${puestosMatch.none}`);

  // 6. Write manual review CSV
  const manualCsvLines = [
    'csvPuesto;csvMunicipio;tipo;cedula;sugerencia_bd;similitud',
    ...puestosNoMatch.map(p =>
      `"${p.csvPuesto}";"${p.csvMunicipio}";"${p.tipo}";"${p.cedula}";"${p.sugerencia_bd}";${p.similitud}`
    ),
  ];
  fs.writeFileSync(MANUAL_REVIEW_PATH, manualCsvLines.join('\n'), 'utf8');
  console.log(`\nManual review CSV: ${MANUAL_REVIEW_PATH}`);

  // 7. Write reconciliation report
  const modDetails = modificados.slice(0, 30).map(t =>
    `  - ${t.cedula} (${t.name}): ${t.diffs.join('; ')}`
  ).join('\n');
  const moreMod = modificados.length > 30
    ? `\n  ... y ${modificados.length - 30} más (ver script output completo)\n`
    : '';

  const ausentesSample = ausentes.slice(0, 20).map(t =>
    `  - ${t.cedula} ${t.name}`
  ).join('\n');
  const moreAusentes = ausentes.length > 20
    ? `\n  ... y ${ausentes.length - 20} más\n`
    : '';

  const muniSection = muniList.slice(0, 15).map(([m, c]) => `  - ${m}: ${c}`).join('\n');

  const schemaWarnings = [];
  if (!hasActive) {
    schemaWarnings.push(
      '⚠️  **SCHEMA ISSUE**: `Testigo` no tiene campo `active`. ' +
      'Para marcar testigos como inactivos se necesita agregar `active Boolean @default(true)` al modelo. ' +
      'Esto requiere una migration adicional. ¿Aprobás este cambio al schema de Testigo?'
    );
  }
  if (!hasEmail) {
    schemaWarnings.push(
      '⚠️  **SCHEMA ISSUE**: `Testigo` no tiene campo `correo`/`email`. ' +
      'El CSV incluye correo electrónico por testigo. ¿Querés guardar ese dato en Testigo o ignorarlo?'
    );
  }

  const report = `# Reporte de reconciliación CSV vs BD
Fecha: 2026-05-25
CSV: data/testigos_ANTIOQUIA_20260525_161923.csv
Backup Cloud SQL ID: 1779750649911

---

## ⚠️ Problemas de schema detectados (requieren decisión del owner)

${schemaWarnings.length > 0 ? schemaWarnings.join('\n\n') : 'Ninguno.'}

---

## CSV — resumen
- Total filas: ${allRows.length}
- Testigos: ${csvTestigos.length}
- Jurados: ${csvJurados.length}
- Filas con cédula o nombre vacío: ${badRows.length}
- Municipios presentes (top 15):
${muniSection}

## Testigos
- **Nuevos (a insertar)**: ${nuevos.length}
- **Modificados (a actualizar)**: ${modificados.length}
- **Sin cambios**: ${sinCambios.length}
- **Ausentes en CSV (candidatos a inactivar)**: ${ausentes.length}

### Detalle de modificados (primeros 30):
${modDetails}${moreMod}

### Ausentes en CSV (primeros 20):
${ausentesSample}${moreAusentes}

> Nota: "ausentes" son testigos en la BD que no aparecen en el CSV.
> El owner debe decidir si marcarlos como inactive (requiere campo active en schema).

## Jurados
- **Para insertar (todos nuevos)**: ${juradoNuevos.length}

## Mapeo de puestos (testigos + jurados combinados)
- Match automático exacto (raw):       ${puestosMatch.exact_raw}
- Match automático normalizado:        ${puestosMatch.exact_norm}
- Match fuzzy (≥85% similitud):        ${puestosMatch.fuzzy}
- **SIN MATCH (revisar manualmente)**: ${puestosMatch.none}

Ver: ${MANUAL_REVIEW_PATH}

---

## Próximos pasos — requieren luz verde del owner

1. **Decisión schema Testigo.active**: ¿agregar el campo para poder inactivar testigos?
2. **Decisión schema Testigo.correo**: ¿guardar el email del CSV en la tabla Testigo?
3. **Revisar** \`${MANUAL_REVIEW_PATH}\` — ${puestosMatch.none} puestos sin match automático
4. **Decidir** si los ${ausentes.length} testigos "ausentes en CSV" se marcan inactivos
5. **Aprobar** para proceder con Fase 2 (schema/migration) y Fase 4 (import)
`;

  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`\nReport: ${REPORT_PATH}`);

  await pool.end();
  console.log('\nDone. No DB changes were made.');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
