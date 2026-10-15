import { readdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,relative } from 'node:path';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const files=(folder)=>readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(resolve(folder,entry.name)):/\.tsx?$/.test(entry.name) && !/\.test(?:\.|-helper\.)/.test(entry.name)?[resolve(folder,entry.name)]:[]);
let patch='*** Begin Patch\n';const reviewed=[];
const only=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
for(const file of [...files(resolve(root,'src/app/api')),...files(resolve(root,'src/lib'))]){
  if(only && relative(root,file).replaceAll('\\','/')!==only)continue;
  const original=readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  const source=ts.createSourceFile(file,original,ts.ScriptTarget.Latest,true);const edits=[];
  const visit=node=>{
    if(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source)==='console' && ['log','warn','error','info','debug'].includes(node.expression.name.text)){
      const safe=node.arguments.length===1 && ts.isStringLiteral(node.arguments[0]);
      const fields=node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])?node.arguments[1].properties.map(property=>property.getText(source).replace(/\s+/g,'')):[];
      const audit=relative(root,file).replaceAll('\\','/')==='src/lib/shodan/scans.ts' && node.expression.name.text==='info' && node.arguments.length===2 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text==='[OPHANIM] Shodan scan submitted' && JSON.stringify(fields)===JSON.stringify(['organizationId:actor.organizationId','userId:actor.userId','auditId','scanId:result.id','targets']);
      reviewed.push({file:relative(root,file).replaceAll('\\','/'),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,staticOnly:safe,reviewedScanAudit:audit});
      if(!safe && !audit){const label=node.arguments[0] && ts.isStringLiteral(node.arguments[0])?node.arguments[0].getText(source):"'[OPHANIM] Provider operation status changed.'";edits.push({start:node.getStart(source),end:node.end,text:`${node.expression.getText(source)}(${label})`});}
    }
    ts.forEachChild(node,visit);
  };visit(source);
  let updated=original;
  for(const edit of edits.sort((a,b)=>b.start-a.start))updated=updated.slice(0,edit.start)+edit.text+updated.slice(edit.end);
  if(updated===original && !process.argv.includes('--catch-bindings'))continue;
  const referenced=(clause)=>{
    if(!clause.variableDeclaration || !ts.isIdentifier(clause.variableDeclaration.name))return false;
    const name=clause.variableDeclaration.name.text;let used=false;
    const visit=node=>{if(ts.isIdentifier(node) && node.text===name && !(ts.isPropertyAssignment(node.parent) && node.parent.name===node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name===node))used=true;ts.forEachChild(node,visit);};visit(clause.block);return used;
  };
  const getCatches=(tree)=>{const entries=[];const visit=node=>{if(ts.isCatchClause(node))entries.push(node);ts.forEachChild(node,visit);};visit(tree);return entries;};
  let beforeSource=source;
  if(process.argv.includes('--catch-bindings')){
    try{beforeSource=ts.createSourceFile(file,execFileSync('git',['show',`HEAD:${relative(root,file).replaceAll('\\','/')}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}),ts.ScriptTarget.Latest,true);}catch{continue;}
  }
  const previous=getCatches(beforeSource);
  const parsed=ts.createSourceFile(file,updated,ts.ScriptTarget.Latest,true);const catches=[];let catchIndex=0;
  if(getCatches(parsed).length!==previous.length)continue;
  const cleanCatch=node=>{
    if(ts.isCatchClause(node)){
      const prior=previous[catchIndex++];
      if(node.variableDeclaration && !referenced(node) && referenced(prior))catches.push({start:node.getStart(parsed),end:node.block.getStart(parsed),text:'catch '});
      else if(!node.variableDeclaration && prior.variableDeclaration && !referenced(prior))catches.push({start:node.getStart(parsed),end:node.block.getStart(parsed),text:beforeSource.text.slice(prior.getStart(beforeSource),prior.block.getStart(beforeSource))});
    }
    ts.forEachChild(node,cleanCatch);
  };cleanCatch(parsed);
  for(const edit of catches.sort((a,b)=>b.start-a.start))updated=updated.slice(0,edit.start)+edit.text+updated.slice(edit.end);
  if(updated===original)continue;
  if(process.argv.includes('--write'))writeFileSync(file,updated);
  const oldLines=original.trimEnd().split('\n'),newLines=updated.trimEnd().split('\n');let start=0,end=0;
  while(oldLines[start]===newLines[start] && start<Math.min(oldLines.length,newLines.length))start++;
  while(oldLines[oldLines.length-1-end]===newLines[newLines.length-1-end] && end<Math.min(oldLines.length,newLines.length)-start)end++;
  patch+=`*** Update File: ${file}\n@@\n`+oldLines.slice(start,oldLines.length-end).map(line=>'-'+line).join('\n')+'\n'+newLines.slice(start,newLines.length-end).map(line=>'+'+line).join('\n')+'\n';
}
if(process.argv.includes('--patch'))process.stdout.write(patch+'*** End Patch');
else{
  const unsafe=reviewed.filter(item=>!item.staticOnly && !item.reviewedScanAudit);
  writeFileSync(resolve(root,'STRESS_TEST/artifacts/log-review.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'API and server-library console calls, excluding test helpers and framework/dependencies; exact structured scan audit intentionally retained (actor IDs, scan ID, authorized targets; no credentials)',calls:reviewed.length,reviewedScanAudits:reviewed.filter(item=>item.reviewedScanAudit),unsafe,pass:unsafe.length===0},null,2));
  console.log(JSON.stringify({calls:reviewed.length,reviewedScanAudits:reviewed.filter(item=>item.reviewedScanAudit).length,unsafe:unsafe.length}));
  if(unsafe.length)process.exitCode=1;
}
