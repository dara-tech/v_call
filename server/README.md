# Server removed — use `v_server`

The backend lives in **`../v_server`** (single server for auth, chat, calls, WebRTC, AI proxy, and watch-party search).

## Local dev

From `v_call/`:

```bash
npm run dev          # starts v_server + client
npm run dev:server   # v_server only (port 5003)
npm run dev:client   # Vite client only
```

Or from `v_server/`:

```bash
npm run dev
```

Ensure MongoDB is running and `v_server/.env` is configured.

## Production

PM2 should run **`v_server`**, not this folder. Set:

```
SERVE_CLIENT_DIST=/root/v_call/client/dist
PORT=5001
```
