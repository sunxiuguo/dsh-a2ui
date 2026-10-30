import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {createRequire} from 'node:module';
import React,{act} from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import * as ReactClient from 'react-dom/client';
import * as Cordis from '@deepseek-ai/cordis';import * as slots from '@deepseek-ai/dsh-client-ui-slots';import * as store from '@deepseek-ai/dsh-client-store';// Unused composer primitives must never be touched by this bounded service fixture.
const primitives=new Proxy({}, {get(){throw Error('Full composer primitives are outside this acceptance boundary');}});
import {fireEvent,within,waitFor} from '@testing-library/dom';import {replyFixture} from './reply-v1.fixture';
const require=createRequire(import.meta.url);
// Evaluate once per browser registry; re-evaluating defines conflicting custom elements.
function loadPackedModules(){
 const factories=new Map<string,any>();const modules=new Map<string,any>([['react',React],['react/jsx-runtime',jsx],['react-dom',ReactDOM],['react-dom/client',ReactClient],['@deepseek-ai/cordis',Cordis],['@deepseek-ai/dsh-client-ui-slots',slots],['@deepseek-ai/dsh-client-store',store],['@deepseek-ai/dsh-client-ui-primitives',primitives]]);
 // Capture the shipped classic-script factories. The separate packed-profile
 // acceptance covers the official graph/loader; this fixture exercises real UI services.
 (window as any).__ModuleLoader__={load:({id,factory}:any)=>factories.set(id,factory)};
 for(const n of ['dsh-api-gateway','dsh-api-session-controller','dsh-client-ui-renderer','dsh-client-ui-session','dsh-client-ui-conversation'])window.eval(readFileSync(resolve(dirname(require.resolve('@deepseek-ai/'+n+'/package.json')),'lib/client.js'),'utf8'));
 const pkg=resolve('experimental-lib');
 window.eval(readFileSync(resolve(pkg,'client.js'),'utf8'));
 const load=(id:string):any=>{if(id.startsWith('@deepseek-ai/'))id=id.replace(/\/client$/, '');if(modules.has(id))return modules.get(id);const f=factories.get(id);if(!f)throw Error('Unseeded dependency '+id);const m=f(load);modules.set(id,m);return m;};
 return {gateway:load('@deepseek-ai/dsh-api-gateway'),controller:load('@deepseek-ai/dsh-api-session-controller'),renderer:load('@deepseek-ai/dsh-client-ui-renderer'),uiSession:load('@deepseek-ai/dsh-client-ui-session'),conversation:load('@deepseek-ai/dsh-client-ui-conversation'),plugin:load('dsh-a2ui-reply-v1')};
}
it('routes final v1 replies through official DSH services, isolates sessions, withdraws and replays without sending',async()=>{
 const {gateway,controller,renderer,uiSession,conversation,plugin}=loadPackedModules();
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 const ctx:any=new Cordis.Context(),prompts:any[]=[],refs:any[]=[];let rejectNext=false,unmount:any;
 const container=document.createElement('div');document.body.append(container);
 const connection={generation:{getSnapshot:()=>undefined,subscribe:()=>()=>{}}};
 ctx.reflect.provide('connection',connection);ctx.reflect.provide('typert',{contexts:{registerClient:()=>{}}});
 ctx.reflect.provide('remote',{$on:()=>()=>{},$stream:(options:any)=>new gateway.RemoteStream(connection,options),session:{prompt:async(input:any)=>{prompts.push(input);return rejectNext?{ok:false,error:{code:'synthetic/rejected',message:'Synthetic rejection'}}:{ok:true,value:{accepted:true}};}}});
 try{
  controller.apply(ctx);renderer.apply(ctx);uiSession.apply(ctx);new conversation.UiConversation(ctx,ctx.sessions);new conversation.ConversationController(ctx,{maxConcurrentFileUploads:1});
  for(const id of ['synthetic-A','synthetic-B'])refs.push(ctx.sessions.retainAgentScope(id));
  ctx.uiConversation.views.register({target:'chat',create(){let nodes=new Map();return {replace({nodes:rows}:any){nodes=new Map(rows.map((n:any)=>[n.key,n]));return [...nodes.values()];},apply({upserts}:any){for(const n of upserts)nodes.set(n.key,n);return [...nodes.values()];}};}});
  plugin.apply(ctx);
  const targets=new Map<string,any>();
  const events=(id:string,text:string,mode='final')=>{
   const messages=replyFixture('sameSurface',text);
   const call={type:'tool/call',seq:1,data:{name:'render_a2ui_reply_v1',callId:'call-'+id,arguments:JSON.stringify({messages})}};
   const result={type:'tool/result',seq:2,surfaceOp:'append',data:{message:{source:{callId:'call-'+id},isError:mode==='error'},meta:{kind:'dsh-a2ui/experimental-reply-v1',messages}}};
   return (mode==='pending'?[call]:[call,result]).map(event=>({type:'event',event}));
  };
  for(const ref of refs){
   ref.binding.eventSource.replace(events(ref.sessionId,'Reply '+ref.sessionId),false);
   const binding=ctx.uiConversation.binding(ref.binding);binding.activate('chat');targets.set(ref.sessionId,binding.target('chat'));
  }
  function ReactiveSession({refValue,renderSlot}:any){const target=targets.get(refValue.sessionId);const rows=React.useSyncExternalStore<any[]>(target.subscribe,target.getSnapshot,target.getSnapshot);return React.createElement('article',{'aria-label':refValue.sessionId},...rows.filter(n=>n.visibility!=='hidden').map(node=>React.createElement(React.Fragment,{key:node.key},renderSlot('conversation.chat.node',{node},{entryKey:'a2ui-reply-v1'}))));}
  ctx.slots.register({name:'root',children:{'conversation.chat.node':{kind:'keyed',scope:'session'}}},({SessionProvider,renderSlot}:any)=>React.createElement(React.Fragment,null,...refs.map(ref=>React.createElement(SessionProvider,{key:ref.sessionId,session:ref},React.createElement(ReactiveSession,{refValue:ref,renderSlot})))));
  await act(async()=>{unmount=ctx.uiRenderer.mount(container);});
  const a=within(container).getByRole('article',{name:'synthetic-A'}),b=within(container).getByRole('article',{name:'synthetic-B'});
  expect(within(a).getAllByRole('button')).toHaveLength(2);expect(prompts).toHaveLength(0);
  await act(async()=>{fireEvent.click(within(b).getByRole('button',{name:'Choose dynamic'}));});
  await waitFor(()=>expect(prompts).toHaveLength(1));expect(prompts[0].sessionId).toBe('synthetic-B');expect(prompts[0].mode).toBe('queue');
  const payload=JSON.parse(prompts[0].content[0].text.split('\n')[1]);
  expect(payload).toMatchObject({version:'v1.0',action:{name:'reply',surfaceId:'sameSurface',sourceComponentId:'dynamic',userMessage:'Reply synthetic-B',context:{choice:'choice-1'}}});
  expect(typeof payload.action.timestamp).toBe('string');expect(prompts[0].content[0].text).toContain('(untrusted data)');
  await act(async()=>{refs[1].binding.eventSource.replace(events('synthetic-B','New B reply'),false);});
  expect(prompts).toHaveLength(1);
  await act(async()=>{fireEvent.click(within(b).getByRole('button',{name:'Choose dynamic'}));});
  await waitFor(()=>expect(prompts).toHaveLength(2));expect(JSON.parse(prompts[1].content[0].text.split('\n')[1]).action.userMessage).toBe('New B reply');
  rejectNext=true;
  await act(async()=>{fireEvent.click(within(a).getByRole('button',{name:'Choose literal'}));});
  await waitFor(()=>expect(prompts).toHaveLength(3));expect(prompts[2].sessionId).toBe('synthetic-A');
  expect(JSON.parse(prompts[2].content[0].text.split('\n')[1]).action.userMessage).toBe('Literal synthetic reply');
  expect(within(a).getByRole('alert').textContent).toContain('has not been retried');
  await act(async()=>{refs[0].binding.eventSource.replace(structuredClone(events('synthetic-A','Reply synthetic-A')),false);});
  expect(prompts).toHaveLength(3);expect(within(a).getByRole('alert').textContent).toContain('has not been retried');
  rejectNext=false;
  await act(async()=>{fireEvent.click(within(a).getByRole('button',{name:'Choose literal'}));});
  await waitFor(()=>expect(prompts).toHaveLength(4));
  await act(async()=>{refs[0].binding.eventSource.replace(events('synthetic-A','Pending should not click','pending'),false);});
  expect(within(a).queryAllByRole('button')).toHaveLength(0);expect(prompts).toHaveLength(4);
  await act(async()=>{refs[0].binding.eventSource.replace(events('synthetic-A','Cancelled should not click','error'),false);});
  expect(within(a).queryAllByRole('button')).toHaveLength(0);expect(within(a).getByRole('alert').textContent).toContain('withdrawn');
  await act(async()=>{refs[0].binding.eventSource.replace([],false);});
  expect(within(a).queryAllByRole('button')).toHaveLength(0);expect(prompts).toHaveLength(4);
  expect(within(b).getAllByRole('button')).toHaveLength(2);
 }finally{await act(async()=>{unmount?.();});for(const ref of refs)ref.release();await ctx.fiber.dispose();container.remove();delete (window as any).__ModuleLoader__;}
});
