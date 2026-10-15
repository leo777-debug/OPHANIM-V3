import { readdirSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { beforeEach,afterAll,describe,expect,it,vi } from 'vitest';
import { can,requireOrganizationAccess } from '@/lib/operations/authorization';
import { OPHANIM_MEMBER_ROLES,type OphanimMemberRole,type OrganizationPermission } from '@/lib/operations/types';

const principal=vi.hoisted(()=>({role:'viewer' as OphanimMemberRole}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth/actor',()=>({
  getAuthenticatedActor:vi.fn(async()=>({userId:'11111111-1111-4111-8111-111111111111',organizationId:'22222222-2222-4222-8222-222222222222',role:principal.role,email:'synthetic@example.test',displayName:null,authProvider:'legacy' as const})),
  requireAuthenticatedActor:vi.fn(async(_request,permission)=>{
    const actor={userId:'11111111-1111-4111-8111-111111111111',organizationId:'22222222-2222-4222-8222-222222222222',role:principal.role};
    if(permission)requireOrganizationAccess(actor,actor.organizationId,permission);
    return actor;
  }),
}));
import { requireAuthenticatedActor } from './actor';
const folder=resolve('src/app/api');
function files(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(resolve(path,entry.name)):entry.name==='route.ts'?[resolve(path,entry.name)]:[]);}
const cases=files(folder).flatMap(file=>{
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  return source.statements.flatMap(statement=>{
    if(!ts.isFunctionDeclaration(statement) || !statement.name || !/^(GET|POST|PUT|PATCH|DELETE)$/.test(statement.name.text) || !statement.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))return [];
    const permissions:string[]=[];
    const visit=(node:ts.Node)=>{if(ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text==='requireAuthenticatedActor' && node.arguments[1] && ts.isStringLiteral(node.arguments[1]))permissions.push(node.arguments[1].text);ts.forEachChild(node,visit);};
    if(statement.body)visit(statement.body);
    const permission=permissions[0] as OrganizationPermission|undefined;
    if(!permission)return [];
    return OPHANIM_MEMBER_ROLES.filter(role=>!can({userId:'test',organizationId:'test',role},permission)).map(role=>({file,method:statement.name!.text,name:file.slice(folder.length).replaceAll('\\','/').replace('/route.ts',''),permission,role}));
  });
});
const fetchSpy=vi.fn(async()=>{throw new Error('Role-denial checks must never contact providers.');});
vi.stubGlobal('fetch',fetchSpy);
beforeEach(()=>vi.clearAllMocks());afterAll(()=>vi.unstubAllGlobals());
describe('declared role denial through every restricted route handler',()=>{
  it.each(cases)('$role cannot call $method $name ($permission)',async({file,method,name,permission,role})=>{
    principal.role=role;
    const handlers=await import(file.replaceAll('\\','/')) as Record<string,(request:NextRequest,context:unknown)=>Promise<Response>>;
    const request=new NextRequest(`http://localhost/api${name.replaceAll(/\[[^\]]+\]/g,'11111111-1111-4111-8111-111111111111')}`,{method,...(method==='GET'?{}:{headers:{Origin:'http://localhost','Content-Type':'application/json'},body:'{}'})});
    const response=await handlers[method](request,{params:Promise.resolve({id:'11111111-1111-4111-8111-111111111111',type:'shipment'})});
    expect([401,403],`${role}: ${method} ${name}`).toContain(response.status);
    expect(vi.mocked(requireAuthenticatedActor).mock.calls.some(([,checked])=>checked===permission)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
