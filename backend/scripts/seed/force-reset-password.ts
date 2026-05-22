import * as admin from 'firebase-admin';

async function main() {
  const app = admin.apps.find(a => a?.name === 'new') 
    || admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'comando-electoral-amva' }, 'new');
  const auth = admin.auth(app);

  const uid = 'F8hzD1ge7XTXPHkWQNNvVpdz64K3';
  const newPwd = 'Defensores2026!';

  await auth.updateUser(uid, { password: newPwd });
  console.log(`Password updated for uid ${uid} → ${newPwd}`);

  // Also reset for second admin
  const uid2 = 'Av4A9E6xkLQVShQQX57m2OVpMZ42';
  await auth.updateUser(uid2, { password: 'Defensores2026!' });
  console.log(`Password updated for uid ${uid2} → Defensores2026!`);
}
main().catch(console.error);
