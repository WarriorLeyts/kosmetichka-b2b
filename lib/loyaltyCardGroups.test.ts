import { describe, expect, it } from "vitest";
import { oneCCardKinds, ownerCardKind } from "./loyaltyCardGroups";
import { BONUS_GROUP, DISCOUNT_GROUP, DISCOUNT_GROUP_REF } from "./discountCardRule";
const discount = { Ref_Key: DISCOUNT_GROUP_REF, Description: "Переименованная папка", IsFolder: true };
const bonus = { Ref_Key: "bonus-root", Description: BONUS_GROUP, IsFolder: true };
describe("1C card hierarchy", () => {
  it("recognizes a nested owner by the verified discount identity even after renaming", () => {
    const child = { Ref_Key: "child", Parent_Key: DISCOUNT_GROUP_REF, IsFolder: true };
    expect(ownerCardKind({ Ref_Key: "owner", Parent_Key: "child" }, [discount, child])).toBe("discount");
  });
  it("does not grant discount for a same-named different folder", () => { expect(ownerCardKind({ Ref_Key: "owner", Parent_Key: "copy" }, [{ Ref_Key: "copy", Description: DISCOUNT_GROUP, IsFolder: true }])).toBeNull(); });
  it("recognizes a bonus owner without looking at the barcode prefix", () => {
    const owners = [bonus, { Ref_Key: "owner", Parent_Key: bonus.Ref_Key, IsFolder: false }];
    expect(oneCCardKinds(owners, [{ КодКартыШтрихкод: "900123", ВладелецКарты_Key: "owner" }]).get("900123")).toBe("bonus");
  });
  it("rejects ambiguous duplicate numbers in different groups", () => {
    const owners = [discount, bonus, { Ref_Key: "a", Parent_Key: discount.Ref_Key, IsFolder: false }, { Ref_Key: "b", Parent_Key: bonus.Ref_Key, IsFolder: false }];
    expect(oneCCardKinds(owners, [{ КодКартыШтрихкод: "123456", ВладелецКарты_Key: "a" }, { КодКартыШтрихкод: "123456", ВладелецКарты_Key: "b" }]).has("123456")).toBe(false);
  });
  it("does not follow deleted folders or cycles", () => {
    expect(ownerCardKind({ Ref_Key: "owner", Parent_Key: discount.Ref_Key }, [{ ...discount, DeletionMark: true }])).toBeNull();
    expect(ownerCardKind({ Ref_Key: "owner", Parent_Key: "a" }, [{ Ref_Key: "a", Parent_Key: "b", IsFolder: true }, { Ref_Key: "b", Parent_Key: "a", IsFolder: true }])).toBeNull();
  });
});
