import {beforeEach,describe,expect,it,vi} from 'vitest';
const s=vi.hoisted(()=>({id:9,update:vi.fn(async()=>({}))}));
vi.mock('../_auth',()=>({currentCustomerId:async()=>s.id}));vi.mock('@/lib/prisma',()=>({prisma:{customer:{update:s.update}}}));
import {DELETE} from './route';
beforeEach(()=>{vi.clearAllMocks();s.id=9});
describe('customer explicitly unlinks a card',()=>{
 it('disables phone rediscovery without changing MAXMA itself',async()=>{expect((await DELETE()).status).toBe(200);expect(s.update).toHaveBeenCalledWith({where:{id:9},data:{loyaltyCard:null,maxmaDiscount:false,loyaltyAutoLinkDisabled:true}})});
 it('does not unlink while signed out',async()=>{s.id=0;expect((await DELETE()).status).toBe(401);expect(s.update).not.toHaveBeenCalled()});
});
