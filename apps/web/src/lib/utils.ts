import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatting lives in `@/lib/format` — one currency module, one date module,
 * one number module. These two names are re-exported here because ~30 files
 * already import them from `@/lib/utils`; both import paths resolve to the
 * same implementation, so there is no second definition to drift.
 *
 * New code should import from `@/lib/format` directly, which also gives you
 * formatCurrencyPrecise, formatCompactCurrency, formatDateTime, formatTime,
 * formatNumber and formatPercent.
 */
export {
  formatCurrency,
  formatCurrencyPrecise,
  formatCompactCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "@/lib/format"
