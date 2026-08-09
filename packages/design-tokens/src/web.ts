/* Generated from ../tokens.json. Run pnpm generate; do not edit directly. */
export const webTokens = {
  "color": {
    "background": "var(--sm-color-background)",
    "foreground": "var(--sm-color-foreground)",
    "card": "var(--sm-color-card)",
    "cardForeground": "var(--sm-color-card-foreground)",
    "popover": "var(--sm-color-popover)",
    "popoverForeground": "var(--sm-color-popover-foreground)",
    "primary": "var(--sm-color-primary)",
    "primaryHover": "var(--sm-color-primary-hover)",
    "primaryForeground": "var(--sm-color-primary-foreground)",
    "secondary": "var(--sm-color-secondary)",
    "secondaryForeground": "var(--sm-color-secondary-foreground)",
    "muted": "var(--sm-color-muted)",
    "mutedForeground": "var(--sm-color-muted-foreground)",
    "accent": "var(--sm-color-accent)",
    "accentForeground": "var(--sm-color-accent-foreground)",
    "border": "var(--sm-color-border)",
    "input": "var(--sm-color-input)",
    "focus": "var(--sm-color-focus)",
    "danger": "var(--sm-color-danger)",
    "dangerForeground": "var(--sm-color-danger-foreground)",
    "dangerMuted": "var(--sm-color-danger-muted)",
    "success": "var(--sm-color-success)",
    "successForeground": "var(--sm-color-success-foreground)",
    "successMuted": "var(--sm-color-success-muted)",
    "warning": "var(--sm-color-warning)",
    "warningForeground": "var(--sm-color-warning-foreground)",
    "warningMuted": "var(--sm-color-warning-muted)",
    "info": "var(--sm-color-info)",
    "infoForeground": "var(--sm-color-info-foreground)",
    "infoMuted": "var(--sm-color-info-muted)",
    "chart1": "var(--sm-color-chart1)",
    "chart2": "var(--sm-color-chart2)",
    "chart3": "var(--sm-color-chart3)",
    "chart4": "var(--sm-color-chart4)",
    "chart5": "var(--sm-color-chart5)"
  },
  "fontFamily": {
    "sans": "var(--sm-font-family-sans)",
    "mono": "var(--sm-font-family-mono)"
  },
  "fontSize": {
    "xs": "var(--sm-font-size-xs)",
    "sm": "var(--sm-font-size-sm)",
    "md": "var(--sm-font-size-md)",
    "lg": "var(--sm-font-size-lg)",
    "xl": "var(--sm-font-size-xl)",
    "2xl": "var(--sm-font-size-2xl)",
    "3xl": "var(--sm-font-size-3xl)"
  },
  "space": {
    "0": "var(--sm-space-0)",
    "1": "var(--sm-space-1)",
    "2": "var(--sm-space-2)",
    "3": "var(--sm-space-3)",
    "4": "var(--sm-space-4)",
    "5": "var(--sm-space-5)",
    "6": "var(--sm-space-6)",
    "8": "var(--sm-space-8)",
    "10": "var(--sm-space-10)",
    "12": "var(--sm-space-12)"
  },
  "radius": {
    "sm": "var(--sm-radius-sm)",
    "md": "var(--sm-radius-md)",
    "lg": "var(--sm-radius-lg)",
    "xl": "var(--sm-radius-xl)",
    "full": "var(--sm-radius-full)"
  },
  "elevation": {
    "sm": "var(--sm-elevation-sm)",
    "md": "var(--sm-elevation-md)",
    "lg": "var(--sm-elevation-lg)"
  },
  "motion": {
    "fast": "var(--sm-motion-fast)",
    "normal": "var(--sm-motion-normal)",
    "slow": "var(--sm-motion-slow)"
  },
  "breakpoint": {
    "sm": "var(--sm-breakpoint-sm)",
    "md": "var(--sm-breakpoint-md)",
    "lg": "var(--sm-breakpoint-lg)",
    "xl": "var(--sm-breakpoint-xl)"
  },
  "zIndex": {
    "base": "var(--sm-z-index-base)",
    "dropdown": "var(--sm-z-index-dropdown)",
    "sticky": "var(--sm-z-index-sticky)",
    "overlay": "var(--sm-z-index-overlay)",
    "modal": "var(--sm-z-index-modal)",
    "toast": "var(--sm-z-index-toast)"
  },
  "density": {
    "controlCompact": "var(--sm-density-control-compact)",
    "controlDefault": "var(--sm-density-control-default)",
    "controlComfortable": "var(--sm-density-control-comfortable)",
    "touchTarget": "var(--sm-density-touch-target)"
  }
} as const;

export type WebTokenGroup = keyof typeof webTokens;
export type WebColorToken = keyof typeof webTokens.color;
