# VP Construction Jarves AI

Standalone responsive Node.js/Express + PostgreSQL starter for the VP Construction command centre. It is separate from all existing Floot projects.

## Current source features
- One-time first-owner setup and login with bcrypt password hashing and a signed HttpOnly, SameSite-strict session cookie.
- PostgreSQL-persisted project records and audit log.
- Server-side OpenAI Chat Completions integration. The browser never receives the API key; without an API key, Jarves returns an explicit setup error rather than fabricated AI output.
- Helmet security headers, API rate limiting, request-size limits, basic input validation and a database health endpoint.
- Responsive mobile-first interface and Render deployment blueprint.

## Deploy
1. Create a PostgreSQL database on Render and set its internal connection URL as `DATABASE_URL`.
2. Deploy this repository as a Node web service using `npm install` and `npm start`.
3. Configure `NODE_ENV=production`, a random `JWT_SECRET` (at least 32 characters), `DATABASE_URL`, and `OPENAI_API_KEY` as server-side environment secrets. Set `OPENAI_MODEL` to a model enabled for your API account.
4. Verify `/api/health` returns HTTP 200 with `database: connected`. On the first visit, create an owner account with a valid email and a password of at least 12 characters.
5. Verify setup/login/logout, project persistence, and one AI response before entering real business information.

## Local checks
Requires Node.js 20+ and PostgreSQL for end-to-end use:
```sh
npm install
npm run check
npm test
npm start
```

## Security status and limits
**GitHub currently reports this repository as public.** Make it private in GitHub settings before commercial use. Never commit live API keys, passwords, production database URLs, client details or financial records. The application is a starter vertical slice, not a full QS/ERP system. Before relying on it for business records, test authorization boundaries, email verification/password reset, MFA, automated backups and restore, retention controls and production monitoring. Free hosting/database availability and retention rules can change. Construction outputs require competent professional review.
