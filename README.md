# SpendVentures

SpendVentures is a full-stack monthly expense tracker. The frontend is React (Vite), the backend is Node.js with Express, and data is stored in SQLite via `better-sqlite3`.

## Prerequisites

- Node.js 20+ recommended (includes `npm` and `--watch` for the API dev server).

## Setup

From the repository root:

```bash
npm install
```

This installs dependencies for the root workspace, `server`, and `client`.

Create `server/.env` if needed (defaults to port 3001). You can copy the example:

```bash
copy server\\.env.example server\\.env
```

On macOS/Linux, use `cp server/.env.example server/.env`.

The SQLite database file is created automatically at:

`server/db/spendventures.db`

On first startup, built-in expense categories are inserted so the category dropdown matches the defaults in the UI.

## Running locally

```bash
npm run dev
```

- API: http://localhost:3001  
- Web app (Vite): http://localhost:5173  

The client proxies `/api` to the backend during development.

## Production build

```bash
npm run build
```

Serve the `client/dist` folder with any static host, and configure it to proxy `/api` to your Node server (or expose the API on its own hostname with CORS rules you control).
