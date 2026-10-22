import type { NextRequest } from 'next/server';
import { sameOrigin } from '@/lib/presentation/http';
export function requireSameOrigin(request:NextRequest){
 const origin=request.headers.get('origin');
 if(!origin||!sameOrigin(request))throw new Error('Same-origin request required.');
}
export const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function callForecastWorker(path:'/forecast'|'/resolve',body:Record<string,string>){
 const base=process.env.FORECAST_WORKER_URL||(process.env.FORECAST_WORKER_HOST?`http://${process.env.FORECAST_WORKER_HOST}:8081`:undefined),token=process.env.FORECAST_WORKER_TOKEN;
 if(!base||!token)return {status:'withheld',reason:'Local forecast worker is not configured.'};
 const url=new URL(base);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid internal worker configuration.');
 const response=await fetch(new URL(path,url),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('Local forecast worker unavailable; no prediction issued.');
 return response.json();
}
