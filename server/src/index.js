import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { adminRouter } from './admin.js';
import { db, hashKey } from './db.js';

const PORT = process.env.PORT || 3000;

const findKey = db.prepare('SELECT id, tenant_id FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL');
const getSubscription = db.prepare('SELECT quota, used, expires_at FROM subscriptions WHERE tenant_id = ?');
const insertDocument = db.prepare(
  'INSERT INTO documents (id, tenant_id, api_key_id, payload, created_at) VALUES (?, ?, ?, ?, ?)',
);
// Check and consume in one statement, so two concurrent requests can never both take the last unit.
const useOneSubmission = db.prepare(`
  UPDATE subscriptions SET used = used + 1
  WHERE tenant_id = ? AND used < quota AND expires_at > ?
  RETURNING quota, used
`);

// The charge and the insert share a transaction: if saving the document fails, the charge is rolled back.
const submitDocument = db.transaction((apiKey, payload, now) => {
  const usage = useOneSubmission.get(apiKey.tenant_id, now);
  if (!usage) return null;
  const id = randomUUID();
  insertDocument.run(id, apiKey.tenant_id, apiKey.id, payload, now);
  return { id, remaining: usage.quota - usage.used };
});

// Same response for a missing, unknown or revoked key, so callers can't tell which keys exist.
function requireApiKey(req, res, next) {
  const rawKey = req.get('X-API-Key');
  const apiKey = rawKey ? findKey.get(hashKey(rawKey)) : undefined;
  if (!apiKey) {
    return res.status(401).json({ error: 'invalid_api_key', message: 'The API key is missing or invalid.' });
  }
  req.apiKey = apiKey;
  next();
}

const app = express();

// The key is checked before the body is parsed, so unauthenticated callers can't make us do any work.
app.post('/documents', requireApiKey, express.json({ limit: '1mb' }), (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    return res.status(400).json({ error: 'invalid_body', message: 'Send a non-empty JSON object.' });
  }

  const now = new Date().toISOString();
  const result = submitDocument(req.apiKey, JSON.stringify(body), now);

  if (!result) {
    const sub = getSubscription.get(req.apiKey.tenant_id);
    const details = sub && { quota: sub.quota, used: sub.used, expires_at: sub.expires_at };
    if (!sub || sub.expires_at <= now) {
      return res.status(403).json({ error: 'subscription_expired', message: 'Your subscription has expired.', ...details });
    }
    return res.status(403).json({ error: 'quota_exceeded', message: 'Your document limit has been reached.', ...details });
  }

  res.status(201).json({ id: result.id, remaining: result.remaining });
});

app.use('/admin', adminRouter);

// The admin page (public/index.html and public/app.jsx) is served at http://localhost:3000/
app.use(express.static(path.join(import.meta.dirname, '..', 'public')));

// Malformed JSON would otherwise produce Express's default HTML error page.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json', message: 'The request body is not valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large', message: 'The request body is larger than 1 MB.' });
  }
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
});

app.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`DocFlow API and admin page on http://localhost:${PORT}`);
});
