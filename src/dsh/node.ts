import type {ConversationNodeDefinition,ConversationMatch} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-chat/client';
import {completeMessages} from './partial';
import {validateDocument,type Message} from '../protocol';
import {META_KIND} from './meta';
export interface ViewData {messages:Message[];error?:string;running:boolean}
declare module '@deepseek-ai/dsh-client-ui-chat/client' {interface ChatNodeDataMap {'a2ui-document':ViewData}}
interface State {raw:string;settled:Message[]|null;finished:boolean;error?:string}
function fold(state:State,match:ConversationMatch):State{
 const event=match.event;
 if(state.finished)return state;
 if(event.type==='assistant/live-chunk'&&event.data.chunk.type==='tool-call-delta')return {...state,raw:state.raw+event.data.chunk.argumentsDelta};
 if(event.type==='tool/call')return {...state,raw:event.data.arguments};
 if(event.type==='tool/result'){
  if(event.data.message.isError)return {raw:'',settled:[],finished:true,error:'A2UI tool failed or was cancelled. Preview withdrawn.'};
  const meta=event.data.meta as {kind?:string;messages?:unknown}|undefined;
  if(meta?.kind===META_KIND){try{return {...state,settled:validateDocument(meta.messages),finished:true};}catch(e){return {raw:'',settled:[],finished:true,error:String(e)};}}
  return {raw:'',settled:[],finished:true,error:'A2UI tool finished without a validated document. Preview withdrawn.'};
 }
 return state;
}
export const definition:ConversationNodeDefinition<State>={
 kind:'a2ui-document',target:'chat',
 match(event){
  if(event.type==='assistant/live-chunk'&&event.data.chunk.type==='tool-call-delta'){
   const c=event.data.chunk;return c.name===undefined?{id:String(c.id),role:'update'}:c.name==='render_a2ui'?{id:String(c.id),role:'start'}:null;
  }
  if(event.type==='tool/call')return event.data.name==='render_a2ui'?{id:String(event.data.callId),role:'start'}:null;
  if(event.type==='tool/result'&&event.surfaceOp==='append')return {id:String(event.data.message.source.callId),role:'update'};
  return null;
 },
 start:(_ctx,match)=>fold({raw:'',settled:null,finished:false},match),
 update:(ctx,match)=>fold(ctx.state,match),
 publication:match=>match.event.type==='assistant/live-chunk'?'animation-frame':'immediate',
 buildViewNode(ctx){
  if(!ctx.state){
   // A cancelled live attempt retires its transient start. The host retains
   // materialized keys, so withdraw the payload through a hidden tombstone.
   const current=ctx.current.get('chat');
   return current==null?null:{...current,visibility:'hidden',data:{messages:[],running:false}};
  }
  let data:ViewData={messages:[],running:!ctx.state.finished};
  try{
   const messages=ctx.state.settled??completeMessages(ctx.state.raw);
   if(messages.length)data={messages:validateDocument(messages,false),running:!ctx.state.finished};
   if(ctx.state.error)data.error=ctx.state.error;
  }catch(e){data.error=String(e);}
  return {key:ctx.key,kind:'a2ui-document',id:ctx.id,target:'chat',anchorSeq:ctx.start?.event.seq??0,location:ctx.start?.location??{kind:'unresolved'},visibility:'visible',data};
 }
};
