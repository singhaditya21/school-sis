/* Generated from ../tokens.json. Run pnpm generate; do not edit directly. */
export const nativeTokens = {
  "color": {
    "white": "#ffffff",
    "slate50": "#f8fafc",
    "slate100": "#f1f5f9",
    "slate200": "#e2e8f0",
    "slate300": "#cbd5e1",
    "slate400": "#94a3b8",
    "slate500": "#64748b",
    "slate600": "#475569",
    "slate700": "#334155",
    "slate800": "#1e293b",
    "slate900": "#0f172a",
    "slate950": "#020617",
    "indigo50": "#eef2ff",
    "indigo200": "#c7d2fe",
    "indigo500": "#6366f1",
    "indigo600": "#4f46e5",
    "indigo700": "#4338ca",
    "blue50": "#eff6ff",
    "blue600": "#2563eb",
    "blue800": "#1e40af",
    "emerald50": "#ecfdf5",
    "emerald600": "#059669",
    "emerald700": "#047857",
    "emerald800": "#065f46",
    "amber50": "#fffbeb",
    "amber700": "#b45309",
    "amber900": "#78350f",
    "red50": "#fef2f2",
    "red600": "#dc2626",
    "red800": "#991b1b",
    "violet500": "#8b5cf6",
    "cyan600": "#0891b2",
    "pink600": "#db2777"
  },
  "fontFamily": {
    "sans": "Inter",
    "mono": "Geist Mono"
  },
  "fontSize": {
    "xs": 12,
    "sm": 14,
    "md": 16,
    "lg": 18,
    "xl": 20,
    "2xl": 24,
    "3xl": 30
  },
  "space": {
    "0": "0",
    "1": 4,
    "2": 8,
    "3": 12,
    "4": 16,
    "5": 20,
    "6": 24,
    "8": 32,
    "10": 40,
    "12": 48
  },
  "radius": {
    "sm": 6,
    "md": 8,
    "lg": 12,
    "xl": 16,
    "full": 9999
  },
  "elevation": {
    "sm": "0 1px 2px rgb(15 23 42 / 0.08)",
    "md": "0 4px 12px rgb(15 23 42 / 0.10)",
    "lg": "0 12px 28px rgb(15 23 42 / 0.14)"
  },
  "motion": {
    "fast": 120,
    "normal": 200,
    "slow": 320
  },
  "breakpoint": {
    "sm": 640,
    "md": 768,
    "lg": 1024,
    "xl": 1280
  },
  "zIndex": {
    "base": 0,
    "dropdown": 1000,
    "sticky": 1100,
    "overlay": 1200,
    "modal": 1300,
    "toast": 1400
  },
  "density": {
    "controlCompact": 32,
    "controlDefault": 40,
    "controlComfortable": 44,
    "touchTarget": 44
  }
} as const;

export const nativeThemes = {
  "light": {
    "background": "#ffffff",
    "foreground": "#020617",
    "card": "#ffffff",
    "cardForeground": "#020617",
    "popover": "#ffffff",
    "popoverForeground": "#020617",
    "primary": "#4f46e5",
    "primaryHover": "#4338ca",
    "primaryForeground": "#ffffff",
    "secondary": "#f1f5f9",
    "secondaryForeground": "#0f172a",
    "muted": "#f1f5f9",
    "mutedForeground": "#475569",
    "accent": "#eef2ff",
    "accentForeground": "#4338ca",
    "border": "#e2e8f0",
    "input": "#cbd5e1",
    "focus": "#4f46e5",
    "danger": "#dc2626",
    "dangerForeground": "#ffffff",
    "dangerMuted": "#fef2f2",
    "success": "#047857",
    "successForeground": "#ffffff",
    "successMuted": "#ecfdf5",
    "warning": "#b45309",
    "warningForeground": "#ffffff",
    "warningMuted": "#fffbeb",
    "info": "#2563eb",
    "infoForeground": "#ffffff",
    "infoMuted": "#eff6ff",
    "chart1": "#4f46e5",
    "chart2": "#059669",
    "chart3": "#0891b2",
    "chart4": "#8b5cf6",
    "chart5": "#db2777"
  },
  "dark": {
    "background": "#020617",
    "foreground": "#f8fafc",
    "card": "#0f172a",
    "cardForeground": "#f8fafc",
    "popover": "#0f172a",
    "popoverForeground": "#f8fafc",
    "primary": "#4f46e5",
    "primaryHover": "#4338ca",
    "primaryForeground": "#ffffff",
    "secondary": "#1e293b",
    "secondaryForeground": "#f8fafc",
    "muted": "#1e293b",
    "mutedForeground": "#94a3b8",
    "accent": "#1e293b",
    "accentForeground": "#c7d2fe",
    "border": "#334155",
    "input": "#334155",
    "focus": "#6366f1",
    "danger": "#dc2626",
    "dangerForeground": "#ffffff",
    "dangerMuted": "#991b1b",
    "success": "#047857",
    "successForeground": "#ffffff",
    "successMuted": "#065f46",
    "warning": "#b45309",
    "warningForeground": "#ffffff",
    "warningMuted": "#78350f",
    "info": "#2563eb",
    "infoForeground": "#ffffff",
    "infoMuted": "#1e40af",
    "chart1": "#6366f1",
    "chart2": "#059669",
    "chart3": "#0891b2",
    "chart4": "#8b5cf6",
    "chart5": "#db2777"
  }
} as const;

export type NativeThemeName = keyof typeof nativeThemes;
export type NativeThemeToken = keyof typeof nativeThemes.light;
export type NativeTheme = Readonly<Record<NativeThemeToken, string>>;
