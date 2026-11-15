# Backend database tenancy

`MONGODB_URI` connects to the shared database that stores organizations and user accounts. Authenticated organization routes open a dedicated Mongoose connection to a tenant database named `tenant_<organization UUID without hyphens>` using the organization ID in the verified session token. The connection manager reuses the pending or established connection for each tenant, removes failed connection attempts so they can be retried, and closes tenant connections during graceful shutdown.

The tenant connection is attached to the request as `tenantConnection`. Organization-owned models and queries must be created through that connection rather than the shared Mongoose models. Each tenant database is created by MongoDB when its first collection is written.

`REDIS_URL` configures the Redis connection. Redis is required at startup and is closed during graceful shutdown; `/api/health/redis` checks its availability. The Redis service exports `getRedisValue` and `setRedisValue` for application operations.

Billing operations can use `acquireLock(lockKey, ttlMs)` to obtain a time-limited lock. It returns a unique ownership token or `null` if another caller holds the lock. Pass that token to `releaseLock(lockKey, token)`; release succeeds only when the token still owns the lock. Redis expires abandoned locks automatically after `ttlMs`.

## Billing transactions

Authenticated clients can submit `POST /api/billing/transactions` with `idempotencyKey`, a positive `amount`, a three-letter `currency`, and an optional `description` (up to 500 characters). The organization ID is taken from the verified session, not the request body. The first request returns `201` with a pending transaction; repeating the same key in that organization returns the existing transaction with `200` and `replayed: true`.

Billing records are stored in the organization's tenant database. A Redis lock serializes requests with the same key, and unique MongoDB indexes on `transactionId` and `(organizationId, idempotencyKey)` provide a final duplicate-prevention safeguard. Requests still contending after five seconds receive `503` with `Retry-After: 1`. The transaction remains pending until a payment-processing integration updates its status to `successful` or `failed`; this API does not charge a payment method.
