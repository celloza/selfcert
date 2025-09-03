import axios from 'axios';

async function main() {
  const base = 'http://localhost:8080';
  try {
    // 1. Health
    const health = await axios.get(base + '/healthz');
    console.log('HEALTH', health.data);
  } catch (_e) {
    console.error('Health check failed. Is server running?');
    process.exit(1);
  }
  // 2. Root CAs
  let rootcasResp = await axios.get(base + '/api/rootcas');
  let items = rootcasResp.data.items || [];
  if (!items.length) {
    console.log('No root CAs found; creating one...');
    const created = await axios.post(base + '/api/rootcas', { displayName: 'Smoke Root ' + Date.now() });
    console.log('Created root CA', created.data.id);
    rootcasResp = await axios.get(base + '/api/rootcas');
    items = rootcasResp.data.items || [];
  }
  const root = items[0];
  console.log('Using root CA:', { id: root.id, displayName: root.displayName });

  // 3. Issue cert
  const issueResp = await axios.post(base + '/api/certs', { rootCaId: root.id, displayName: 'Smoke Test Cert ' + Date.now() });
  const issued = issueResp.data;
  console.log('Issued cert:', { id: issued.id, rootCaId: issued.rootCaId, displayName: issued.displayName });

  // 4. List certs
  const listResp = await axios.get(base + '/api/certs');
  console.log('Total certs now:', listResp.data.items?.length ?? listResp.data.length);

  // 5. Download PEM
  const pemResp = await axios.get(base + `/api/certs/${issued.id}/pem`);
  const pem = pemResp.data.certPem || pemResp.data; // depending on route implementation
  console.log('PEM first line:', pem.split('\n')[0]);

  console.log('Smoke test complete.');
}

main().catch(_err => { console.error('Smoke test error'); process.exit(1); });
