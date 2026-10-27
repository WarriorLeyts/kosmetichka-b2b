import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findFirst: (a: unknown) => findFirst(a) }, orderMessage: { create: (a: unknown) => create(a) } },
}));

import { POST } from "./route";

const req = (body: string) =>
  new Request("http://x/api/bitrix/comment", { method: "POST", body }) as unknown as Parameters<typeof POST>[0];

/** Ответ Bitrix на crm.timeline.comment.get */
function bitrixReturns(result: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ result }))));
}

describe("Bitrix comment webhook", () => {
  beforeEach(() => {
    process.env.BITRIX_WEBHOOK_URL = "https://b24.example/rest/1/key/";
    findFirst.mockReset().mockResolvedValue({ id: 42 });
    create.mockReset().mockResolvedValue({});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("текст и сделку берёт из Bitrix, а не из присланного запроса", async () => {
    bitrixReturns({ ID: "77", ENTITY_ID: "555", ENTITY_TYPE: "deal", COMMENT: "Настоящий ответ менеджера" });
    const body =
      "event=ONCRMTIMELINECOMMENTADD&data[FIELDS][ID]=77&data[FIELDS][ENTITY_ID]=1&data[FIELDS][ENTITY_TYPE_ID]=2" +
      "&data[FIELDS][COMMENT]=" + encodeURIComponent("Оплатите на карту 0000");
    await POST(req(body));
    expect(findFirst).toHaveBeenCalledWith({ where: { bitrixDealId: 555 } });
    expect(create.mock.calls[0][0].data).toMatchObject({ orderId: 42, text: "Настоящий ответ менеджера", bitrixCommentId: "77" });
  });

  it("комментарий, которого нет в Bitrix, не сохраняется", async () => {
    bitrixReturns(null);
    const res = await POST(req("event=ONCRMTIMELINECOMMENTADD&data[FIELDS][ID]=99&data[FIELDS][COMMENT]=fake"));
    expect(await res.json()).toMatchObject({ skip: "comment not found in Bitrix" });
    expect(create).not.toHaveBeenCalled();
  });

  it("комментарий не к сделке пропускается", async () => {
    bitrixReturns({ ID: "5", ENTITY_ID: "8", ENTITY_TYPE: "lead", COMMENT: "x" });
    await POST(req("event=ONCRMTIMELINECOMMENTADD&data[FIELDS][ID]=5"));
    expect(create).not.toHaveBeenCalled();
  });

  it("__proto__ в ключах не попадает в Object.prototype", async () => {
    bitrixReturns(null);
    await POST(req("__proto__[polluted]=1&constructor[prototype][polluted2]=1&event=ONCRMTIMELINECOMMENTADD&data[FIELDS][ID]=1"));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted2).toBeUndefined();
  });
});
