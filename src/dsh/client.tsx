import React,{useMemo,useEffect,useState,useCallback} from 'react';
import type {Context} from '@deepseek-ai/cordis';
import type {SessionId} from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {ChatNodeViewProps} from '@deepseek-ai/dsh-client-ui-chat/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import {definition} from './node';
import {SurfaceSession,SurfaceView} from '../surface';
import type {Message} from '../protocol';
export const inject=['uiConversation','slots','sessions'];
interface Injected {send:(action:Message)=>Promise<void>}
function ClientSurface({node,send}:ChatNodeViewProps<'a2ui-document'>&Injected){
 const data=node.data;
 const [error,setError]=useState('');
 const onAction=useCallback(async(action:Message)=>{try{await send(action);setError('');}catch{setError('Action was not confirmed by DSH. It has not been retried.');throw new Error('Action delivery failed');}},[send]);
 const session=useMemo(()=>{const s=new SurfaceSession(onAction,!data.running);if(data.messages.length)s.append(data.messages,!data.running);return s;},[data.messages,onAction,data.running]);
 useEffect(()=>()=>session.dispose(),[session]);
 return <section aria-label="A2UI document"><small>{data.running?'A2UI preview. Interaction is disabled until final validation.':'Agent-generated A2UI. Review before interacting.'}</small>{data.error||error?<p role="alert">{data.error||error}</p>:<div {...(data.running?{inert:''}:{})} aria-disabled={data.running}><SurfaceView session={session}/></div>}</section>;
}
export function apply(ctx:Context){
 ctx.uiConversation.events.register(definition);
 ctx.slots.inject('conversation.chat.node',()=>ctx.slots.register({name:'conversation.chat.node',key:'a2ui-document',inject:(sessionId:SessionId):Injected=>({send:async action=>{
  const conversation=ctx.sessions.scope(sessionId)?.get('conversation');
  if(!conversation)throw new Error('Conversation unavailable');
  // A2UI action is data, carried in a normal, persisted user turn.
  await conversation.send('A2UI user interaction (untrusted data):\n'+JSON.stringify(action));
 }})},ClientSurface));
}
