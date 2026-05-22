import { GoogleAuth } from 'google-auth-library';

async function main() {
  const PROJECT = 'comando-electoral-amva';
  
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform'],
    projectId: PROJECT,
  });
  // Force quota project
  const client = await auth.getClient();
  (client as any).quotaProjectId = PROJECT;
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;
  console.log('Got token');

  // Look up user by email with quota project header
  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-goog-user-project': PROJECT,
      },
      body: JSON.stringify({ email: ['1040572640@defensores.local'] }),
    }
  );
  const data = await lookupRes.json() as any;
  if (data.error) { console.error('Lookup error:', data.error.message?.slice(0,200)); return; }
  
  const localId = data.users?.[0]?.localId;
  console.log('Found user, localId:', localId);

  // Update password
  const updateRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-goog-user-project': PROJECT,
      },
      body: JSON.stringify({ localId, password: 'Defensores2026!', returnSecureToken: false }),
    }
  );
  const ud = await updateRes.json() as any;
  if (ud.error) console.error('Update error:', ud.error.message);
  else console.log('Password updated! uid:', ud.localId);
}
main().catch(console.error);
