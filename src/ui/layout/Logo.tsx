/**
 * The family wordmark shared with azamatos.com and pass.azamatos.com: a shell prompt with the site's name.
 * The cursor blinks at pass.azamatos.com's pace for the first 4.4 s, then stays solid (WCAG 2.2.2 allows up to 5 s;
 * the owner chose this on 2026-10-20), and doesn't blink at all with reduced motion.
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-[0.3em] font-mono text-lg whitespace-nowrap select-none">
      <span aria-hidden="true" className="text-accent">
        ➜
      </span>
      <span aria-hidden="true" className="text-prompt">
        ~
      </span>
      <span className="text-fg">
        rebuffer.azamatos<span className="sr-only">, home</span>
      </span>
      <span aria-hidden="true" className="animate-cursor text-fg motion-reduce:animate-none">
        ▊
      </span>
    </span>
  );
}
