import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(packageRoot, "tokens.json");
const cssPath = resolve(packageRoot, "src/tokens.css");
const nativePath = resolve(packageRoot, "src/native.ts");
const webPath = resolve(packageRoot, "src/web.ts");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const tokenAt = (path) => {
  const token = path.split(".").reduce((value, key) => value?.[key], source);
  if (!token || !("$value" in token)) {
    throw new Error(`Unknown token reference: ${path}`);
  }
  return token;
};

const resolveValue = (value, seen = new Set()) => {
  if (typeof value !== "string") return value;
  const reference = value.match(/^\{(.+)\}$/)?.[1];
  if (!reference) return value;
  if (seen.has(reference)) throw new Error(`Circular token reference: ${reference}`);
  return resolveValue(tokenAt(reference).$value, new Set([...seen, reference]));
};

const valuesOf = (group) => Object.fromEntries(
  Object.entries(group)
    .filter(([key]) => !key.startsWith("$"))
    .map(([key, token]) => [key, resolveValue(token.$value)]),
);

const kebab = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const hexToHsl = (hex) => {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    if (max === g) hue = 60 * ((b - r) / delta + 2);
    if (max === b) hue = 60 * ((r - g) / delta + 4);
  }

  if (hue < 0) hue += 360;
  return `${Number(hue.toFixed(1))} ${Number((saturation * 100).toFixed(1))}% ${Number((lightness * 100).toFixed(1))}%`;
};

const primitiveGroups = Object.fromEntries(
  Object.entries(source.primitive).map(([groupName, group]) => [groupName, valuesOf(group)]),
);
const themes = {
  light: valuesOf(source.semantic.light),
  dark: valuesOf(source.semantic.dark),
};

const compatibilityNames = {
  background: "background",
  foreground: "foreground",
  card: "card",
  cardForeground: "card-foreground",
  popover: "popover",
  popoverForeground: "popover-foreground",
  primary: "primary",
  primaryForeground: "primary-foreground",
  secondary: "secondary",
  secondaryForeground: "secondary-foreground",
  muted: "muted",
  mutedForeground: "muted-foreground",
  accent: "accent",
  accentForeground: "accent-foreground",
  border: "border",
  input: "input",
  focus: "ring",
  danger: "destructive",
  dangerForeground: "destructive-foreground",
  chart1: "chart-1",
  chart2: "chart-2",
  chart3: "chart-3",
  chart4: "chart-4",
  chart5: "chart-5",
};

const primitiveCss = Object.entries(primitiveGroups)
  .filter(([group]) => group !== "color")
  .flatMap(([group, values]) => Object.entries(values).map(
    ([name, value]) => `  --sm-${kebab(group)}-${kebab(name)}: ${value};`,
  ));

const themeCss = (name) => {
  const selector = name === "light"
    ? ":root, [data-theme=\"light\"]"
    : ".dark, [data-theme=\"dark\"]";
  const lines = [`${selector} {`, `  color-scheme: ${name};`];

  for (const [tokenName, hex] of Object.entries(themes[name])) {
    const channels = hexToHsl(hex);
    if (tokenName === "primary") {
      lines.push(`  --primary: var(--sm-tenant-brand-primary-hsl, ${channels});`);
      lines.push("  --sm-color-primary: hsl(var(--primary));");
    } else if (tokenName === "primaryHover") {
      lines.push(`  --sm-color-primary-hover: hsl(var(--sm-tenant-brand-primary-hover-hsl, ${channels}));`);
    } else {
      lines.push(`  --sm-color-${kebab(tokenName)}: hsl(${channels});`);
    }

    const compatibilityName = compatibilityNames[tokenName];
    if (compatibilityName && tokenName !== "primary") {
      lines.push(`  --${compatibilityName}: ${channels};`);
    }
  }

  lines.push("}");
  return lines.join("\n");
};

const css = `/* Generated from ../tokens.json. Run pnpm generate; do not edit directly. */
:root {
${primitiveCss.join("\n")}
  --radius: var(--sm-radius-md);
}

${themeCss("light")}

${themeCss("dark")}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

const remToNumber = (value) => {
  if (typeof value !== "string") return value;
  if (value.endsWith("rem")) return Number.parseFloat(value) * 16;
  if (value.endsWith("px")) return Number.parseFloat(value);
  if (value.endsWith("ms")) return Number.parseFloat(value);
  return value;
};

const nativePrimitives = Object.fromEntries(
  Object.entries(primitiveGroups).map(([group, values]) => [
    group,
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, remToNumber(value)])),
  ]),
);
nativePrimitives.fontFamily = { sans: "Inter", mono: "Geist Mono" };

const native = `/* Generated from ../tokens.json. Run pnpm generate; do not edit directly. */
export const nativeTokens = ${JSON.stringify(nativePrimitives, null, 2)} as const;

export const nativeThemes = ${JSON.stringify(themes, null, 2)} as const;

export type NativeThemeName = keyof typeof nativeThemes;
export type NativeThemeToken = keyof typeof nativeThemes.light;
export type NativeTheme = Readonly<Record<NativeThemeToken, string>>;
`;

const webTokenGroups = {
  color: Object.fromEntries(
    Object.keys(themes.light).map((tokenName) => [tokenName, `var(--sm-color-${kebab(tokenName)})`]),
  ),
  ...Object.fromEntries(
    Object.entries(primitiveGroups)
      .filter(([group]) => group !== "color")
      .map(([group, values]) => [
        group,
        Object.fromEntries(
          Object.keys(values).map((tokenName) => [tokenName, `var(--sm-${kebab(group)}-${kebab(tokenName)})`]),
        ),
      ]),
  ),
};

const web = `/* Generated from ../tokens.json. Run pnpm generate; do not edit directly. */
export const webTokens = ${JSON.stringify(webTokenGroups, null, 2)} as const;

export type WebTokenGroup = keyof typeof webTokens;
export type WebColorToken = keyof typeof webTokens.color;
`;

const outputs = [[cssPath, css], [nativePath, native], [webPath, web]];
const checkOnly = process.argv.includes("--check");

for (const [path, expected] of outputs) {
  if (checkOnly) {
    const actual = await readFile(path, "utf8").catch(() => "");
    if (actual !== expected) {
      console.error(`${path} is stale. Run pnpm --filter @school-sis/design-tokens generate.`);
      process.exitCode = 1;
    }
  } else {
    await writeFile(path, expected);
  }
}
