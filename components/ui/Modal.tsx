
import React from "react";
import { XIcon } from "../icons/XIcon.tsx";
import { cn } from "../../lib/utils.ts";
import { motion, AnimatePresence } from "framer-motion";
import { modalContentVariants, modalOverlayVariants } from "../../lib/motion.ts";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
        {isOpen && (
            <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            aria-labelledby="modal-title"
            role="dialog"
            aria-modal="true"
            >
            <motion.div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={modalOverlayVariants}
                onClick={onClose}
            />

            <motion.div
                className={cn(
                "relative z-10 w-full max-w-lg rounded-card bg-gray-100/90 dark:bg-slate-800/90 p-6 shadow-2xl shadow-black/50",
                "border border-black/5 dark:border-white/10"
                )}
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={modalContentVariants}
            >
                <div className="absolute top-3 right-3">
                <button
                    onClick={onClose}
                    className="inline-flex items-center justify-center rounded-full p-1 text-primary dark:text-accent hover:bg-primary/10 dark:hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-accent"
                    aria-label="Close"
                >
                    <XIcon className="h-6 w-6" />
                </button>
                </div>
                {children}
            </motion.div>
            </div>
        )}
    </AnimatePresence>
  );
};

export default Modal;
