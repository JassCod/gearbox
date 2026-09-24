/** A short burst of confetti – used when a job, NCR or audit is closed out. */
export function celebrate(message?: string) {
  if (typeof document === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  const colors = ['#14b8a6', '#f59e0b', '#6366f1', '#ef4444', '#22c55e', '#ec4899'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--x', `${(Math.random() - 0.5) * 900}px`);
    p.style.setProperty('--y', `${-200 - Math.random() * 420}px`);
    p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    p.style.setProperty('--d', `${900 + Math.random() * 700}ms`);
    p.style.background = colors[i % colors.length];
    p.style.left = `${45 + Math.random() * 10}%`;
    layer.appendChild(p);
  }
  if (message) {
    const toast = document.createElement('div');
    toast.className = 'celebrate-toast';
    toast.textContent = message;
    layer.appendChild(toast);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2200);
}
