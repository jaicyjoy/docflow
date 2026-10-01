import { createApiKey, createTables, db } from './db.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS).toISOString();

const companies = [
  { name: 'ABC Company', quota: 100, used: 0, expiresAt: daysFromNow(30) },  // healthy
  { name: 'DEF Company', quota: 5, used: 4, expiresAt: daysFromNow(30) },    // 1 submission left
  { name: 'GHI Company', quota: 100, used: 10, expiresAt: daysFromNow(-1) }, // expired yesterday
];

// Start from an empty database every time.
db.exec(`
  DROP TABLE IF EXISTS documents;
  DROP TABLE IF EXISTS api_keys;
  DROP TABLE IF EXISTS subscriptions;
  DROP TABLE IF EXISTS tenants;
`);
createTables();

const insertTenant = db.prepare('INSERT INTO tenants (name) VALUES (?)');
const insertSubscription = db.prepare(
  'INSERT INTO subscriptions (tenant_id, quota, used, expires_at) VALUES (?, ?, ?, ?)',
);

const seed = db.transaction(() =>
  companies.map((company) => {
    const tenantId = insertTenant.run(company.name).lastInsertRowid;
    insertSubscription.run(tenantId, company.quota, company.used, company.expiresAt);
    const apiKey = createApiKey(tenantId);
    return { company: company.name, apiKey, usage: `${company.used}/${company.quota}`, expiresAt: company.expiresAt };
  }),
);

console.log('Database seeded. API keys are shown only now; the database stores only their hashes.\n');
console.table(seed());
