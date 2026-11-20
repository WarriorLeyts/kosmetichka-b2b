import {beforeEach,describe,expect,it,vi} from "vitest";
const s=vi.hoisted(()=>({role:'manager',visible:true,purchase:vi.fn()}));
vi.mock('../../../_auth',()=>({ADMIN_MANAGER:['admin','manager'],requireStaff:async(roles:string[])=>roles.includes(s.role)?{ok:true,session:{id:1,role:s.role,login:'manager'}}:{ok:false,response:new Response(null,{status:s.role==='guest'?401:403})}}));
vi.mock('@/lib/staffScope',()=>({staffSeesOrder:async()=>s.visible}));
vi.mock('@/lib/assemblyCardPurchase',()=>({CardPurchaseError:class extends Error{status=409},purchaseAssemblyCard:s.purchase}));
import {POST} from './route';
const call=()=>POST(new Request('https://site/api/team/orders/7/card-purchase',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({registration:{fullName:'Тест Тестов',birthDate:'03.02.1995'}})}),{params:Promise.resolve({id:'7'})});
beforeEach(()=>{vi.clearAllMocks();s.role='manager';s.visible=true;s.purchase.mockResolvedValue({ok:true,total:8990})});
describe('assembly card purchase access',()=>{
 it.each(['guest','picker'])('rejects %s before purchasing',async role=>{s.role=role;expect((await call()).status).toBe(role==='guest'?401:403);expect(s.purchase).not.toHaveBeenCalled()});
 it('does not touch another manager order',async()=>{s.visible=false;expect((await call()).status).toBe(404);expect(s.purchase).not.toHaveBeenCalled()});
 it('allows the scoped manager to buy a card and calculate the order',async()=>{expect((await call()).status).toBe(200);expect(s.purchase).toHaveBeenCalledWith(7,{fullName:'Тест Тестов',birthDate:'03.02.1995'},{id:1,role:'manager',login:'manager'})});
});
