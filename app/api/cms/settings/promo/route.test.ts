/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Prisma transaction fixture */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const state = vi.hoisted(() => ({ rows: new Map<string, any>(), denied: false, tick: 0 }));
vi.mock("@/lib/prisma", () => {
  const db: any = { cmsSetting: {
    findUnique: vi.fn(async ({where}: any) => state.rows.get(where.key) ?? null),
    upsert: vi.fn(async ({where,create,update}: any) => { const value={...(state.rows.get(where.key)??create),...update,updatedAt:new Date(1800000000000+(++state.tick)),updatedBy:"admin"};state.rows.set(where.key,value);return value; }),
    deleteMany: vi.fn(async ({where}: any) => { state.rows.delete(where.key); }),
  }, banner: {findMany:async()=>[]} };
  db.$transaction=async(fn:any)=>fn(db);return {prisma:db};
});
vi.mock("@/lib/cms/auth",()=>({cmsGuard:async()=>state.denied?NextResponse.json({error:"Нет доступа"},{status:403}):{user:{id:1,name:"Админ",login:"admin"},ip:null},isGuardError:(x:unknown)=>x instanceof Response}));
vi.mock("@/lib/cms/audit",()=>({logAction:vi.fn()}));
import {GET,PUT} from "./route";
import {POST as preview} from "./preview/route";
import { getCampaign } from "@/lib/campaignSettings";
import { promoSchema, editablePromo } from "@/lib/promoSchema";
const settings=()=>editablePromo(promoSchema.parse({enabled:true,name:"Следующая",startsAt:"2026-12-10T00:00:00+03:00",endsAt:"2026-12-13T00:00:00+03:00"}));
const request=(body:unknown)=>new Request("http://test/api/cms/settings/promo",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{state.rows.clear();state.denied=false;state.tick=0;});
describe("campaign publication",()=>{
 it("keeps a draft private, then publishes atomically and rejects stale editors",async()=>{
   const original=await getCampaign();
   expect((await PUT(request({action:"draft",settings:settings(),revision:null,draftRevision:null}))).status).toBe(200);
   expect(await getCampaign()).toEqual(original);
   const draft=await (await GET(new Request("http://test"))).json();expect(draft.hasDraft).toBe(true);
   expect((await PUT(request({action:"publish",settings:settings(),revision:null,draftRevision:null}))).status).toBe(409);
   expect((await PUT(request({action:"publish",settings:settings(),revision:draft.revision,draftRevision:draft.draftRevision}))).status).toBe(200);
   expect((await getCampaign()).name).toBe("Следующая");expect(state.rows.has("promo_draft")).toBe(false);
   expect((await PUT(request({action:"draft",settings:settings(),revision:null,draftRevision:null}))).status).toBe(409);
 });
 it("requires dates to publish a running campaign but accepts an unfinished draft",async()=>{
   const incomplete={...settings(),startsAt:null,endsAt:null};
   expect((await PUT(request({action:"publish",settings:incomplete,revision:null,draftRevision:null}))).status).toBe(400);
   expect((await PUT(request({action:"draft",settings:incomplete,revision:null,draftRevision:null}))).status).toBe(200);
 });
 it("uses the actual pricing engine for a dry run without writing settings",async()=>{
   const res=await preview(request({settings:settings(),subtotal:100000,shockSubtotal:20000,customer:"wholesale"}));
   expect(res.status).toBe(200);expect((await res.json()).pricing).toMatchObject({percent:3,eligibleSubtotal:80000,discount:2400,total:97600});expect(state.rows.size).toBe(0);
 });
 it("rejects bad amounts and unauthorized writes/previews",async()=>{
   expect((await preview(request({settings:settings(),subtotal:1,shockSubtotal:2,customer:"wholesale"}))).status).toBe(400);
   state.denied=true;expect((await PUT(request({}))).status).toBe(403);expect((await preview(request({}))).status).toBe(403);
 });
});
