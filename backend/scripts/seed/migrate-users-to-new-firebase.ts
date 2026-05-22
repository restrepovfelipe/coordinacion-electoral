/**
 * Migrates all users from the old Firebase project (coordinacion-electoral)
 * to the new one (comando-electoral-amva), then updates cipUid in Postgres.
 *
 * Each user gets a temporary password: their username + "@Def2026"
 * (they can change it via the profile widget later)
 */
import * as fs from 'fs';
import * as path from 'path';
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

const prisma = new PrismaClient();

async function main() {
  // Use new project (where the frontend now points)
  const newApp = admin.apps.find(a => a?.name === 'new') 
    || admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'comando-electoral-amva' }, 'new');
  const newAuth = admin.auth(newApp);

  const users = await prisma.user.findMany({
    select: { id: true, username: true, cipUid: true, displayName: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Migrating ${users.length} users to comando-electoral-amva...\n`);

  for (const user of users) {
    const email = `${user.username}@defensores.local`;
    const tempPassword = `${user.username}@Def2026`;

    // Check if already exists in new project
    let newUid: string;
    try {
      const existing = await newAuth.getUserByEmail(email);
      newUid = existing.uid;
      console.log(`  ${user.username}: already exists in new project (uid: ${newUid})`);
      // Reset password to known value
      await newAuth.updateUser(newUid, { password: tempPassword });
      console.log(`    → password reset to: ${tempPassword}`);
    } catch {
      // Create new user
      const created = await newAuth.createUser({
        uid: user.cipUid, // try to keep same UID
        email,
        password: tempPassword,
        displayName: user.displayName ?? user.username,
        emailVerified: true,
      }).catch(async (e) => {
        if (e.code === 'auth/uid-already-exists') {
          // UID conflict — create with auto-generated UID
          return newAuth.createUser({ email, password: tempPassword, displayName: user.displayName ?? user.username, emailVerified: true });
        }
        throw e;
      });
      newUid = created.uid;
      console.log(`  ${user.username}: created (uid: ${newUid}, pwd: ${tempPassword})`);
    }

    // Update cipUid in DB if it changed
    if (newUid !== user.cipUid) {
      await prisma.user.update({ where: { id: user.id }, data: { cipUid: newUid } });
      console.log(`    → cipUid updated in DB: ${user.cipUid} → ${newUid}`);
    }
  }

  console.log('\nDone! All users migrated.');
  console.log('\nTemporary passwords (username@Def2026):');
  for (const u of users) console.log(`  ${u.username}: ${u.username}@Def2026`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
