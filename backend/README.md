# Backend database tenancy

`MONGODB_URI` connects to the shared database that stores organizations and user accounts. Authenticated organization routes select a tenant database named `tenant_<organization UUID without hyphens>` using the organization ID in the verified session token.

The tenant connection is attached to the request as `tenantConnection`. Organization-owned models and queries must be created through that connection rather than the shared Mongoose models. Mongoose caches tenant database handles on the shared MongoDB client. Each tenant database is created by MongoDB when its first collection is written.
