import { GoogleAuth } from 'google-auth-library';

async function main() {
  const PROJECT = 'coordinacion-electoral';
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform'],
  });
  const token = await auth.getAccessToken();
  console.log('Got token');

  // Get current config
  const getRes = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`,
    { headers: { 'Authorization': `Bearer ${token}`, 'x-goog-user-project': PROJECT } }
  );
  const config = await getRes.json() as any;
  if (config.error) { console.error('Get config error:', config.error.message); return; }
  console.log('Current signIn config:', JSON.stringify(config.signIn));

  // Enable email/password sign-in
  const patchRes = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-goog-user-project': PROJECT },
      body: JSON.stringify({
        signIn: {
          email: { enabled: true, passwordRequired: true }
        }
      }),
    }
  );
  const patched = await patchRes.json() as any;
  if (patched.error) {
    console.error('Patch error:', patched.error.message);
  } else {
    console.log('Updated signIn config:', JSON.stringify(patched.signIn));
  }
}
main().catch(console.error);
