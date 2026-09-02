# hub-shots — version-card thumbnails for the main-page hub

Resized app screenshots used by the **Design versions** section of
`site/index.html` (the full hub). Source-of-truth images stay in the app
`shots/` folders — this folder only holds the small web versions.

Regenerate (ImageMagick; `convert` also works but is deprecated in IMv7):

```bash
cd <repo root>
mkdir -p site/hub-shots
magick apps/figma-app/shots/02-index.png        -resize 240x site/hub-shots/v1-home.png
magick apps/figma-app/shots/24-battle-live.png  -resize 240x site/hub-shots/v1-battle.png
magick apps/figma-app/shots/27-log-sheet.png    -resize 240x site/hub-shots/v1-log.png
magick apps/board/shots/04-home_board.png       -resize 240x site/hub-shots/v2-home.png
magick apps/board/shots/20-table_board.png      -resize 240x site/hub-shots/v2-table.png
magick apps/board/shots/45-result_board.png     -resize 240x site/hub-shots/v2-result.png
magick apps/figma-app/shots/121-battle-final.png -resize 240x site/hub-shots/demo-final.png
```

| file | from | shows |
|---|---|---|
| `v1-home.png` | `apps/figma-app/shots/02-index.png` | v1 home (Ben's Figma) |
| `v1-battle.png` | `apps/figma-app/shots/24-battle-live.png` | v1 live match |
| `v1-log.png` | `apps/figma-app/shots/27-log-sheet.png` | v1 rep log sheet |
| `v2-home.png` | `apps/board/shots/04-home_board.png` | v2 home (board game) |
| `v2-table.png` | `apps/board/shots/20-table_board.png` | v2 the table |
| `v2-result.png` | `apps/board/shots/45-result_board.png` | v2 result + charity |
| `demo-final.png` | `apps/figma-app/shots/121-battle-final.png` | match replay finale |

Deploy: `scripts/build-deploy.sh` copies `*.png` → `deploy/public/site/hub-shots/`
(served at `/site/hub-shots/` on both localhost:4173 and rwf.qalarc.com).
Only this README and the PNGs belong here — nothing else.
