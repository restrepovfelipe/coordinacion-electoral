/**
 * Seed script: import testigos from CSV into the database.
 * Run with: npx tsx scripts/seed/seed-testigos.ts
 *
 * Reads DATABASE_URL from .env.local (or environment).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

// Load DATABASE_URL from .env.local if not already set
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, '../../.env.local');
  const fallbackPath = path.resolve(__dirname, '../../.env');
  const envFile = fs.existsSync(envPath) ? envPath : fs.existsSync(fallbackPath) ? fallbackPath : null;
  if (envFile) {
    const content = fs.readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
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

interface ExcludedRow {
  nombre: string;
  cedula: string;
  municipio: string;
  motivo_exclusion: string;
}

interface SinPuestoRow {
  nombre: string;
  cedula: string;
  municipio: string;
  nombre_puesto_csv: string;
}

interface ValidTestigo {
  puestoId: number | null;
  name: string;
  cedula: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  createdById: null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

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

    // Simple CSV parse — fields do not contain commas (verified from header structure)
    const values = line.split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (values[i] ?? '').trim();
    });
    rows.push(obj as unknown as CsvRow);
  }

  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const csvPath = path.resolve(__dirname, '../../../data/testigos_clean.csv');
  const reportPath = path.resolve(__dirname, '../../../data/testigos_seed_report.xlsx');

  // 1. Read CSV
  const csvRows = await readCsv(csvPath);
  const totalCsv = csvRows.length;

  // 2. Load DB data
  const puestosDb = await prisma.puesto.findMany({
    select: { id: true, name: true, divipola: true, municipioId: true, comunaId: true },
  });
  const municipiosDb = await prisma.municipio.findMany({
    select: { id: true, name: true, divipola: true },
  });

  // Build lookup maps
  const puestoPorDivipola = new Map<string, number>();
  for (const p of puestosDb) {
    puestoPorDivipola.set(normalize(p.divipola), p.id);
  }

  // Map municipio name (normalized) → { id, puestos }
  const municipioNombreToId = new Map<string, number>();
  for (const m of municipiosDb) {
    municipioNombreToId.set(normalize(m.name), m.id);
  }

  // Map (municipioId, normalized puesto name) → puesto id
  const puestoPorMunicipioYNombre = new Map<string, number>();
  for (const p of puestosDb) {
    const key = `${p.municipioId}::${normalize(p.name)}`;
    puestoPorMunicipioYNombre.set(key, p.id);
  }

  // 3. Deduplication state
  // Key for exact duplicate: name + cedula + puestoId (string)
  const exactSeen = new Set<string>();
  // Key for natural-key duplicate: normalized(name) + normalized(municipio)
  const naturalSeen = new Set<string>();

  const toInsert: ValidTestigo[] = [];
  const excluded: ExcludedRow[] = [];
  const sinPuesto: SinPuestoRow[] = [];

  let countExactDup = 0;
  let countNaturalDup = 0;
  let countSinPuestoEspecifico = 0;
  let countSinPuestoMatch = 0;

  // 4. Process rows
  for (const row of csvRows) {
    const fullName = buildFullName(row);
    const municipioNorm = normalize(row.municipio);
    const phone = row.telefono_std.trim() || row.telefono_raw.trim() || null;
    const cedula: string | null = null; // CSV has no cedula column
    const notesArr: string[] = [];
    if (row.quality_flag) notesArr.push(`quality_flag: ${row.quality_flag}`);
    if (row.correo) notesArr.push(`correo: ${row.correo}`);
    const notes = notesArr.length ? notesArr.join(' | ') : null;

    // Exclusion: "sin puesto específico" in name or notes
    const nameAndNotes = `${fullName} ${row.puesto_raw} ${row.quality_flag}`.toLowerCase();
    if (nameAndNotes.includes('sin puesto especifico') || nameAndNotes.includes('sin puesto específico')) {
      countSinPuestoEspecifico++;
      excluded.push({ nombre: fullName, cedula: cedula ?? '', municipio: row.municipio, motivo_exclusion: 'sin_puesto_especifico' });
      continue;
    }

    // Resolve puesto
    let puestoId: number | null = null;

    // Primary: match by puesto_normalized as divipola
    const normedPuesto = normalize(row.puesto_normalized);
    if (normedPuesto && puestoPorDivipola.has(normedPuesto)) {
      puestoId = puestoPorDivipola.get(normedPuesto)!;
    }

    // Secondary: match by puesto name + municipio name
    if (puestoId === null && municipioNorm) {
      const municipioId = municipioNombreToId.get(municipioNorm);
      if (municipioId !== undefined) {
        const key = `${municipioId}::${normedPuesto}`;
        const found = puestoPorMunicipioYNombre.get(key);
        if (found !== undefined) {
          puestoId = found;
        }
      }
    }

    if (puestoId === null) {
      countSinPuestoMatch++;
    }

    // Deduplication checks
    const exactKey = `${normalize(fullName)}::${cedula ?? ''}::${puestoId ?? 'null'}`;
    if (exactSeen.has(exactKey)) {
      countExactDup++;
      excluded.push({ nombre: fullName, cedula: cedula ?? '', municipio: row.municipio, motivo_exclusion: 'duplicado_exacto' });
      continue;
    }

    if (!cedula) {
      const naturalKey = `${normalize(fullName)}::${municipioNorm}`;
      if (naturalSeen.has(naturalKey)) {
        countNaturalDup++;
        excluded.push({ nombre: fullName, cedula: '', municipio: row.municipio, motivo_exclusion: 'duplicado_natural' });
        continue;
      }
      naturalSeen.add(naturalKey);
    }

    exactSeen.add(exactKey);

    // Track sin-puesto rows for report
    if (puestoId === null) {
      sinPuesto.push({
        nombre: fullName,
        cedula: cedula ?? '',
        municipio: row.municipio,
        nombre_puesto_csv: row.puesto_raw,
      });
    }

    toInsert.push({
      puestoId,
      name: fullName,
      cedula,
      phone: phone && phone.length > 0 ? phone : null,
      status: 'pendiente',
      notes,
      createdById: null,
    });
  }

  // 5. Batch insert
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const result = await prisma.testigo.createMany({ data: batch, skipDuplicates: false });
    inserted += result.count;
  }

  // 6. Write Excel report
  const workbook = new ExcelJS.Workbook();

  // Sheet: Excluidos
  const wsExcluidos = workbook.addWorksheet('Excluidos');
  wsExcluidos.columns = [
    { header: 'nombre', key: 'nombre', width: 40 },
    { header: 'cedula', key: 'cedula', width: 16 },
    { header: 'municipio', key: 'municipio', width: 24 },
    { header: 'motivo_exclusion', key: 'motivo_exclusion', width: 30 },
  ];
  for (const row of excluded) {
    wsExcluidos.addRow(row);
  }

  // Sheet: Sin_Puesto
  const wsSinPuesto = workbook.addWorksheet('Sin_Puesto');
  wsSinPuesto.columns = [
    { header: 'nombre', key: 'nombre', width: 40 },
    { header: 'cedula', key: 'cedula', width: 16 },
    { header: 'municipio', key: 'municipio', width: 24 },
    { header: 'nombre_puesto_csv', key: 'nombre_puesto_csv', width: 40 },
  ];
  for (const row of sinPuesto) {
    wsSinPuesto.addRow(row);
  }

  // Sheet: Resumen
  const wsResumen = workbook.addWorksheet('Resumen');
  wsResumen.columns = [
    { header: 'Concepto', key: 'concepto', width: 45 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
  ];
  wsResumen.addRow({ concepto: 'Total CSV', cantidad: totalCsv });
  wsResumen.addRow({ concepto: 'Insertados', cantidad: inserted });
  wsResumen.addRow({ concepto: 'Excluidos (duplicado_exacto)', cantidad: countExactDup });
  wsResumen.addRow({ concepto: 'Excluidos (duplicado_natural)', cantidad: countNaturalDup });
  wsResumen.addRow({ concepto: 'Excluidos (sin_puesto_especifico)', cantidad: countSinPuestoEspecifico });
  wsResumen.addRow({ concepto: 'Sin puesto match', cantidad: countSinPuestoMatch });

  await workbook.xlsx.writeFile(reportPath);

  // 7. Boundary report
  console.log('=== TESTIGOS SEED BOUNDARY REPORT ===');
  console.log(`Total rows in CSV:                   ${totalCsv}`);
  console.log(`Inserted:                            ${inserted}`);
  console.log(`Excluded (exact duplicate):          ${countExactDup}`);
  console.log(`Excluded (natural-key duplicate):    ${countNaturalDup}`);
  console.log(`Excluded (sin_puesto_especifico):    ${countSinPuestoEspecifico}`);
  console.log(`Without puesto match:                ${countSinPuestoMatch}`);
  console.log(`Excel report written to: data/testigos_seed_report.xlsx`);
  console.log('=====================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
