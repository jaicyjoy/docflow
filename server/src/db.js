import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';

export const db = new Database(path.join(import.meta.dirname, '..', 'docflow.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Timestamps are ISO-8601 UTC strings (from toISOString), so comparing them as text compares them as times.
export function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL
    );

    -- The CHECK makes it impossible to use more than the quota, even if application code is wrong.
    CREATE TABLE IF NOT EXISTS subscriptions (
      tenant_id   INTEGER PRIMARY KEY REFERENCES tenants(id),
      quota       INTEGER NOT NULL CHECK (quota >= 0),
      used        INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= quota),
      expires_at  TEXT NOT NULL
    );

    -- Only the SHA-256 hash of a key is stored, never the key itself.
    -- The prefix (first few characters) lets the admin screen tell keys apart without revealing them.
    CREATE TABLE IF NOT EXISTS api_keys (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
      prefix      TEXT NOT NULL,
      key_hash    TEXT NOT NULL UNIQUE,
      created_at  TEXT NOT NULL,
      revoked_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS documents (
      id          TEXT PRIMARY KEY,
      tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
      api_key_id  INTEGER NOT NULL REFERENCES api_keys(id),
      payload     TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );
  `);
}

createTables();

export const hashKey = (apiKey) => createHash('sha256').update(apiKey).digest('hex');

// Returns the plaintext key. This is the only moment it exists; the caller must show it once and forget it.
export function createApiKey(tenantId) {
  const apiKey = 'df_' + randomBytes(32).toString('hex');
  db.prepare('INSERT INTO api_keys (tenant_id, prefix, key_hash, created_at) VALUES (?, ?, ?, ?)').run(
    tenantId,
    apiKey.slice(0, 10),
    hashKey(apiKey),
    new Date().toISOString(),
  );
  return apiKey;
}
