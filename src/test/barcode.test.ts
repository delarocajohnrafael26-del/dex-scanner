import { describe, expect, it } from "vitest";
import { barcodeCandidates, normalizeBarcode } from "@/lib/barcode";

describe("barcode helpers", () => {
  it("normalizes numeric barcodes by stripping separators", () => {
    expect(normalizeBarcode("04 800-575145054")).toBe("04800575145054");
  });

  it("includes 13-digit scanner variant for imported 14-digit GTINs", () => {
    expect(barcodeCandidates("04800575145054")).toContain("4800575145054");
  });

  it("includes 14-digit import variant for scanned 13-digit EANs", () => {
    expect(barcodeCandidates("4800575145054")).toContain("04800575145054");
  });
});
