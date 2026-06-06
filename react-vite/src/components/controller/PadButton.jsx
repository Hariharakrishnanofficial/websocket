import { motion } from 'framer-motion';
import { useHoldButton } from '@shared/hooks';
import { useControllerStore } from '../../stores/controllerStore.js';
import { CMD_LABEL } from '../../services/protocol.js';

/**
 * PadButton — a hold-to-move tile. Uses pointer capture under the hood.
 * Variants control grid placement + colors.
 */
export function PadButton({ cmd, glyph, variant, disabled, className = '' }) {
  const handlers = useHoldButton(cmd);
  const isActive = useControllerStore((s) => s.activeCmd === cmd);

  const base =
    'no-tap relative select-none touch-none flex items-center justify-center ' +
    'rounded-2xl border border-border text-text font-semibold text-2xl ' +
    'transition-colors duration-100 ease-out shadow-card';

  const variants = {
    dir:  'bg-surface-2 active:bg-accent active:text-black',
    stop: 'bg-[#3a1f24] text-text active:bg-danger',
  };

  const activeStyles = isActive
    ? (variant === 'stop' ? 'bg-danger text-white' : 'bg-accent text-black')
    : '';

  return (
    <motion.button
      type="button"
      disabled={disabled}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      aria-label={CMD_LABEL[cmd]}
      aria-pressed={isActive}
      className={`${base} ${variants[variant] || variants.dir} ${activeStyles} ${
        disabled ? 'opacity-40' : ''
      } ${className}`}
      {...handlers}
    >
      <span className="pointer-events-none">{glyph}</span>
    </motion.button>
  );
}

export default PadButton;
