#!/usr/bin/env bash
# Assemble the Cloudflare Pages deploy bundle from the monorepo.
# Output: deploy/ (site at /, app at /app, hub at /hub, debug at /debug,
# design at /design, functions for /api/ai + /api/state).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ building app bundle"
bun build apps/web/src/main.ts --outdir apps/web/dist --minify >/dev/null

echo "▸ assembling deploy/public (functions/ lives beside it — wrangler picks it up from cwd)"
mkdir -p deploy/public/site deploy/public/design deploy/public/app deploy/public/hub deploy/public/debug deploy/public/slack deploy/public/connect deploy/public/cards

cp site/index.html deploy/public/index.html
cp site/site.css site/main.js site/guide.js deploy/public/site/
cp -r site/lib deploy/public/site/lib
cp -r design/. deploy/public/design/
cp -r apps/web/dist/. deploy/public/app/
cp apps/hub/index.html apps/hub/hub.js apps/hub/hub.css deploy/public/hub/
cp apps/debug/index.html apps/debug/debug.js apps/debug/debug.css deploy/public/debug/
cp apps/slack-setup/index.html apps/slack-setup/slack-setup.js apps/slack-setup/slack-setup.css apps/slack-setup/manifest.yml deploy/public/slack/
cp apps/connect/index.html apps/connect/connect.js apps/connect/connect.css apps/connect/qr.js deploy/public/connect/
cp apps/demo/index.html apps/demo/demo.js apps/demo/demo.css deploy/public/demo/
# deploy/functions/api/{ai,state}.js are source-controlled as-is

echo "▸ bundle ready:"
find deploy/public -type f | wc -l | xargs echo "  asset files:"
du -sh deploy/public | cut -f1 | xargs echo "  size:"
echo "  deploy with: cd deploy && bunx wrangler pages deploy public --project-name=rwf"
