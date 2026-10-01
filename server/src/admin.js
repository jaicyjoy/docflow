import express from 'express';
import { createApiKey, db } from './db.js';

// Shortcut: these endpoints have no login. Anyone who can reach the server can issue and revoke keys.
// Production would put them behind staff SSO and log who did what.

const findTenants = db.prepare('SELECT id, name FROM tenants ORDER BY name');
const findTenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?');
const findSubscription = db.prepare('SELECT quota, used, expires_at FROM subscriptions WHERE tenant_id = ?');
const findKeys = db.prepare(
  'SELECT id, prefix, created_at, revoked_at FROM api_keys WHERE tenant_id = ? ORDER BY id DESC',
);
const findKey = db.prepare('SELECT id, tenant_id, revoked_at FROM api_keys WHERE id = ?');
const revokeKey = db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL');

// Revoking the old key and creating the new one happen together, or not at all.
const replaceKey = db.transaction((key) => {
  revokeKey.run(new Date().toISOString(), key.id);
  return createApiKey(key.tenant_id);
});

export const adminRouter = express.Router();

adminRouter.get('/tenants', (req, res) => {
  res.json(findTenants.all());
});

// Everything the admin screen shows for one tenant: usage and keys. Key hashes are never sent.
adminRouter.get('/tenants/:id', (req, res) => {
  const tenant = findTenant.get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'not_found', message: 'Tenant not found.' });
  res.json({ tenant, subscription: findSubscription.get(tenant.id), keys: findKeys.all(tenant.id) });
});

adminRouter.post('/tenants/:id/keys', (req, res) => {
  const tenant = findTenant.get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'not_found', message: 'Tenant not found.' });
  res.status(201).json({ apiKey: createApiKey(tenant.id) });
});

// Replace = revoke the old key and issue a new one. The old key stops working immediately.
adminRouter.post('/keys/:id/replace', (req, res) => {
  const key = findKey.get(req.params.id);
  if (!key) return res.status(404).json({ error: 'not_found', message: 'Key not found.' });
  if (key.revoked_at) return res.status(409).json({ error: 'already_revoked', message: 'Key is already revoked.' });
  res.status(201).json({ apiKey: replaceKey(key) });
});

// Revoke = kill the key. The next request using it gets 401.
adminRouter.post('/keys/:id/revoke', (req, res) => {
  const key = findKey.get(req.params.id);
  if (!key) return res.status(404).json({ error: 'not_found', message: 'Key not found.' });
  if (key.revoked_at) return res.status(409).json({ error: 'already_revoked', message: 'Key is already revoked.' });
  revokeKey.run(new Date().toISOString(), key.id);
  res.json({ revoked: true });
});
