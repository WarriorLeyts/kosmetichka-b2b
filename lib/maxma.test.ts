import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bonusAmount,
  calcLoyalty,
  canSpendBonuses,
  loyaltyCalculationQuery,
  setLoyaltyOrder,
  setLoyaltyOrderQuery,
  setOrderQuery,
  splitBonusDiscount,
  splitPromoDiscount,
} from "./maxma";

const lines = [
  { sku: "a", productName: "Крем", price: 100, quantity: 2, total: 200 },
  { sku: "b", productName: "Шампунь", price: 30, quantity: 1, total: 30 },
];

describe("canSpendBonuses (retail rule)", () => {
  it("only retail customers with a linked card", () => {
    expect(canSpendBonuses({ loyaltyCard: "2000123", priceType: "retail" })).toBe(true);
    expect(canSpendBonuses({ loyaltyCard: "2000123", priceType: "wholesale" })).toBe(false);
    expect(canSpendBonuses({ loyaltyCard: "2000123", priceType: "discount" })).toBe(false);
    expect(canSpendBonuses({ loyaltyCard: null, priceType: "retail" })).toBe(false);
    expect(canSpendBonuses({ loyaltyCard: "  ", priceType: "retail" })).toBe(false);
    expect(canSpendBonuses(null)).toBe(false);
  });

  it("bonusAmount: whole non-negative numbers only", () => {
    expect(bonusAmount(12.9)).toBe(12);
    expect(bonusAmount(-5)).toBe(0);
    expect(bonusAmount("abc")).toBe(0);
    expect(bonusAmount(undefined)).toBe(0);
  });
});

describe("rounding / distribution", () => {
  it("promo: floor per line, remainder to the largest fractions, sums to the floored total", () => {
    expect(splitPromoDiscount([33.4, 33.3, 33.3], 100, [200, 200, 200])).toEqual({ discount: 100, lines: [34, 33, 33] });
  });

  it("bonuses: never more than what the promo discount leaves of a line", () => {
    // line 2 has 30 − 25 = 5 ₽ left after the promo code
    const r = splitBonusDiscount([90.5, 9.5], 100, [200, 30], [0, 25]);
    expect(r.lines[1]).toBeLessThanOrEqual(5);
    expect(r.discount).toBe(100);
    expect(r.lines[0] + r.lines[1]).toBe(100);
  });

  it("bonuses: rows without amounts still get the applied sum distributed", () => {
    expect(splitBonusDiscount([0, 0], 50, [200, 30], [0, 0])).toEqual({ discount: 50, lines: [50, 0] });
  });

  it("bonuses: capped by what is left of the order", () => {
    expect(splitBonusDiscount([150, 30], 500, [200, 30], [50, 0]).discount).toBe(180);
  });
});

describe("loyaltyCalculationQuery", () => {
  it("card: applyBonuses and collectBonuses auto; phone / none: no bonuses", () => {
    const q = loyaltyCalculationQuery(lines, { client: { card: "2000123" }, promocode: "SALE", applyBonuses: 40, collect: true });
    expect(q).toMatchObject({ client: { card: "2000123" }, promocode: "SALE", applyBonuses: 40, collectBonuses: "auto" });
    expect(q.rows[0]).toEqual({ id: "0", product: { sku: "a", title: "Крем", blackPrice: 100 }, qty: 2, noOffer: true });
    const p = loyaltyCalculationQuery(lines, { client: { phoneNumber: "+79001234567" }, applyBonuses: 40, collect: true });
    expect(p).toMatchObject({ applyBonuses: 0, collectBonuses: 0 });
    expect(p).not.toHaveProperty("promocode");
    expect(loyaltyCalculationQuery(lines, { client: null, applyBonuses: 0, collect: true })).not.toHaveProperty("client");
  });
});

describe("calcLoyalty (MAXMA mocked)", () => {
  const fetchMock = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reply = (body: any, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
  const sent = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body);

  beforeEach(() => {
    process.env.MAXMA_API_KEY = "test";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const retail = { phone: "89001234567", loyaltyCard: "2000123", priceType: "retail" };

  it("spends what MAXMA applies and splits it per line", async () => {
    fetchMock.mockImplementationOnce(() =>
      reply({
        calculationResult: {
          rows: [
            { id: "0", discounts: { bonuses: 43.5 } },
            { id: "1", discounts: { bonuses: 6.5 } },
          ],
          summary: { discounts: { bonuses: 50 } },
          bonuses: { applied: 50, collected: 9, maxToApply: 50 },
        },
      })
    );
    const r = await calcLoyalty({ customer: retail, lines, applyBonuses: 80 });
    expect(sent(0).calculationQuery).toMatchObject({ client: { card: "2000123" }, applyBonuses: 80, collectBonuses: "auto" });
    expect(r.promo).toBeNull();
    expect(r.bonuses).toMatchObject({ applied: 50, collected: 9, maxToApply: 50 });
    expect(r.bonusLines.reduce((s, x) => s + x, 0)).toBe(50);
    expect(r.bonusLines).toEqual([44, 6]);
  });

  it("asks again with maxToApply when MAXMA refuses a too large amount", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        reply({ calculationResult: { rows: [], bonuses: { applied: 0, collected: 11, maxToApply: 30, error: { description: "too many" } } } })
      )
      .mockImplementationOnce(() =>
        reply({ calculationResult: { rows: [{ id: "0", discounts: { bonuses: 30 } }], bonuses: { applied: 30, collected: 9, maxToApply: 30 } } })
      );
    const r = await calcLoyalty({ customer: retail, lines, applyBonuses: 1000 });
    expect(sent(1).calculationQuery.applyBonuses).toBe(30);
    expect(r.bonuses?.applied).toBe(30);
    expect(r.bonusLines).toEqual([30, 0]);
  });

  it("non-retail with a card: no card sent — no spending, no accrual", async () => {
    fetchMock.mockImplementationOnce(() => reply({ calculationResult: { rows: [] } }));
    const r = await calcLoyalty({ customer: { ...retail, priceType: "wholesale" }, lines, applyBonuses: 40 });
    expect(sent(0).calculationQuery).toMatchObject({ applyBonuses: 0, collectBonuses: 0 });
    expect(sent(0).calculationQuery.client?.card).toBeUndefined();
    expect(r.bonuses).toBeNull();
  });
  it("card MAXMA doesn't know → anonymous calculation, bonuses null", async () => {
    fetchMock
      .mockImplementationOnce(() => reply({ errorCode: 3, description: "Card not found" }, 400))
      .mockImplementationOnce(() =>
        reply({ calculationResult: { rows: [{ id: "0", discounts: { promocode: 20 } }], promocode: { applied: true }, summary: { discounts: { promocode: 20 } } } })
      );
    const r = await calcLoyalty({ customer: retail, lines, promocode: "SALE", applyBonuses: 10 });
    expect(sent(1).calculationQuery).not.toHaveProperty("client");
    expect(sent(1).calculationQuery).toMatchObject({ applyBonuses: 0, collectBonuses: 0, promocode: "SALE" });
    expect(r.bonuses).toBeNull();
    expect(r.promo).toMatchObject({ applied: true, discount: 20, lines: [20, 0] });
  });

  it("set-order: card, applied bonuses, accrual auto, promo code", async () => {
    fetchMock.mockImplementationOnce(() => reply({ calculationResult: { bonuses: { applied: 30, collected: 9 } } }));
    const r = await setLoyaltyOrder(5, lines, { customer: retail, promocode: "SALE", applyBonuses: 30 });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/v2\/set-order$/);
    expect(sent(0)).toMatchObject({
      orderId: "site-5",
      calculationQuery: { client: { card: "2000123" }, promocode: "SALE", applyBonuses: 30, collectBonuses: "auto" },
    });
    expect(r).toEqual({ applied: 30, collected: 9, anonymous: false, bonusRows: [0, 0] });
  });

  it("set-order: returns MAXMA's bonus split per row; unknown card → anonymous only without bonuses", async () => {
    fetchMock.mockImplementationOnce(() =>
      reply({ calculationResult: { rows: [{ id: "1", discounts: { bonuses: 5 } }, { id: "0", discounts: { bonuses: 20 } }], bonuses: { applied: 25 } } })
    );
    const q = setOrderQuery(lines, { customer: retail, applyBonuses: 30 });
    expect(await setLoyaltyOrderQuery(6, q)).toEqual({ applied: 25, collected: 0, anonymous: false, bonusRows: [20, 5] });

    fetchMock.mockImplementationOnce(() => reply({ errorCode: 3, description: "Card not found" }, 400));
    await expect(setLoyaltyOrderQuery(6, q)).rejects.toMatchObject({ notFound: true });

    fetchMock
      .mockImplementationOnce(() => reply({ errorCode: 3, description: "Card not found" }, 400))
      .mockImplementationOnce(() => reply({ calculationResult: { bonuses: {} } }));
    const r = await setLoyaltyOrderQuery(6, setOrderQuery(lines, { customer: retail, promocode: "SALE", applyBonuses: 0 }));
    const anon = JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body));
    expect(anon.calculationQuery).not.toHaveProperty("client");
    expect(anon.calculationQuery).toMatchObject({ applyBonuses: 0, collectBonuses: 0, promocode: "SALE" });
    expect(r.anonymous).toBe(true);
  });

  it("errors carry a detail for the queue / admin", async () => {
    fetchMock.mockImplementationOnce(() => reply({ errorCode: 1, description: "Internal" }, 500));
    await expect(setLoyaltyOrder(5, lines, { customer: retail, applyBonuses: 0 })).rejects.toMatchObject({
      message: "unavailable",
      detail: expect.stringMatching(/^v2\/set-order: HTTP 500/),
    });
  });
});
