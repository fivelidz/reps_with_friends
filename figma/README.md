# Branch: Figma Integration — "the Ben design"

*Charter: Ben's Figma has arrived (blocker B1 resolved). This branch takes in
EVERYTHING from it — read-only, no edits to the online file — downloads all
assets, catalogues every screen/component/token, compares against our
independent design (docs/13), and implements the components and screens.*

**Figma:** https://www.figma.com/design/jTTqanaC6WLPBTpPlyuUYu/Reps-With-Friends-%E2%80%94-Product-Design
**File key:** `jTTqanaC6WLPBTpPlyuUYu`
**Access status:** 🔴 blocked on a personal access token (API 403s without one)

## Rules of engagement
1. **READ-ONLY on the Figma** — no comments, no edits, no branch merges in the
   file. Fetch, download, analyse, implement locally.
2. Everything downloaded lands in `figma/assets/` (raw) with exports in
   `figma/assets/exports/`. Never modify the raws.
3. Our design system (design/tokens.css) stays the implementation target —
   Figma values get MAPPED into it, not forked from it. Where the Figma
   genuinely differs, we diverge deliberately and log it (docs/13 §7
   divergence log is the home for decisions).
4. The prototype's working features are not regressed — Figma screens land as
   improvements, not rewrites, unless a screen is clearly better.

## Lanes
| Lane | Owns | Status |
|---|---|---|
| `F1-extract` | figma/assets/, figma/notes/catalogue.md — get EVERYTHING out of the file | 🔴 needs token |
| `F2-analysis` | figma/notes/analysis.md + docs/13 divergence log — compare vs our design | ⏳ after F1 |
| `F3-components` | figma/impl/components/ — Figma components in our design system | ⏳ after F2 |
| `F4-screens` | apps/web screens per Figma, keeping engine/sync intact | ⏳ after F3 |

## Access options (pick one)
- **A (best): personal access token** — figma.com → Settings → Security →
  Personal access tokens → Generate, scope: *Read only* (or minimum
  `file_content:read`). Drop it in `~/.secrets/figma.env` as
  `FIGMA_TOKEN=...` or paste to the orchestrator. Read-only tokens cannot
  modify anything — matches our rules.
- **B: export** — in Figma: select all pages → Export as PNG @2x (or File →
  Export → PDF), plus Dev Mode → "Export variables" if available. Drop files
  into `figma/assets/exports/`. Slower but zero setup.
