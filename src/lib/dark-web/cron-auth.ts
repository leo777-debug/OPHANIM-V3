import { timingSafeEqual } from 'node:crypto';
export function cronAuthorized(request:Request,names:readonly string[]){
 const supplied=Buffer.from((request.headers.get('authorization')??'').replace(/^Bearer\s+/i,''));
 return names.some(name=>{const expected=Buffer.from(process.env[name]??'');return expected.length>0&&expected.length===supplied.length&&timingSafeEqual(expected,supplied);});
}
