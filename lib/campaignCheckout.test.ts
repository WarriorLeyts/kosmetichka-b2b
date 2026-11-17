import { afterEach, expect, it, vi } from "vitest";
const db=vi.hoisted(()=>({cmsSetting:{findUnique:vi.fn()},product:{findMany:vi.fn()}}));
vi.mock("./prisma",()=>({prisma:db}));
import {priceOrder} from "./orderPricing";
afterEach(()=>vi.restoreAllMocks());
it("checkout reads the published campaign, ignores draft and client prices, and stops discounts when disabled",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(Date.parse("2026-12-11T12:00:00+03:00"));
 const config={enabled:true,name:"Декабрь",startsAt:"2026-12-10T00:00:00+03:00",endsAt:"2026-12-13T00:00:00+03:00",pricing:{usePromoPrices:true,wholesaleMin:5000,bigWholesaleMin:30000,discountSteps:[{from:50000,percent:6}]}};
 db.cmsSetting.findUnique.mockImplementation(async({where})=>({value:where.key==="promo"?config:{...config,pricing:{...config.pricing,discountSteps:[{from:1,percent:99}]}}}));
 db.product.findMany.mockResolvedValue([{id:1,name:"Товар",guid:"p",stock:1000,wholesaleStock:1000,minOrderQty:1,prices:[{priceType:"retail",price:1000},{priceType:"wholesale",price:1000},{priceType:"big_wholesale",price:1000}]}]);
 const inputs=[{id:1,quantity:100,price:1}];
 expect((await priceOrder({priceType:"wholesale"},inputs)).pricing).toMatchObject({subtotal:100000,percent:6,discount:6000,total:94000});
 config.enabled=false;
 expect((await priceOrder({priceType:"wholesale"},inputs)).pricing).toMatchObject({subtotal:100000,percent:0,total:100000});
});
