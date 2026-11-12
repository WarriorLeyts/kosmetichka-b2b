import { describe, expect, it } from "vitest";
import { articleKey, parsePhotoName } from "./photoNames";

describe("articleKey", () => {
  it("ignores hyphen, case and leading zeros", () => {
    expect(articleKey("ГБ-00000370")).toBe("ГБ370");
    expect(articleKey("ГБ000000370")).toBe("ГБ370");
    expect(articleKey("гб-370")).toBe("ГБ370");
    expect(articleKey("НФ-00000907")).toBe("НФ907");
    expect(articleKey("ГБ000000016")).not.toBe(articleKey("ГБ000000160"));
  });
  it("keeps non-numeric articles", () => {
    expect(articleKey("ABC-12X")).toBe("ABC12X");
    expect(articleKey("")).toBeNull();
  });
});

describe("parsePhotoName", () => {
  it("main and numbered photos", () => {
    expect(parsePhotoName("ГБ-00000370.jpg")).toEqual({ base: "ГБ-00000370", index: 1 });
    expect(parsePhotoName("folder/ГБ-00000370_2.JPG")).toEqual({ base: "ГБ-00000370", index: 2 });
    expect(parsePhotoName("ГБ-00000370 (3).png")).toEqual({ base: "ГБ-00000370", index: 3 });
    expect(parsePhotoName("НФ-00000907-2.webp")).toEqual({ base: "НФ-00000907", index: 2 });
    expect(parsePhotoName("ГБ000000370.jpg")).toEqual({ base: "ГБ000000370", index: 1 });
  });
  it("skips hidden files", () => {
    expect(parsePhotoName(".DS_Store.jpg")).toBeNull();
  });
});
