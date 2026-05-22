import * as admin from 'firebase-admin';

async function main() {
  const app = admin.apps.find(a => a?.name === 'new') 
    || admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'comando-electoral-amva' }, 'new');
  const auth = admin.auth(app);

  // Try to find the test user we just created via REST API
  try {
    const u = await auth.getUser('SK0Mxzfnw2bhXF8rgkkwYvCFl692');
    console.log('Admin SDK IS targeting comando-electoral-amva - found test user:', u.email);
    
    // Now reset 1040572640 password
    const target = await auth.getUserByEmail('1040572640@defensores.local');
    console.log('Found 1040572640, uid:', target.uid);
    await auth.updateUser(target.uid, { password: 'Defensores2026!' });
    console.log('Password updated!');
  } catch(e: any) {
    console.log('Admin SDK is NOT targeting comando-electoral-amva:', e.code, e.message?.slice(0,100));
  }
}
main().catch(console.error);
