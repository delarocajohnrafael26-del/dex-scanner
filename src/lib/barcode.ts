/**
 * Normalize a raw barcode string for consistent lookup/storage.
 * - Trims whitespace
 * - Strips non-digits ONLY for purely numeric retail codes (EAN/UPC)
 * - Leaves alphanumeric codes (CODE_128/QR) untouched after trim
 */
export function normalizeBarcode(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  // If it's all digits with possible spaces/dashes -> strip those
  const digitsOnly = t.replace(/[\s\-]/g, "");
  if (/^\d+$/.test(digitsOnly)) return digitsOnly;
  return t;
}

/**
 * Returns candidate barcodes to try when looking up.
 * Handles UPC-A (12) <-> EAN-13 (13 with leading 0) ambiguity and
 * scanners that drop or add a leading zero.
 */
export function barcodeCandidates(raw: string): string[] {
  const n = normalizeBarcode(raw);
  if (!n) return [];
  const set = new Set<string>([n]);
  if (/^\d+$/.test(n)) {
    // Add leading-zero padded variants
    if (n.length === 12) set.add("0" + n); // UPC-A -> EAN-13
    if (n.length === 13 && n.startsWith("0")) set.add(n.slice(1)); // EAN-13 -> UPC-A
    if (n.length === 7) set.add("0" + n); // EAN-8 short
    if (n.length === 11) set.add("0" + n);
  }
  return Array.from(set);
}
