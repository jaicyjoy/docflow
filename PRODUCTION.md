# What's next for production (in priority order)

1. **Admin login and audit log.** Staff sign in with company SSO, with roles (view only vs. issue/revoke). Every key action is recorded with who did it and when. Today anyone who can reach the admin page can issue keys.
2. **Retry protection.** Accept an `Idempotency-Key` header and store it with `UNIQUE(tenant_id, idempotency_key)`. A repeated request returns the original document id instead of being charged again.
3. **Abuse protection.** Rate limits per key (burst protection, separate from the quota), throttling of repeated wrong-key attempts, and HTTPS only.
4. **Safer key rotation and leak response.** A grace period on Replace (old key keeps working for, say, 24 hours), email to the tenant when keys are issued or revoked, `last_used_at` on keys, and registering the `df_` format with GitHub secret scanning.
5. **Postgres instead of SQLite**, with migrations and backups. The schema and the atomic `UPDATE` carry over unchanged and stay correct across many server instances.
6. **Subscription and usage features.** Subscription periods with renewal history, a usage log per charge (for billing disputes), and warnings to the tenant at 80% and 100% of quota.
7. **Engineering basics.** Automated tests (auth, quota, concurrency, revoke) in CI, a build step for the admin page instead of the CDN, structured logs (key prefix only, never the key) and monitoring.
8. **Scale, when needed.** At very high traffic per tenant, the single counter row becomes a bottleneck: move the counter to Redis with periodic reconciliation, or hand each server a block of quota.

If I had another hour, I would do items 1 and 2 first.
