import { clearAllRootCAs, createRootCA, listRootCAs } from '../src/services/rootcas.js';

async function main() {
  clearAllRootCAs();
  const names = process.argv.slice(2);
  const target = names.length ? names : ['Fresh Root Alpha', 'Fresh Root Beta'];
  for (const n of target) {
    const r = await createRootCA(n);
    console.log('Created root:', r.displayName, r.id);
  }
  const all = await listRootCAs();
  console.log('\nCurrent roots:');
  for (const r of all) console.log('-', r.displayName, r.id);
}

main().catch(e => { console.error(e); process.exit(1); });
