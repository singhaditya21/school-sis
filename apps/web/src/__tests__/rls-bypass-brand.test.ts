import {
  RLS_BYPASS_JUSTIFICATIONS,
  assertRlsBypassJustification,
  type RlsBypassJustification,
} from "@/lib/db/rls-bypass";

/**
 * Guards the one property of the justification brand that no other test can see.
 *
 * Next.js compiles packages/api/src/db/rls-bypass.ts once per build layer — a
 * production build carries three copies, and instrumentation.ts gets a different
 * one from every page. The session resolver in instrumentation.ts mints
 * `RLS_BYPASS_JUSTIFICATIONS.PLATFORM_SESSION` for PLATFORM_ADMIN sessions, and
 * `resolvedContext()` in the page's copy asserts it. With a plain `Symbol()` the
 * brands differ per copy, so that assert throws and every PLATFORM_ADMIN request
 * 500s.
 *
 * Jest resolves one module graph, so a same-process test cannot reproduce the
 * duplication directly. What it CAN pin is the property that makes duplication
 * survivable: the brand must live in the cross-realm symbol registry. A
 * regression from `Symbol.for(...)` back to `Symbol(...)` fails here.
 */
describe("RLS bypass justification brand", () => {
  const brandOf = (value: RlsBypassJustification): symbol => {
    const [brand] = Object.getOwnPropertySymbols(value);
    return brand;
  };

  it("is a registered symbol, so every duplicated copy of the module agrees", () => {
    const brand = brandOf(RLS_BYPASS_JUSTIFICATIONS.PLATFORM_SESSION);

    // Symbol.keyFor returns undefined for a unique Symbol() and the key for a
    // registered Symbol.for(). This is the whole assertion.
    expect(Symbol.keyFor(brand)).toBe("school-sis:rls-bypass-justification");
  });

  it("accepts a justification branded through the registry by another copy", () => {
    // Stands in for a second compiled copy of the module: an object branded with
    // an independently-obtained registry symbol, exactly as instrumentation.ts's
    // copy would produce.
    const fromOtherCopy = Object.freeze(
      Object.defineProperty(
        { id: "platform.session", reason: "x".repeat(30) },
        Symbol.for("school-sis:rls-bypass-justification"),
        { value: true },
      ),
    ) as RlsBypassJustification;

    expect(() => assertRlsBypassJustification(fromOtherCopy)).not.toThrow();
  });

  it("still rejects an unbranded object", () => {
    const forged = { id: "platform.session", reason: "x".repeat(30) };

    expect(() =>
      assertRlsBypassJustification(forged as RlsBypassJustification),
    ).toThrow("RLS bypass requires a reviewed justification.");
  });
});
