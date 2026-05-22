import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';

const envFile = '/Users/feliperestrepo/Desktop/PÁGINAS WEB/coordinacion-electoral/backend/.env.local';
if (!process.env.DATABASE_URL) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('='); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const USERNAME = process.argv[2] || '1040572640';
const NEW_PASSWORD = process.argv[3] || 'Defensores2026!';

const prisma = new PrismaClient();

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'comando-electoral-amva' });
  }

  const user = await prisma.user.findFirst({ where: { username: USERNAME }, select: { cipUid: true, username: true } });
  if (!user) { console.error('User not found:', USERNAME); process.exit(1); }

  console.log(`Resetting password for ${user.username} (cipUid: ${user.cipUid})...`);
  await admin.auth().updateUser(user.cipUid, { password: NEW_PASSWORD });
  console.log(`Done! New password: ${NEW_PASSWORD}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
