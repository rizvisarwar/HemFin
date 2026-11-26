import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressLines, addressPayload, validateAddress, type AddressValues } from "./address.ts";
import { COUNTRIES, countryByCode, countryForDial, countryOptions } from "./countries.ts";
import { CURRENCY_CODES, currencyOptions } from "./currencies.ts";
import { isUsableLocale, localeOptionsWith } from "./locales.ts";
import { buildPhone, phoneDefaults, regionOfLocale, splitPhone } from "./phone.ts";
import { ADDRESS_LIMIT_MESSAGE, parseProblem } from "./problem.ts";

describe("phone", () => {
  it("builds a +code number and drops the national trunk 0", () => {
    assert.equal(buildPhone("NL", "06 12345678"), "+31612345678");
    assert.equal(buildPhone("NL", "6 1234 5678"), "+31612345678");
    assert.equal(buildPhone("US", "(415) 555-2671"), "+14155552671");
  });
  it("keeps the leading 0 where it is part of the number (Italy)", () => {
    assert.equal(buildPhone("IT", "06 1234567"), "+39061234567");
  });
  it("takes a number typed with a plus as already international", () => {
    assert.equal(buildPhone("NL", "+44 20 7946 0958"), "+442079460958");
  });
  it("clears on empty input and passes unknown countries to the API", () => {
    assert.equal(buildPhone("NL", "   "), null);
    assert.equal(buildPhone("ZZ", "123"), "123");
  });
  it("splits a stored number into country and national digits", () => {
    assert.deepEqual(splitPhone("+31612345678"), { country: "NL", national: "612345678" });
    assert.deepEqual(splitPhone("+14155552671"), { country: "US", national: "4155552671" });
    assert.deepEqual(splitPhone("+442079460958"), { country: "GB", national: "2079460958" });
    assert.equal(splitPhone(null), null);
    assert.equal(splitPhone("0612345678"), null);
  });
  it("treats a leading 00 like a plus", () => {
    assert.equal(buildPhone("NL", "0044 20 7946 0958"), "+442079460958");
    assert.equal(buildPhone("NL", "0031 6 12345678"), "+31612345678");
  });
  it("derives the country from the locale's region, never from the browser", () => {
    assert.equal(regionOfLocale("nl-NL"), "NL");
    assert.equal(regionOfLocale("en"), undefined);
    assert.equal(regionOfLocale("not a locale"), undefined);
    assert.deepEqual(phoneDefaults(null, "nl-NL"), { country: "NL", number: "" });
    assert.deepEqual(phoneDefaults(null, "en"), { country: null, number: "" });
    assert.deepEqual(phoneDefaults("+31612345678", "en-US"), { country: "NL", number: "612345678" });
  });
  it("keeps a stored number whose calling code is not in the table, whole", () => {
    assert.equal(splitPhone("+80012345678"), null);
    assert.deepEqual(phoneDefaults("+80012345678", "nl-NL"), { country: null, number: "+80012345678" });
    // Saving it unchanged sends the same number back, never null.
    assert.equal(buildPhone("NL", "+80012345678"), "+80012345678");
    assert.equal(buildPhone("", "+88212345678"), "+88212345678");
  });
  it("round-trips split and build", () => {
    for (const e164 of ["+31612345678", "+4915112345678", "+85291234567", "+351912345678"]) {
      const s = splitPhone(e164);
      assert.ok(s, e164);
      assert.equal(buildPhone(s.country, s.national), e164);
    }
  });
});

describe("country, currency and locale lists", () => {
  it("has unique alpha-2 codes and numeric calling codes", () => {
    const codes = COUNTRIES.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length);
    for (const c of COUNTRIES) {
      assert.match(c.code, /^[A-Z]{2}$/);
      assert.match(c.dial, /^[0-9]{1,3}$/);
    }
    assert.equal(countryByCode("nl")?.dial, "31");
    assert.equal(countryForDial("1")?.code, "US");
  });
  it("offers searchable options sorted by name", () => {
    const opts = countryOptions("en", true);
    const nl = opts.find((o) => o.value === "NL");
    assert.equal(nl?.label, "Netherlands");
    assert.ok(nl?.search.includes("+31"));
  });
  it("has unique three-letter currencies including EUR and USD", () => {
    assert.equal(new Set(CURRENCY_CODES).size, CURRENCY_CODES.length);
    assert.ok(CURRENCY_CODES.every((c) => /^[A-Z]{3}$/.test(c)));
    assert.ok(CURRENCY_CODES.includes("EUR"));
    const eur = currencyOptions("en").find((o) => o.value === "EUR");
    assert.equal(eur?.label, "Euro");
    assert.ok(eur?.search.includes("euro"));
  });
  it("keeps a saved locale that is not in the list", () => {
    assert.ok(localeOptionsWith("sv-SE").some((o) => o.value === "sv-SE"));
    assert.equal(localeOptionsWith("en").filter((o) => o.value === "en").length, 1);
    assert.ok(isUsableLocale("nl-NL"));
    assert.ok(!isUsableLocale("not a locale"));
  });
});

const BLANK: AddressValues = { label: "", line1: "", line2: "", city: "", region: "", postcode: "", country: "" };
const known = (c: string) => countryByCode(c) !== undefined;

describe("address helpers", () => {
  it("requires label, street, city and country", () => {
    const e = validateAddress(BLANK, known);
    assert.deepEqual(Object.keys(e).sort(), ["city", "country", "label", "line1"]);
  });
  it("rejects unknown countries and over-long values", () => {
    const e = validateAddress({ ...BLANK, label: "x".repeat(51), line1: "a", city: "b", country: "ZZ" }, known);
    assert.equal(e.country, "Choose a country from the list.");
    assert.equal(e.label, "Use at most 50 characters.");
  });
  it("sends trimmed values and null for empty optional fields", () => {
    const body = addressPayload({ ...BLANK, label: " Home ", line1: " Main 1 ", city: "Utrecht", country: "nl" });
    assert.deepEqual(body, { label: "Home", line1: "Main 1", line2: null, city: "Utrecht", region: null, postcode: null, country: "NL" });
  });
  it("formats display lines without empty parts", () => {
    assert.deepEqual(addressLines({ line1: "Main 1", city: "Utrecht", postcode: "3511 AB", country: "NL" }), [
      "Main 1",
      "3511 AB Utrecht",
      "Netherlands",
    ]);
  });
});

describe("parseProblem", () => {
  it("maps a 422 to the field's message", () => {
    const p = parseProblem(422, {
      status: 422,
      errors: [{ loc: ["body", "phone_e164"], msg: "Value error, Not a valid phone number.", type: "value_error" }],
    });
    assert.deepEqual(p.fields, { phone_e164: "Not a valid phone number." });
    assert.equal(p.form, undefined);
  });
  it("gives the API's 409 detail to the form", () => {
    assert.equal(parseProblem(409, { detail: "At most 20 addresses are allowed." }).form, "At most 20 addresses are allowed.");
  });
  it("has a safe message for every other status and for a non-JSON body", () => {
    assert.match(parseProblem(500, null).form ?? "", /Something went wrong/);
    assert.match(parseProblem(401, {}).form ?? "", /Sign in again/);
    assert.match(parseProblem(422, {}).form ?? "", /Check the highlighted fields/);
    assert.ok(ADDRESS_LIMIT_MESSAGE.includes("20"));
  });
});
