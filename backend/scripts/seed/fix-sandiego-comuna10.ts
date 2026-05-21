import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  for (const f of ['/Users/feliperestrepo/Desktop/PÁGINAS WEB/coordinacion-electoral/backend/.env.local', '/Users/feliperestrepo/Desktop/PÁGINAS WEB/coordinacion-electoral/backend/.env']) {
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
  const r = await prisma.comuna.findMany({ where: { municipioId: 1, name: { contains: 'CANDELARIA', mode: 'insensitive' } }, select: { id: true, name: true } });
  console.log(JSON.stringify(r));
  // also update puesto 131 to comuna 10
  await prisma.puesto.update({ where: { id: 131 }, data: { comunaId: r[0].id } });
  const p = await prisma.puesto.findUnique({ where: { id: 131 }, select: { id: true, name: true, comunaId: true } });
  console.log('Puesto 131 updated:', JSON.stringify(p));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
