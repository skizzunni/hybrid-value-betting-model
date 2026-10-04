# Hybrid Value Betting System

## Full stack app

This repo includes:
- React + Vite front-end multi-page app
- Express backend with simulation endpoints
- live dashboard concept UI
- analytics and simulation modules

## Run frontend

```bash
npm install
npm run dev
```

## Run backend

```bash
cd server
npm install
npm run dev
```

## Endpoints

- GET /api/health
- GET /api/tickets
- GET /api/metrics
- POST /api/simulate
- POST /api/tickets/:name/resolve
