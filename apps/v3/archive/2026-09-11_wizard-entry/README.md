# ARCHIVED 2026-09-11 — the wizard entry (setup → create → draft)

Founder feedback after first real play: "a million clicks just to make a team —
less clicks to buy a car." The entry was rebuilt as the 3-click path:

    type your name → tap a tier → tap START THE BATTLE → you are ON the course

with everything else auto-set (target 200 · every day active · bodyweight pack ·
weekly season · giving OFF · power-ups auto-dealt) and a ⚙︎ HOUSE RULES sheet on
the course for changing it all later.

- `app_wizard.js` — app.js as of commit 17e00ea (setup/create screens + the
  draft-over-course entry, verbatim).
- `v3_pre_ux2.css` — the stylesheet as shipped with the wizard.

Nothing in the archive is loaded by index.html. The draft-from-3 sheet and the
setup/create VIEW CODE were preserved inside the live app.js where still used
(draft = power-up auto-deal OFF; setup/create routes redirect to #/play).
