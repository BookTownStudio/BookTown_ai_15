
export const TOKENS = {
  layout: {
    container: "container mx-auto px-4 md:px-6 max-w-7xl",
    section: "py-8 md:py-12 space-y-6",
  },
  surface: {
    // Standardized on slate scale for neutral surfaces
    card: "bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-sm",
    panel: "bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800",
  },
  text: {
    heading: "font-bold tracking-tight text-slate-900 dark:text-white",
    subheading: "font-semibold text-slate-800 dark:text-slate-100",
    body: "text-base text-slate-600 dark:text-slate-300 leading-relaxed",
    muted: "text-sm text-slate-500 dark:text-slate-400",
  },
  action: {
    // Relying on 'primary' and 'accent' from tailwind.config.js (available in both CDN and build)
    primary: "bg-primary text-white hover:bg-primary/90 shadow-sm",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700",
    ghost: "bg-transparent text-primary dark:text-accent hover:bg-primary/10 dark:hover:bg-accent/10",
    icon: "bg-transparent hover:bg-white/10 text-current transition-colors",
  }
};
