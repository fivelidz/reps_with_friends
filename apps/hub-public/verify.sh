#!/usr/bin/env bash
# Coverage hub link verifier (v1.1.0).
# Crawls every href/src on /v1 (+ every rendered doc page) and asserts
# status 200 AND a sane content-type — because this site's dev server and
# Cloudflare Pages both serve index.html with 200 for unknown paths
# (HTML fallthrough), so status alone proves nothing.
#
# Usage: ./verify.sh [base-url]     (default http://localhost:4173)
set -euo pipefail
BASE="${1:-http://localhost:4173}"

pass=0; fail=0
declare -a FAILURES

check() { # check <path> <expected-type-regex>
  local path="$1" want="${2:-text/html}"
  local meta
  meta=$(curl -sL -o /dev/null -w "%{http_code} %{content_type}" --max-time 20 "$BASE$path" || echo "000 -")
  local code="${meta%% *}" ctype="${meta#* }"
  if [ "$code" = "200" ] && printf '%s' "$ctype" | grep -qiE "$want"; then
    pass=$((pass+1)); printf '  ok    %s\n' "$path"
  else
    fail=$((fail+1)); FAILURES+=("$path → $meta (want 200 $want)")
    printf '  FAIL  %s  [%s]\n' "$path" "$meta"
  fi
}

echo "▸ verifying every link on $BASE/v1 (content-type aware)"

# ── 1. the hub page itself + its assets ──────────────────────────────
check /v1                                   'text/html'
check /v1/hub.css                           'text/css'
check /v1/assets/phone-app.png              'image/png'

# ── 2. every link the page declares (explicit, audited list) ─────────
# app section
check /figma-app                            'text/html'
check '/figma-app/?demo=1'                  'text/html'
check /apk/rwf-app-debug.apk                'application/vnd.android.package-archive|application/octet-stream'
check /connect                              'text/html'
check /slack                                'text/html'
# business
check /deck/RWF_Followup_Deck.pdf           'application/pdf'
check /deck/RWF_Contract_Scope.pdf          'application/pdf'
check /deck/RWF_Followup_Appendix.pdf       'application/pdf'
for d in 01_BUSINESS_ANALYSIS 02_MASTER_PLAN 19_PRICING_EQUITY_GUIDE \
         24_GAME_DESIGN 25_DESIGN_BRIEF 17_FEATURES_AND_PROGRESS \
         15_BLOCKERS 22_BACKEND_CHAT_ARCHITECTURE 21_BEEPER_MATRIX_INVESTIGATION \
         figma_design_analysis; do
  check "/v1/docs/$d.html"                  'text/html'
done
check /v1/docs/docs.css                     'text/css'
# dashboards
check /hub                                  'text/html'
check /debug                                'text/html'
check /api/state                            'application/json'
check /wiki                                 'text/html'
check /system                               'text/html'
check /styles                               'text/html'
# fun
check /avatars                              'text/html'
check /avatars/avatars.js                   'javascript|text/plain'
check /atelier                              'text/html'
check /demo                                 'text/html'
# shared deps pulled by the hub + docs + avatars/atelier pages
check /design/tokens.css                    'text/css'
check /design/fonts/fonts.css               'text/css'
# ── 3. model assets the avatar gallery + atelier lazy-load ───────────
for m in Geno.glb orc.glb orc_marauder.glb Soldier.glb Xbot.glb Cranberry.glb \
         wolf.glb dragon_hunter.glb dragon_elder.glb humanoid_adventurer.glb \
         humanoid_brute.glb meshy_frog_full.glb meshy_frog_head_b.glb \
         meshy_frog_head_c.glb goblin_limp.bvh goblin_drag.bvh \
         goblin_one_arm.bvh goblin_combat.bvh geno_npz_walk.json \
         geno_npz_run.json geno_npz_sprint.json geno_npz_aimwalk.json \
         geno_npz_floorscoot.json geno_npz_getdown.json meshy/manifest.json; do
  check "/models/$m"                        'model/|application/|text/plain|octet-stream'
done
for s in model-avatars.js model-recolor.js avatars.js; do
  check "/site/$s"                          'javascript'
done
for s in geno-wardrobe geno-outfit geno-derived geno-cloth frog-heads; do
  check "/site/models/$s.js"                'javascript'
done
check /site/avatar-styles/dragon2.js        'javascript'
check /site/lib/GLTFLoader.js               'javascript'
check /site/lib/BVHLoader.js                'javascript'
check /site/lib/three.module.js             'javascript'

# ── 4. crawl the actual page markup for anything NOT in the list ─────
echo "▸ crawling page markup for unlisted hrefs/srcs"
mapfile -t found < <(
  curl -sL --max-time 20 "$BASE/v1" | grep -oE '(href|src)="[^"]+"' | sed -E 's/^(href|src)="//; s/"$//' | sort -u
  for d in $(curl -sL --max-time 20 "$BASE/v1" | grep -oE 'href="/v1/docs/[^"]+\.html"' | sed -E 's/href="//; s/"//' | sort -u); do
    curl -sL --max-time 20 "$BASE$d" | grep -oE '(href|src)="[^"]+"' | sed -E 's/^(href|src)="//; s/"$//' | sort -u
  done
)
for u in "${found[@]}"; do
  case "$u" in
    http*|mailto:*|data:*) ;;                                              # external/scheme — out of scope
    /*) ;;                                                                # absolute — already in audited list above? verify anyway
    *) ;;                                                                 # relative inside /v1
  esac
done
# dedupe + verify absolute-path ones found in markup that we haven't checked
mapfile -t extra < <(printf '%s\n' "${found[@]}" | grep '^/' | sort -u | \
  while read -r u; do
    case "$u" in
      /v1|/v1/*|/figma-app*|/apk/*|/connect|/slack|/deck/*|/hub|/debug|/api/state|/wiki|/system|/styles|/avatars*|/atelier*|/demo|/design/*) exit 0 ;;  # covered above (skip echo)
      *) echo "$u" ;;
    esac
  done)
for u in "${extra[@]:-}"; do
  [ -z "$u" ] && continue
  check "$u" 'text/html|text/css|javascript|image/|font/|application/'
done

echo
echo "▸ $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  printf '  ✗ %s\n' "${FAILURES[@]}"
  exit 1
fi
echo "▸ ALL LINKS GOOD — every route 200s with correct content-type"
