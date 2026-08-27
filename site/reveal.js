// RWF site — scroll reveals via IntersectionObserver (.reveal lives in tokens.css).
// Children stagger 60ms apart: within each section, the Nth .reveal gets an
// N*60ms transition-delay (overrides the inline delays in the markup).
export function initReveals() {
  const els = [...document.querySelectorAll('.reveal')];
  if (!els.length) return;

  // stagger pass — group by ancestor section/header/footer, index within group
  const groups = new Map();
  for (const el of els) {
    const section = el.closest('section, header, footer') ?? document.body;
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(el);
  }
  for (const group of groups.values()) {
    group.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i, 8) * 60}ms`;
    });
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    for (const el of els) el.classList.add('in');
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  for (const el of els) io.observe(el);
}
