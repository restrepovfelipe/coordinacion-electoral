import * as fs from 'fs';
import * as path from 'path';
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
  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, cipUid: true, mustChangePassword: true },
    orderBy: { id: 'asc' }
  });
  console.log(JSON.stringify(users, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
