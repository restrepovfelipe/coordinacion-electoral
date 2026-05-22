import * as admin from 'firebase-admin';

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'coordinacion-electoral' });
  }
  const auth = admin.auth();

  const users = ['1040572640', '1001370773'];
  for (const username of users) {
    const email = `${username}@defensores.local`;
    const pwd = 'Defensores2026!';
    const u = await auth.getUserByEmail(email);
    await auth.updateUser(u.uid, { password: pwd });
    console.log(`${username} (${u.uid}): password reset to ${pwd}`);
  }
}
main().catch(console.error);
