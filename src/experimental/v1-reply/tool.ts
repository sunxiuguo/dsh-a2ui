import type {Context} from '@deepseek-ai/cordis';
import {defineTool} from '@deepseek-ai/dsh-tools';
import type {JsonValue} from '@deepseek-ai/dsh-util-values';
import {validateReplyV1Document as validateDocument,REPLY_V1_META as META_KIND,REPLY_V1_TOOL} from './protocol';

export const name='dsh-a2ui-reply-v1-experimental';
export const inject=['tools'];
export function apply(ctx:Context){
 ctx.tools.register(defineTool({
  name:REPLY_V1_TOOL,
  description:`Experimental v1.0 reply choices only. This is not full v1 support. Supply a complete self-contained v1.0 document using the v1 basic catalog with Text (plain text), Column (static children) and Button (event with userMessage) only. Bindings use @path; function calls, RPC, media, navigation, templates and optional layout/validation properties are rejected. No update-only continuation across tool calls. Choices are inert until final validation.`,
  parameters:{messages:{type:'array',required:true,items:{type:'json'},description:'Complete A2UI messages in chronological order.'}},
  output:{schema:{type:'object',additionalProperties:false,properties:{recording:{type:'json',required:true}}},
   render:()=>[{type:'text',text:'Experimental v1 reply choices validated. Interactive display requires the separate experimental reply client; the default legacy client does not render this tool. This receipt alone does not confirm display.'}],
   presentationMeta:(_args,value)=>value.recording,
  },
  isConcurrencySafe:()=>true,
  async execute(args,exec){
   exec.signal.throwIfAborted();
   const messages=validateDocument(args.messages);
   return {recording:{kind:META_KIND,callId:String(exec.callId),messages} as unknown as JsonValue};
  },
  presentCall:()=>({card:'generic',title:'A2UI document'}),
  presentResult:(_args,result)=>result.isError?undefined:{card:'generic',title:'A2UI document validated'},
 }));
}
