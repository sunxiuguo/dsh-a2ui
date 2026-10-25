import React from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import * as ReactClient from 'react-dom/client';
import * as Cordis from '@deepseek-ai/cordis';import * as slots from '@deepseek-ai/dsh-client-ui-slots';import * as store from '@deepseek-ai/dsh-client-store';
import gatewaySource from '@deepseek-ai/dsh-api-gateway/client?raw';
import controllerSource from '@deepseek-ai/dsh-api-session-controller/client?raw';
import rendererSource from '@deepseek-ai/dsh-client-ui-renderer/client?raw';
import sessionSource from '@deepseek-ai/dsh-client-ui-session/client?raw';
import conversationSource from '@deepseek-ai/dsh-client-ui-conversation/client?raw';
import pluginSource from '../experimental-lib/client.js?raw';
import {replyFixture} from '../test/reply-v1.fixture';
const primitives=new Proxy({}, {get(){throw Error('Full composer primitives are outside this service fixture');}});
const factories=new Map<string,any>();const modules=new Map<string,any>([['react',React],['react/jsx-runtime',jsx],['react-dom',ReactDOM],['react-dom/client',ReactClient],['@deepseek-ai/cordis',Cordis],['@deepseek-ai/dsh-client-ui-slots',slots],['@deepseek-ai/dsh-client-store',store],['@deepseek-ai/dsh-client-ui-primitives',primitives]]);
(window as any).__ModuleLoader__={load:({id,factory}:any)=>factories.set(id,factory)};
for(const source of [gatewaySource,controllerSource,rendererSource,sessionSource,conversationSource,pluginSource])window.eval(source);
const load=(id:string):any=>{if(id.startsWith('@deepseek-ai/'))id=id.replace(/\/client$/, '');if(modules.has(id))return modules.get(id);const f=factories.get(id);if(!f)throw Error('Unseeded dependency '+id);const m=f(load);modules.set(id,m);return m;};
const gateway=load('@deepseek-ai/dsh-api-gateway'),controller=load('@deepseek-ai/dsh-api-session-controller'),renderer=load('@deepseek-ai/dsh-client-ui-renderer'),uiSession=load('@deepseek-ai/dsh-client-ui-session'),conversation=load('@deepseek-ai/dsh-client-ui-conversation'),plugin=load('dsh-a2ui-reply-v1');
const ctx:any=new Cordis.Context(),prompts:any[]=[],refs:any[]=[];let rejectNext=false;
const connection={generation:{getSnapshot:()=>undefined,subscribe:()=>()=>{}}};
ctx.reflect.provide('connection',connection);ctx.reflect.provide('typert',{contexts:{registerClient:()=>{}}});
ctx.reflect.provide('remote',{$on:()=>()=>{},$stream:(options:any)=>new gateway.RemoteStream(connection,options),session:{prompt:async(input:any)=>{prompts.push(input);document.getElementById('prompts')!.textContent=JSON.stringify(prompts,null,2);const reject=rejectNext;rejectNext=false;return reject?{ok:false,error:{code:'synthetic/rejected',message:'Synthetic rejection'}}:{ok:true,value:{accepted:true}};}}});
controller.apply(ctx);renderer.apply(ctx);uiSession.apply(ctx);new conversation.UiConversation(ctx,ctx.sessions);new conversation.ConversationController(ctx,{maxConcurrentFileUploads:1});
for(const id of ['synthetic-A','synthetic-B'])refs.push(ctx.sessions.retainAgentScope(id));
ctx.uiConversation.views.register({target:'chat',create(){let nodes=new Map();return {replace({nodes:rows}:any){nodes=new Map(rows.map((n:any)=>[n.key,n]));return [...nodes.values()];},apply({upserts}:any){for(const n of upserts)nodes.set(n.key,n);return [...nodes.values()];}};}});plugin.apply(ctx);
const targets=new Map<string,any>();
const events=(id:string,text:string,mode='final')=>{
 const messages:any=replyFixture('sameSurface',text);if(mode==='malformed')messages[0].createSurface.components[1].action.event.userMessage=42;
 const call={type:'tool/call',seq:1,data:{name:'render_a2ui_reply_v1',callId:'call-'+id,arguments:JSON.stringify({messages})}};
 const result={type:'tool/result',seq:2,surfaceOp:'append',data:{message:{source:{callId:'call-'+id},isError:mode==='error'},meta:{kind:'dsh-a2ui/experimental-reply-v1',messages}}};
 return (mode==='pending'?[call]:[call,result]).map(event=>({type:'event',event}));
};
for(const ref of refs){ref.binding.eventSource.replace(events(ref.sessionId,'Reply '+ref.sessionId),false);const binding=ctx.uiConversation.binding(ref.binding);binding.activate('chat');targets.set(ref.sessionId,binding.target('chat'));}
function ReactiveSession({refValue,renderSlot}:any){const target=targets.get(refValue.sessionId);const rows=React.useSyncExternalStore<any[]>(target.subscribe,target.getSnapshot,target.getSnapshot);return <article aria-label={refValue.sessionId}><h2>{refValue.sessionId}</h2>{rows.filter(n=>n.visibility!=='hidden').map(node=><React.Fragment key={node.key}>{renderSlot('conversation.chat.node',{node},{entryKey:'a2ui-reply-v1'})}</React.Fragment>)}</article>;}
ctx.slots.register({name:'root',children:{'conversation.chat.node':{kind:'keyed',scope:'session'}}},({SessionProvider,renderSlot}:any)=><>{refs.map(ref=><SessionProvider key={ref.sessionId} session={ref}><ReactiveSession refValue={ref} renderSlot={renderSlot}/></SessionProvider>)}</>);
const unmount=ctx.uiRenderer.mount(document.getElementById('host'));
const controls:[string,()=>void][]=[
 ['Replace B canonical reply',()=>refs[1].binding.eventSource.replace(events('synthetic-B','New B reply'),false)],
 ['Replay A unchanged',()=>refs[0].binding.eventSource.replace(structuredClone(events('synthetic-A','Reply synthetic-A')),false)],
 ['Mark A pending',()=>refs[0].binding.eventSource.replace(events('synthetic-A','Pending','pending'),false)],
 ['Cancel A result',()=>refs[0].binding.eventSource.replace(events('synthetic-A','Cancelled','error'),false)],
 ['Remove A events',()=>refs[0].binding.eventSource.replace([],false)],
 ['Restore A document',()=>refs[0].binding.eventSource.replace(events('synthetic-A','Reply synthetic-A'),false)],
 ['Reject next delivery',()=>{rejectNext=true;}],
 ['Malformed A result',()=>refs[0].binding.eventSource.replace(events('synthetic-A','Invalid','malformed'),false)]
];
for(const [label,action] of controls){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{action();document.getElementById('status')!.textContent=label;};document.getElementById('controls')!.append(button);}
document.getElementById('status')!.textContent='Ready: synthetic service fixture';
window.addEventListener('pagehide',()=>{unmount();for(const ref of refs)ref.release();void ctx.fiber.dispose();delete (window as any).__ModuleLoader__;},{once:true});
