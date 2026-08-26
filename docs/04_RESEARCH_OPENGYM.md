# Research: OpenGym & Open-Source Fitness Landscape (GitHub)

*26 Aug 2026 · verified via GitHub API*

## Disambiguation: what "OpenGym" is on GitHub

| Meaning | What it is | Relevant? |
|---|---|---|
| **openGym (fitness tracker)** | Self-hosted gym/bodyweight workout tracker PWA. Original `DuarteSantos8/openGym` is **deleted (404)**; surviving snapshot `arvids-unavailable/openGym` (5,906★, 934 forks) | ✅ Closest namesake — study, don't fork |
| **OpenAI Gym / Gymnasium** | RL/ML environment library — most search hits are this | ❌ Noise |
| **"open gym" (casual sports)** | `dmateusp/opengym` — organise group sports sessions | ⚠️ Group mechanics reference |

Key fact: the 5.9k★ openGym is a **frozen mirror with no active maintainer**
(upstream deleted; snapshot pushed once, 2026-08-03).

## Landscape table

| Repo | ★ | Lang | Licence | What it does | Active |
|---|---|---|---|---|---|
| [arvids-unavailable/openGym](https://github.com/arvids-unavailable/openGym) | 5,906 | React/Node | **AGPL-3.0** | Solo tracker: 1,324-exercise library, progression rules, est. 1RM, RPE, PWA+Capacitor | snapshot only |
| [jovandeginste/workout-tracker](https://github.com/jovandeginste/workout-tracker) | 1,247 | Go | **MIT** | Self-hosted family tracker, GPX/maps, Docker | very |
| [yo-WASSUP/Good-GYM](https://github.com/yo-WASSUP/Good-GYM) | 397 | Python | **MIT** | **RTMPose real-time rep counting + form feedback**, exercises declarative in `data/exercises.json` | yes |
| [itskovacs/wingfit](https://github.com/itskovacs/wingfit) | 521 | TS | custom | Planner, PR tracking, smartwatch data | stale |
| [brandonp2412/Flexify](https://github.com/brandonp2412/Flexify) | 418 | Flutter | **MIT** | Offline-first strength+cardio tracker | yes |
| [Cawlumm/lyftr](https://github.com/Cawlumm/lyftr) | 311 | TS | **MIT** | Self-hosted tracker + nutrition | yes |
| [norrdev/OpenGym](https://github.com/norrdev/OpenGym) | 28 | Flutter | GPL-3.0 | Private workout journal | 2026-05 |
| [abishekvashok/Rep-Counter](https://github.com/abishekvashok/Rep-Counter) | 67 | Python | Apache-2.0 | PoseNet camera rep counter | dead 2021 |
| [dmateusp/opengym](https://github.com/dmateusp/opengym) | 3 | Go+TS | **MIT** | Group sports RSVP/waitlists/cost-splitting | 2026-03 |
| [LibreFitOrg/LibreFit](https://github.com/LibreFitOrg/LibreFit) | 204 | Kotlin | GPL-3.0 | Android tracker | 2026-07 |

**"Gym leaderboard" search: nothing.** Only 0-star student projects. **No
established open-source project does social fitness competition — the niche is
genuinely open.**

## Licence constraints (important)

- **openGym is AGPL-3.0** — strongest copyleft. Forking it, linking its code,
  or copying its exercise media into a network service forces RWF fully
  open-source. **Reference-only. Rebuild concepts; source exercise data
  elsewhere (MIT datasets).**
- **Good-GYM, workout-tracker, dmateusp/opengym, Flexify, lyftr are MIT** —
  safe to borrow patterns and code with attribution.
- GPL-3.0 repos (norrdev, LibreFit): avoid, nothing unique.

## Recommendations

1. **Adopt Good-GYM's rep-counting approach (MIT)** — port the RTMPose +
   angle-threshold counting logic and its declarative `exercises.json` config
   as the seed of RWF's rep-verification layer. The only active, permissively
   licensed camera rep counter found. Rep verification is our hardest problem;
   this de-risks it materially.
2. **Study openGym as a white-paper, not a codebase (AGPL)** — its exercise
   taxonomy, progression/1RM/RPE schema, and its radical simplicity (Node
   backend with 2 deps, JSON storage) prove a full-featured fitness PWA needs
   almost no backend. Don't copy code or media.
3. **Borrow group-session mechanics from dmateusp/opengym + multi-user
   self-hosting patterns from workout-tracker (both MIT)** — group membership,
   session lifecycle, family-scale deployment. The competition layer (our IP)
   is greenfield.

**Bottom line:** nothing on GitHub does what RWF does. The one directly
reusable asset is Good-GYM's MIT rep counter; the one trap is openGym's AGPL
licence.
