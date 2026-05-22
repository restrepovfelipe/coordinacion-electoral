import * as admin from 'firebase-admin';

async function main() {
  // Try with GCP project ID instead
  const app2 = admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'coordinacion-electoral' }, 'app2');
  const auth2 = admin.auth(app2);

  try {
    const u = await auth2.getUserByEmail('1040572640@defensores.local');
    console.log('Found in coordinacion-electoral:', JSON.stringify({ uid: u.uid, email: u.email, disabled: u.disabled }));
  } catch(e: any) {
    console.log('Not found in coordinacion-electoral either:', e.code);
  }

  try {
    const u = await auth2.getUser('F8hzD1ge7XTXPHkWQNNvVpdz64K3');
    console.log('UID found in coordinacion-electoral:', u.email);
  } catch(e: any) {
    console.log('UID not found there either:', e.code);
  }
}
main().catch(console.error);
