# Ben's Pinterest — Design Analysis

**What this is:** a read of Ben Gillies' complete Pinterest reference material for Reps
With Friends, produced from the founder's offline save of the secret board
(`design/references/Pinterest.html` + `Pinterest_files/`, 2026-09-03) merged with the
earlier 22-pin public-board/profile scrape. The wall lives at **/pinboard**
(59 cards, both sets, deduped).

**Method + honesty box.** Pinterest's own DOM declares the ideation board at
**39 pins — all 39 are captured** (complete, not lazy-truncated; the 5 stray
474px images after the last pin are Pinterest's "related ideas" rail, excluded).
One pin is a 10-frame carousel (Quizly) and one image was pinned 3×, giving
**37 unique covers** + 9 carousel frames. Covers were re-fetched at 736px from the
Pinterest CDN (the founder's save holds 236px lazy-grid thumbs). Dedupe against
the earlier 22 was done on **pin id AND image signature: zero overlap — the boards
are disjoint**. Image-input was unavailable in this analysis session, so clusters and
palettes derive from Pinterest's per-pin alt-text (rich: "This may contain: …"),
aspect-ratio profiling and PIL median-cut palette extraction (6 colours/pin, 300px).
Where a claim rests on palette maths rather than eyes, it says so.

---

## 1 · What Ben actually collects

The ideation board is **not a mood board of vibes — it's a product study wall.**
37 of 39 pins are screenshots/app showcases; ~30 of them are *multi-phone
presentation shots* (2–4 devices arranged in one composition — the Dribbble case-study
format). Ben is collecting **how apps present themselves**, not decoration.

### Cluster A — The sports numbers cluster *(betting · odds · tickets · players)*
The densest sports cluster, and it contains the only pin Ben saved **three times**
(a strong like-signal): `ideation_02` (×3), with `ideation_03`, `ideation_35` —
and it repeats one exact palette across two different pins:

| pin | what alt-text says | palette extract |
|---|---|---|
| I02 ×3 | "three iphones displaying the different sports betting options for each player" | `#ebd9c1` cream · `#7ab3ad` teal · `#313d3b` ink |
| I35 | "three iphones displaying different sports tickets and numbers" | `#ebd9c1` · `#7bb3ad` · `#313c3b` *(same family)* |
| I03 | "four iphones … different books and prices" (odds comparison) | `#f11814` red-led · `#ff714d` · `#4b1e1d` |
| I13 | "numbers and information for each destination" (held phone) | dark-olive `#1d2921` · `#afb293` |
| I34 | "name and number of players … purple background" | `#ab70f8` violet · `#3c1e36` · `#bf98f2` |

**Read:** the sportsbook language Ben gravitates to is *cream + teal + ink* — a
ticket/scratch-sheet feel, not neon bookmaker darkness — plus violet player-cards
(I34) as the hero way to show *people as competitors*.

### Cluster B — Quizly: one app case, studied end-to-end *(10 frames)*
`ideation_05` is a single pin carrying a **10-frame carousel** of the "Quizly"
learning app (@vektora.studio). He didn't just pin the hero shot — the carousel
means onboarding → dashboard → quiz → results all passed under his eyes.
Palette: `#f2e7c5` cream · `#a89262` gold-ochre · `#f1f0ec` paper.
**Read:** friendly-rounded, cream-and-gold, mascot-adjacent learning UI — the
closest single object on the board to "how do you teach a game to a group chat".

### Cluster C — Neo-brutalism & loud flat colour
| pin | evidence | palette |
|---|---|---|
| I14 | alt says it outright: "yellow and purple **Neo-Brutalism** UI … bookmark folders" | `#fed01a` yellow · `#9888ab` lilac · `#4d2637` ink |
| I24 | "shareos … three different colors and font styles" (typeface-flexing) | `#fe0000` pure red-led · `#f0ab72` |
| I21 | "yellow and black text" across three iPhones | `#161616` · `#cdc197` gold-tan |
| I25 | untitled, amber-dominant | `#ffba07` amber (49.6% of pixels) |
| I28 | untitled, acid accent | `#defc45` acid lime on paper |
| I27 | "yellow sign that says pelago" on lilac field | `#f1c5ff` lilac · `#f9e566` yellow |

**Read:** one loud accent on a flat ground, chunky type, poster energy — repeatedly.

### Cluster D — Wellness · habits · gamified daily apps *(the RWF-shaped ones)*
| pin | alt-text | palette |
|---|---|---|
| I15 | "welcoming start screen with mood emojis, main dashboard … sleep and stress, quick mood check-ins, progress quiz" | `#eae4f0` lilac-paper · `#fcfbfa` |
| I26 | "iphone with the **daily challenge app** … displaying multiple tasks" | `#e7def9` lavender · `#70627b` |

These two are the pins that look like RWF itself: check-ins, streaks, task lists,
a friendly dashboard. Note both are **light-lilac**, not dark.

### Cluster E — Brand campaigns & posters *(the loud stuff)*
I12 San Diego Power basketball ad (`#083ff3` electric blue on white — the most
poster-shaped pin, 736×1472), I18/I19 ("get slushy get stylish") / I29 ("what we do")
/ I31 (ad study "colors and font on the back side"), I32 **"Pure Taste Power"**
(@lay.the.designer — a named designer case, like Quizly), I37 sneaker lineup
(`#fde079` yellow-led). Big display type, flat grounds, retail energy.

### Cluster F — Everything else (one pin each)
Sports-club apps (I06 Game Changers Dream Team — navy-indigo `#1b1b27`; I08 Real
Madrid — teal+plum), fintech (I16 red/blue cards), utility (I17 calculator, I11
world-clock), onboarding patterns (I23), social/texting (I33, gold `#e7c03b`),
menu/hospitality (I20 `#04b9bb` cyan-led), commerce (I37), dark-UI studies
(I22, I13). None of these is a cluster; each is a single glance.

### And the earlier 22 (public board + profile feed)
A different diet entirely: gym-editorial photography, brand identities, logos,
interiors (5!), illustration, fashion — **lifestyle and identity, not UI.** The two
boards are complementary: *public board = who RWF feels like; ideation board = what
the product looks like.*

---

## 2 · The common threads

**Colour (quantified).** Share-weighted hue census across all 37 covers:
neutrals dominate the canvas (expected for UI shots — ~48% of pixel-weight),
but among *colour*: **orange 537 · yellow 458 · blue 334 · purple 280 · red 204 ·
green 199**. Light beats dark ~2052 : 619. Only 5 of 37 covers are
accent-colour-led at the top of their palette; the pattern is **a calm base with
one loud, warm accent.**

- **Does the gold/purple Figma palette appear here? Yes — but as accents, not as a dark theme.** Gold-ochre/amber leads the Quizly case (`#a89262`), Pelago (`#f9e566`), amber pin I25 (`#ffba07`), social I33 (`#e7c03b`) — and RWF's `--gold #ffc821` sits squarely in that family. Purple shows as **player-card violet `#ab70f8` (I34), explicit yellow×purple neo-brutalism (I14), lavender dashboards (I26/I15), indigo-navy club apps (I06)**. The board *validates the brand hues* while rejecting the current `--ink #0b0a12` canvas: Ben's references are **cream/ivory/paper-light**.
- **The one exact palette he saved twice:** cream `#ebd9c1` + teal `#7ab3ad` + ink `#313d3b` (I02/I35). Treat it as the board's "sportsbook kit".

**Format/layout instinct.** 21 of 37 covers are wide multi-phone compositions
(AR ≥ 1.15); tall pins are posters/ads, not screens. He collects **app-as-set
showcases** — 2–4 phones, one hero message. For RWF that means: match cards,
crew pages and store shots should be *multi-device compositions*, and the phone
frame is a design element, not a neutral container.

**Type instinct (from alt-text, no glyph inspection).** Pins described by their
type: "yellow and black text" (I21), "different colors and font styles" (I24 — a
whole OS flexing three typefaces), posters "with different colors and font"
(I31). Loud display type on flat grounds, repeatedly. Nothing in the alt-text
suggests delicacy or fine serif work — this is poster-weight type.

**What's conspicuously absent:** photography as UI background, dark-mode
dashboards, data-dense tables, illustration systems, gradients-for-depth. The
public board carries the photography load; the ideation board wants **flat,
light, typographic, accented.**

---

## 3 · Implications for RWF themes

**Already aligned:**
- `theme-neobrut` is the sleeper hit — its warm poster cream `#f2e3c4` + card-stock
  surfaces is *exactly* the board's dominant ground (Quizly/neo-brutal/amber
  cluster). It should be treated as a first-class candidate, not a novelty.
- `theme-gold`'s **hues** are validated (`#ffc821` ≈ the amber/gold family he
  saves); its **canvas** is not — it's the darkest theme in the library while the
  board is the lightest diet we've analysed.
- `theme-lime`'s acid energy exists on the board (I28 `#defc45`) — one pin, keep it niche.
- `theme-track`/`theme-n64` etc. — nothing on the board argues for them either way.

**Missing that the board asks for (concrete):**
1. **A light cream ground with gold+ink** — the single biggest gap. Quizly's
   `#f2e7c5`/`#a89262` and amber I25 `#ffba07` are the spec.
2. **The cream+teal+ink "sportsbook" kit** from I02/I35 (`#ebd9c1`/`#7ab3ad`/`#313d3b`)
   for anything odds/numbers/tickets — the match lobby, handicap maths, season tables.
3. **Violet player-cards** (I34 `#ab70f8` on `#3c1e36`) as the identity of crew
   profiles/leaderboards — people-as-competitors.
4. **Multi-phone showcase compositions** as a marketing/store asset pattern — no
   theme kit currently ships a "device set" presentation component.

---

## 4 · The board says *(quotable)*

> Ben's board is a product study, not a mood board: 39 pins, almost all app
> showcases, gathered as multi-phone case studies. He saved one betting-UI pin
> three times — in cream, teal and ink, not neon. He studied a whole learning-app
> flow frame by frame (10 slides) in cream and gold. He explicitly pinned
> yellow-and-purple neo-brutalism. His one purple moment is a player card.
> Everything he collects is light, flat, warm-accented and typographic —
> the gold and purple we already own are right; the dark canvas they sit on
> is the one thing his references never do.

---

## 5 · Theme-delta recommendations *(for the themes lane — not implemented here)*

1. **Ship a light "Cream Gold" variant of theme-gold** (or a `theme-gold--light`
   flag): base `#f2e7c5`-family cream, surfaces `#faf1de`, text ink `#1c1712`,
   keep `--gold #ffc821` as the accent and `--ink-brand-tint` purple for
   power-up zones. Highest-confidence change the board supports; the dark
   variant remains default until the founder/Ben weigh in.
2. **Add a `theme-sportsbook` kit** with the exact I02/I35 palette
   (`#ebd9c1` / `#7ab3ad` / `#313d3b`, red `#f11814` for live odds/alerts) and
   apply it to match lobby + handicap + season-table surfaces.
3. **Neo-brutalist component pass on `theme-neobrut`** targeting challenge /
   daily-task cards (the I26 pattern): thick ink borders, hard offset shadows,
   `#fed01a`/`#9888ab` accents — one screen type, not a whole-app reskin.
4. **Introduce a violet "player card" component** (I34: `#ab70f8` gradient,
   `#3c1e36` ground, name + number lockup) for crew profiles, leaderboards and
   match-result cards — carried across all themes as a brand object.

---

*Evidence files: `design/references/pinterest_ideation/` (37 covers + 9 carousel
frames, 736px), `/tmp` working data not persisted, wall at `site/pinboard/`
(manifest v2, 59 images), screenshots in `apps/screenshots/pinboard/`.*
