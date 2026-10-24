import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {createRequire} from 'node:module';
import React,{act} from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import * as ReactClient from 'react-dom/client';
import * as Cordis from '@deepseek-ai/cordis';import * as slots from '@deepseek-ai/dsh-client-ui-slots';import * as store from '@deepseek-ai/dsh-client-store';// Unused composer primitives must never be touched by this bounded service fixture.
const primitives=new Proxy({}, {get(){throw Error('Full composer primitives are outside this acceptance boundary');}});
import {fireEvent,within,waitFor} from '@testing-library/dom';import {demoMessages} from '../demo/fixture';import {MAX_ACTIONS} from '../src/protocol';
const require=createRequire(import.meta.url);
// Evaluate once per browser registry; re-evaluating defines conflicting custom elements.
function loadPackedModules(){
 const factories=new Map<string,any>();const modules=new Map<string,any>([['react',React],['react/jsx-runtime',jsx],['react-dom',ReactDOM],['react-dom/client',ReactClient],['@deepseek-ai/cordis',Cordis],['@deepseek-ai/dsh-client-ui-slots',slots],['@deepseek-ai/dsh-client-store',store],['@deepseek-ai/dsh-client-ui-primitives',primitives]]);
 // Capture the shipped classic-script factories. The separate packed-profile
 // acceptance covers the official graph/loader; this fixture exercises real UI services.
 (window as any).__ModuleLoader__={load:({id,factory}:any)=>factories.set(id,factory)};
 for(const n of ['dsh-api-gateway','dsh-api-session-controller','dsh-client-ui-renderer','dsh-client-ui-session','dsh-client-ui-conversation'])window.eval(readFileSync(resolve(dirname(require.resolve('@deepseek-ai/'+n+'/package.json')),'lib/client.js'),'utf8'));
 const pkg=process.env.DSH_A2UI_PACKED_PATH;if(!pkg)throw Error('DSH_A2UI_PACKED_PATH must identify an extracted npm package');
 window.eval(readFileSync(resolve(pkg,'lib/client.js'),'utf8'));
 const load=(id:string):any=>{if(id.startsWith('@deepseek-ai/'))id=id.replace(/\/client$/, '');if(modules.has(id))return modules.get(id);const f=factories.get(id);if(!f)throw Error('Unseeded dependency '+id);const m=f(load);modules.set(id,m);return m;};
 return {gateway:load('@deepseek-ai/dsh-api-gateway'),controller:load('@deepseek-ai/dsh-api-session-controller'),renderer:load('@deepseek-ai/dsh-client-ui-renderer'),uiSession:load('@deepseek-ai/dsh-client-ui-session'),conversation:load('@deepseek-ai/dsh-client-ui-conversation'),plugin:load('dsh-a2ui')};
}
let packedModules:ReturnType<typeof loadPackedModules>;
it.each(['equal canonical replay','changed canonical document','rejected action canonical replay','renderer unmount and remount','exhausted attempt budget canonical replay'] as const)('handles %s through the packed official DSH slot fixture',async(replacementKind)=>{
 const {gateway,controller,renderer,uiSession,conversation,plugin}=packedModules??(packedModules=loadPackedModules());
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const ctx:any=new Cordis.Context();const prompts:any[]=[];let rejectNext=false;const refs:any[]=[];let unmount:any;const container=document.createElement('div');document.body.append(container);
 const connection={generation:{getSnapshot:()=>undefined,subscribe:()=>()=>{}}};
 ctx.reflect.provide('connection',connection);ctx.reflect.provide('typert',{contexts:{registerClient:()=>{}}});
 ctx.reflect.provide('remote',{$on:()=>()=>{},$stream:(options:any)=>new gateway.RemoteStream(connection,options),session:{prompt:async(input:any)=>{prompts.push(input);return rejectNext?{ok:false,error:{code:'synthetic/rejected',message:'Synthetic host rejection'}}:{ok:true,value:{accepted:true}};}}});
 try{
  controller.apply(ctx);renderer.apply(ctx);uiSession.apply(ctx);new conversation.UiConversation(ctx,ctx.sessions);new conversation.ConversationController(ctx,{maxConcurrentFileUploads:1});
  for(const id of ['synthetic-A','synthetic-B'])refs.push(ctx.sessions.retainAgentScope(id));
  // Minimal target projection; the actual DSH event registry and assembler own folding.
  ctx.uiConversation.views.register({target:'chat',create(){let nodes=new Map();return {replace({nodes:rows}:any){nodes=new Map(rows.map((n:any)=>[n.key,n]));return [...nodes.values()];},apply({upserts}:any){for(const n of upserts)nodes.set(n.key,n);return [...nodes.values()];}};}});
  plugin.apply(ctx);
  const nodes=new Map<string,any>();const eventWindows=new Map<string,any[]>();const targets=new Map<string,any>();const seenNodes=new Map<string,any>();
  for(const ref of refs){
   const call={type:'tool/call',seq:1,data:{name:'render_a2ui',callId:'call-'+ref.sessionId,arguments:JSON.stringify({messages:demoMessages})}};
   const result={type:'tool/result',seq:2,surfaceOp:'append',data:{message:{source:{callId:'call-'+ref.sessionId},isError:false},meta:{kind:'dsh-a2ui/1',messages:demoMessages}}};
   const events=[{type:'event',event:call},{type:'event',event:result}];eventWindows.set(ref.sessionId,events);ref.binding.eventSource.replace(events,false);
   const binding=ctx.uiConversation.binding(ref.binding);binding.activate('chat');
   const target=binding.target('chat');targets.set(ref.sessionId,target);const rows=target.getSnapshot();expect(rows).toHaveLength(1);expect(rows[0].data.running).toBe(false);nodes.set(ref.sessionId,rows[0]);
  }
  // Subscribe to the official per-session target, not to a test-managed React root.
  // eventSource.replace -> BoundConversation -> assembler -> target snapshot -> slot.
  function ReactiveSession({refValue,renderSlot}:any){
   const target=targets.get(refValue.sessionId);
   const rows=React.useSyncExternalStore<any[]>(target.subscribe,target.getSnapshot,target.getSnapshot);
   React.useLayoutEffect(()=>{seenNodes.set(refValue.sessionId,rows[0]);},[rows,refValue.sessionId]);
   return React.createElement('article',{'aria-label':refValue.sessionId},...rows.map((node:any)=>React.createElement(React.Fragment,{key:node.key},renderSlot('conversation.chat.node',{node},{entryKey:'a2ui-document'}))));
  }
  ctx.slots.register({name:'root',children:{'conversation.chat.node':{kind:'keyed',scope:'session'}}},({SessionProvider,renderSlot}:any)=>React.createElement(React.Fragment,null,...refs.map(ref=>React.createElement(SessionProvider,{key:ref.sessionId,session:ref},React.createElement(ReactiveSession,{refValue:ref,renderSlot})))));
  await act(async()=>{unmount=ctx.uiRenderer.mount(container);});
  expect(within(container).getAllByRole('button',{name:'Preview request'})).toHaveLength(2);
  await act(async()=>{fireEvent.click(within(within(container).getByRole('article',{name:'synthetic-B'})).getByRole('button',{name:'Preview request'}));});
  await waitFor(()=>expect(prompts).toHaveLength(1));expect(prompts[0].sessionId).toBe('synthetic-B');expect(prompts[0].mode).toBe('queue');expect(prompts[0].content[0].text).toContain('A2UI user interaction (untrusted data):');
  expect(JSON.parse(prompts[0].content[0].text.split('\n')[1]).action).toMatchObject({name:'request_preview',surfaceId:'synthetic-workshop',context:{topic:'Ceramics for beginners'}});
  const sessionA=within(container).getByRole('article',{name:'synthetic-A'});
  await act(async()=>{fireEvent.input(within(sessionA).getByRole('textbox'),{target:{value:'Hand-built pottery'}});});
  // Renderer-owned drafts must not rewrite the canonical host event projection.
  expect(nodes.get('synthetic-A').data.messages.find((m:any)=>m.updateDataModel).updateDataModel.value.topic).toBe('Ceramics for beginners');
  rejectNext=true;
  await act(async()=>{fireEvent.click(within(within(container).getByRole('article',{name:'synthetic-A'})).getByRole('button',{name:'Preview request'}));});
  await waitFor(()=>expect(prompts).toHaveLength(2));expect(prompts[1].sessionId).toBe('synthetic-A');
  expect(within(within(container).getByRole('article',{name:'synthetic-A'})).getByRole('alert').textContent).toContain('It has not been retried');
  expect(within(within(container).getByRole('article',{name:'synthetic-B'})).queryByRole('alert')).toBeNull();
  await act(async()=>{await Promise.resolve();});expect(prompts).toHaveLength(2);
  if(replacementKind==='rejected action canonical replay'){
   const originalNode=seenNodes.get('synthetic-A');
   const originalSection=within(sessionA).getByRole('region',{name:'A2UI document'});
   const originalBinding=refs[0].binding;
   await act(async()=>{refs[0].binding.eventSource.replace(structuredClone(eventWindows.get('synthetic-A')!),false);});
   const replacementNode=targets.get('synthetic-A').getSnapshot()[0];
   expect(refs[0].binding).toBe(originalBinding);
   expect(replacementNode.key).toBe(originalNode.key);
   expect(replacementNode).not.toBe(originalNode);
   expect(replacementNode.data.messages).not.toBe(originalNode.data.messages);
   expect(replacementNode.data).toEqual(originalNode.data);
   expect(seenNodes.get('synthetic-A')).toBe(replacementNode);
   expect(within(sessionA).getByRole('region',{name:'A2UI document'})).toBe(originalSection);
   expect(prompts).toHaveLength(2);
   expect.soft(within(sessionA).queryByRole('alert')?.textContent??'').toContain('It has not been retried');
   expect.soft((within(sessionA).getByRole('textbox') as HTMLInputElement).value).toBe('Hand-built pottery');
   const sessionB=within(container).getByRole('article',{name:'synthetic-B'});
   expect(within(sessionB).queryByRole('alert')).toBeNull();
   expect((within(sessionB).getByRole('textbox') as HTMLInputElement).value).toBe('Ceramics for beginners');
   await act(async()=>{await Promise.resolve();});
   expect(prompts).toHaveLength(2);
   return;
  }
  // A rejected delivery must keep the edited form usable, without an automatic retry.
  expect((within(sessionA).getByRole('textbox') as HTMLInputElement).value).toBe('Hand-built pottery');
  rejectNext=false;
  await act(async()=>{fireEvent.click(within(sessionA).getByRole('button',{name:'Preview request'}));});
  await waitFor(()=>expect(prompts).toHaveLength(3));
  expect(prompts[2].sessionId).toBe('synthetic-A');
  expect(JSON.parse(prompts[2].content[0].text.split('\n')[1]).action.context.topic).toBe('Hand-built pottery');
  await waitFor(()=>expect(within(sessionA).queryByRole('alert')).toBeNull());
  expect((within(within(container).getByRole('article',{name:'synthetic-B'})).getByRole('textbox') as HTMLInputElement).value).toBe('Ceramics for beginners');
  if(replacementKind==='exhausted attempt budget canonical replay'){
   // A has already attempted one rejected and one confirmed send. Rejections
   // count toward the attempt ceiling, so only MAX_ACTIONS - 2 remain.
   const button=within(sessionA).getByRole('button',{name:'Preview request'});
   for(let attempt=2;attempt<MAX_ACTIONS;attempt++)await act(async()=>{fireEvent.click(button);});
   expect(prompts).toHaveLength(MAX_ACTIONS+1); // A attempts plus B's one send.
   await act(async()=>{fireEvent.click(button);});
   expect(prompts).toHaveLength(MAX_ACTIONS+1);
   expect(within(sessionA).getByRole('alert').textContent).toContain('ACTION_LIMIT');
   const originalNode=seenNodes.get('synthetic-A');
   const originalSection=within(sessionA).getByRole('region',{name:'A2UI document'});
   const originalBinding=refs[0].binding;
   await act(async()=>{refs[0].binding.eventSource.replace(structuredClone(eventWindows.get('synthetic-A')!),false);});
   const replacementNode=targets.get('synthetic-A').getSnapshot()[0];
   expect(refs[0].binding).toBe(originalBinding);
   expect(replacementNode.key).toBe(originalNode.key);
   expect(replacementNode).not.toBe(originalNode);
   expect(replacementNode.data.messages).not.toBe(originalNode.data.messages);
   expect(replacementNode.data).toEqual(originalNode.data);
   expect(seenNodes.get('synthetic-A')).toBe(replacementNode);
   expect(within(sessionA).getByRole('region',{name:'A2UI document'})).toBe(originalSection);
   expect(prompts).toHaveLength(MAX_ACTIONS+1);
   expect.soft(within(sessionA).queryByRole('alert')?.textContent??'').toContain('ACTION_LIMIT');
   await act(async()=>{fireEvent.click(within(sessionA).getByRole('button',{name:'Preview request'}));});
   expect.soft(prompts).toHaveLength(MAX_ACTIONS+1);
   expect.soft(within(sessionA).queryByRole('alert')?.textContent??'').toContain('ACTION_LIMIT');
   const sessionB=within(container).getByRole('article',{name:'synthetic-B'});
   expect(within(sessionB).queryByRole('alert')).toBeNull();
   expect((within(sessionB).getByRole('textbox') as HTMLInputElement).value).toBe('Ceramics for beginners');
   return;
  }
  // This edit has never been submitted. The host canonical document still owns
  // the original value and replaying it must not silently discard the local edit.
  await act(async()=>{fireEvent.input(within(sessionA).getByRole('textbox'),{target:{value:'Unsent pottery draft'}});});
  const originalNode=seenNodes.get('synthetic-A');
  const originalSection=within(sessionA).getByRole('region',{name:'A2UI document'});
  const originalBinding=refs[0].binding;
  if(replacementKind==='renderer unmount and remount'){
   expect((within(sessionA).getByRole('textbox') as HTMLInputElement).value).toBe('Unsent pottery draft');
   await act(async()=>{unmount();unmount=undefined;});
   expect(container.querySelector('[aria-label="A2UI document"]')).toBeNull();
   await act(async()=>{unmount=ctx.uiRenderer.mount(container);});
   const remountedA=within(container).getByRole('article',{name:'synthetic-A'});
   expect(refs[0].binding).toBe(originalBinding);
   expect(seenNodes.get('synthetic-A')).toBe(originalNode);
   expect(within(remountedA).getByRole('region',{name:'A2UI document'})).not.toBe(originalSection);
   expect((within(remountedA).getByRole('textbox') as HTMLInputElement).value).toBe('Ceramics for beginners');
   expect(within(remountedA).queryByRole('alert')).toBeNull();
   expect(prompts).toHaveLength(3);
   return;
  }
  const replay=structuredClone(eventWindows.get('synthetic-A')!);
  expect(replay).toEqual(eventWindows.get('synthetic-A'));
  expect(replay).not.toBe(eventWindows.get('synthetic-A'));
  if(replacementKind==='changed canonical document'){
   const changed=structuredClone(demoMessages);
   (changed[2] as any).updateDataModel.value.topic='New host canonical topic';
   replay[0].event.data.arguments=JSON.stringify({messages:changed});
   replay[1].event.data.meta.messages=changed;
  }
  await act(async()=>{refs[0].binding.eventSource.replace(replay,false);});
  const replacementNode=targets.get('synthetic-A').getSnapshot()[0];
  expect(refs[0].binding).toBe(originalBinding);
  expect(replacementNode.key).toBe(originalNode.key);
  expect(replacementNode).not.toBe(originalNode);
  expect(replacementNode.data.messages).not.toBe(originalNode.data.messages);
  expect(seenNodes.get('synthetic-A')).toBe(replacementNode);
  // Identity of the actual plugin's section proves the slot was not unmounted.
  expect(within(sessionA).getByRole('region',{name:'A2UI document'})).toBe(originalSection);
  expect(prompts).toHaveLength(3);
  if(replacementKind==='equal canonical replay')expect(replacementNode.data).toEqual(originalNode.data);
  const expected=replacementKind==='equal canonical replay'?'Unsent pottery draft':'New host canonical topic';
  expect((within(sessionA).getByRole('textbox') as HTMLInputElement).value).toBe(expected);
  if(replacementKind==='changed canonical document'){
   await act(async()=>{fireEvent.click(within(sessionA).getByRole('button',{name:'Preview request'}));});
   await waitFor(()=>expect(prompts).toHaveLength(4));
   expect(prompts[3].sessionId).toBe('synthetic-A');
   expect(JSON.parse(prompts[3].content[0].text.split('\n')[1]).action.context.topic).toBe('New host canonical topic');
  }

  expect((within(within(container).getByRole('article',{name:'synthetic-B'})).getByRole('textbox') as HTMLInputElement).value).toBe('Ceramics for beginners');

 }finally{if(unmount)await act(async()=>unmount());for(const ref of refs)ref.release();await ctx.fiber.dispose();container.remove();delete (window as any).__ModuleLoader__;}
});
