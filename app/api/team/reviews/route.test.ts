import { beforeEach, describe, expect, it, vi } from "vitest";
const s=vi.hoisted(()=>({allowed:true}));const db=vi.hoisted(()=>({orderReview:{count:vi.fn(async()=>32),findMany:vi.fn(async()=>[])}}));
vi.mock("@/lib/prisma",()=>({prisma:db}));vi.mock("../_auth",()=>({ADMIN_MANAGER:["admin","manager"],requireStaff:vi.fn(async()=>s.allowed?{ok:true,session:{id:1,role:"manager"}}:{ok:false,response:new Response(null,{status:403})})}));
vi.mock("@/lib/staffScope",()=>({staffScope:async()=>({all:false,group:"own"}),orderScopeWhere:()=>({customer:{manager:"own"}})}));
import {GET} from "./route";beforeEach(()=>{vi.clearAllMocks();s.allowed=true});
describe("staff reviews",()=>{
 it("scopes both the list and count to the manager's orders",async()=>{const r=await GET(new Request('https://site/api/team/reviews?rating=2&page=2'));expect((await r.json()).totalPages).toBe(2);expect(db.orderReview.count).toHaveBeenCalledWith({where:{order:{customer:{manager:"own"}},rating:2}});expect(db.orderReview.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{order:{customer:{manager:"own"}},rating:2},skip:30,take:30}))});
 it("blocks other roles/guests before database access",async()=>{s.allowed=false;expect((await GET(new Request('https://site'))).status).toBe(403);expect(db.orderReview.findMany).not.toHaveBeenCalled()});
 it.each(["0","6","oops"])("rejects malformed rating %s",async rating=>{expect((await GET(new Request('https://site?rating='+rating))).status).toBe(400);expect(db.orderReview.findMany).not.toHaveBeenCalled()});
});
