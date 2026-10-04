# Hybrid Value Betting Server

Minimal backend to support the hybrid value betting demo.

Run locally:

```bash
cd server
npm install
npm run dev
```

API:
- GET /api/health
- GET /api/tickets
- GET /api/metrics
- POST /api/simulate { fair, trials }
- POST /api/tickets/:name/resolve { outcome }
