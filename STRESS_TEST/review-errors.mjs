import { readdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,relative } from 'node:path';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'..');
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
const files=folder=>readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(resolve(folder,entry.name)):entry.name==='route.ts'?[resolve(folder,entry.name)]:[]);
const found=[];let patch='*** Begin Patch\n';
for(const file of files(resolve(root,'src/app/api'))){
  const name=relative(root,file).replaceAll('\\','/');if(only && name!==only)continue;
  const original=readFileSync(file,'utf8').replace(/\r\n/g,'\n');const source=ts.createSourceFile(file,original,ts.ScriptTarget.Latest,true),edits=[];
  const visit=node=>{
    if(ts.isConditionalExpression(node) && ts.isBinaryExpression(node.condition) && node.condition.operatorToken.kind===ts.SyntaxKind.InstanceOfKeyword && ts.isIdentifier(node.condition.right) && node.condition.right.text==='Error' && ts.isPropertyAccessExpression(node.whenTrue) && node.whenTrue.name.text==='message'){
      found.push({file:name,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1});
      edits.push({start:node.getStart(source),end:node.end,text:ts.isStringLiteral(node.whenFalse)?node.whenFalse.getText(source):"'Backend request unavailable.'"});
    }
    ts.forEachChild(node,visit);
  };visit(source);
  if(!edits.length)continue;let updated=original;
  for(const edit of edits.sort((a,b)=>b.start-a.start))updated=updated.slice(0,edit.start)+edit.text+updated.slice(edit.end);
  const a=original.trimEnd().split('\n'),b=updated.trimEnd().split('\n');let start=0,end=0;
  while(start<Math.min(a.length,b.length) && a[start]===b[start])start++;
  while(end<Math.min(a.length,b.length)-start && a[a.length-1-end]===b[b.length-1-end])end++;
  patch+=`*** Update File: ${file}\n@@\n`+a.slice(start,a.length-end).map(line=>'-'+line).join('\n')+'\n'+b.slice(start,b.length-end).map(line=>'+'+line).join('\n')+'\n';
}
if(process.argv.includes('--patch'))process.stdout.write(patch+'*** End Patch');
else{writeFileSync(resolve(root,'STRESS_TEST/artifacts/error-review.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Generic Error.message echo branches in API routes; explicitly typed safe-domain errors are separate',found,pass:found.length===0},null,2));console.log(JSON.stringify({found:found.length}));if(found.length)process.exitCode=1;}
