import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Magnet from './reactbits/Magnet';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'muse' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  cursor?: string;
}

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40';

const variants: Record<Variant, string> = {
  // the main action is white light: the brightest thing on screen is what you press (20.1:1)
  primary: 'bg-light text-black hover:bg-white hover:shadow-[0_0_0_6px_rgba(139,112,236,0.18),0_0_40px_rgba(139,112,236,0.45)]',
  secondary: 'border border-hairline-strong bg-white/[0.04] text-mist hover:border-text-4 hover:bg-white/[0.08]',
  tertiary: 'text-text-2 hover:bg-white/[0.06] hover:text-mist',
  // filled violet only for Muse actions (white label on #7358CC, 5.25:1)
  muse: 'bg-violet-600 text-white hover:bg-violet-700 hover:shadow-[0_0_32px_rgba(139,112,236,0.45)]',
  danger: 'border border-red-500/50 text-red-400 hover:bg-red-500/10',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-[15px]',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, children, className = '', cursor, ...rest },
  ref,
) {
  return (
    <button ref={ref} data-cursor={cursor} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="h-4 w-4 animate-[aether-spin_0.9s_linear_infinite] rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

/** A button that is pulled toward the cursor within ~80px (magnetic spring 170 / 18). */
export function MagneticButton(props: ButtonProps & { strength?: number }) {
  const { strength = 3, ...rest } = props;
  return (
    <Magnet padding={80} magnetStrength={strength} maxOffset={14} spring={{ stiffness: 170, damping: 18, mass: 1 }} wrapperClassName="inline-block">
      <Button {...rest} />
    </Magnet>
  );
}
