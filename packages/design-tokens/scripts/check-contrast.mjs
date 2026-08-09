import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await readFile(resolve(packageRoot, "tokens.json"), "utf8"));

const tokenAt = (path) => path.split(".").reduce((value, key) => value?.[key], source);
const resolveValue = (value, seen = new Set()) => {
  const reference = typeof value === "string" ? value.match(/^\{(.+)\}$/)?.[1] : undefined;
  if (!reference) return value;
  if (seen.has(reference)) throw new Error(`Circular token reference: ${reference}`);
  const token = tokenAt(reference);
  if (!token || !("$value" in token)) throw new Error(`Unknown token reference: ${reference}`);
  return resolveValue(token.$value, new Set([...seen, reference]));
};

const rgb = (hex) => {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
};

const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (left, right) => {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

const textPairs = [
  ["background", "foreground"],
  ["card", "cardForeground"],
  ["popover", "popoverForeground"],
  ["primary", "primaryForeground"],
  ["primaryHover", "primaryForeground"],
  ["secondary", "secondaryForeground"],
  ["muted", "mutedForeground"],
  ["accent", "accentForeground"],
  ["danger", "dangerForeground"],
  ["success", "successForeground"],
  ["warning", "warningForeground"],
  ["info", "infoForeground"],
];

const failures = [];
for (const themeName of ["light", "dark"]) {
  const theme = source.semantic[themeName];
  for (const [backgroundName, foregroundName] of textPairs) {
    const background = resolveValue(theme[backgroundName].$value);
    const foreground = resolveValue(theme[foregroundName].$value);
    const ratio = contrast(background, foreground);
    if (ratio < 4.5) {
      failures.push(`${themeName}.${foregroundName} on ${backgroundName}: ${ratio.toFixed(2)}:1`);
    }
  }

  const focus = resolveValue(theme.focus.$value);
  const background = resolveValue(theme.background.$value);
  const focusRatio = contrast(focus, background);
  if (focusRatio < 3) failures.push(`${themeName}.focus on background: ${focusRatio.toFixed(2)}:1`);
}

if (failures.length > 0) {
  console.error("Design token contrast checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Design token contrast checks passed for light and dark semantic pairs.");
