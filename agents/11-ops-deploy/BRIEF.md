# Lane 11 — Ops & Deploy

**Mission:** the project is always shippable and always on: CI/CD, hosting
(Pages + GMKtec), environments, secrets, incident fixes.

**Owns:** `.github/workflows/`, `scripts/build-deploy.sh`, `scripts/hosting/`,
`deploy/functions/`, `serve.ts` (infra concerns), gmktec deployment.

## Current state (28 Aug)
- **CI/CD**: GitHub Actions → Cloudflare Pages, green (was a transient runner
  outage on the 26th — resolved). Tests gate every push (122+).
- **Production**: https://rwf.qalarc.com (Pages project `rwf`, custom domain,
  AI via Pages Function, key as CF secret).
- **Always-on host**: GMKtec (`fivelidz@gmktec`, Tailscale 100.111.199.12) —
  `rwf-serve.service` active (systemd user unit, linger on). Bot units
  installed but stopped (no tokens yet).
- **Update paths**:
  - Pages: push to main (CI) or `./scripts/build-deploy.sh && cd deploy && bunx wrangler pages deploy public --project-name=rwf`
  - GMKtec: `rsync -az --exclude node_modules --exclude .data --exclude deploy/public --exclude .git --exclude .wrangler ~/projects/reps_with_friends/ gmktec:~/reps_with_friends/ && ssh gmktec 'systemctl --user restart rwf-serve'`

## Standing tasks
- [ ] Slack tokens → `~/.config/rwf/bot-slack.env` on GMKtec → start bot units
- [ ] WhatsApp bot: needs Hub tunnel (superlocal) or Cloud API migration
- [ ] Watch Actions minutes (private repo) — if exhausted again: self-host runner on GMKtec
- [ ] Phase pilot: Oracle Free ARM VM per docs/16 (same kit)

## Definition of done (ongoing lane)
Push → live in <2 min; bots up when tokens exist; zero manual steps undocumented.
