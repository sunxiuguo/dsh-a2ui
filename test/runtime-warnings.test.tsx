import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {ComponentContext,DataContext,GenericBinder} from '@a2ui/web_core/v0_9';
import {basicCatalog,ButtonApi} from '@a2ui/web_core/v0_9/basic_catalog';
import {CATALOG_ID,type Message} from '../src/protocol';
import {importRecording} from '../src/replay';
import {SurfaceSession,SurfaceView} from '../src/surface';

const notice='Runtime warning observed. Some content may be unavailable. Dismissing this notice does not confirm recovery.';
const dismiss='Dismiss runtime warning';
const malformed='${1.2.3}';
const denied='${openUrl(url: "https://example.invalid/synthetic-runtime-marker")}';
const format=(value:unknown)=>({call:'formatString',args:{value},returnType:'string'});
function document(version:string,id='affected',template='Hello ${/name}'):Message[]{return [
 {version,createSurface:{surfaceId:id,catalogId:CATALOG_ID}},
 {version,updateDataModel:{surfaceId:id,path:'/',value:{name:'Synthetic',template}}},
 {version,updateComponents:{surfaceId:id,components:[{id:'root',component:'Text',text:format({path:'/template'})}]}},
];}
function update(version:string,id:string,value:string):Message{return {version,updateDataModel:{surfaceId:id,path:'/template',value}};}
const error={code:'SYNTHETIC_RUNTIME_ERROR',message:'SYNTHETIC_PAYLOAD_MARKER',expression:'SYNTHETIC_EXPRESSION_MARKER',details:{value:'SYNTHETIC_DETAIL_MARKER'}};
const sessions:SurfaceSession[]=[];
function session(send?:(message:Message)=>Promise<void>){const value=new SurfaceSession(send);sessions.push(value);return value;}
beforeEach(()=>{
 // Even a regression cannot navigate or issue a network request in this suite.
 vi.spyOn(basicCatalog.functions.get('openUrl')!,'execute').mockImplementation(()=>{throw new Error('Original navigation executor must never run');});
 vi.spyOn(window,'open').mockImplementation(()=>{throw new Error('Unexpected window.open');});
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected fetch');}));
});
afterEach(()=>{
 cleanup();for(const value of sessions.splice(0))value.dispose();
 try{expect(basicCatalog.functions.get('openUrl')!.execute).not.toHaveBeenCalled();expect(window.open).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();}
 finally{vi.restoreAllMocks();vi.unstubAllGlobals();}
});

describe.each(['v0.9','v0.9.1'])('%s runtime notice lifecycle',version=>{
 it('captures actual evaluator failures before the view mounts without retaining error payloads',async()=>{
  const value=session();value.append(document(version),true);
  const original=value.export();
  const context=new DataContext(value.processor.model.surfacesMap.get('affected')!,'/');
  expect(context.resolveDynamicValue(format(malformed))).toBeUndefined();
  expect(value.hasRuntimeWarning('affected')).toBe(true);
  expect(value.lastError).toBeNull();
  const view=render(<SurfaceView session={value}/>);
  expect(view.getByRole('alert').textContent).toBe(notice+dismiss);
  expect(value.export()).toEqual(original);
 });
 it.each([['malformed',malformed],['denied',denied]])('shows initial %s binding failures with fixed text and no React render-phase update warning',async(_label,template)=>{
  const consoleError=vi.spyOn(console,'error');
  const value=session();value.append(document(version,'affected',template),true);
  const view=render(<SurfaceView session={value}/>);
  await waitFor(()=>expect(view.getByRole('alert').textContent).toBe(notice+dismiss));
  expect(view.getAllByRole('alert')).toHaveLength(1);
  expect(view.container.textContent).not.toContain('synthetic-runtime-marker');
  expect(view.container.textContent).not.toContain('POLICY_NAVIGATION');
  expect(value.lastError).toBeNull();
  expect(consoleError.mock.calls.map(args=>args.map(String).join(' ')).join('\n')).not.toMatch(/Cannot update a component|Too many re-renders|Maximum update depth/);
 });
 it('keeps the observed warning through a good edit and unrelated action, then permits explicit dismissal and later recurrence',async()=>{
  const sent=vi.fn(async()=>{});const value=session(sent);
  value.append([...document(version,'affected',malformed),...document(version,'unaffected')],true);
  const view=render(<SurfaceView session={value}/>);
  await waitFor(()=>expect(view.getAllByRole('alert')).toHaveLength(1));
  await act(async()=>{
   value.append([update(version,'affected','Corrected ${/name}')]);
   await value.processor.model.surfacesMap.get('unaffected')!.dispatchAction({name:'save',context:{synthetic:true}},'root');
  });
  expect(sent).toHaveBeenCalledTimes(1);expect(value.lastError).toBeNull();
  expect(value.hasRuntimeWarning('affected')).toBe(true);expect(value.hasRuntimeWarning('unaffected')).toBe(false);
  expect(view.getAllByRole('alert')).toHaveLength(1);
  fireEvent.click(view.getByRole('button',{name:dismiss}));
  await waitFor(()=>expect(view.queryByRole('alert')).toBeNull());
  await act(async()=>{value.append([update(version,'affected',denied)]);});
  await waitFor(()=>expect(view.getAllByRole('alert')).toHaveLength(1));
 });
 it('does not turn action-time expression failure into action rejection or delivery success into runtime recovery',async()=>{
  const sent:Message[]=[];const value=session(async message=>{sent.push(message);});
  const messages=document(version,'affected',denied);
  messages[2].updateComponents.components=[
   {id:'root',component:'Button',child:'label',action:{event:{name:'save',context:{result:format({path:'/template'}),literal:'Synthetic'}}}},
   {id:'label',component:'Text',text:'Save synthetic'},
  ];
  value.append(messages,true);const surface=value.processor.model.surfacesMap.get('affected')!;
  const binder=new GenericBinder<any>(new ComponentContext(surface,'root'),ButtonApi.schema);binder.subscribe(()=>{});
  try{
   expect(value.hasRuntimeWarning('affected')).toBe(false);
   await binder.snapshot.action();
   expect(sent[0].action.context).toEqual({result:'',literal:'Synthetic'});
   expect(value.actions).toHaveLength(1);expect(value.lastError).toBeNull();expect(value.hasRuntimeWarning('affected')).toBe(true);
  }finally{binder.dispose();}
 });
 it('deduplicates repeated errors per surface and never uses payload contents to choose or display a notice',async()=>{
  const value=session();value.append([...document(version),...document(version,'unaffected')],true);
  const changed=vi.fn();value.subscribeStatus(changed);
  const surface=value.processor.model.surfacesMap.get('affected')!;
  await Promise.all(Array.from({length:100},()=>surface.dispatchError({...error,surfaceId:'unaffected'})));
  expect(changed).toHaveBeenCalledTimes(1);expect(value.hasRuntimeWarning('affected')).toBe(true);expect(value.hasRuntimeWarning('unaffected')).toBe(false);
  await surface.dispatchError(error);expect(changed).toHaveBeenCalledTimes(1);
  const view=render(<SurfaceView session={value}/>);
  expect(view.getAllByRole('alert')).toHaveLength(1);expect(view.getByRole('alert').textContent).toBe(notice+dismiss);
  expect(view.container.innerHTML).not.toContain('SYNTHETIC_');
  await act(async()=>{value.dismissRuntimeWarning('affected');});
  expect(value.hasRuntimeWarning('affected')).toBe(false);
  await act(async()=>{await surface.dispatchError(error);});
  expect(value.hasRuntimeWarning('affected')).toBe(true);expect(view.getAllByRole('alert')).toHaveLength(1);
 });
 it('keeps delivery error state independent from runtime notices and dismissal',async()=>{
  let fail=true;const value=session(async()=>{if(fail)throw new Error('Synthetic delivery failure');});value.append(document(version),true);
  const surface=value.processor.model.surfacesMap.get('affected')!;
  await surface.dispatchError(error);await surface.dispatchAction({name:'save',context:{}},'root');
  const view=render(<SurfaceView session={value}/>);
  expect(view.getAllByRole('alert')).toHaveLength(2);expect(value.lastError).toBe('Synthetic delivery failure');
  await act(async()=>{value.dismissRuntimeWarning('affected');});
  expect(view.getAllByRole('alert')).toHaveLength(1);expect(value.lastError).toBe('Synthetic delivery failure');
  await act(async()=>{await surface.dispatchError(error);fail=false;await surface.dispatchAction({name:'save',context:{}},'root');});
  expect(value.lastError).toBeNull();expect(view.getAllByRole('alert')).toHaveLength(1);expect(value.hasRuntimeWarning('affected')).toBe(true);
 });
 it('cleans deletion state and treats a recreated surface ID as a new instance',async()=>{
  const value=session();value.append([...document(version),...document(version,'unaffected')],true);
  const old=value.processor.model.surfacesMap.get('affected')!;
  await old.dispatchError(error);await value.processor.model.surfacesMap.get('unaffected')!.dispatchError(error);
  value.append([{version,deleteSurface:{surfaceId:'affected'}},...document(version)],true);
  const replacement=value.processor.model.surfacesMap.get('affected')!;
  expect(replacement).not.toBe(old);expect(value.hasRuntimeWarning('affected')).toBe(false);expect(value.hasRuntimeWarning('unaffected')).toBe(true);
  await old.dispatchError(error);expect(value.hasRuntimeWarning('affected')).toBe(false);
  await replacement.dispatchError(error);expect(value.hasRuntimeWarning('affected')).toBe(true);
  value.append([{version,deleteSurface:{surfaceId:'affected'}}],true);
  expect(value.hasRuntimeWarning('affected')).toBe(false);expect(value.hasRuntimeWarning('unaffected')).toBe(true);
 });
 it('does not serialize warnings or dismissals, and replay only shows newly evaluated failures',async()=>{
  const value=session();value.append(document(version),true);const clean=value.export();
  await value.processor.model.surfacesMap.get('affected')!.dispatchError(error);
  expect(value.export()).toEqual(clean);
  value.dismissRuntimeWarning('affected');expect(value.export()).toEqual(clean);
  const replaySend=vi.fn(async()=>{}),restored=session(replaySend);
  restored.restore(importRecording(JSON.stringify(clean)));
  expect(restored.hasRuntimeWarning('affected')).toBe(false);expect(replaySend).not.toHaveBeenCalled();
  const bad=session();bad.append(document(version,'affected',malformed),true);
  const badReplay=session(replaySend);badReplay.restore(importRecording(JSON.stringify(bad.export())));
  expect(badReplay.hasRuntimeWarning('affected')).toBe(false);
  const view=render(<SurfaceView session={badReplay}/>);
  await waitFor(()=>expect(view.getAllByRole('alert')).toHaveLength(1));expect(replaySend).not.toHaveBeenCalled();
 });
 it('drops queued notifications and detaches owned listeners on dispose',async()=>{
  const value=session();value.append(document(version),true);const changed=vi.fn();value.subscribeStatus(changed);
  const surface=value.processor.model.surfacesMap.get('affected')!;
  const pending=surface.dispatchError(error);expect(value.hasRuntimeWarning('affected')).toBe(true);
  value.dispose();await pending;
  expect(changed).not.toHaveBeenCalled();expect(value.hasRuntimeWarning('affected')).toBe(false);
  await surface.dispatchError(error);expect(value.hasRuntimeWarning('affected')).toBe(false);
  // The pinned processor's dispose only disposes RPC, so this public event
  // remains a useful regression probe for leaked creation subscriptions.
  value.processor.processMessages(document(version,'after-dispose'));
  await value.processor.model.surfacesMap.get('after-dispose')!.dispatchError(error);
  expect(value.hasRuntimeWarning('after-dispose')).toBe(false);expect(changed).not.toHaveBeenCalled();
 });
 it('captures errors from later public creation listeners before a view is attached',async()=>{
  const value=session();
  const created=value.processor.onSurfaceCreated(surface=>{new DataContext(surface,'/').resolveDynamicValue(format(malformed));});
  try{
   value.append(document(version),true);
   await Promise.resolve();
   expect(value.hasRuntimeWarning('affected')).toBe(true);
   const view=render(<SurfaceView session={value}/>);expect(view.getAllByRole('alert')).toHaveLength(1);
  }finally{created.unsubscribe();}
 });
});
