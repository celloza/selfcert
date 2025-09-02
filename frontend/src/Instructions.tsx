import React from 'react';

const SectionCard: React.FC<{ id: string; title: string; children: React.ReactNode; icon?: string }>=({ id, title, children, icon }) => (
  <section id={id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/70 dark:backdrop-blur-sm shadow-sm p-5 space-y-4 scroll-mt-24 transition-colors">
    <div className="flex items-center gap-2">
      {icon && <span className="text-indigo-600 dark:text-indigo-400 text-xl" aria-hidden>{icon}</span>}
      <h2 className="text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-100">{title}</h2>
      <a href={`#${id}`} className="ml-auto text-xs text-indigo-500 dark:text-indigo-400 hover:underline">#</a>
    </div>
    {children}
  </section>
);

export default function Instructions() {
  return (
    <div className="flex flex-col gap-8">
      {/* Intro / Quick Nav */}
      <div className="flex flex-col gap-4">
  <h1 className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">How to Use This App</h1>
  <p className="text-gray-700 dark:text-gray-300 leading-relaxed max-w-3xl">Use this portal to create, download and revoke user/device VPN client certificates under managed Root Certificate Authorities. Administrators oversee trust anchors and audit activity.</p>
        <div className="flex flex-wrap gap-2 text-xs">
          {['user','admin','certs','security','troubleshooting','roadmap'].map(a => (
            <a key={a} href={`#${a}`} className="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 font-medium transition-colors">{a}</a>
          ))}
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <SectionCard id="user" title="User Workflow" icon="👤">
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Login</strong> with your Entra ID account (popup). MFA may apply.</li>
            <li>Go to <em>My Certificates</em> once at least one Root CA exists.</li>
            <li>Select a <strong>Root CA</strong>, enter a descriptive display name (e.g. “Alice Laptop”), click <em>Request Certificate</em>.</li>
            <li>Download <code>PEM</code> (leaf only) or <code>Bundle</code> (leaf + root) and install per VPN instructions.</li>
            <li><strong>Revoke</strong> immediately if the device / key is lost or compromised.</li>
          </ol>
          <div className="mt-3 rounded border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">Treat exported private keys like passwords. Do not email or store them in plain text repositories.</div>
        </SectionCard>

        <SectionCard id="admin" title="Administrator Workflow" icon="🛡️">
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>Create Root CAs</strong> under <em>Root CAs</em> (production keys stored in Key Vault).</li>
            <li>Monitor issuance & status in <em>All Certificates</em>.</li>
            <li>Use <em>Audit Log</em> to review actions (issue / revoke / rootca.create).</li>
            <li>Plan <strong>rotation</strong> of Root CAs before expiry; communicate migration steps.</li>
            <li>Enforce least privilege—limit Admin role assignments.</li>
          </ol>
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">Future: automated renewal reminders & CRL publishing.</div>
        </SectionCard>

        <SectionCard id="certs" title="Certificate Profile" icon="📄">
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li><span className="font-medium">Root CA validity:</span> 5 years (configurable).</li>
            <li><span className="font-medium">Leaf validity:</span> 1 year.</li>
            <li><span className="font-medium">Algorithm:</span> RSA 2048 (roadmap: RSA 4096 / ECDSA).</li>
            <li><span className="font-medium">Bundle:</span> Leaf certificate followed by Root CA certificate.</li>
            <li><span className="font-medium">Revocation:</span> Table-tracked (roadmap: CRL export).</li>
          </ul>
        </SectionCard>

        <SectionCard id="security" title="Security Notes" icon="🔐">
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>Production private keys reside in Azure Key Vault (Managed Identity access).</li>
            <li>Local dev uses in-memory secrets—ephemeral & not for real keys.</li>
            <li>Auth tokens validated server-side against Entra JWKS; admin via role/group.</li>
            <li>Revoke action timestamps recorded for audit & future CRL generation.</li>
            <li>Download endpoints send PEM over HTTPS only in production (configure TLS).</li>
          </ul>
          <div className="mt-3 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 text-xs p-3">Enhance by adding rate limits, schema validation, CRL/OCSP endpoints.</div>
        </SectionCard>

        <SectionCard id="troubleshooting" title="Troubleshooting" icon="🛠️">
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>No Root CAs:</strong> Request an Admin to create one.</li>
            <li><strong>401 Unauthorized:</strong> Token expired—logout then login.</li>
            <li><strong>Missing Admin menu:</strong> Admin role not assigned.</li>
            <li><strong>Download invalid:</strong> Confirm file not altered & bundle order maintained.</li>
            <li><strong>Popup blocked:</strong> Allow popups for the site to sign in.</li>
          </ul>
        </SectionCard>

        <SectionCard id="roadmap" title="Roadmap" icon="🚀">
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
            <li>PFX (PKCS#12) export with password enforcement.</li>
            <li>CRL / JSON revocation feed & optional OCSP service.</li>
            <li>Automated Root CA rotation helper & leaf renewal prompts.</li>
            <li>Advanced search, pagination, filtering at scale.</li>
            <li>Custom certificate profiles (key size, EKUs, SANs).</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

