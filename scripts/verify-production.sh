#!/usr/bin/env bash
set -euo pipefail
: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required}"
: "${VITE_SUPABASE_ANON_KEY:?VITE_SUPABASE_ANON_KEY is required}"
test -f package.json
test -f src/main.tsx
test -f index.html
test -f public/manifest.webmanifest
npm run build
test -f dist/index.html
test -d dist
echo "DulyAgrivia 2.1 build OK — publish dist/"
