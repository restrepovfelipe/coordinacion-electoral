import * as admin from 'firebase-admin';
import { PrismaClient, Role } from '@prisma/client';
// @ts-ignore — Role.VIEWER is added by migration 20260528120000
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
  { username: 'viewer', displayName: 'Solo Lectura', password: 'Viewer.2026', role: 'VIEWER' as Role },
];

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  const auth = admin.auth();

  for (const u of USERS) {
    const email = `${u.username}@defensores.local`;
    console.log(`\nProcessing: ${u.username}`);

    // 1. Create Firebase user
    let cipUid: string;
    try {
      const existing = await auth.getUserByEmail(email);
      cipUid = existing.uid;
      console.log(`  Firebase user already exists: uid=${cipUid}`);
    } catch {
      const created = await auth.createUser({
        email,
        password: u.password,
        displayName: u.displayName,
        emailVerified: true,
      });
      cipUid = created.uid;
      console.log(`  Firebase user created: uid=${cipUid}`);
    }

    // 2. Create DB user (skip if already exists)
    const existing = await prisma.user.findFirst({ where: { username: u.username } });
    if (existing) {
      console.log(`  DB user already exists: id=${existing.id}`);
      continue;
    }
    const dbUser = await prisma.user.create({
      data: {
        cipUid,
        username: u.username,
        displayName: u.displayName,
        role: (u as any).role || Role.SUPER_ADMIN,
        active: true,
      },
    });
    console.log(`  DB user created: id=${dbUser.id}, role=${dbUser.role}`);
  }

  console.log('\n✅ All done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
