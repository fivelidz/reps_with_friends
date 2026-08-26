// RWF site — interactive handicap demo.
// Math ported verbatim from packages/game-core/src/handicap.ts (v1 tier
// multipliers). v1: tier only; v2 (Phase 3) blends measured %HRR — not shown here.

const TIER_MULTIPLIERS = { couch: 1.5, casual: 1.25, fit: 1.0, athlete: 0.85 };

const TIERS = [
  { id: 'couch', label: 'Couch', mult: 1.5, blurb: 'New to it, or restarting. Every rep counts extra.' },
  { id: 'casual', label: 'Casual', mult: 1.25, blurb: 'Moves sometimes. Reps count a little extra.' },
  { id: 'fit', label: 'Fit', mult: 1.0, blurb: 'Trained and consistent. Reps count as-is.' },
  { id: 'athlete', label: 'Athlete', mult: 0.85, blurb: 'This is your sport. Reps count slightly less.' },
];

/** Adjusted (handicapped) score — same rounding as the API (1 decimal). */
function adjustedScore(reps, tierId) {
  return Math.round(reps * TIER_MULTIPLIERS[tierId] * 10) / 10;
}

export function initHandicap() {
  const slider = document.getElementById('tierSlider');
  const repsInput = document.getElementById('repsInput');
  const blurb = document.getElementById('tierBlurb');
  const multOut = document.getElementById('multOut');
  const scoreOut = document.getElementById('scoreOut');
  const rawBar = document.getElementById('rawBar');
  const adjBar = document.getElementById('adjBar');
  const rawVal = document.getElementById('rawVal');
  const adjVal = document.getElementById('adjVal');
  const scale = document.getElementById('tierScale');
  if (!slider || !repsInput || !scoreOut) return; // markup missing — bail quietly

  const scaleCells = scale ? [...scale.querySelectorAll('span')] : [];

  function render() {
    const tier = TIERS[Number(slider.value)] || TIERS[0];
    const raw = Math.max(0, Math.min(2000, Math.round(Number(repsInput.value) || 0)));
    const adjusted = adjustedScore(raw, tier.id);

    if (blurb) blurb.textContent = tier.blurb;
    if (multOut) multOut.textContent = `× ${tier.mult.toFixed(2)}`;
    scoreOut.textContent = String(adjusted);
    if (rawVal) rawVal.textContent = String(raw);
    if (adjVal) adjVal.textContent = String(adjusted);

    const max = Math.max(raw, adjusted, 1);
    if (rawBar) rawBar.style.width = `${(raw / max) * 100}%`;
    if (adjBar) adjBar.style.width = `${(adjusted / max) * 100}%`;

    for (const cell of scaleCells) {
      cell.classList.toggle('active', cell.dataset.tier === tier.id);
    }
  }

  slider.addEventListener('input', render);
  repsInput.addEventListener('input', render);
  render();
}
