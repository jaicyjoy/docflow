const { useEffect, useState } = React;

const formatDate = (iso) => new Date(iso).toLocaleString();

function subscriptionStatus(sub) {
  if (new Date(sub.expires_at) <= new Date()) return 'Expired';
  if (sub.used >= sub.quota) return 'Limit reached';
  return 'Active';
}

function App() {
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [details, setDetails] = useState(null); // { tenant, subscription, keys }
  const [newKey, setNewKey] = useState('');     // plaintext key, shown once after issue/replace
  const [error, setError] = useState('');

  async function callApi(method, path) {
    const res = await fetch(`/admin${path}`, { method });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message);
    return body;
  }

  async function loadTenants() {
    try {
      const list = await callApi('GET', '/tenants');
      setTenants(list);
      setTenantId(list[0]?.id ?? '');
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadDetails() {
    try {
      setDetails(await callApi('GET', `/tenants/${tenantId}`));
    } catch (err) {
      setError(err.message);
    }
  }

  // Issue, replace and revoke all follow the same steps: confirm, call the API, show any new key, reload.
  async function runAction(method, path, confirmMessage) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError('');
    setNewKey('');
    try {
      const result = await callApi(method, path);
      if (result.apiKey) setNewKey(result.apiKey);
      await loadDetails();
    } catch (err) {
      setError(err.message);
    }
  }

  // Load the tenant list once, when the page opens.
  useEffect(() => {
    loadTenants();
  }, []);

  // Whenever a different tenant is picked, forget the last shown key and load the new tenant.
  useEffect(() => {
    setNewKey('');
    if (tenantId) loadDetails();
  }, [tenantId]);

  const sub = details?.subscription;

  return (
    <main>
      <h1>DocFlow Admin</h1>

      {error && <p className="error">{error}</p>}

      {tenants.length > 0 && (
        <p>
          Tenant:{' '}
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </p>
      )}

      {sub && (
        <section>
          <h2>Usage</h2>
          <p>
            <strong>{sub.used}</strong> of <strong>{sub.quota}</strong> documents used ({sub.quota - sub.used} left)
          </p>
          <progress value={sub.used} max={sub.quota} />
          <p>
            Expires: {formatDate(sub.expires_at)} | Status: <strong>{subscriptionStatus(sub)}</strong>
          </p>
        </section>
      )}

      {details && (
        <section>
          <h2>API keys</h2>
          <button onClick={() => runAction('POST', `/tenants/${tenantId}/keys`)}>Issue new key</button>

          {newKey && (
            <div className="new-key">
              <strong>Copy this key now. It will not be shown again.</strong>
              <br />
              <code>{newKey}</code>
            </div>
          )}

          <table>
            <thead>
              <tr><th>Key</th><th>Created</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {details.keys.map((key) => (
                <tr key={key.id}>
                  <td><code>{key.prefix}…</code></td>
                  <td>{formatDate(key.created_at)}</td>
                  <td>{key.revoked_at ? `Revoked ${formatDate(key.revoked_at)}` : 'Active'}</td>
                  <td>
                    {!key.revoked_at && (
                      <>
                        <button onClick={() => runAction('POST', `/keys/${key.id}/replace`, 'Replace this key? The old key stops working immediately.')}>
                          Replace
                        </button>
                        <button onClick={() => runAction('POST', `/keys/${key.id}/revoke`, 'Revoke this key? It stops working immediately.')}>
                          Revoke
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
