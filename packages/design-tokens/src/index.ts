export { nativeThemes, nativeTokens } from "./native";
export type { NativeTheme, NativeThemeName } from "./native";
export { webTokens } from "./web";
export type { WebColorToken, WebTokenGroup } from "./web";

export type TenantBrandStyle = Readonly<{
  "--sm-tenant-brand-primary-hsl": string;
  "--sm-tenant-brand-primary-hover-hsl": string;
}>;

export type TenantBrand = Readonly<{
  hex: string;
  hoverHex: string;
  hsl: string;
  hoverHsl: string;
}>;

const HEX_COLOR = /^#?([\da-f]{6})$/i;

function hexToRgb(hex: string): [number, number, number] | null {
  const match = hex.match(HEX_COLOR);
  if (!match) return null;
  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbToHsl([red, green, blue]: [number, number, number]): string {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
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
}

function rgbToHex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function createTenantBrand(hex: string): TenantBrand | null {
  const rgb = hexToRgb(hex.trim());
  if (!rgb) return null;

  const contrastWithWhite = 1.05 / (relativeLuminance(rgb) + 0.05);
  if (contrastWithWhite < 4.5) return null;

  const hoverRgb = rgb.map((channel) => Math.max(0, Math.round(channel * 0.82))) as [number, number, number];
  return {
    hex: rgbToHex(rgb),
    hoverHex: rgbToHex(hoverRgb),
    hsl: rgbToHsl(rgb),
    hoverHsl: rgbToHsl(hoverRgb),
  };
}

/**
 * Returns a safe tenant accent override, or null when the value is malformed or
 * cannot meet WCAG AA contrast against white button text. Semantic status and
 * focus colors are intentionally not tenant-overridable.
 */
export function createTenantBrandStyle(hex: string): TenantBrandStyle | null {
  const brand = createTenantBrand(hex);
  if (!brand) return null;

  return {
    "--sm-tenant-brand-primary-hsl": brand.hsl,
    "--sm-tenant-brand-primary-hover-hsl": brand.hoverHsl,
  };
}
