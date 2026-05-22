/**
 * T13 — seed-reference.ts
 * Parses js/data.js literals and idempotent-upserts reference data:
 *   Subregion / Municipio / Zona / Comuna / Puesto
 * Assigns Comuna.zonaId from MEDELLIN_ZONAS (Amendment 3).
 * No Pregonero seed (Amendment 10).
 *
 * Run: pnpm tsx scripts/seed/seed-reference.ts
 * Precondition: Cloud SQL proxy running on localhost:5432, DATABASE_URL set in .env.local
 */

import * as path from 'path';
import * as fs from 'fs';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.join(__dirname, '../../.env.local') });

const prisma = new PrismaClient();

// ── Types ───────────────────────────────────────────────────────────────────

interface RawPuesto {
  dd: number;
  mm: number;
  zz: number;
  pp: number;
  puesto: string;
  direccion: string;
  mujeres: number;
  hombres: number;
  total: number;
  mesas: number;
  lat: number;
  lon: number;
}

interface MedellinZona {
  nombre: string;
  comunas: string[];
}

type RawData = Record<string, Record<string, RawPuesto[]>>;
type Regiones = Record<string, string[]>;

// ── Load data.js ─────────────────────────────────────────────────────────────

function loadDataJs(): {
  RAW: RawData;
  REGIONES: Regiones;
  MEDELLIN_ZONAS: MedellinZona[];
} {
  const dataPath = path.join(__dirname, '../../../js/data.js');
  const src = fs.readFileSync(dataPath, 'utf8');
  // Evaluate the JS literal file in an isolated function scope.
  // data.js declares globals with `const` — wrapping in a function and
  // returning them is the standard safe extraction technique for non-module JS.
  const fn = new Function(src + '; return { RAW, REGIONES, MEDELLIN_ZONAS };') as () => {
    RAW: RawData;
    REGIONES: Regiones;
    MEDELLIN_ZONAS: MedellinZona[];
  };
  return fn();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Zero-pad municipality code to 3 digits: 1 → "001", 125 → "125" */
function munDivipola(mm: number): string {
  return String(mm).padStart(3, '0');
}

/**
 * Puesto divipola: mm (3-digit) + sequential index within the municipality
 * (1-based, communes iterated in sorted key order).
 * Using positional index because zz+pp is not globally unique (7 collisions
 * in corregimientos of RIONEGRO and TURBO where zz=99 pp=0).
 */
function puestoDivipola(mm: number, seqIdx: number): string {
  return `${String(mm).padStart(3, '0')}-${String(seqIdx).padStart(4, '0')}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Loading js/data.js …');
  const { RAW, REGIONES, MEDELLIN_ZONAS } = loadDataJs();

  // ── 1. Subregiones ────────────────────────────────────────────────────────
  console.log('\n[1/6] Upserting subregiones …');
  const subregionMap = new Map<string, number>(); // name → id

  for (const subName of Object.keys(REGIONES)) {
    const row = await prisma.subregion.upsert({
      where: { name: subName },
      create: { name: subName },
      update: {},
    });
    subregionMap.set(subName, row.id);
  }
  console.log(`  → ${subregionMap.size} subregiones`);

  // ── 2. Municipios ─────────────────────────────────────────────────────────
  console.log('[2/6] Upserting municipios …');
  const municipioMap = new Map<string, number>(); // name → id

  for (const [subName, muniNames] of Object.entries(REGIONES)) {
    const subregionId = subregionMap.get(subName)!;
    for (const muniName of muniNames) {
      const comunas = RAW[muniName];
      // Get mm from the first puesto in the first commune
      const firstPuesto = Object.values(comunas)[0][0];
      const divipola = munDivipola(firstPuesto.mm);

      const row = await prisma.municipio.upsert({
        where: { divipola },
        create: { name: muniName, divipola, subregionId },
        update: { name: muniName, subregionId },
      });
      municipioMap.set(muniName, row.id);
    }
  }
  console.log(`  → ${municipioMap.size} municipios`);

  // ── 3. Zonas (Medellín) ───────────────────────────────────────────────────
  console.log('[3/6] Upserting zonas …');
  const zonaMap = new Map<string, number>(); // nombre → id

  for (const z of MEDELLIN_ZONAS) {
    const row = await prisma.zona.upsert({
      where: { name: z.nombre },
      create: { name: z.nombre },
      update: {},
    });
    zonaMap.set(z.nombre, row.id);
  }
  console.log(`  → ${zonaMap.size} zonas`);

  // ── 4. Comunas ───────────────────────────────────────────────────────────
  console.log('[4/6] Upserting comunas …');
  // Map: "MUNINAME|COMUNAKEY" → comunaId
  const comunaMap = new Map<string, number>();

  for (const [muniName, comunas] of Object.entries(RAW)) {
    const municipioId = municipioMap.get(muniName)!;
    for (const comunaKey of Object.keys(comunas)) {
      const row = await prisma.comuna.upsert({
        where: { municipioId_name: { municipioId, name: comunaKey } },
        create: { municipioId, name: comunaKey },
        update: {},
      });
      comunaMap.set(`${muniName}|${comunaKey}`, row.id);
    }
  }
  console.log(`  → ${comunaMap.size} comunas`);

  // ── 5. Assign zonaId to Medellín comunas (Amendment 3) ───────────────────
  console.log('[5/6] Assigning zonaId to Medellín comunas …');
  let assigned = 0;
  let unmatched: string[] = [];

  for (const z of MEDELLIN_ZONAS) {
    const zonaId = zonaMap.get(z.nombre)!;
    for (const comunaKey of z.comunas) {
      const comunaId = comunaMap.get(`MEDELLIN|${comunaKey}`);
      if (comunaId == null) {
        unmatched.push(comunaKey);
        continue;
      }
      await prisma.comuna.update({ where: { id: comunaId }, data: { zonaId } });
      assigned++;
    }
  }

  const withoutZona = [...comunaMap.entries()]
    .filter(([k]) => k.startsWith('MEDELLIN|'))
    .map(([k]) => k.replace('MEDELLIN|', ''));

  console.log(`  → assigned zonaId to ${assigned} Medellín comunas`);
  if (unmatched.length) console.warn(`  ⚠ unmatched zona keys: ${unmatched.join(', ')}`);
  // Any Medellín commune that ended with zonaId=null after assignment
  const stillNull = await prisma.comuna.count({
    where: {
      municipio: { name: 'MEDELLIN' },
      zonaId: null,
    },
  });
  console.log(`  → Medellín comunas still without zonaId: ${stillNull}`);

  // ── 6. Puestos ───────────────────────────────────────────────────────────
  console.log('[6/6] Upserting puestos …');
  let puestoCount = 0;

  for (const [muniName, comunas] of Object.entries(RAW)) {
    const municipioId = municipioMap.get(muniName)!;
    const firstPuesto = Object.values(comunas)[0][0];
    const mm = firstPuesto.mm;

    // Iterate communes in sorted key order for a stable sequential index
    let seqIdx = 1;
    for (const comunaKey of Object.keys(comunas).sort()) {
      const comunaId = comunaMap.get(`${muniName}|${comunaKey}`) ?? null;
      for (const p of comunas[comunaKey]) {
        const divipola = puestoDivipola(mm, seqIdx++);
        await prisma.puesto.upsert({
          where: { divipola },
          create: {
            divipola,
            municipioId,
            comunaId,
            name: p.puesto,
            address: p.direccion,
            lat: p.lat,
            lng: p.lon,
            mesas: p.mesas,
            votantes: p.total,
          },
          update: {
            municipioId,
            comunaId,
            name: p.puesto,
            address: p.direccion,
            lat: p.lat,
            lng: p.lon,
            mesas: p.mesas,
            votantes: p.total,
          },
        });
        puestoCount++;
      }
    }
  }
  console.log(`  → ${puestoCount} puestos`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.subregion.count(),
    prisma.municipio.count(),
    prisma.zona.count(),
    prisma.comuna.count(),
    prisma.puesto.count(),
  ]);

  console.log('\n=== Seed complete ===');
  console.log(`  Subregiones : ${counts[0]}  (expected 9)`);
  console.log(`  Municipios  : ${counts[1]}  (expected 125)`);
  console.log(`  Zonas       : ${counts[2]}  (expected 6)`);
  console.log(`  Comunas     : ${counts[3]}`);
  console.log(`  Puestos     : ${counts[4]}  (expected 1282)`);

  if (counts[0] !== 9)   console.error('ERROR: subregion count mismatch');
  if (counts[1] !== 125) console.error('ERROR: municipio count mismatch');
  if (counts[2] !== 6)   console.error('ERROR: zona count mismatch');
  if (counts[4] !== 1282) console.error('ERROR: puesto count mismatch');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
