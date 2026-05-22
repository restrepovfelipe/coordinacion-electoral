import { GoogleAuth } from 'google-auth-library';

async function lookup(token: string, project: string, email: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-goog-user-project': project },
      body: JSON.stringify({ email: [email] }),
    }
  );
  const d = await res.json() as any;
  return d;
}

async function main() {
  const getToken = async (proj: string) => {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform'], projectId: proj });
    const client = await auth.getClient();
    (client as any).quotaProjectId = proj;
    return (await client.getAccessToken()).token as string;
  };

  const email = '1040572640@defensores.local';

  // Try coordinacion-electoral
  const t1 = await getToken('coordinacion-electoral');
  const r1 = await lookup(t1, 'coordinacion-electoral', email);
  console.log('coordinacion-electoral lookup:', r1.users ? `found uid=${r1.users[0]?.localId}` : `error: ${r1.error?.message?.slice(0,80)}`);

  // Try comando-electoral-amva
  const t2 = await getToken('comando-electoral-amva');
  const r2 = await lookup(t2, 'comando-electoral-amva', email);
  console.log('comando-electoral-amva lookup:', r2.users ? `found uid=${r2.users[0]?.localId}` : `error: ${r2.error?.message?.slice(0,80)}`);
}
main().catch(console.error);
