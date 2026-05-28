import * as admin from 'firebase-admin';
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

const USERS = [
  { username: 'Andres.Tobon',      password: 'Tobon.2026'     },
  { username: 'Luisa.Florez',      password: 'Luisa.2026'     },
  { username: 'Defensor3',         password: 'Defensor3.2026' },
  { username: 'Defensor4',         password: 'Defensor4.2026' },
  { username: 'Defensor5',         password: 'Defensor5.2026' },
  { username: 'Defensor6',         password: 'Defensor6.2026' },
  { username: 'Daniel.Uribe',      password: 'Daniel.2026'    },
  { username: 'Juan.Sierra',       password: 'Juan.2026'      },
  { username: 'Paula.Aristizabal', password: 'Paula.2026'     },
];

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  const auth = admin.auth();

  for (const u of USERS) {
    const dbUser = await prisma.user.findFirst({ where: { username: u.username } });
    if (!dbUser) { console.log(`⚠ Not found in DB: ${u.username}`); continue; }

    try {
      await auth.updateUser(dbUser.cipUid, { password: u.password });
      console.log(`✅ ${u.username} → password reset OK`);
    } catch (err: any) {
      console.error(`❌ ${u.username}: ${err.message}`);
    }
  }

  // Verify Juan.Sierra login via REST
  const FIREBASE_KEY = 'AIzaSyBmZtgzH8EFepEqUoOcNVWbajRCMD7CU_Y';
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'Juan.Sierra@defensores.local', password: 'Juan.2026', returnSecureToken: true }),
  });
  const d = await res.json() as any;
  console.log('\nTest login Juan.Sierra:', d.error ? `FAILED: ${d.error.message}` : `✅ OK uid=${d.localId}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
