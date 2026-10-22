import { beforeEach,describe,expect,it,vi } from 'vitest';
import { NextRequest,NextResponse } from 'next/server';
import { GET,POST,PATCH } from './route';
const mocks=vi.hoisted(()=>({actor:vi.fn(),query:vi.fn(),shipment:vi.fn(),worker:vi.fn(),get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('@/lib/auth/actor',()=>({requireAuthenticatedActor:mocks.actor}));
vi.mock('@/lib/watchlists/db',()=>({db:()=>({query:mocks.query})}));
vi.mock('@/lib/logistics/shipments',()=>({getShipment:mocks.shipment}));
vi.mock('@/lib/forecast/http',async original=>({...await original<typeof import('@/lib/forecast/http')>(),callForecastWorker:mocks.worker}));
vi.mock('./analyst/route',()=>({GET:mocks.get,POST:mocks.post,PATCH:mocks.patch}));
const id='51000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({organizationId:'server-tenant',userId:'owner',role:'owner',authProvider:'legacy'});mocks.query.mockResolvedValue({rows:[]});});
const post=(body:unknown,origin='http://localhost')=>POST(new NextRequest('http://localhost/api/forecasts',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
describe('both forecast API contracts coexist',()=>{
 it('dispatches legacy list/create/resolve to the sourced analyst ledger',async()=>{
  mocks.get.mockResolvedValue(NextResponse.json({forecasts:[],writable:true}));expect((await GET(new NextRequest('http://localhost/api/forecasts'))).status).toBe(200);
  mocks.post.mockImplementation(async req=>NextResponse.json(await req.json(),{status:201}));
  const response=await post({question:'Will gate clear?',probability:.7});expect(response.status).toBe(201);expect((await response.json()).probability).toBe(.7);
  expect(PATCH).toBe(mocks.patch);expect(mocks.worker).not.toHaveBeenCalled();
 });
 it('preserves shipment reads and worker issuance with a server-derived tenant',async()=>{
  expect((await GET(new NextRequest(`http://localhost/api/forecasts?shipmentId=${id}`))).status).toBe(200);expect(mocks.query.mock.calls[0][1]).toEqual(['server-tenant',id]);
  mocks.shipment.mockResolvedValue({id});mocks.worker.mockResolvedValue({status:'withheld'});
  expect((await post({shipmentId:id})).status).toBe(200);expect(mocks.worker).toHaveBeenCalledWith('/forecast',{organization_id:'server-tenant',shipment_id:id});expect(mocks.post).not.toHaveBeenCalled();
 });
 it('rejects ambiguous and oversized requests and foreign-origin worker calls',async()=>{
  expect((await post({shipmentId:id,question:'ambiguous'})).status).toBe(400);
  expect((await post({question:'x'.repeat(13000)})).status).toBe(400);
  expect((await post({shipmentId:id},'https://foreign.example')).status).toBe(400);
  expect((await GET(new NextRequest(`http://localhost/api/forecasts?shipment=${id}&shipmentId=bad`))).status).toBe(400);expect(mocks.worker).not.toHaveBeenCalled();expect(mocks.post).not.toHaveBeenCalled();
 });
});
