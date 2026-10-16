import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';

const root=resolve(import.meta.dirname,'..');
const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});
const paths=[...new Set([...git(['diff','--name-only','HEAD']).split(/\r?\n/),...git(['ls-files','--others','--exclude-standard']).split(/\r?\n/)])].filter(file=>/\.(?:[cm]?js|tsx?)$/.test(file) && !file.startsWith('STRESS_TEST/runtime/'));
const eslint=new ESLint({cwd:root});
const baseline=[];
for(const file of paths){
  let source;try{source=git(['show',`HEAD:${file}`]);}catch{continue;}
  baseline.push(...await eslint.lintText(source,{filePath:resolve(root,file)}));
}
const current=await eslint.lintFiles(paths);
// React diagnostics embed surrounding source and line numbers inside message.
// Preserve the flagged expression, but ignore unrelated context-line changes.
const diagnostic=message=>message.split('\n').filter(line=>!/^\s*\d+\s*\|/.test(line)).map(line=>line.replace(/^\s*>\s*\d+\s*\|/,'> |').replace(/:\d+:\d+\s*$/,'')).join('\n');
const key=(result,message)=>`${result.filePath}:${message.ruleId}:${diagnostic(message.message)}`;
const remaining=new Map();
for(const result of baseline)for(const message of result.messages)remaining.set(key(result,message),(remaining.get(key(result,message))??0)+1);
const introduced=[];
for(const result of current)for(const message of result.messages){const id=key(result,message),count=remaining.get(id)??0;if(count)remaining.set(id,count-1);else introduced.push({file:result.filePath.slice(root.length+1),rule:message.ruleId,severity:message.severity,line:message.line,message:message.message});}
const totals=results=>({errors:results.reduce((n,result)=>n+result.errorCount,0),warnings:results.reduce((n,result)=>n+result.warningCount,0)});
await writeFile(resolve(root,'STRESS_TEST/artifacts/focused-lint.json'),JSON.stringify({checkedAt:new Date().toISOString(),comparison:'HEAD versus working revision; diagnostic/rule multiplicity and flagged expressions retained, surrounding code-frame context/line numbers excluded',files:paths.length,baseline:totals(baseline),current:totals(current),introduced},null,2));
console.log(JSON.stringify({files:paths.length,baseline:totals(baseline),current:totals(current),introduced}));
if(introduced.length)process.exitCode=1;
