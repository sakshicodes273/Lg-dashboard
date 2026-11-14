# Backend database tenancy

`MONGODB_URI` connects to the shared database that stores organizations and user accounts. Authenticated organization routes open a dedicated Mongoose connection to a tenant database named `tenant_<organization UUID without hyphens>` using the organization ID in the verified session token. The connection manager reuses the pending or established connection for each tenant, removes failed connection attempts so they can be retried, and closes tenant connections during graceful shutdown.

The tenant connection is attached to the request as `tenantConnection`. Organization-owned models and queries must be created through that connection rather than the shared Mongoose models. Each tenant database is created by MongoDB when its first collection is written.

`REDIS_URL` configures the Redis connection. Redis is required at startup and is closed during graceful shutdown; `/api/health/redis` checks its availability. The Redis service exports `getRedisValue` and `setRedisValue` for application operations.

Billing operations can use `acquireLock(lockKey, ttlMs)` to obtain a time-limited lock. It returns a unique ownership token or `null` if another caller holds the lock. Pass that token to `releaseLock(lockKey, token)`; release succeeds only when the token still owns the lock. Redis expires abandoned locks automatically after `ttlMs`.
