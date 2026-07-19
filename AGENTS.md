# AGENTS.md

## Project Overview
NestJS backend API for Pro-ERP. Single package, `src/` is source root.

## Dev Commands
- `yarn start:dev` — watch mode with hot reload
- `yarn build` — production build (output to `dist/`)
- `yarn start:prod` — run built image via pm2
- `yarn lint` — ESLint with unused-imports plugin (also enforces import order)
- `yarn test` — Jest unit tests (root in `src/`, pattern `*.spec.ts`)
- `yarn test:e2e` — e2e tests (`test/jest-e2e.json`)
- `yarn format` — Prettier on `src/` and `test/`

## Test Commands
- Single test file: `yarn test -- <file-match>`
- Single test: `yarn test -- --testPathPattern=<name>`
- Coverage: `yarn test:cov`

## Dependencies & Services
- **PostgreSQL** via Docker Compose (port 5432, config in `docker-compose.yaml`)
- **Redis** — ioredis, configured via env vars
- Start DB: `docker-compose up -d`

## Runtime Configuration
- API prefix: `/api`
- Swagger docs: `/docs` (antes `/doc`)
- WebSocket (Socket.IO): port 3001
- CORS whitelist: localhost:18080, 192.168.56.103:18080, devproerpec.site, proerp.sigafi.com
- Multi-tenancy headers: `X-Ide-Usua`, `X-Ide-Empr`, `X-Ide-Sucu`, `X-Ide-Perf`, `X-Login`, `X-Ip`, `X-Terminal`
- Rate limiting: 300 req/min per IP (ThrottlerModule)

## Build & Deploy
- Production: `pm2 start npm --name "nest-core-api" -- run start:prod` (via `deploy.sh`)
- `generated/` and `dist/` are excluded from linting

## Architecture
- Entry: `src/main.ts`
- Root module: `src/app.module.ts`
- Feature modules under `src/core/modules/`
- `src/core/` contains auth, db connection, email, whatsapp, and business modules
- `src/reports/` — PDF generation (pdfmake, printer service)
- `src/config/envs.ts` — env configuration loader

## Lint Rules
- Unused imports are errors (`unused-imports/no-unused-imports`)
- Import order: builtin → external → internal ( `@/**` ) → parent → sibling
- Vars/args prefixed with `_` are ignored

## Database
- Scripts in `scripts/` (`.sql` files for schema/triggers)
- Uses DataSource Native Querys(`src/core/connection/datasource.module.ts`)

## Environment
- Copy `.env.template` → `.env` before starting
- JWT secrets required (access + refresh, different secrets)
- `PATH_DRIVE` for local file storage

## FK Null Handling
- **Use `?? null`** for optional FK fields (e.g., `dtoIn.ide_vgtra ?? null`)
- **NEVER use `|| null`** — `0` is a valid number, `||` would coerce it to `null` incorrectly
- If frontend sends `ide_xxx: 0` for a FK that doesn't exist, let the DB FK constraint fail — don't silently convert to null