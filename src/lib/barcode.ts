/**
 * Normalize a raw barcode string for consistent lookup/storage.
 * - Trims whitespace
 * - Strips non-digits ONLY for purely numeric retail codes (EAN/UPC/GTIN)
 * - Leaves alphanumeric codes (CODE_128/QR) untouched after trim
 */
export function normalizeBarcode(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const digitsOnly = t.replace(/[^\d]/g, "");
  if (/^\d+$/.test(digitsOnly)) return digitsOnly;
  return t;
}

/**
 * Returns candidate barcodes to try when looking up.
 * Handles UPC/EAN/GTIN variants where scanners/imports may add or drop
 * a packaging leading zero.
 */
export function barcodeCandidates(raw: string): string[] {
  const n = normalizeBarcode(raw);
  if (!n) return [];

  const set = new Set<string>([n]);

  if (/^\d+$/.test(n)) {
    if (n.length === 7) set.add(`0${n}`);
    if (n.length === 8 && n.startsWith("0")) set.add(n.slice(1));

    if (n.length === 11) set.add(`0${n}`);
    if (n.length === 12) {
      set.add(`0${n}`);
      set.add(`00${n}`);
    }

    if (n.length === 13) {
      set.add(`0${n}`);
      if (n.startsWith("0")) {
        set.add(n.slice(1));
      }
    }

    if (n.length === 14 && n.startsWith("0")) {
      set.add(n.slice(1));
      if (n[1] === "0") set.add(n.slice(2));
    }
  }

  return Array.from(set);
}
