import axios from 'axios';

interface PlanCert {
  displayName: string;
  description?: string;
  backdateDays?: number;
  validDays?: number;
}

async function createRoot(base: string, name: string) {
  const resp = await axios.post(base + '/api/rootcas', { displayName: name });
  console.log('Created root CA:', resp.data.id, name);
  return resp.data.id as string;
}

async function issue(base: string, rootCaId: string, plan: PlanCert, actor?: string) {
  const resp = await axios.post(base + '/api/certs', { rootCaId, displayName: plan.displayName, description: plan.description, backdateDays: plan.backdateDays, validDays: plan.validDays });
  console.log('Issued cert:', resp.data.id, plan.displayName, 'created', resp.data.createdAt);
}

async function main() {
  const base = 'http://localhost:8080';
  try { await axios.get(base + '/healthz'); } catch {
    console.error('Server not reachable on ' + base + '. Start backend first (npm run dev).');
    process.exit(1);
  }

  // Create three demo roots
  const today = new Date().toISOString().slice(0,10);
  const rootIds: Record<string,string> = {};
  rootIds.primary = await createRoot(base, 'Primary Demo Root ' + today);
  rootIds.legacy = await createRoot(base, 'Legacy Demo Root ' + today);
  rootIds.test = await createRoot(base, 'Test Demo Root ' + today);

  // Generate ~100 certificates across roots with varied dates
  const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const names = ['Alice','Bob','Carol','Dave','Eve','Frank','Grace','Heidi','Ivan','Judy','Mallory','Niaj','Olivia','Peggy','Rupert','Sybil','Trent','Victor','Wendy'];
  const deviceTypes = ['Laptop','Tablet','Phone','Desktop','Gateway','Agent','Sensor','Tester','VM','Server'];
  const roots = Object.values(rootIds);
  let count = 0;
  while (count < 100) {
    const name = names[random(0, names.length-1)] + ' ' + deviceTypes[random(0, deviceTypes.length-1)];
    const backdateDays = random(0, 800); // some far in past
    const validDays = random(30, 500);   // varied validity (may already be expired)
    const description = `Demo certificate for ${name} issued ${backdateDays}d ago valid ${validDays}d`;
    await issue(base, roots[count % roots.length], { displayName: name, description, backdateDays, validDays });
    count++;
  }

  // Summary
  const list = await axios.get(base + '/api/certs');
  const counts: Record<string, number> = {};
  for (const c of list.data.items) {
    counts[c.rootCaId] = (counts[c.rootCaId] || 0) + 1;
  }
  console.log('Certificate counts per root:', counts);
  console.log('Seed complete. Open the UI to view multiple roots and varied certificate states (including expired).');
}

main().catch(e => { console.error('Seed error', e.response?.data || e.message); process.exit(1); });