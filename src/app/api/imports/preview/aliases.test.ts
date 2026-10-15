import { NextRequest } from 'next/server';
import { beforeEach,describe,expect,it,vi } from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth/actor',()=>({requireAuthenticatedActor:async()=>({organizationId:'synthetic-org',userId:`synthetic-import-user-${mocks.case}`,role:'owner'})}));
vi.mock('@/lib/imports/access',()=>({assertImportFeature:()=>{}}));
vi.mock('@/lib/platform/capabilities',()=>({requirePlatformCapability:async()=>{}}));
vi.mock('@/lib/imports/pipeline',()=>({previewImportCsv:()=>({rows:[]})}));
const mocks=vi.hoisted(()=>({persist:vi.fn(),entity:vi.fn(),case:0}));
vi.mock('@/lib/imports/repository',()=>({persistImportPreview:mocks.persist}));
vi.mock('@/lib/imports/generic-entity-import',()=>({createEntityImport:mocks.entity}));
import { POST as shipmentPreview } from '@/app/api/logistics/shipments/imports/preview/route';
import { POST as platformPreview } from '@/app/api/platform/imports/preview/route';
import { MAX_IMPORT_BYTES } from '@/lib/imports/csv';
async function request(kind:string,index=0,large=false){
  const url='http://localhost/api/imports/preview';
  if(kind==='shipment')return new NextRequest(url,{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json','x-forwarded-for':`198.51.${mocks.case}.${index+1}`},body:JSON.stringify({fileName:'synthetic.csv',csv:large?'x'.repeat(MAX_IMPORT_BYTES*2+300000):'Shipment Reference\nSynthetic'})});
  const form=new FormData();form.set('file',new File([large?'x'.repeat(MAX_IMPORT_BYTES+300000):'Name\nSynthetic'],'synthetic.csv',{type:'text/csv'}));form.set('entityType','company');form.set('mapping','{}');
  // Model received multipart bytes, not undici's still-running File serializer.
  const serialized=new Response(form),bytes=await serialized.arrayBuffer();
  return new NextRequest(url,{method:'POST',headers:{Origin:'http://localhost','Content-Type':serialized.headers.get('content-type')!,'x-forwarded-for':`198.51.${mocks.case}.${index+1}`},body:bytes});
}
beforeEach(()=>{mocks.case++;vi.clearAllMocks();mocks.persist.mockResolvedValue({id:'synthetic-import'});mocks.entity.mockResolvedValue({id:'synthetic-entity-import'});});
describe.each([['shipment',shipmentPreview],['platform',platformPreview]] as const)('%s legacy preview', (kind,handler)=>{
  it('bounds actual request bytes before persistence',async()=>{expect((await handler(await request(kind,0,true))).status).toBe(413);expect(mocks.persist).not.toHaveBeenCalled();expect(mocks.entity).not.toHaveBeenCalled();});
  it('shares the user budget despite changing forwarded addresses',async()=>{for(let index=0;index<20;index++)expect((await handler(await request(kind,index))).status).toBeLessThan(300);expect((await handler(await request(kind,20))).status).toBe(429);});
});
it('shares one budget across both legacy aliases',async()=>{for(let index=0;index<20;index++)expect((await (index%2?platformPreview:shipmentPreview)(await request(index%2?'platform':'shipment',index))).status).toBeLessThan(300);expect((await shipmentPreview(await request('shipment',21))).status).toBe(429);});
