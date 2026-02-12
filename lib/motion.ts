
import { Variants } from 'framer-motion';

// --- Page Transitions ---
export const pageVariants: Variants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2, ease: "easeIn" } }
};

// --- Container Staggering ---
export const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.1
        }
    }
};

// --- List Items ---
export const listItemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

// --- Micro-interactions ---
export const tapScale = 0.96;
export const hoverScale = 1.02;

export const buttonMotion = {
    whileTap: { scale: tapScale },
    whileHover: { scale: hoverScale, transition: { duration: 0.2 } }
};

export const cardMotion = {
    whileTap: { scale: 0.98 },
    whileHover: { y: -4, transition: { duration: 0.2 } },
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3 }
};

// --- Modal / Overlays ---
export const modalOverlayVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
};

export const modalContentVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", damping: 25, stiffness: 300 } },
    exit: { opacity: 0, scale: 0.95, y: 20 }
};

export const drawerVariants: Variants = {
    hidden: (isRTL: boolean) => ({ x: isRTL ? '100%' : '-100%' }),
    visible: { x: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
    exit: (isRTL: boolean) => ({ x: isRTL ? '100%' : '-100%', transition: { duration: 0.2 } })
};
    