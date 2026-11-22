# Backend database tenancy

`MONGODB_URI` connects to the shared database that stores organizations and user accounts. Authenticated organization routes open a dedicated Mongoose connection to a tenant database named `tenant_<organization UUID without hyphens>` using the organization ID in the verified session token. The connection manager reuses the pending or established connection for each tenant, removes failed connection attempts so they can be retried, and closes tenant connections during graceful shutdown.

The tenant connection is attached to the request as `tenantConnection`. Organization-owned models and queries must be created through that connection rather than the shared Mongoose models. Each tenant database is created by MongoDB when its first collection is written.

`REDIS_URL` configures the Redis connection. Redis is required at startup and is closed during graceful shutdown; `/api/health/redis` checks its availability. The Redis service exports `getRedisValue` and `setRedisValue` for application operations.

Billing operations can use `acquireLock(lockKey, ttlMs)` to obtain a time-limited lock. It returns a unique ownership token or `null` if another caller holds the lock. Pass that token to `releaseLock(lockKey, token)`; release succeeds only when the token still owns the lock. Redis expires abandoned locks automatically after `ttlMs`.

## Billing transactions

Authenticated clients can submit `POST /api/billing/transactions` with `idempotencyKey`, a positive `amount`, a three-letter `currency`, and an optional `description` (up to 500 characters). The organization ID is taken from the verified session, not the request body. The first request returns `201` with a pending transaction; repeating the same key in that organization returns the existing transaction with `200` and `replayed: true`.

Billing records are stored in the organization's tenant database. A Redis lock serializes requests with the same key, and unique MongoDB indexes on `transactionId` and `(organizationId, idempotencyKey)` provide a final duplicate-prevention safeguard. Requests still contending after five seconds receive `503` with `Retry-After: 1`. The transaction remains pending until a payment-processing integration updates its status to `successful` or `failed`; this API does not charge a payment method.

Each new billing record is written in a MongoDB transaction using a Mongoose session. The session is committed only after the record is created; operation and commit errors abort the transaction, and the session is ended in either case. The Redis lock is released using its ownership token after the transaction finishes. MongoDB must run as a replica set (or on a supported sharded cluster); standalone servers cannot process billing requests.

## Usage analytics data

Usage events are stored as `UsageRecord` documents in the authenticated organization's tenant database. Each record includes its organization ID, resource type (`compute`, `storage`, `api_requests`, or `network`), usage amount and unit, cost and ISO-style three-letter currency, and recorded timestamp. Resource name is optional for events that can be attributed to an individual resource. Mongoose timestamps also supply `createdAt` and `updatedAt`.

The analytics service creates records, lists them with organization/date/resource filters, and aggregates usage by resource type, unit, and currency. Separate units and currencies are never summed together. Compound indexes on organization plus recorded date and organization plus resource type plus recorded date support tenant-scoped time-series reporting. A separate `ResourceUsage` collection is intentionally not used; the single event record is the source for both resource-level and organization-level aggregation.

`GET /api/dashboard` returns analytics for the authenticated organization. It accepts optional `startDate` and `endDate` query parameters in `YYYY-MM-DD` format (inclusive); when omitted, it uses the current UTC month through today. The response includes usage and cost grouped by resource type, usage unit, and currency; daily usage-record counts; and the number of distinct named resources with usage in the selected period. Usage amounts with different units and costs with different currencies remain separate. Utilization is returned as `null` because usage records do not currently include capacity telemetry.

`GET /api/billing/transactions` returns the authenticated organization's transactions, newest first. It supports `status` (`pending`, `successful`, or `failed`), `startDate` and `endDate` (`YYYY-MM-DD`, inclusive), `page` (default `1`), and `limit` (default `20`, maximum `100`). The response contains `transactions` and pagination metadata (`page`, `limit`, `total`, and `totalPages`). Unknown or invalid query parameters return `400`. `GET /api/billing/transactions/:transactionId` returns a transaction only when it belongs to the authenticated organization; unknown IDs return `404`.

For local development, start MongoDB with replica-set support, for example `mongod --replSet rs0 --bind_ip localhost --dbpath <data-directory>`, then initialize the set once with `mongosh --eval "rs.initiate()"`. Set `MONGODB_URI` to `mongodb://127.0.0.1:27017/ledgerguard?replicaSet=rs0` (as in `.env.example`). For a hosted database, use its replica-set or sharded-cluster connection string.

To populate the single local organization with synthetic Indian-region usage and INR billing records, run `npm run seed:india-demo` from `backend`. The command refuses production mode, requires exactly one organization unless `SEED_ORGANIZATION_ID` is set, and can be rerun safely. Remove only those demo records with `npm run seed:india-demo -- --clear`.

In non-production mode, the API accepts the configured `FRONTEND_ORIGIN` and `http://127.0.0.1:5173`. When `VITE_API_URL` is unset, the frontend uses its current hostname for API requests so session cookies remain on the same host. For production, configure `FRONTEND_ORIGIN` and `VITE_API_URL` explicitly.
