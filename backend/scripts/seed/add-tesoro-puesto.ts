/**
 * add-tesoro-puesto.ts
 * Crea el puesto "PARQUE COMERCIAL EL TESORO" en DB y reasigna sus 35 testigos.
 */
import * as fs from 'fs';
import * as path from 'path';
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
const ATANASIO_ID = 246;

async function main() {
  // Get comunaId used by other SIN COMUNA puestos in Medellín
  const ref = await prisma.puesto.findFirst({
    where: { municipioId: 1, name: 'ESTADIO ATANASIO GIRARDOT' },
    select: { comunaId: true, divipola: true },
  });
  console.log('Referencia Atanasio:', JSON.stringify(ref));

  // Check if already exists
  const existing = await prisma.puesto.findFirst({ where: { name: 'PARQUE COMERCIAL EL TESORO', municipioId: 1 } });
  if (existing) {
    console.log('Ya existe con id:', existing.id);
  } else {
    const created = await prisma.puesto.create({
      data: {
        name: 'PARQUE COMERCIAL EL TESORO',
        municipioId: 1,
        comunaId: ref?.comunaId ?? null,
        address: 'CRA 25A # 1A SUR-45',
        lat: 6.20218,
        lng: -75.56812,
        mesas: 0,
        votantes: 0,
        divipola: '05001-TESORO',
      },
    });
    console.log('Puesto creado con id:', created.id);

    // Reassign testigos from Atanasio that belong to El Tesoro
    // (the 35 identified in analysis)
    // We cross-reference by CSV: any testigo at Atanasio whose CSV puesto = PARQUE COMERCIAL EL TESORO
    const { readCsvAndBuildMaps, reassignTestigos } = await import('./add-tesoro-helpers.js').catch(() => ({ readCsvAndBuildMaps: null, reassignTestigos: null }));

    // Inline approach: load testigos at Atanasio, reassign ones that match
    const readline = await import('readline');
    const fs2 = await import('fs');
    const csvPath = path.resolve(__dirname, '../../../data/testigos_clean.csv');
    const rl2 = readline.createInterface({ input: fs2.createReadStream(csvPath, { encoding: 'utf-8' }), crlfDelay: Infinity });
    const rows: any[] = []; let headers: string[] = []; let first = true;
    for await (const line of rl2) {
      if (first) { headers = line.split(',').map((h: string) => h.trim()); first = false; continue; }
      if (!line.trim()) continue;
      const vals = line.split(','); const obj: any = {};
      headers.forEach((h: string, i: number) => { obj[h] = (vals[i] ?? '').trim(); });
      rows.push(obj);
    }

    function normalize(s: string) { return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' '); }
    function normPhone(raw: string) { let p = raw.replace(/\D/g, ''); if (p.startsWith('57') && p.length > 10) p = p.slice(2); return p; }

    const byNamePhone = new Map<string, any>(); const byName = new Map<string, any>();
    for (const row of rows) {
      const name = normalize([row.primer_nombre, row.segundo_nombre, row.primer_apellido, row.segundo_apellido].filter(Boolean).join(' '));
      const phone = normPhone(row.telefono_std || row.telefono_raw || '');
      if (phone && !byNamePhone.has(name + '::' + phone)) byNamePhone.set(name + '::' + phone, row);
      if (!byName.has(name)) byName.set(name, row);
    }

    const testigos = await prisma.testigo.findMany({ where: { puestoId: ATANASIO_ID }, select: { id: true, name: true, phone: true } });
    const toMove: number[] = [];
    for (const t of testigos) {
      const normName = normalize(t.name || '');
      const phone = normPhone(t.phone || '');
      let row = phone ? byNamePhone.get(normName + '::' + phone) : undefined;
      if (!row) row = byName.get(normName);
      if (row && row.puesto_normalized === 'PARQUE COMERCIAL EL TESORO') toMove.push(t.id);
    }

    console.log('Testigos a mover a El Tesoro:', toMove.length);
    if (toMove.length > 0) {
      await prisma.$transaction(toMove.map(id => prisma.testigo.update({ where: { id }, data: { puestoId: created.id } })));
      console.log('Reasignados correctamente.');
    }

    const atanasioFinal = await prisma.testigo.count({ where: { puestoId: ATANASIO_ID } });
    const tesoro = await prisma.testigo.count({ where: { puestoId: created.id } });
    console.log(`\nAtanasio: ${atanasioFinal} testigos`);
    console.log(`El Tesoro (${created.id}): ${tesoro} testigos`);
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
