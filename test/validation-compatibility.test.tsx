import React from 'react';
import {afterEach,describe,expect,it} from 'vitest';
import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import type {Context} from '@deepseek-ai/cordis';
import type {ToolDefinition,ToolRunContext} from '@deepseek-ai/dsh-tools';
import {JsonlDecoder,validateDocument,validateMessage,type Message} from '../src/protocol';
import {importRecording} from '../src/replay';
import {SurfaceSession,SurfaceView} from '../src/surface';
import {apply} from '../src/dsh/tool';
import {definition} from '../src/dsh/node';
import fixture from '../demo/validation-fixture.json';
afterEach(cleanup);
function document(version:string):Message[]{return structuredClone(fixture).map(message=>({...message,version}));}
function field(messages:Message[]):Message{return messages[2].updateComponents.components.find((component:Message)=>component.id==='code');}
function unsupported(version:string,pattern:unknown='',withChecks=false):Message[]{
 const messages=document(version);const input=field(messages);input.validationRegexp=pattern;
 if(!withChecks)delete input.checks;
 return messages;
}
function register(){let tool:ToolDefinition|undefined;apply({tools:{register:(value:ToolDefinition)=>{tool=value;}}} as unknown as Context);return tool!;}
function preview(messages:Message[]){
 const event={type:'tool/call',seq:1,data:{name:'render_a2ui',callId:'synthetic-validation-call',arguments:JSON.stringify({messages})}};
 const match={event,location:{kind:'unresolved'}};
 const state=definition.start!({} as any,match as any,{} as any);
 const view=(current:any)=>definition.buildViewNode!({state:current,key:'synthetic',id:'synthetic-validation-call',start:match,matches:[match]} as any) as any;
 return {state,view};
}
describe.each(['v0.9','v0.9.1'])('%s runtime validation compatibility',version=>{
 it.each(['','^[A-Z]{2}[0-9]{2}$'])('rejects present validationRegexp %j without changing the input',pattern=>{
  const messages=unsupported(version,pattern);const before=structuredClone(messages);
  expect(()=>validateMessage(messages[2])).toThrow(/^COMPATIBILITY: TextField.validationRegexp/);
  expect(()=>validateDocument(messages)).toThrow('pinned @a2ui/web_core 0.14.0');
  expect(messages).toEqual(before);
 });
 it('rejects the unsupported property even when explicit checks are also present',()=>{
  expect(()=>validateDocument(unsupported(version,'',true))).toThrow('COMPATIBILITY');
 });
 it('keeps malformed official properties a schema error rather than a compatibility error',()=>{
  expect(()=>validateDocument(unsupported(version,42))).toThrow(/^SCHEMA:/);
 });
 it('accepts unchanged explicit checks and similarly named arbitrary data',()=>{
  const messages=document(version);
  messages[1].updateDataModel.value.validationRegexp='arbitrary model field';
  messages[1].updateDataModel.value.nested={component:'TextField',validationRegexp:''};
  const button=messages[2].updateComponents.components.find((component:Message)=>component.id==='submit');
  button.action.event.context.validationRegexp='ordinary context data';
  expect(validateDocument(messages)).toEqual(messages);
 });
 it('rejects a streamed definition before accepting it and leaves earlier valid messages intact',()=>{
  const messages=unsupported(version);const decoder=new JsonlDecoder();
  expect(decoder.push(messages.slice(0,2).map(message=>JSON.stringify(message)).join('\n')+'\n')).toEqual(messages.slice(0,2));
  const text=JSON.stringify(messages[2]);
  expect(decoder.push(text.slice(0,text.length-1))).toEqual([]);
  expect(()=>decoder.push(text.slice(-1)+'\n')).toThrow('COMPATIBILITY');
  // A rejection does not insert the bad component into the accepted stream.
  decoder.push(JSON.stringify(document(version)[2])+'\n');
  expect(decoder.finish()).toEqual(document(version));
 });
 it('rejects an appended mixed batch atomically before changing renderer state',()=>{
  const session=new SurfaceSession();session.append(document(version),true);
  try{
   const before=session.export();
   const update={version,updateDataModel:{surfaceId:'synthetic-validation',path:'/code',value:'CD34'}};
   expect(()=>session.append([update,unsupported(version)[2]],true)).toThrow('COMPATIBILITY');
   expect(session.export()).toEqual(before);
   expect(session.processor.model.surfacesMap.get('synthetic-validation')!.dataModel.get('/code')).toBe('AB12');
  }finally{session.dispose();}
 });
 it('rejects old recordings without rewriting their messages or replaying actions',()=>{
  const value={format:'dsh-a2ui-recording/1',messages:unsupported(version),snapshots:[],actions:[]};
  const before=structuredClone(value);
  expect(()=>importRecording(JSON.stringify(value))).toThrow('COMPATIBILITY');
  expect(value).toEqual(before);
 });
 it('rejects the real SDK tool execution without returning validated metadata',async()=>{
  const tool=register();
  expect(tool.description).toContain('TextField.validationRegexp');
  await expect(tool.execute({messages:unsupported(version)},{callId:'synthetic-validation',signal:new AbortController().signal} as ToolRunContext)).rejects.toThrow('COMPATIBILITY');
  const accepted=await tool.execute({messages:document(version)},{callId:'synthetic-validation',signal:new AbortController().signal} as ToolRunContext) as any;
  expect(accepted.recording.messages).toEqual(document(version));
 });
 it('shows compatibility errors and no payload in preview and final host projections',()=>{
  const messages=unsupported(version);const {state,view}=preview(messages);
  expect(view(state).data).toEqual({messages:[],running:true,error:expect.stringContaining('COMPATIBILITY')});
  const settled=definition.update!({state} as any,{event:{type:'tool/result',data:{message:{isError:false},meta:{kind:'dsh-a2ui/1',messages}}}} as any);
  expect(view(settled).data).toEqual({messages:[],running:false,error:expect.stringContaining('COMPATIBILITY')});
 });
 it('runs explicit checks, independently gates Button, and preserves validation through replay',async()=>{
  const sent:Message[]=[];const session=new SurfaceSession(async action=>{sent.push(action);});
  const messages=document(version);const before=structuredClone(messages);session.append(messages,true);
  const restored=new SurfaceSession(async()=>{throw new Error('Replay must not send');});
  try{
   const first=render(<SurfaceView session={session}/>);
   await waitFor(()=>expect(first.container.querySelector('input[type=text]')).not.toBeNull());
   const input=first.container.querySelector('input[type=text]') as HTMLInputElement;
   const button=first.container.querySelector('button')!;
   expect(input.value).toBe('AB12');expect(button.disabled).toBe(false);
   fireEvent.input(input,{target:{value:'bad'}});
   await waitFor(()=>expect(input.classList.contains('a2ui-invalid')).toBe(true));
   expect(first.container.querySelector('.a2ui-error-message')?.textContent).toBe(field(messages).checks[0].message);
   expect(button.disabled).toBe(true);fireEvent.click(button);expect(sent).toHaveLength(0);
   fireEvent.input(input,{target:{value:'CD34'}});
   await waitFor(()=>expect(button.disabled).toBe(false));
   expect(first.container.querySelector('.a2ui-error-message')).toBeNull();
   fireEvent.click(button);await waitFor(()=>expect(sent).toHaveLength(1));
   expect(sent[0].version).toBe(version);expect(sent[0].action.context).toEqual({code:'CD34'});
   act(()=>session.append([{version,updateDataModel:{surfaceId:'synthetic-validation',path:'/code',value:'wrong'}}]));
   await waitFor(()=>expect(button.disabled).toBe(true));
   expect(input.value).toBe('wrong');expect(input.classList.contains('a2ui-invalid')).toBe(true);
   const saved=importRecording(JSON.stringify(session.export()));restored.restore(saved);
   first.unmount();const second=render(<SurfaceView session={restored}/>);
   await waitFor(()=>expect(second.container.querySelector('button')?.disabled).toBe(true));
   expect((second.container.querySelector('input[type=text]') as HTMLInputElement).value).toBe('wrong');
   expect(restored.actions).toHaveLength(1);expect(sent).toHaveLength(1);expect(messages).toEqual(before);
  }finally{restored.dispose();session.dispose();}
 });
 it('does not aggregate field-only checks into a Button that has no checks',async()=>{
  const messages=document(version);delete messages[2].updateComponents.components.find((component:Message)=>component.id==='submit').checks;
  const session=new SurfaceSession();session.append(messages,true);
  try{
   const {container}=render(<SurfaceView session={session}/>);
   await waitFor(()=>expect(container.querySelector('input[type=text]')).not.toBeNull());
   const input=container.querySelector('input[type=text]') as HTMLInputElement;
   fireEvent.input(input,{target:{value:'bad'}});
   await waitFor(()=>expect(input.classList.contains('a2ui-invalid')).toBe(true));
   expect(container.querySelector('button')?.disabled).toBe(false);
  }finally{session.dispose();}
 });
});
