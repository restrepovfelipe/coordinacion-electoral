import * as admin from 'firebase-admin';

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'coordinacion-electoral' });
  }
  const u = await admin.auth().getUser('F8hzD1ge7XTXPHkWQNNvVpdz64K3');
  console.log('providerData:', JSON.stringify(u.providerData));
  console.log('passwordHash:', u.passwordHash ? 'set' : 'NOT SET');
  console.log('disabled:', u.disabled);
  console.log('email:', u.email);
  
  // Check if old key project is different
  // Try to get project config
  const { GoogleAuth } = await import('google-auth-library');
  const auth2 = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/firebase'] });
  const t = await auth2.getAccessToken();
  const r = await fetch('https://identitytoolkit.googleapis.com/admin/v2/projects/coordinacion-electoral/config', {
    headers: { 'Authorization': `Bearer ${t}` }
  });
  const cfg = await r.json() as any;
  console.log('\nProject signIn config:', JSON.stringify(cfg.signIn?.email));
}
main().catch(console.error);
