import { readdirSync, readFileSync } from 'node:fs';

export const ICON_VENDORS = ['aws', 'azure', 'gcp', 'k8s'] as const;
type Vendor = (typeof ICON_VENDORS)[number];

const root = new URL('../assets/icons/', import.meta.url);
const names = new Map<Vendor, readonly string[]>();
const svgs = new Map<string, string>();

export const isVendor = (vendor: string): vendor is Vendor => ICON_VENDORS.some((v) => v === vendor);

export function iconNames(vendor: Vendor): readonly string[] {
  const known = names.get(vendor);
  if (known) return known;
  const found = readdirSync(new URL(`${vendor}/`, root))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4))
    .sort();
  names.set(vendor, found);
  return found;
}

export function iconSvg(icon: string): string {
  const known = svgs.get(icon);
  if (known) return known;
  const [vendor, name] = icon.split('.');
  const svg = readFileSync(new URL(`${vendor}/${name}.svg`, root), 'utf8');
  svgs.set(icon, svg);
  return svg;
}
