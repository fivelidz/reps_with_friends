# Lane F1 — Figma extraction

**Mission:** get EVERYTHING out of Ben's Figma, read-only. Download all, catalogue all.

**Owns:** `figma/fetch.ts`, `figma/assets/**`, `figma/notes/catalogue.md`

## Status: BLOCKED on access token

API 403s without a token; the embed viewer is CloudFront-blocked for headless
browsers. Both probed and dead. **Nothing else can proceed until this lands.**

## Unblock (30 seconds, founder)
figma.com → Settings → Security → **Personal access tokens** → Generate →
scope **Read only** → save as `FIGMA_TOKEN=...` in `~/.secrets/figma.env`
(read-only tokens cannot modify the file — matches our rules of engagement).

## Run when unblocked
```bash
bun figma/fetch.ts
```
Pulls: full document JSON · component registry · variables (design tokens) ·
every top-level frame as PNG @2x → `figma/assets/exports/` · auto-catalogue
→ `figma/notes/catalogue.md`. Rate-limit aware, batched, idempotent.

## Then
Hand off to F2 with: catalogue + exports + variables.json. Flag anything the
extractor couldn't reach (e.g. no variables endpoint → note it for F2 to read
colours from the JSON instead).

## Definition of done
`figma/notes/catalogue.md` lists every page/frame/component with IDs;
`exports/` contains a PNG for every top-level node; file.json + variables.json
saved. Zero writes to the Figma (read-only endpoints only).
