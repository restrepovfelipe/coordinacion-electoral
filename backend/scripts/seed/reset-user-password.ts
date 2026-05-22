import * as fs from 'fs';
import * as path from 'path';

// Load env
if (!process.env.DATABASE_URL) {
  for (const f of [
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(__dirname, '../../.env'),
  ]) {
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

import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];
  const newPassword = process.argv[3];

  if (!username || !newPassword) {
    console.error('Usage: npx tsx reset-user-password.ts <username> <newPassword>');
    process.exit(1);
  }

  // Init Firebase Admin
  const serviceAccountPath = path.resolve(__dirname, '../../firebase-service-account.json');
  if (!admin.apps.length) {
    if (fs.existsSync(serviceAccountPath)) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
    } else {
      // Try GOOGLE_APPLICATION_CREDENTIALS
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
  }

  const user = await prisma.user.findFirst({ where: { username } });
  if (!user) {
    console.error('User not found in DB:', username);
    process.exit(1);
  }
  console.log('Found user:', user.username, '| cipUid:', user.cipUid);

  await admin.auth().updateUser(user.cipUid, { password: newPassword });
  console.log(`Password reset for ${username} to: ${newPassword}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
