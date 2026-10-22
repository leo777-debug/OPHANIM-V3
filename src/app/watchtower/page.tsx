import { redirect } from 'next/navigation';
// Keep existing bookmarks and job-file links on the shared operational globe.
export default async function WatchtowerPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;const value=params.port??params.q;
 const query=new URLSearchParams({tool:'watchtower'});
 if(typeof value==='string'&&value.length<=160)query.set('port',value);
 redirect(`/logistics/map?${query}`);
}
