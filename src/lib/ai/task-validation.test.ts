import { describe,expect,it } from 'vitest';
import { validateTaskOutput } from './task-validation';
import { DOCUMENT_FIELDS } from './task-schemas';
import { buildAiMessages } from './task-policy';
describe('dual-mode strict task output',()=>{
  it('requires every extraction field, null for missing, and correct field types',()=>{
    const target=Object.fromEntries(DOCUMENT_FIELDS.extract_awb.map(f=>[f,null]));
    expect(()=>validateTaskOutput('extract_awb',JSON.stringify(target))).not.toThrow();
    expect(()=>validateTaskOutput('extract_awb',JSON.stringify({...target,pieces:'48'}))).toThrow();
    expect(()=>validateTaskOutput('extract_awb','{}')).toThrow();
  });
  it('tags both modes and fences document instructions',()=>{
    expect(buildAiMessages({task:'extract_awb'})[0].content).toContain('[mode: logistics][task: extract_awb]');
    const general=buildAiMessages({task:'forecast'})[0].content;expect(general).toContain('[mode: general][task: forecast]');expect(general).toContain('FORECAST');expect(general).toContain('untrusted data');
    expect(buildAiMessages({task:'grounded_qa',mode:'general'})[0].content).toContain('[mode: general][task: grounded_qa]');
  });
});
