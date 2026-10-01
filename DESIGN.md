# Design decisions

## 1. Credential: a random API key, sent in a header, stored only as a hash
- A key is `df_` + 32 random bytes (64 hex characters): impossible to guess. The `df_` prefix makes a leaked key easy to recognise.
- Sent in the `X-API-Key` header (over HTTPS in production), never in the URL, because URLs end up in logs.
- The database stores only the **SHA-256 hash** and a short display prefix. The full key is shown once, when it is created. A database leak does not expose working keys.
- **Rejected:** storing the plain key (a leak equals full access); bcrypt (built for weak passwords, slows every request, adds nothing for a 256-bit random key); JWTs (hard to revoke before they expire).

## 2. Compromised or replaced keys
- **Revoke** kills a key on the very next request. There is no cache, so there is nothing to wait for.
- **Replace** revokes the old key and issues a new one in a single transaction, so a tenant is never left with no key.
- A tenant can have several keys (for example one per integration), so one leak doesn't break all their systems.
- Revoked keys are kept, not deleted, so documents still show which key submitted them.
- **Rejected:** one key per tenant, regenerated in place, because every change would break all of the tenant's integrations at once.

## 3. Metering: an atomic counter, charged only when a document is saved
- `subscriptions.used` is the counter. A single statement checks and consumes one unit:
  `UPDATE subscriptions SET used = used + 1 WHERE tenant_id = ? AND used < quota AND expires_at > now`.
  If no row changes, the request is rejected. Two concurrent requests can't both take the last unit, and `CHECK (used <= quota)` backs this up in the database.
- The charge and the document insert run in **one transaction**: if saving fails, the charge is rolled back.
- Requests with a bad key (401) or a bad body (400) are never charged.
- **Rejected:** counting rows in `documents` or reading then writing in application code (both race and allow over-use); a separate Redis counter (a second source of truth, unnecessary at this scale).
- **Gap:** retries. If a client times out and resends, it is charged twice. The fix is an `Idempotency-Key` header (see PRODUCTION.md).

## 4. Error responses
- **401 `invalid_api_key`**: the same response for a missing, unknown or revoked key, so the API never confirms that a key exists.
- **403 `subscription_expired` / `quota_exceeded`**: the caller is authenticated, so they get a specific reason plus `quota`, `used` and `expires_at`, telling them whether to renew or upgrade.
- **Rejected:** 429 (means "retry later", but retrying never fixes an expired plan); 402 (reserved and poorly supported by clients).

## Shortcuts taken (within the timebox)
- **No admin login.** The brief doesn't require one, so the admin page and `/admin` endpoints are open. This is the biggest gap.
- **Replace takes effect immediately**: no grace period for the tenant to switch to the new key.
- **No retry protection** (`Idempotency-Key`), **no rate limiting**, **no audit log** of admin actions.
- **SQLite** instead of Postgres; one subscription per tenant with no renewal history.
- **React from a CDN** with JSX compiled in the browser, to avoid a build step. Fine for an internal demo, not for production.
- **No automated tests**; verified manually with Postman, curl and the browser.
