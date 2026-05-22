import { GoogleAuth } from 'google-auth-library';

async function main() {
  const PROJECT = 'comando-electoral-amva';
  
  // Get OAuth2 token scoped to Firebase/Identity Toolkit
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform'],
  });
  const token = await auth.getAccessToken();
  console.log('Got OAuth token');

  // Look up user by email
  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ email: ['1040572640@defensores.local'] }),
    }
  );
  const lookupData = await lookupRes.json() as any;
  console.log('Lookup result:', JSON.stringify(lookupData));

  if (!lookupData.users?.length) { console.error('User not found'); return; }

  const localId = lookupData.users[0].localId;
  console.log('localId:', localId);

  // Update password
  const updateRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ localId, password: 'Defensores2026!', returnSecureToken: false }),
    }
  );
  const updateData = await updateRes.json() as any;
  if (updateData.error) {
    console.error('Update error:', JSON.stringify(updateData.error));
  } else {
    console.log('Password updated! localId:', updateData.localId);
  }

  // Also reset second admin
  const lookupRes2 = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ email: ['1001370773@defensores.local'] }),
    }
  );
  const ld2 = await lookupRes2.json() as any;
  if (ld2.users?.length) {
    const uid2 = ld2.users[0].localId;
    const ur2 = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ localId: uid2, password: 'Defensores2026!', returnSecureToken: false }),
    });
    const ud2 = await ur2.json() as any;
    if (ud2.error) console.error('Update2 error:', ud2.error);
    else console.log('1001370773 password updated!');
  }
}
main().catch(console.error);
