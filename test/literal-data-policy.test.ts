import {afterEach,beforeEach,describe,expect,it,vi,type MockInstance} from 'vitest';
import {ComponentContext,DataContext,GenericBinder,getValue} from '@a2ui/web_core/v0_9';
import {basicCatalog,ButtonApi,ColumnApi,OpenUrlApi,TextApi,TextFieldApi} from '@a2ui/web_core/v0_9/basic_catalog';
import {rendererCatalog} from '../src/catalog';
import {CATALOG_ID,JsonlDecoder,validateAction,validateDocument,validateMessage,type Message} from '../src/protocol';
import {importRecording,recording} from '../src/replay';
import {SurfaceSession} from '../src/surface';

const id='synthetic-catalog-record';
const url='https://example.invalid/synthetic';
const metadata={component:'Image',call:'openUrl'};
const nested=[metadata,[{component:'Video',call:'openUrl'},{call:'required',args:{value:''},returnType:'boolean'}]];
const nav={call:'openUrl',args:{url},returnType:'void'};
const template='${openUrl(url: "'+url+'")}';
const format=(value:unknown)=>({call:'formatString',args:{value},returnType:'string'});
function form(version:string,selection:any=metadata,context:any={selection:{path:'/selection'},nested:{path:'/nested'}}):Message[]{return [
 {version,createSurface:{surfaceId:id,catalogId:CATALOG_ID}},
 {version,updateDataModel:{surfaceId:id,path:'/',value:{selection,nested,template:'Hello ${/name}',name:'Synthetic'}}},
 {version,updateComponents:{surfaceId:id,components:[
  {id:'root',component:'Column',children:['component-field','call-field','submit']},
  {id:'component-field',component:'TextField',label:'Catalog component type',value:{path:'/selection/component'}},
  {id:'call-field',component:'TextField',label:'Documented operation name',value:{path:'/selection/call'}},
  {id:'submit',component:'Button',child:'submit-label',action:{event:{name:'save_catalog_record',context}}},
  {id:'submit-label',component:'Text',text:'Save metadata only'},
 ]}},
];}
function binder(surface:any,componentId:string,api:any){const bound=new GenericBinder<any>(new ComponentContext(surface,componentId),api.schema);bound.subscribe(()=>{});return bound;}
function surface(session:SurfaceSession){return session.processor.model.surfacesMap.get(id)!;}
function action(version:string,context:any):Message{return {version,action:{name:'save_catalog_record',surfaceId:id,sourceComponentId:'submit',timestamp:'2026-10-24T00:00:00Z',context}};}
function deep(value:unknown){for(let i=0;i<34;i++)value={nested:value};return value;}

// Test only the deny replacement. Even a regression must not run the real
// navigation implementation or issue network/browser requests.
let denied:ReturnType<typeof vi.spyOn>,original:ReturnType<typeof vi.spyOn>;
let opened:MockInstance<typeof window.open>;
const fetched=vi.fn(()=>{throw new Error('Unexpected fetch in offline policy test');});
beforeEach(()=>{
 denied=vi.spyOn(rendererCatalog.functions.get('openUrl')!,'execute');
 original=vi.spyOn(basicCatalog.functions.get('openUrl')!,'execute').mockImplementation(()=>{throw new Error('Original navigation executor must never run');});
 opened=vi.spyOn(window,'open').mockImplementation(()=>{throw new Error('Unexpected window.open in offline policy test');});
 fetched.mockClear();vi.stubGlobal('fetch',fetched);
});
afterEach(()=>{
 try{expect(original).not.toHaveBeenCalled();expect(opened).not.toHaveBeenCalled();expect(fetched).not.toHaveBeenCalled();}
 finally{vi.restoreAllMocks();vi.unstubAllGlobals();}
});

it('keeps catalog identity, complete schemas, and every unaffected implementation',()=>{
 expect(rendererCatalog.id).toBe(CATALOG_ID);expect(rendererCatalog.toJson()).toEqual(basicCatalog.toJson());
 expect(rendererCatalog.functions.get('openUrl')!.schema).toBe(OpenUrlApi.schema);
 for(const [name,fn]of basicCatalog.functions)if(name!=='openUrl')expect(rendererCatalog.functions.get(name)).toBe(fn);
 for(const [name,component]of basicCatalog.components)if(!['TextField','Slider','DateTimeInput'].includes(name))expect(rendererCatalog.components.get(name)).toBe(component);
});

describe.each(['v0.9','v0.9.1'])('%s literal data versus authored evaluator inputs',version=>{
 it('stores literal records and nested arrays, displays and submits without any function evaluation',async()=>{
  const sent:Message[]=[];const session=new SurfaceSession(async a=>{sent.push(a);});session.append(form(version),true);
  const s=surface(session),field=binder(s,'component-field',TextFieldApi),call=binder(s,'call-field',TextFieldApi),submit=binder(s,'submit',ButtonApi);
  const invoke=vi.spyOn(s.defaultCatalog!,'invoker');
  try{expect(field.snapshot.value).toBe('Image');expect(call.snapshot.value).toBe('openUrl');
   await submit.snapshot.action();expect(sent[0].action.context).toEqual({selection:metadata,nested});
   expect(session.lastError).toBeNull();expect(session.actions).toHaveLength(1);expect(invoke).not.toHaveBeenCalled();expect(denied).not.toHaveBeenCalled();
   expect([...s.componentsModel.entries].some(([,c])=>['Image','Video','AudioPlayer'].includes(c.type))).toBe(false);
  }finally{field.dispose();call.dispose();submit.dispose();session.dispose();}
 });
 it('completes blank form binder edit → submit → export/import/replay without rewriting authored history or replaying actions',async()=>{
  const sent:Message[]=[];const replaySend=vi.fn(async()=>{}),session=new SurfaceSession(async a=>{sent.push(a);}),restored=new SurfaceSession(replaySend);
  const messages=form(version,{component:'',call:''});const before=structuredClone(messages);session.append(messages,true);
  const field=binder(surface(session),'component-field',TextFieldApi),call=binder(surface(session),'call-field',TextFieldApi),submit=binder(surface(session),'submit',ButtonApi);
  try{field.snapshot.setValue('Image');call.snapshot.setValue('openUrl');await submit.snapshot.action();
   expect(sent[0].action.context).toEqual({selection:metadata,nested});expect(session.lastError).toBeNull();
   const saved=importRecording(JSON.stringify(session.export()));expect(saved.messages).toEqual(before);expect(messages).toEqual(before);
   expect(saved.snapshots[0].updateDataModel.value).toMatchObject({selection:metadata,nested});restored.restore(saved);
   expect(surface(restored).dataModel.get('/selection')).toEqual(metadata);expect(surface(restored).dataModel.get('/nested')).toEqual(nested);
   expect(restored.actions).toEqual(session.actions);expect(restored.export()).toEqual(saved);expect(replaySend).not.toHaveBeenCalled();expect(denied).not.toHaveBeenCalled();
  }finally{field.dispose();call.dispose();submit.dispose();restored.dispose();session.dispose();}
 });
 it.each([
  ['bound',{component:{path:'/selection/component'},call:{path:'/selection/call'}}],
 ])('treats %s top-level action-context field names as output keys',async(_label,context)=>{
  const sent:Message[]=[];const session=new SurfaceSession(async a=>{sent.push(a);});session.append(form(version,metadata,context),true);const submit=binder(surface(session),'submit',ButtonApi);
  try{await submit.snapshot.action();expect(sent[0].action.context).toEqual(metadata);expect(session.lastError).toBeNull();expect(denied).not.toHaveBeenCalled();}
  finally{submit.dispose();session.dispose();}
 });
 it('keeps the conservative rejection of literal authored context maps; bound field values are the supported route',()=>{
  for(const context of [metadata,{call:'openUrl'}]){
   const messages=form(version,metadata,context);
   expect(()=>validateDocument(messages)).toThrow(context===metadata?'POLICY_RESOURCE':'POLICY_NAVIGATION');
   const session=new SurfaceSession();try{expect(()=>session.append(messages,true)).toThrow('POLICY_');expect(denied).not.toHaveBeenCalled();}finally{session.dispose();}
  }
 });
 it('ordinary functions and child templates consume model data without interpreting metadata as components or nested calls',()=>{
  const messages=form(version);messages[2].updateComponents.components[0].children={componentId:'submit-label',path:'/nested'};
  const session=new SurfaceSession();session.append(messages,true);const s=surface(session),root=binder(s,'root',ColumnApi),ctx=new DataContext(s,'/');
  try{expect(ctx.resolveDynamicValue({call:'required',args:{value:{path:'/selection'}},returnType:'boolean'})).toBe(true);
   expect(ctx.resolveDynamicValue({path:'/nested'})).toEqual(nested);const sub=ctx.subscribeDynamicValue({path:'/nested'},()=>{});expect(sub.value).toEqual(nested);sub.unsubscribe();
   expect(root.snapshot.children).toEqual([{id:'submit-label',basePath:'/nested/0'},{id:'submit-label',basePath:'/nested/1'}]);expect(s.componentsModel.get('submit-label')!.type).toBe('Text');expect(denied).not.toHaveBeenCalled();
  }finally{root.dispose();session.dispose();}
 });
 it('retains renamed-key and JSON-string workarounds without implicit decoding',async()=>{
  const data={componentType:'Image',operationName:'openUrl',encoded:JSON.stringify(metadata)};const sent:Message[]=[];const session=new SurfaceSession(async a=>{sent.push(a);});session.append(form(version,data),true);const submit=binder(surface(session),'submit',ButtonApi);
  try{await submit.snapshot.action();expect(sent[0].action.context.selection).toEqual(data);expect(importRecording(JSON.stringify(session.export())).snapshots[0].updateDataModel.value.selection).toEqual(data);}
  finally{submit.dispose();session.dispose();}
 });
 it('still evaluates allowed functions in inline authored context arrays',async()=>{
  const sent:Message[]=[];const session=new SurfaceSession(async a=>{sent.push(a);});session.append(form(version,metadata,{values:[{nested:{call:'required',args:{value:''},returnType:'boolean'}}]}),true);const submit=binder(surface(session),'submit',ButtonApi);
  try{await submit.snapshot.action();expect(sent[0].action.context).toEqual({values:[{nested:false}]});expect(denied).not.toHaveBeenCalled();}
  finally{submit.dispose();session.dispose();}
 });

 it.each(['Image','Video','AudioPlayer'])('rejects actual %s definitions with static or bound URLs on every static entry route',component=>{
  for(const resourceUrl of [url,{path:'/selection/url'}]){
   const messages=form(version),media={id:'remote',component,url:resourceUrl};messages[2].updateComponents.components.push(media);
   expect(()=>validateDocument(messages)).toThrow('POLICY_RESOURCE');expect(()=>recording(messages)).toThrow('POLICY_RESOURCE');
   const stream=new JsonlDecoder();expect(()=>stream.push(messages.map(m=>JSON.stringify(m)).join('\n')+'\n')).toThrow('POLICY_RESOURCE');
   const session=new SurfaceSession();session.append(form(version),true);const before=session.export();
   try{expect(()=>session.append([{version,updateDataModel:{surfaceId:id,path:'/name',value:'Must not apply'}},{version,updateComponents:{surfaceId:id,components:[media]}}])).toThrow('POLICY_RESOURCE');expect(session.export()).toEqual(before);}
   finally{session.dispose();}
  }
  expect(denied).not.toHaveBeenCalled();
 });
 it.each([
  ['function action',(components:any[])=>{components[3].action={functionCall:nav};}],
  ['dynamic property',(components:any[])=>{components[4].text=nav;}],
  ['accessibility',(components:any[])=>{components[1].accessibility={label:nav};}],
  ['check condition',(components:any[])=>{components[1].checks=[{condition:nav,message:'No navigation'}];}],
  ['nested function arguments',(components:any[])=>{components[4].text={call:'formatString',args:{value:{call:'required',args:{value:[[{nested:nav}]]},returnType:'boolean'}},returnType:'string'};}],
  ['nested inline action-context arrays',(components:any[])=>{components[3].action.event.context={value:[[{nested:nav}]]};}],
  ['call-named context value',(components:any[])=>{components[3].action.event.context={call:[{nested:nav}]};}],
  ['lookalike event context nested in an expression',(components:any[])=>{components[3].action.event.context={value:[{action:{event:{context:nav}}}]};}],
 ])('preserves static POLICY_NAVIGATION rejection for %s',(_label,mutate)=>{
  const messages=form(version);mutate(messages[2].updateComponents.components);
  expect(()=>validateDocument(messages)).toThrow('POLICY_NAVIGATION');expect(()=>recording(messages)).toThrow('POLICY_NAVIGATION');
  const stream=new JsonlDecoder();expect(()=>stream.push(messages.map(m=>JSON.stringify(m)).join('\n')+'\n')).toThrow('POLICY_NAVIGATION');
  const session=new SurfaceSession();session.append(form(version),true);const before=session.export();
  try{expect(()=>session.append([messages[2]])).toThrow('POLICY_NAVIGATION');expect(session.export()).toEqual(before);}
  finally{session.dispose();}expect(denied).not.toHaveBeenCalled();
 });
 it('does not let object identity alias an output context map into a real media definition',()=>{
  const messages=form(version);const media={id:'remote',component:'Image',url};messages[2].updateComponents.components.push(media);messages[2].updateComponents.components[3].action.event.context=media;
  expect(()=>validateDocument(messages)).toThrow('POLICY_RESOURCE');
  expect(()=>validateMessage(messages[2])).toThrow('POLICY_RESOURCE');
 });
 it('does not let object identity alias an output context map into an executable context value',()=>{
  const messages=form(version);const context={call:'openUrl'};messages[2].updateComponents.components[3].action.event.context=context;
  messages[2].updateComponents.components.push({id:'second',component:'Button',child:'submit-label',action:{event:{name:'save',context:{nested:[context]}}}});
  expect(()=>validateDocument(messages)).toThrow('POLICY_NAVIGATION');
 });
 it.each([
  ['unsafe key',()=>JSON.parse('{"constructor":{}}'),'POLICY_KEY'],
  ['unsafe path',()=>({path:'/metadata/__proto__/x'}),'POLICY_PATH'],
  ['depth',()=>deep({component:'Image',call:'openUrl'}),'POLICY_DEPTH'],
 ])('keeps global %s checks in model data, resolved events and replay snapshots',(_label,makeValue,error)=>{
  const data=makeValue();const messages=form(version,data);expect(()=>validateDocument(messages)).toThrow(error);expect(()=>validateAction(action(version,{data}))).toThrow(error);
  expect(()=>recording(form(version),[],[{version,updateDataModel:{surfaceId:id,path:'/',value:data}}])).toThrow(error);
 });

 it('denies the actual capability through direct public invoker and evaluator without reaching original navigation',async()=>{
  const session=new SurfaceSession();session.append(form(version),true);const s=surface(session),ctx=new DataContext(s,'/'),errors:Message[]=[];s.onError.subscribe(e=>{errors.push(e);});
  try{expect(()=>s.defaultCatalog!.invoker('openUrl',{url},ctx)).toThrow('POLICY_NAVIGATION');
   expect(ctx.resolveDynamicValue(nav)).toBeUndefined();expect(denied).toHaveBeenCalledTimes(2);
   // The official EventEmitter awaits each listener. SurfaceSession observes
   // first; external diagnostic observers can run in a later microtask.
   await vi.waitFor(()=>expect(errors).toEqual([expect.objectContaining({code:'EXPRESSION_ERROR',expression:'openUrl',message:'POLICY_NAVIGATION: openUrl disabled'})]));
  }finally{session.dispose();}
 });
 it.each([
  ['literal',template],
  ['model-bound',{path:'/template'}],
  ['nested argument','${required(value: openUrl(url: "'+url+'"))}'],
  ['nested interpolation','${${openUrl(url: "'+url+'")}}'],
  ['nested formatString','${formatString(value: \'${openUrl(url: "'+url+'\")}\')}'],
 ])('denies %s formatString-derived navigation at Text binder evaluation, not append validation',async(_label,value)=>{
  const messages=form(version);messages[1].updateDataModel.value.template=template;messages[2].updateComponents.components[4].text=format(value);
  const session=new SurfaceSession();expect(()=>session.append(messages,true)).not.toThrow();const s=surface(session),errors:Message[]=[];s.onError.subscribe(e=>{errors.push(e);});
  const text=binder(s,'submit-label',TextApi);
  try{expect(typeof text.snapshot.text).toBe('string');expect(denied).toHaveBeenCalled();await vi.waitFor(()=>expect(errors).toContainEqual(expect.objectContaining({code:'EXPRESSION_ERROR',expression:'openUrl',message:'POLICY_NAVIGATION: openUrl disabled'})));}
  finally{text.dispose();session.dispose();}
 });
 it('denies lazy action-time formatString and preserves unrelated literal context data',async()=>{
  const messages=form(version,metadata,{selection:{path:'/selection'},result:format({path:'/template'})});messages[1].updateDataModel.value.template=template;
  const sent:Message[]=[];const session=new SurfaceSession(async a=>{sent.push(a);});session.append(messages,true);const errors:Message[]=[];surface(session).onError.subscribe(e=>{errors.push(e);});const submit=binder(surface(session),'submit',ButtonApi);
  try{expect(denied).not.toHaveBeenCalled();await submit.snapshot.action();expect(denied).toHaveBeenCalled();expect(errors.some(e=>e.code==='EXPRESSION_ERROR'&&e.message.includes('POLICY_NAVIGATION'))).toBe(true);
   expect(sent[0].action.context).toEqual({selection:metadata,result:''});
  }finally{submit.dispose();session.dispose();}
 });
 it.each(['append','binder edit'])('denies reactive formatString after %s and recovers on harmless data',async mode=>{
  const messages=form(version);messages[2].updateComponents.components[4].text=format({path:'/template'});messages[2].updateComponents.components[1].value={path:'/template'};
  const session=new SurfaceSession();session.append(messages,true);const s=surface(session),errors:Message[]=[];s.onError.subscribe(e=>{errors.push(e);});const text=binder(s,'submit-label',TextApi),field=binder(s,'component-field',TextFieldApi);
  try{expect(text.snapshot.text).toBe('Hello Synthetic');expect(denied).not.toHaveBeenCalled();
   if(mode==='append')expect(()=>session.append([{version,updateDataModel:{surfaceId:id,path:'/template',value:template}}])).not.toThrow();else field.snapshot.setValue(template);
   expect(text.snapshot.text).toBe('');expect(denied).toHaveBeenCalled();await vi.waitFor(()=>expect(errors.some(e=>e.message.includes('POLICY_NAVIGATION'))).toBe(true));
   field.snapshot.setValue('Recovered ${required(value: "")}');expect(text.snapshot.text).toBe('Recovered false');
  }finally{text.dispose();field.dispose();session.dispose();}
 });
 it('denies restored-snapshot evaluation through the creation observer and a lazy signal without resending historical actions',async()=>{
  const messages=form(version);const snapshots=[{version,updateDataModel:{surfaceId:id,path:'/',value:{template,nested,selection:metadata}}}];const saved=importRecording(JSON.stringify(recording(messages,[action(version,{selection:metadata,nested})],snapshots)));
  const sent=vi.fn(async()=>{}),session=new SurfaceSession(sent);const subscriptions:Array<{unsubscribe():void}>=[];const errors:Message[]=[];
  // Install the public reactive binding through surface creation. The emitter
  // awaits earlier listeners, so this observer may run after restore applies
  // its snapshots; wait for its actual subscription and error delivery.
  const created=session.processor.onSurfaceCreated(s=>{s.onError.subscribe(e=>{errors.push(e);});subscriptions.push(new DataContext(s,'/').subscribeDynamicValue(format({path:'/template'}),()=>{}));});
  try{expect(()=>session.restore(saved)).not.toThrow();await vi.waitFor(()=>{expect(subscriptions).toHaveLength(1);expect(denied).toHaveBeenCalled();expect(errors.some(e=>e.message.includes('POLICY_NAVIGATION'))).toBe(true);});expect(sent).not.toHaveBeenCalled();expect(session.actions).toEqual(saved.actions);
   const before=denied.mock.calls.length;const signal=new DataContext(surface(session),'/').resolveSignal([format({path:'/template'})]);expect(getValue(signal)).toEqual(['']);expect(denied.mock.calls.length).toBeGreaterThan(before);signal.unsubscribe?.();
  }finally{created.unsubscribe();subscriptions.forEach(s=>s.unsubscribe());session.dispose();}
 });
});
