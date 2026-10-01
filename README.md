# DocFlow — API access & subscription management

Controls who may call DocFlow's document API and how much they may use it.

- **Backend:** Node.js + Express, SQLite (`better-sqlite3`)
- **Admin page:** React (served by the same Express server)

## Run it locally

Requires **Node.js 20.11 or newer** and an internet connection (for `npm install` and the React CDN used by the admin page).

```bash
cd server
npm install
npm run seed     # creates the database and prints one API key per company
npm start        # API and admin page on http://localhost:3000
```

API keys are printed **only once** by `npm run seed`; the database stores only their SHA-256 hashes.
Running `npm run seed` again resets everything and prints new keys.

### Seed data

| Company | Usage | Expires | Use it to see |
|---|---|---|---|
| ABC Company | 0 / 100 | in 30 days | successful submissions |
| DEF Company | 4 / 5 | in 30 days | 1 success, then `403 quota_exceeded` |
| GHI Company | 10 / 100 | yesterday | `403 subscription_expired` |

## Admin page

Open **http://localhost:3000**. Pick a company to see its usage and API keys, then:

- **Issue new key**: the full key is shown once; copy it.
- **Replace**: revokes the key and issues a new one in one step.
- **Revoke**: the key stops working on the next request.

## Test the API with Postman

1. New request: **POST** `http://localhost:3000/documents`
2. **Headers:** `X-API-Key` = a key printed by `npm run seed` (or issued in the admin page)
3. **Body:** raw, JSON: `{ "title": "invoice-001.pdf" }`
4. Send.

| Try this | Expected |
|---|---|
| ABC Company's key | `201` `{ "id": "...", "remaining": 99 }` |
| No `X-API-Key` header, or a wrong key | `401` `invalid_api_key` |
| A key revoked in the admin page | `401` `invalid_api_key` |
| GHI Company's key | `403` `subscription_expired` |
| DEF Company's key, sent twice | `201`, then `403` `quota_exceeded` |
| Body `{}` | `400` `invalid_body` |
| Body that isn't valid JSON | `400` `invalid_json` |

The same with curl:

```bash
curl -i -X POST http://localhost:3000/documents \
  -H "X-API-Key: <key from npm run seed>" \
  -H "Content-Type: application/json" \
  -d '{"title": "invoice-001.pdf"}'
```

## API

### `POST /documents` (tenant API)

| Status | `error` | Meaning |
|---|---|---|
| `201` | | Accepted. Body: `{ id, remaining }`. Counted against the allowance. |
| `400` | `invalid_body`, `invalid_json` | Malformed request. Not counted. |
| `401` | `invalid_api_key` | Missing, unknown or revoked key. Deliberately the same response for all three. |
| `403` | `subscription_expired`, `quota_exceeded` | Key is valid but the subscription doesn't allow more submissions. Includes `quota`, `used`, `expires_at`. |
| `413` | `payload_too_large` | Body over 1 MB. |

### Admin endpoints (used by the admin page)

| Method & path | |
|---|---|
| `GET /admin/tenants` | list companies |
| `GET /admin/tenants/:id` | usage and keys (key hashes are never returned) |
| `POST /admin/tenants/:id/keys` | issue a key; the full key is returned once |
| `POST /admin/keys/:id/replace` | revoke the key and issue a new one |
| `POST /admin/keys/:id/revoke` | revoke the key |

## Project layout

```
server/
  src/db.js          database connection, tables, key hashing and creation
  src/seed.js        resets the database with the seed companies
  src/index.js       server, POST /documents, error handling
  src/admin.js       admin endpoints
  public/index.html  admin page shell
  public/app.jsx     admin page (React)
```

## Troubleshooting

- **`EADDRINUSE: address already in use :::3000`**: another server is using port 3000. Stop it, or run `PORT=3001 npm start` and use port 3001.
- **`401` with a key you just copied**: `npm run seed` was run again since, which replaces all keys.
