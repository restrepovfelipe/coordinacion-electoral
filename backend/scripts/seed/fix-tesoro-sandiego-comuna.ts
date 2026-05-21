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

async function main() {
  const comuna14 = await prisma.comuna.findFirst({
    where: { municipioId: 1, name: { contains: 'POBLADO', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  console.log('Comuna 14:', JSON.stringify(comuna14));
  if (!comuna14) { console.error('No encontrada'); return; }

  await prisma.puesto.updateMany({ where: { id: { in: [131, 2565] } }, data: { comunaId: comuna14.id } });

  const puestos = await prisma.puesto.findMany({ where: { id: { in: [131, 2565] } }, select: { id: true, name: true, comunaId: true } });
  console.log('Actualizados:', JSON.stringify(puestos));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
