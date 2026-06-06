import { motion } from 'framer-motion';
import robotClient from '../../services/RobotClient.js';
import { vibrate } from '../../services/feedback.js';

export function EmergencyStop({ disabled }) {
  const onClick = () => {
    vibrate([20, 30, 20]);
    robotClient.emergencyStop();
  };
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      className="w-full rounded-2xl bg-danger text-white font-bold tracking-widest py-4 shadow-card disabled:opacity-40"
      aria-label="Emergency stop"
    >
      ⛔ EMERGENCY STOP
    </motion.button>
  );
}
export default EmergencyStop;
