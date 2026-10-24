import React from 'react';
import {it,expect,afterEach} from 'vitest';
import {render,cleanup,act,waitFor,fireEvent} from '@testing-library/react';
import {SurfaceSession,SurfaceView} from '../src/surface';
import {demoMessages} from '../demo/fixture';
import {completeMessages} from '../src/dsh/partial';
afterEach(cleanup);
it('official renderer creates surface and emits resolved action; exported state retains edits',async()=>{
 const sent:unknown[]=[];const session=new SurfaceSession(async a=>{sent.push(a);});
 const authored=structuredClone(demoMessages);const before=structuredClone(authored);
 session.append(authored,true);
 const {container}=render(<SurfaceView session={session}/>);
 expect(container.querySelector('.a2ui-container')).not.toBeNull();
 const surface=session.processor.model.surfacesMap.get('synthetic-workshop')!;
 function findDeep(root:ParentNode,selector:string):Element|null {
  const direct=root.querySelector(selector);if(direct)return direct;
  for(const el of root.querySelectorAll('*'))if(el.shadowRoot){const found=findDeep(el.shadowRoot,selector);if(found)return found;}
  return null;
 }
 await waitFor(()=>expect(findDeep(container,'input')).not.toBeNull());
 const input=findDeep(container,'input') as HTMLInputElement;
 fireEvent.input(input,{target:{value:'Updated synthetic topic'}});
 expect(surface.dataModel.get('/topic')).toBe('Updated synthetic topic');
 expect(authored).toEqual(before);
 expect(session.export().messages).toEqual(before);
 const button=findDeep(container,'button') as HTMLButtonElement;
 expect(button).not.toBeNull();
 fireEvent.click(button);
 await waitFor(()=>expect(sent).toHaveLength(1));
 expect(sent).toHaveLength(1);
 expect(session.export().actions).toHaveLength(1);
 const restored=new SurfaceSession(async()=>{throw new Error('Must not send on replay');});
 restored.restore(session.export());
 expect(restored.actions).toEqual(session.actions);
 expect(restored.export().actions).toEqual(session.export().actions);
 expect(restored.processor.model.surfacesMap.get(surface.id)?.dataModel.get('/topic')).toBe('Updated synthetic topic');
 restored.dispose();session.dispose();
});
it('extracts completed streamed tool arguments without repairing partial objects',()=>{
 const text=JSON.stringify({messages:demoMessages});
 for(let n=0;n<text.length;n++){
  const values=completeMessages(text.slice(0,n));
  expect(values).toEqual(demoMessages.slice(0,values.length));
 }
 expect(completeMessages(text)).toEqual(demoMessages);
});
it('rejects a new invalid batch before mutating official renderer state',()=>{
 const s=new SurfaceSession();s.append(demoMessages,true);
 const before=s.export();
 expect(()=>s.append([{version:'v0.9',deleteSurface:{surfaceId:'synthetic-workshop'}},{version:'v0.9',createSurface:{surfaceId:'bad',catalogId:'bad'}}])).toThrow();
 expect(s.export()).toEqual(before);s.dispose();
});
it('uses the latest create version after delete and recreate for replay',()=>{
 const s=new SurfaceSession();s.append(demoMessages,true);
 s.append([{version:'v0.9',deleteSurface:{surfaceId:'synthetic-workshop'}},...demoMessages.map(x=>({...x,version:'v0.9.1'}))],true);
 expect(s.export().snapshots.at(-1)?.version).toBe('v0.9.1');s.dispose();
});
it('rejects oversized action payload before sending',async()=>{
 let sent=0;const s=new SurfaceSession(async()=>{sent++;});s.append(demoMessages,true);
 const surface=s.processor.model.surfacesMap.get('synthetic-workshop')!;
 await surface.dispatchAction({name:'test',context:{data:'x'.repeat(17000)}},'submit');expect(s.lastError).toContain('ACTION_LIMIT');
 expect(sent).toBe(0);expect(s.actions).toHaveLength(0);s.dispose();
});
it('bounds concurrent sends before awaiting transport',async()=>{
 const pending:Array<()=>void>=[];let sent=0;const s=new SurfaceSession(async()=>{sent++;await new Promise<void>(resolve=>pending.push(resolve));});s.append(demoMessages,true);
 const surface=s.processor.model.surfacesMap.get('synthetic-workshop')!;
 const promises=Array.from({length:128},()=>surface.dispatchAction({name:'test',context:{}},'submit'));
 await surface.dispatchAction({name:'test',context:{}},'submit');expect(s.lastError).toContain('ACTION_LIMIT');
 expect(sent).toBe(128);for(const resolve of pending)resolve();await Promise.all(promises);
 expect(s.actions).toHaveLength(128);s.dispose();
});
it('bounds cumulative successful payload bytes before a send',async()=>{
 let sent=0;const s=new SurfaceSession(async()=>{sent++;});s.append(demoMessages,true);
 const surface=s.processor.model.surfacesMap.get('synthetic-workshop')!;
 for(let i=0;i<17;i++)await surface.dispatchAction({name:'test',context:{data:'x'.repeat(15000)}},'submit');
 await surface.dispatchAction({name:'test',context:{data:'x'.repeat(15000)}},'submit');expect(s.lastError).toContain('ACTION_LIMIT');
 expect(sent).toBe(17);s.dispose();
});
it('exports and restores a maximum 512-message document without spending history slots on snapshots',()=>{
 const messages=[...demoMessages];while(messages.length<512)messages.push({version:'v0.9',updateDataModel:{surfaceId:'synthetic-workshop',path:'/',value:{topic:'Boundary'}}});
 const original=new SurfaceSession();original.append(messages,true);
 const saved=original.export();expect(saved.messages).toHaveLength(512);expect(saved.snapshots).toHaveLength(1);
 const restored=new SurfaceSession();restored.restore(saved);expect(restored.export().messages).toHaveLength(512);
 expect(restored.processor.model.surfacesMap.get('synthetic-workshop')?.dataModel.get('/topic')).toBe('Boundary');original.dispose();restored.dispose();
});
it('preview sessions visibly reject actions before transport',async()=>{
 let sent=0;const s=new SurfaceSession(async()=>{sent++;},false);s.append(demoMessages,true);
 await s.processor.model.surfacesMap.get('synthetic-workshop')!.dispatchAction({name:'test',context:{}},'submit');
 expect(sent).toBe(0);expect(s.lastError).toContain('ACTION_PENDING');s.dispose();
});

it('isolates renderer-owned edits from authored input and other sessions using that input',()=>{
 const messages=structuredClone(demoMessages);
 const original=structuredClone(messages);
 const authoredTopic=original.find(m=>m.updateDataModel)!.updateDataModel!.value.topic;
 const a=new SurfaceSession(),b=new SurfaceSession();
 try{
  a.append(messages,true);b.append(messages,true);
  const surfaceA=a.processor.model.surfacesMap.get('synthetic-workshop')!;
  const surfaceB=b.processor.model.surfacesMap.get('synthetic-workshop')!;
  surfaceA.dataModel.set('/topic','Private unsent edit A');
  expect(messages).toEqual(original);
  expect(surfaceB.dataModel.get('/topic')).toBe(authoredTopic);
  expect(a.export().messages).toEqual(original);
  expect(a.export().snapshots[0].updateDataModel.value.topic).toBe('Private unsent edit A');
  // Mutating a caller's retained object must not change either live renderer.
  messages.find(m=>m.updateDataModel)!.updateDataModel!.value.topic='Caller update without append';
  expect(surfaceA.dataModel.get('/topic')).toBe('Private unsent edit A');
  expect(surfaceB.dataModel.get('/topic')).toBe(authoredTopic);
 }finally{a.dispose();b.dispose();}
});
it('keeps authored updates ordered and immutable when later messages change the model',()=>{
 const messages=structuredClone(demoMessages);
 const first=messages.find(m=>m.updateDataModel)!.updateDataModel!.value.topic;
 const updates=[...messages,{version:'v0.9',updateDataModel:{surfaceId:'synthetic-workshop',path:'/topic',value:'Model revision'}}];
 const session=new SurfaceSession();const restored=new SurfaceSession();
 try{
  session.append(updates,true);
  const saved=session.export();
  expect(saved.messages[2].updateDataModel.value.topic).toBe(first);
  expect(saved.messages[3].updateDataModel.value).toBe('Model revision');
  expect(saved.snapshots[0].updateDataModel.value.topic).toBe('Model revision');
  const untouched=structuredClone(saved);
  restored.restore(saved);
  restored.processor.model.surfacesMap.get('synthetic-workshop')!.dataModel.set('/topic','Restored local edit');
  expect(saved).toEqual(untouched);
  expect(restored.export().messages).toEqual(untouched.messages);
  expect(restored.export().snapshots[0].updateDataModel.value.topic).toBe('Restored local edit');
 }finally{session.dispose();restored.dispose();}
});
