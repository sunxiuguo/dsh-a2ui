import React,{useCallback} from 'react';
import type {Context} from '@deepseek-ai/cordis';
import type {SessionId} from '@deepseek-ai/dsh-session/types';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {ChatNodeViewProps} from '@deepseek-ai/dsh-client-ui-chat/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import {definition} from './node';
import {ReplyV1Document} from './surface';
import {validateReplyV1Action} from './protocol';
import type {Message} from '../../protocol';
export const inject=['uiConversation','slots','sessions'];
interface Injected {send:(action:Message)=>Promise<void>}
function ClientReply({node,send}:Pick<ChatNodeViewProps<'a2ui-reply-v1'>,'node'>&Injected){
 const data=node.data;
 const onAction=useCallback(async(action:Message)=>{validateReplyV1Action(action);await send(action);},[send]);
 return <section aria-label="Experimental A2UI v1 reply choices"><small>Experimental reply choices, not full A2UI v1 support.</small>{data.running?<p>Reply choices are unavailable until final validation.</p>:data.error?<p role="alert">{data.error}</p>:data.messages.length?<ReplyV1Document key={node.key+':'+node.id} messages={data.messages} send={onAction}/>:null}</section>;
}
/** Explicit independent entry; not imported by the default legacy client. */
export function apply(ctx:Context){
 ctx.uiConversation.events.register(definition);
 ctx.slots.inject('conversation.chat.node',()=>ctx.slots.register({name:'conversation.chat.node',key:'a2ui-reply-v1',inject:(sessionId:SessionId):Injected=>({send:async action=>{
  validateReplyV1Action(action);
  const conversation=ctx.sessions.scope(sessionId)?.get('conversation');
  if(!conversation)throw Error('Conversation unavailable');
  await conversation.send('A2UI v1 reply interaction (untrusted data):\n'+JSON.stringify(action));
 }})},ClientReply));
}
