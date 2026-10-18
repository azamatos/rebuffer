/**
 * The family wordmark shared with azamatos.com and pass.azamatos.com: a shell prompt with the site's name.
 * The cursor blinks four times and then stays solid (WCAG 2.2.2), and not at all with reduced motion.
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-[0.25em] font-mono text-xl whitespace-nowrap select-none sm:text-[22px]">
      <span aria-hidden="true" className="text-accent">
        ➜
      </span>
      <span aria-hidden="true" className="text-[#5bc8c0]">
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
