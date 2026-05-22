/**
 * T14 — bootstrap-super-admins.ts
 * Reads BOOTSTRAP_SUPER_ADMINS_JSON from Secret Manager and ensures both
 * super-admin accounts exist in Cloud Identity Platform AND in the users table.
 *
 * Atomicity: CIP user created first; if the Postgres insert fails, the CIP
 * user is deleted before re-throwing.
 * Idempotent: skips any entry whose username already exists in either CIP or Postgres.
 * Security: passwords are NEVER logged or printed.
 *
 * Run: pnpm tsx scripts/bootstrap/bootstrap-super-admins.ts
 * Preconditions:
 *   - Cloud SQL proxy running on localhost:5432, DATABASE_URL set in .env.local
 *   - ADC credentials available (keyless impersonation per Amendment 5)
 *   - Secret Manager secret BOOTSTRAP_SUPER_ADMINS_JSON exists in project
 */

import * as path from 'path';
import { config } from 'dotenv';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import * as admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';

config({ path: path.join(__dirname, '../../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'coordinacion-electoral';

const secretClient = new SecretManagerServiceClient();
const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────────────────────

interface BootstrapEntry {
  username: string;
  password: string;
  displayName: string;
}

// ── Firebase Admin init ──────────────────────────────────────────────────────

function initFirebase(): void {
  if (admin.apps.length === 0) {
    // ADC / impersonation credentials are picked up automatically from the
    // environment (GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC) — no key file.
    admin.initializeApp({
      projectId: PROJECT_ID,
    });
  }
}

// ── Secret Manager ───────────────────────────────────────────────────────────

async function fetchBootstrapEntries(): Promise<BootstrapEntry[]> {
  const name = `projects/${PROJECT_ID}/secrets/BOOTSTRAP_SUPER_ADMINS_JSON/versions/latest`;
  const [version] = await secretClient.accessSecretVersion({ name });
  const payload = version.payload?.data?.toString();
  if (!payload) throw new Error('BOOTSTRAP_SUPER_ADMINS_JSON secret is empty');
  return JSON.parse(payload) as BootstrapEntry[];
}

// ── Bootstrap one entry ──────────────────────────────────────────────────────

async function bootstrapOne(entry: BootstrapEntry): Promise<void> {
  const email = `${entry.username}@defensores.local`;

  // Idempotency check — Postgres
  const existing = await prisma.user.findUnique({ where: { username: entry.username } });
  if (existing) {
    console.log(`  [SKIP] ${entry.username} already exists in Postgres (id=${existing.id})`);
    return;
  }

  // Idempotency check — CIP
  let cipUid: string | null = null;
  try {
    const cipUser = await admin.auth().getUserByEmail(email);
    cipUid = cipUser.uid;
    console.log(`  [INFO] CIP user already exists for ${email}, uid=${cipUid}`);
  } catch (e: any) {
    if (e.code !== 'auth/user-not-found') throw e;
    // User does not exist in CIP — create them
  }

  if (cipUid === null) {
    // Step 1: create CIP user
    const created = await admin.auth().createUser({
      email,
      password: entry.password,
      displayName: entry.displayName,
      emailVerified: false,
    });
    cipUid = created.uid;
    console.log(`  [CIP] Created CIP user ${email}, uid=${cipUid}`);
  }

  // Step 2: insert Postgres User row
  try {
    await prisma.user.create({
      data: {
        username: entry.username,
        displayName: entry.displayName,
        role: 'SUPER_ADMIN',
        cipUid,
        mustChangePassword: true,
        active: true,
      },
    });
    console.log(`  [DB]  Created User row for ${entry.username}`);
  } catch (dbErr) {
    // Rollback: delete the CIP user we just created to avoid desync
    console.error(`  [ERR] Postgres insert failed for ${entry.username} — rolling back CIP user`);
    try {
      await admin.auth().deleteUser(cipUid);
      console.log(`  [CIP] Rolled back CIP user ${cipUid}`);
    } catch (rollbackErr) {
      console.error(`  [ERR] CIP rollback also failed — MANUAL CLEANUP REQUIRED for uid=${cipUid}`);
    }
    throw dbErr;
  }

  console.log(`  [OK]  Bootstrapped ${entry.username} (${entry.displayName})`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  initFirebase();

  console.log(`Fetching BOOTSTRAP_SUPER_ADMINS_JSON from project ${PROJECT_ID} …`);
  const entries = await fetchBootstrapEntries();
  console.log(`Found ${entries.length} entries to bootstrap.\n`);

  for (const entry of entries) {
    console.log(`Processing ${entry.username} (${entry.displayName}) …`);
    await bootstrapOne(entry);
  }

  // Verification summary
  const users = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, username: true, displayName: true, cipUid: true, mustChangePassword: true, active: true },
  });

  console.log('\n=== Bootstrap complete ===');
  console.log(`  SUPER_ADMIN rows in DB: ${users.length}`);
  users.forEach(u =>
    console.log(`  id=${u.id} username=${u.username} displayName="${u.displayName}" mustChangePassword=${u.mustChangePassword} active=${u.active} cipUid=${u.cipUid}`)
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
