# LedgerGuard
Dynamic Multi-Tenant Zero-Knowledge Billing Engine

## Local development

Prerequisites: Node.js 20.19+ (or 22.12+) and MongoDB running locally, or a MongoDB connection URI.

1. Copy `backend/.env.example` to `backend/.env` and set a unique `JWT_SECRET` of at least 32 characters.
2. Copy `frontend/.env.example` to `frontend/.env` if the API is not at `http://localhost:4000/api`.
3. In `backend`, run `npm install` and `npm run dev`.
4. In `frontend`, run `npm install` and `npm run dev`.

The API health check is available at `GET http://localhost:4000/api/health`. Registration creates an organization and its owner account. Sessions are held in an HttpOnly cookie. Dashboard usage and billing figures are sample data until a billing source is connected.
