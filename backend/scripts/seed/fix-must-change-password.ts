import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

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
  const usernames = [
    'Andres.Tobon', 'Luisa.Florez', 'Defensor3', 'Defensor4',
    'Defensor5', 'Defensor6', 'Daniel.Uribe', 'Juan.Sierra', 'Paula.Aristizabal',
    'Sebastian.Salazar', 'viewer',
  ];
  const result = await prisma.user.updateMany({
    where: { username: { in: usernames } },
    data: { mustChangePassword: false },
  });
  console.log(`✅ Updated ${result.count} users → mustChangePassword=false`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
