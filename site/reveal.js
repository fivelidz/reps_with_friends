// RWF site — scroll reveals via IntersectionObserver (.reveal lives in tokens.css).
export function initReveals() {
  const els = [...document.querySelectorAll('.reveal')];
  if (!els.length) return;

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
