/**
 * create-test-users.ts
 * Creates 5 test coordinator users in CIP + Postgres.
 * Idempotent: skips users that already exist.
 * Atomicity: rolls back CIP if Postgres fails.
 *
 * Run: pnpm tsx scripts/bootstrap/create-test-users.ts
 * Preconditions: Cloud SQL proxy on 15432, DATABASE_URL in env or .env.local
 */

import * as path from 'path';
import { config } from 'dotenv';
import * as admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';
import type { Role, ScopeType } from '@prisma/client';

config({ path: path.join(__dirname, '../../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'coordinacion-electoral';
const prisma = new PrismaClient();

function initFirebase(): void {
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }
}

interface TestUser {
  username: string;
  password: string;
  displayName: string;
  role: Role;
  scopeType: ScopeType;
  scopeId: number;
}

const TEST_USERS: TestUser[] = [
  {
    username: 'Coordinador1',
    password: 'Cord1.2026*',
    displayName: 'Coordinador Regional 1',
    role: 'REGIONAL_COORDINATOR',
    scopeType: 'SUBREGION',
    scopeId: 1,
  },
  {
    username: 'Coordinador2',
    password: 'Cord2.2026*',
    displayName: 'Coordinador Municipal 2',
    role: 'MUNICIPAL_COORDINATOR',
    scopeType: 'MUNICIPIO',
    scopeId: 1,
  },
  {
    username: 'Coordinador3',
    password: 'Cord3.2026*',
    displayName: 'Coordinador Zona 3',
    role: 'ZONE_COORDINATOR',
    scopeType: 'ZONA',
    scopeId: 1,
  },
  {
    username: 'Coordinador4',
    password: 'Cord4.2026*',
    displayName: 'Coordinador Comuna 4',
    role: 'COMUNA_COORDINATOR',
    scopeType: 'COMUNA',
    scopeId: 1,
  },
  {
    username: 'Coordinador5',
    password: 'Cord5.2026*',
    displayName: 'Coordinador Puesto 5',
    role: 'PUESTO_COORDINATOR',
    scopeType: 'PUESTO',
    scopeId: 1,
  },
];

async function createOne(u: TestUser): Promise<'created' | 'skipped'> {
  const email = `${u.username}@defensores.local`;

  const existing = await prisma.user.findUnique({ where: { username: u.username } });
  if (existing) {
    console.log(`  [SKIP] ${u.username} already in Postgres (id=${existing.id})`);
    return 'skipped';
  }

  let cipUid: string | null = null;
  try {
    const cipUser = await admin.auth().getUserByEmail(email);
    cipUid = cipUser.uid;
    console.log(`  [INFO] CIP already has ${email}`);
  } catch (e: any) {
    if (e.code !== 'auth/user-not-found') throw e;
  }

  if (cipUid === null) {
    const created = await admin.auth().createUser({
      email,
      password: u.password,
      displayName: u.displayName,
      emailVerified: false,
    });
    cipUid = created.uid;
    console.log(`  [CIP] Created ${email} uid=${cipUid}`);
  }

  try {
    const user = await prisma.user.create({
      data: {
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        cipUid,
        mustChangePassword: false,
        active: true,
        scopes: {
          create: {
            scopeType: u.scopeType,
            scopeId: u.scopeId,
          },
        },
      },
    });
    console.log(`  [DB]  Created User id=${user.id} + scope ${u.scopeType}:${u.scopeId}`);
  } catch (dbErr) {
    console.error(`  [ERR] Postgres failed for ${u.username} — rolling back CIP uid=${cipUid}`);
    try {
      await admin.auth().deleteUser(cipUid);
      console.log(`  [CIP] Rolled back ${cipUid}`);
    } catch { /* ignore rollback errors, log them */ }
    throw dbErr;
  }

  console.log(`  [OK]  ${u.username} (${u.role})`);
  return 'created';
}

async function main(): Promise<void> {
  initFirebase();
  console.log(`Creating test users in project ${PROJECT_ID} …\n`);

  const results: Array<{ username: string; status: string }> = [];

  for (const u of TEST_USERS) {
    console.log(`Processing ${u.username} …`);
    try {
      const status = await createOne(u);
      results.push({ username: u.username, status });
    } catch (e: any) {
      console.error(`  [FAIL] ${u.username}: ${e.message}`);
      results.push({ username: u.username, status: `FAIL: ${e.message}` });
    }
  }

  console.log('\n=== Results ===');
  for (const r of results) {
    console.log(`  ${r.username}: ${r.status}`);
  }

  const users = await prisma.user.findMany({
    include: { scopes: true },
    orderBy: { id: 'asc' },
  });
  console.log(`\nTotal users in DB: ${users.length}`);
  for (const u of users) {
    const scope = u.scopes[0];
    console.log(`  id=${u.id} username=${u.username} role=${u.role} scope=${scope ? scope.scopeType + ':' + scope.scopeId : 'none'}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
