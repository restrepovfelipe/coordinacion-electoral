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

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  const auth = admin.auth();

  const dbUsers = await prisma.user.findMany({ orderBy: { id: 'asc' } });
  
  for (const u of dbUsers) {
    const email = `${u.username}@defensores.local`;
    const pwd = 'Defensores2026!';
    
    // Delete existing user
    try {
      await auth.deleteUser(u.cipUid);
      console.log(`Deleted: ${u.username} (${u.cipUid})`);
    } catch(e: any) {
      console.log(`Delete failed/not found: ${u.username} (${e.code})`);
    }

    // Recreate with password
    const created = await auth.createUser({
      uid: u.cipUid,
      email,
      password: pwd,
      displayName: u.displayName ?? u.username,
      emailVerified: true,
    });
    console.log(`Created: ${u.username} → uid=${created.uid}, providerData=${JSON.stringify(created.providerData)}`);
  }

  // Test login via REST
  const NEW_KEY = 'AIzaSyBmZtgzH8EFepEqUoOcNVWbajRCMD7CU_Y';
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${NEW_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '1040572640@defensores.local', password: 'Defensores2026!', returnSecureToken: true }),
  });
  const d = await res.json() as any;
  console.log('\nTest login:', d.error ? `FAILED: ${d.error.message}` : `OK uid=${d.localId}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
