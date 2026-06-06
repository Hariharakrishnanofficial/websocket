import { AnimatePresence, motion } from 'framer-motion';
import { useControllerStore } from '../../stores/controllerStore.js';
import { CMD_LABEL } from '../../services/protocol.js';

export function ActiveCommandBadge() {
  const cmd = useControllerStore((s) => s.activeCmd);
  return (
    <div className="h-6 flex items-center justify-center">
      <AnimatePresence mode="wait">
        {cmd ? (
          <motion.span
            key={cmd}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.08 }}
            className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-mono"
          >
            ● {CMD_LABEL[cmd]}
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-muted font-mono"
          >
            idle
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
export default ActiveCommandBadge;
