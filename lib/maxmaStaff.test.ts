import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { findStaffCard, findCard, publicCard, getBonusHistory } from "./maxma";
const fetchMock = vi.fn();
beforeEach(() => { vi.stubEnv("MAXMA_API_KEY", "test"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const answer = (data: unknown) => fetchMock.mockImplementation(async () => new Response(JSON.stringify(data), { status: 200 }));
describe("MAXMA staff profile and bonus history", () => {
 it("reads the full owner's name and staff-only profile without exposing it through publicCard", async () => {
  answer({client:{cardString:"000123",surname:"Иванова",name:"Анна",patronymicName:"Петровна",phoneNumber:"+79990000000",email:"test@example.test",birthdate:"1900-02-03",gender:2,bonuses:0,pendingBonuses:45},level:{name:"VIP"}});
  const card=await findStaffCard({card:"000123"});expect(card).toMatchObject({number:"000123",name:"Иванова Анна Петровна",bonuses:0,pendingBonuses:45,email:"test@example.test",gender:2});
  expect(publicCard(card as unknown as Parameters<typeof publicCard>[0])).not.toHaveProperty("phone");expect(publicCard(card as unknown as Parameters<typeof publicCard>[0])).not.toHaveProperty("email");
  expect(await findCard({card:"000123"})).toMatchObject({name:"Иванова Анна Петровна"});
 });
 it("does not invent a zero balance when MAXMA omits it",async()=>{answer({client:{cardString:"123",fullName:"Тест Тестов"}});expect(await findStaffCard({card:"123"})).toMatchObject({name:"Тест Тестов",bonuses:null,pendingBonuses:null});});
 it("uses MAXMA's signed operation amount, reason and document reference with pagination",async()=>{answer({history:[{at:"2026-11-20T10:00:00Z",amount:-50,operation:"OPERATION_APPLIED",OPERATION_APPLIED:{purchaseId:"sale-1"}},{at:"2026-11-19T10:00:00Z",amount:100,operation:"OPERATION_RECEIVED",OPERATION_RECEIVED:{actionName:"Корректировка"}}],pagination:{total:40}});const r=await getBonusHistory("123",30);expect(r).toMatchObject({total:40,hasMore:true,items:[{amount:-50,title:"Оплата покупки",reference:"sale-1"},{amount:100,detail:"Корректировка"}]});expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({client:{card:"123"},pagination:{limit:30,offset:30}});});
 it("retains unknown operation labels and shows missing amounts as unavailable",async()=>{answer({history:[{operation:"NEW_TYPE",operationName:"Новая операция",amount:null,at:"invalid"}],pagination:{total:1}});expect(await getBonusHistory("123")).toMatchObject({hasMore:false,items:[{title:"Новая операция",amount:null,at:null}]});});
 it("rejects a broken history response instead of showing an empty history",async()=>{answer({});await expect(getBonusHistory("123")).rejects.toThrow();});
});
