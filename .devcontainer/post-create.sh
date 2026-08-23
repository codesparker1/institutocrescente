#!/usr/bin/env bash
# Runs once when the Codespace/devcontainer is first created. Gets the repo to a state where
# `npm run dev`, `npm run seed:teste-5-anos`, and `npm run teste:5-alunos` all work immediately —
# no manual setup needed inside the Codespace.
set -euo pipefail

cd /workspace

echo "==> Writing .env.local for the devcontainer's local Postgres (does not touch your Neon config)"
# AUTH_SECRET signs NextAuth sessions — required for login to work at all; generated fresh per
# Codespace instead of committing a shared secret. BLOB_READ_WRITE_TOKEN (student documents
# upload) is intentionally left unset: the simulation script never exercises that feature.
# Written before any Prisma/npm command below so DATABASE_URL is unambiguously in place —
# docker-compose.yml's environment: block already provides it at the process level too, but
# .env.local is what dotenv.config({ path: ".env.local" }) actually reads in the app/scripts.
AUTH_SECRET_VALUE=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
cat > .env.local <<EOF
DATABASE_URL="postgresql://postgres:postgres@db:5432/institutocrescente?sslmode=disable"
DIRECT_URL="postgresql://postgres:postgres@db:5432/institutocrescente?sslmode=disable"
SIMULATION_MODE=true
AUTH_SECRET="${AUTH_SECRET_VALUE}"
EOF

echo "==> npm install"
npm install

echo "==> Playwright: installing Chromium + OS deps (needed for scripts/simulacao/*)"
npx playwright install --with-deps chromium

echo "==> Prisma: generating client"
npx prisma generate

echo "==> Prisma: applying migrations to local devcontainer Postgres"
npx prisma migrate deploy

echo ""
echo "Setup complete. Next steps:"
echo "  1. npm run seed:teste-5-anos"
echo "  2. npm run dev            (in one terminal)"
echo "  3. npm run teste:5-alunos -- --url http://localhost:3000   (in another terminal)"
