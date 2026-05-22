import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const envFile = '/Users/feliperestrepo/Desktop/PÁGINAS WEB/coordinacion-electoral/backend/.env.local';
if (!process.env.DATABASE_URL) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const prisma = new PrismaClient();

async function main() {
  // Get comunas
  const comunas = await prisma.comuna.findMany({
    where: { municipioId: 1, name: { in: [
      '06COMUNA 6 DOCE DE OCTUBRE',
      '07COMUNA 7 ROBLEDO',
      '10COMUNA 10 LA CANDELARIA',
      '11COMUNA 11 LAURELES',
    ]}},
    select: { id: true, name: true },
  });
  console.log('Comunas:', JSON.stringify(comunas));

  const c = (n: string) => comunas.find(c => c.name.includes(n))!;
  const c6 = c('DOCE DE OCTUBRE');
  const c7 = c('ROBLEDO');
  const c10 = c('CANDELARIA');
  const c11 = c('LAURELES');

  // Get puestos
  const puestos = await prisma.puesto.findMany({
    where: { municipioId: 1, name: { in: [
      'ESTADIO ATANASIO GIRARDOT',
      'PLAZA MAYOR CTRO EXPOS. CONVEN',
      'RECLUSION DE MUJERES PEDREGAL MEDELLIN',
      'ESTABLECIMIENTO CARCELARIO PEDREGAL MEDE',
      'CENTRO CARLOS LLERAS RESTREPO',
    ]}},
    select: { id: true, name: true, comunaId: true },
  });
  console.log('\nPuestos:', JSON.stringify(puestos, null, 2));

  const updates = [
    { name: 'ESTADIO ATANASIO GIRARDOT',               comunaId: c11.id },
    { name: 'PLAZA MAYOR CTRO EXPOS. CONVEN',          comunaId: c10.id },
    { name: 'RECLUSION DE MUJERES PEDREGAL MEDELLIN',  comunaId: c6.id  },
    { name: 'ESTABLECIMIENTO CARCELARIO PEDREGAL MEDE',comunaId: c6.id  },
    { name: 'CENTRO CARLOS LLERAS RESTREPO',           comunaId: c7.id  },
  ];

  for (const u of updates) {
    const p = puestos.find(p => p.name === u.name);
    if (!p) { console.log(`NOT FOUND: ${u.name}`); continue; }
    await prisma.puesto.update({ where: { id: p.id }, data: { comunaId: u.comunaId } });
    const comunaName = comunas.find(c => c.id === u.comunaId)?.name;
    console.log(`Updated ${p.name} (${p.id}) → ${comunaName}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
