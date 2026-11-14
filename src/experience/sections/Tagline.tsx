import { useRef } from 'react';
import { useChapter } from '../useChapter';

const LINES = ['Every universe begins', 'with a spark', 'AETHER is where', 'yours takes shape'];

/**
 * The tagline reveal (mandatory in the landing-page skill). Each word turns from 30% to full as
 * the scroll crosses it, in reading order. Reduced motion shows it complete.
 */
export default function Tagline() {
  const section = useRef<HTMLElement>(null);
  const words = useRef<HTMLSpanElement[]>([]);
  const total = LINES.join(' ').split(' ').length;

  useChapter(section, 'tagline', {
    onUpdate: (p) => {
      const reduced = document.documentElement.classList.contains('motion-off');
      const lit = reduced ? total : Math.floor(((p - 0.08) / 0.62) * total);
      words.current.forEach((w, i) => {
        if (!w) return;
        w.style.opacity = i < lit ? '1' : '0.3';
        w.style.filter = i < lit ? 'none' : 'blur(0.5px)';
      });
    },
  });

  let k = 0;
  return (
    <section ref={section} className="relative h-[230vh]" aria-label="Every universe begins with a spark. AETHER is where yours takes shape.">
      <div className="sticky top-0 flex h-[100svh] items-center justify-center px-6">
        <h2 className="display-2 max-w-[1100px] text-center text-mist [text-shadow:0_2px_40px_rgba(0,0,0,0.65)]" aria-hidden="true">
          {LINES.map((line, li) => (
            <span key={li} className={`block ${li >= 2 ? 'text-text-2' : ''}`}>
              {line.split(' ').map((w) => {
                const idx = k++;
                return (
                  <span
                    key={idx}
                    ref={(el) => { if (el) words.current[idx] = el; }}
                    className="inline-block opacity-30 transition-[opacity,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  >
                    {w}&nbsp;
                  </span>
                );
              })}
            </span>
          ))}
        </h2>
      </div>
    </section>
  );
}
