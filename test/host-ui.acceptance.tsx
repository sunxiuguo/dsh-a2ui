import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';import {resolve,dirname} from 'node:path';import {createRequire} from 'node:module';
import React,{act} from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import * as ReactClient from 'react-dom/client';
import * as Cordis from '@deepseek-ai/cordis';import * as slots from '@deepseek-ai/dsh-client-ui-slots';import * as store from '@deepseek-ai/dsh-client-store';// Unused composer primitives must never be touched by this bounded service fixture.
const primitives=new Proxy({}, {get(){throw Error('Full composer primitives are outside this acceptance boundary');}});
import {fireEvent,within,waitFor} from '@testing-library/dom';import {demoMessages} from '../demo/fixture';
const require=createRequire(import.meta.url);
it('renders the packed client in actual DSH slots and routes actions through the owning session controller',async()=>{
 const factories=new Map<string,any>();const modules=new Map<string,any>([['react',React],['react/jsx-runtime',jsx],['react-dom',ReactDOM],['react-dom/client',ReactClient],['@deepseek-ai/cordis',Cordis],['@deepseek-ai/dsh-client-ui-slots',slots],['@deepseek-ai/dsh-client-store',store],['@deepseek-ai/dsh-client-ui-primitives',primitives]]);
 // Capture the shipped classic-script factories. The separate packed-profile
 // acceptance covers the official graph/loader; this fixture exercises real UI services.
 (window as any).__ModuleLoader__={load:({id,factory}:any)=>factories.set(id,factory)};
 for(const n of ['dsh-api-gateway','dsh-api-session-controller','dsh-client-ui-renderer','dsh-client-ui-session','dsh-client-ui-conversation'])window.eval(readFileSync(resolve(dirname(require.resolve('@deepseek-ai/'+n+'/package.json')),'lib/client.js'),'utf8'));
 const pkg=process.env.DSH_A2UI_PACKED_PATH;if(!pkg)throw Error('DSH_A2UI_PACKED_PATH must identify an extracted npm package');
 window.eval(readFileSync(resolve(pkg,'lib/client.js'),'utf8'));
 const load=(id:string):any=>{if(id.startsWith('@deepseek-ai/'))id=id.replace(/\/client$/, '');if(modules.has(id))return modules.get(id);const f=factories.get(id);if(!f)throw Error('Unseeded dependency '+id);const m=f(load);modules.set(id,m);return m;};
 const gateway=load('@deepseek-ai/dsh-api-gateway');const controller=load('@deepseek-ai/dsh-api-session-controller');const renderer=load('@deepseek-ai/dsh-client-ui-renderer');const uiSession=load('@deepseek-ai/dsh-client-ui-session');const conversation=load('@deepseek-ai/dsh-client-ui-conversation');
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
  load('dsh-a2ui').apply(ctx);
  const nodes=new Map<string,any>();
  for(const ref of refs){
   const call={type:'tool/call',seq:1,data:{name:'render_a2ui',callId:'call-'+ref.sessionId,arguments:JSON.stringify({messages:demoMessages})}};
   const result={type:'tool/result',seq:2,surfaceOp:'append',data:{message:{source:{callId:'call-'+ref.sessionId},isError:false},meta:{kind:'dsh-a2ui/1',messages:demoMessages}}};
   ref.binding.eventSource.replace([{type:'event',event:call},{type:'event',event:result}],false);
   const binding=ctx.uiConversation.binding(ref.binding);binding.activate('chat');
   const rows=binding.target('chat').getSnapshot();expect(rows).toHaveLength(1);expect(rows[0].data.running).toBe(false);nodes.set(ref.sessionId,rows[0]);
  }
  ctx.slots.register({name:'root',children:{'conversation.chat.node':{kind:'keyed',scope:'session'}}},({SessionProvider,renderSlot}:any)=>React.createElement(React.Fragment,null,...refs.map(ref=>React.createElement(SessionProvider,{key:ref.sessionId,session:ref},React.createElement('article',{'aria-label':ref.sessionId},renderSlot('conversation.chat.node',{node:nodes.get(ref.sessionId)},{entryKey:'a2ui-document'}))))));
  await act(async()=>{unmount=ctx.uiRenderer.mount(container);});
  expect(within(container).getAllByRole('button',{name:'Preview request'})).toHaveLength(2);
  await act(async()=>{fireEvent.click(within(within(container).getByRole('article',{name:'synthetic-B'})).getByRole('button',{name:'Preview request'}));});
  await waitFor(()=>expect(prompts).toHaveLength(1));expect(prompts[0].sessionId).toBe('synthetic-B');expect(prompts[0].mode).toBe('queue');expect(prompts[0].content[0].text).toContain('A2UI user interaction (untrusted data):');
  expect(JSON.parse(prompts[0].content[0].text.split('\n')[1]).action).toMatchObject({name:'request_preview',surfaceId:'synthetic-workshop',context:{topic:'Ceramics for beginners'}});
  rejectNext=true;
  await act(async()=>{fireEvent.click(within(within(container).getByRole('article',{name:'synthetic-A'})).getByRole('button',{name:'Preview request'}));});
  await waitFor(()=>expect(prompts).toHaveLength(2));expect(prompts[1].sessionId).toBe('synthetic-A');
  expect(within(within(container).getByRole('article',{name:'synthetic-A'})).getByRole('alert').textContent).toContain('It has not been retried');
  expect(within(within(container).getByRole('article',{name:'synthetic-B'})).queryByRole('alert')).toBeNull();
  await act(async()=>{await Promise.resolve();});expect(prompts).toHaveLength(2);
 }finally{if(unmount)await act(async()=>unmount());for(const ref of refs)ref.release();await ctx.fiber.dispose();container.remove();delete (window as any).__ModuleLoader__;}
});
