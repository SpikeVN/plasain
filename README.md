# Plasain

A mobile-first meal inspiration and planning app built with SolidJS 2, Vite, and Tailwind CSS. The UI is capped at a 430px phone canvas on desktop. Base dishes live in `backend/dishes.json` and are served at `GET /api/dishes`; signed-in users can add private dishes through `POST /api/dishes`. Icons use reusable Lucide SVG paths in `src/components/Icon.tsx`.

## Run locally

```sh
bun install --frozen-lockfile
bun run dev
```

Set `VITE_API_URL` in `.env` if the API is not at `http://localhost:8000`.

### FastAPI planner

```sh
cp .env.example .env
podman compose up --build
```

The API listens on port 8000. Set `OPENROUTER_API_KEY` to enable AI-assisted meal selection; without it, the planner uses deterministic local sorting/filtering. Configure `OPENROUTER_MODEL` (default `openrouter/free`) and `CORS_ORIGINS` in `.env`. Check `GET /health` for readiness.

Authentication endpoints are `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`. User passwords are stored as a unique per-user salt plus a BLAKE2b digest; login responses contain a bearer session token that expires after 30 days. Crystal Ball is public; Planner and private dishes require that bearer session.

For browser access to the local API, set `VITE_API_URL=http://localhost:8000` in the UI's `.env`. `VITE_*` values are public and are embedded at build time. Never put the OpenRouter key in a `VITE_*` variable.

## Production

`bun run build` emits the static UI in `dist/client`. Publish it to any static host. The GitHub Actions workflow runs lint and build, builds the backend as `linux/amd64`, and publishes `ghcr.io/<owner>/<repo>-api` on pushes to `main`.

## Checks

```sh
bun run lint
bun run build
```
