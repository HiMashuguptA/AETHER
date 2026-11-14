import { CheckCircle, Sparkle, Info, WarningCircle, X } from '@phosphor-icons/react';
import { useApp } from '../../data/store';

/** Calm, specific system messages. No exclamation marks. */
export default function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[95] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 md:bottom-6" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="glass-strong elev-3 pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 animate-rise">
          <span className="mt-0.5">
            {t.tone === 'success' ? <CheckCircle size={18} className="text-green-500" weight="fill" /> : t.tone === 'muse' ? <Sparkle size={18} className="text-violet-400" weight="fill" /> : t.tone === 'error' ? <WarningCircle size={18} className="text-red-400" weight="fill" /> : <Info size={18} className="text-text-3" weight="fill" />}
          </span>
          <p className="flex-1 text-sm leading-5 text-mist">{t.text}</p>
          {t.action ? <button className="text-sm font-medium text-violet-300 hover:text-violet-200" onClick={t.action.run}>{t.action.label}</button> : null}
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-text-3 hover:text-mist"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
