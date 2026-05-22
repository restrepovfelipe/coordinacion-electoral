import * as admin from 'firebase-admin';

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'comando-electoral-amva' });
  }

  // Try by email
  try {
    const u = await admin.auth().getUserByEmail('1040572640@defensores.local');
    console.log('Found by email:', JSON.stringify({ uid: u.uid, email: u.email, disabled: u.disabled }));
  } catch(e: any) {
    console.log('Not found by email:', e.code);
  }

  // Try by UID
  try {
    const u = await admin.auth().getUser('F8hzD1ge7XTXPHkWQNNvVpdz64K3');
    console.log('Found by UID:', JSON.stringify({ uid: u.uid, email: u.email }));
  } catch(e: any) {
    console.log('Not found by UID:', e.code);
  }
}
main().catch(console.error);
