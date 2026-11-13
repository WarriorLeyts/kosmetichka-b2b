import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { calculateCart, cartPriceTier, priceFor, novemberPromoActive, bigWholesaleMinOrder, cleanPromoSnapshot } from "./pricing";
import { normalizePriceType } from "../scripts/price-types.js";

const during = Date.parse("2026-11-13T12:00:00+03:00");
const before = Date.parse("2026-11-12T23:59:59.999+03:00");
const after = Date.parse("2026-12-01T00:00:00+03:00");
const opt = { priceType: "wholesale" };
const big = { priceType: "big_wholesale" };
const screenshot = { retailPrice: 490, discountPrice: 440, wholesalePrice: 190, bigWholesalePrice: 180,
  promoRetailPrice: 399, promoWholesalePrice: 168, promoBigWholesalePrice: 168 };

describe("1C campaign prices", () => {
  it("keeps all seven price types distinct regardless of case / whitespace", () => {
    const names = ["Розница", "Скидка", "Опт", "Крупный опт", "Акция Розница", "Акция Опт", "Акция Крупный опт"];
    assert.deepEqual(names.map(normalizePriceType), ["retail", "discount", "wholesale", "big_wholesale", "promo_retail", "promo_wholesale", "promo_big_wholesale"]);
    assert.equal(normalizePriceType(" АКЦИЯ КРУПНЫЙ ОПТ "), "promo_big_wholesale");
  });
  it("uses the screenshot's corresponding prices, without a cross-tariff promo fallback", () => {
    for (const type of ["retail", "discount", "guest"] as const) assert.equal(priceFor(screenshot, type, during), 399);
    for (const type of ["wholesale", "big_wholesale"] as const) assert.equal(priceFor(screenshot, type, during), 168);
    assert.equal(priceFor({ ...screenshot, promoBigWholesalePrice: null }, "big_wholesale", during), 180);
  });
  it("ignores missing, zero and invalid promotional prices", () => {
    for (const value of [null, undefined, 0, -1, NaN, Infinity]) {
      assert.equal(priceFor({ ...screenshot, promoWholesalePrice: value }, "wholesale", during), 190);
    }
  });
  it("runs from 13 November through 30 November in Moscow", () => {
    assert.equal(novemberPromoActive(before), false);
    assert.equal(novemberPromoActive(before + 1), true);
    assert.equal(novemberPromoActive(after - 1), true);
    assert.equal(novemberPromoActive(after), false);
    assert.equal(bigWholesaleMinOrder(during), 25_000);
    assert.equal(bigWholesaleMinOrder(after), 50_000);
    assert.equal(priceFor(screenshot, "retail", after), 490);
    assert.equal(priceFor(screenshot, "wholesale", after), 190);
  });
  it("expires a persisted API snapshot using its original prices", () => {
    const snapshot = { ...screenshot, wholesalePrice: 168, regularPrices: { wholesalePrice: 190, retailPrice: 490 } };
    assert.equal(priceFor(snapshot, "wholesale", after), 190);
  });
  it("preserves campaign metadata through saved-cart sanitisation and expires it afterwards", () => {
    const raw = { ...screenshot, wholesalePrice: 168, regularPrices: { retailPrice: 490, wholesalePrice: 190 } };
    const restored = { wholesalePrice: 168, ...cleanPromoSnapshot(raw) };
    assert.equal(priceFor(restored, "wholesale", during), 168);
    assert.equal(priceFor(restored, "wholesale", after), 190);
  });
  it("drops unrecognised and non-numeric metadata from saved snapshots", () => {
    assert.deepEqual(cleanPromoSnapshot({ promoWholesalePrice: Infinity, promoRetailPrice: "1",
      regularPrices: { wholesalePrice: 190, retailPrice: null, extra: "discard", discountPrice: NaN } }),
    { regularPrices: { wholesalePrice: 190, retailPrice: null } });
    assert.deepEqual(cleanPromoSnapshot({}), {});
  });
});

describe("wholesale campaign calculation", () => {
  it("upgrades at exactly 25 000 ₽ in campaign big-wholesale prices", () => {
    const item = { ...screenshot, quantity: 1, promoBigWholesalePrice: 25_000 };
    assert.equal(cartPriceTier([item], opt, during), "big_wholesale");
    assert.equal(cartPriceTier([{ ...item, promoBigWholesalePrice: 24_999 }], opt, during), "discount");
    assert.equal(cartPriceTier([item], opt, after), "discount");
    assert.equal(cartPriceTier([{ ...screenshot, quantity: 1 }], big, during), "big_wholesale");
  });
  it("selects one maximum discount at every boundary, before applying the discount", () => {
    for (const [subtotal, percent] of [[39_999, 0], [40_000, 2], [99_999, 2], [100_000, 3], [299_999, 3], [300_000, 5]]) {
      const result = calculateCart([{ bigWholesalePrice: subtotal, quantity: 1 }], big, during);
      assert.equal(result.percent, percent);
      assert.equal(result.discount, Math.round(subtotal * percent) / 100);
      assert.equal(result.total, Math.round((subtotal - result.discount) * 100) / 100);
    }
  });
  it("counts shock goods in the threshold and excludes only them from the extra discount", () => {
    const result = calculateCart([
      { bigWholesalePrice: 800, quantity: 100 },
      { bigWholesalePrice: 220, promoBigWholesalePrice: 200, quantity: 100 },
    ], opt, during);
    assert.deepEqual(result, { tier: "big_wholesale", subtotal: 100_000, percent: 3, eligibleSubtotal: 80_000,
      discount: 2400, discounts: [2400, 0], total: 97_600 });
  });
  it("never applies an extra discount to a shock-only cart", () => {
    const result = calculateCart([{ ...screenshot, quantity: 2000 }], big, during);
    assert.equal(result.percent, 5);
    assert.equal(result.discount, 0);
    assert.equal(result.total, 336_000);
  });
  it("does not grant wholesale campaign discounts to retail / guests or outside the campaign", () => {
    const cart = [{ retailPrice: 100_000, discountPrice: 100_000, bigWholesalePrice: 100_000, quantity: 1 }];
    for (const customer of [null, { priceType: "retail" }, { priceType: "discount" }]) assert.equal(calculateCart(cart, customer, during).discount, 0);
    assert.equal(calculateCart(cart, big, before).discount, 0);
    assert.equal(calculateCart(cart, big, after).discount, 0);
    assert.equal(calculateCart([], opt, during).total, 0);
  });
  it("keeps the sum of line discounts equal to the order discount", () => {
    const cart = [{ bigWholesalePrice: 333, quantity: 101 }, { bigWholesalePrice: 67, quantity: 101 }];
    const r = calculateCart(cart, big, during);
    assert.equal(Math.round(r.discounts.reduce((s, n) => s + n, 0) * 100), Math.round(r.discount * 100));
    assert.equal(r.total, 39_592);
  });
});
