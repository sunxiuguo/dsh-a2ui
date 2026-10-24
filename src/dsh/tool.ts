import type {Context} from '@deepseek-ai/cordis';
import {defineTool} from '@deepseek-ai/dsh-tools';
import type {JsonValue} from '@deepseek-ai/dsh-util-values';
import {validateDocument,CATALOG_ID} from '../protocol';
import {META_KIND} from './meta';
export const name='dsh-a2ui';
export const inject=['tools'];
export function apply(ctx:Context){
 ctx.tools.register(defineTool({
  name:'render_a2ui',
  description:`Render an A2UI v0.9 or v0.9.1 document using the official basic catalog ${CATALOG_ID}. Supply createSurface then updateComponents/updateDataModel. Components must have a root. Media and navigation are disabled. TextField.validationRegexp is unsupported by the pinned runtime; author checks with the regex function instead and add Button checks explicitly to gate actions. No HTML, JavaScript or arbitrary catalogs.`,
  parameters:{messages:{type:'array',required:true,items:{type:'json'},description:'Complete A2UI messages in chronological order.'}},
  output:{schema:{type:'object',additionalProperties:false,properties:{recording:{type:'json',required:true}}},
   render:()=>[{type:'text',text:'A2UI document validated and saved for rendering. Interactive display requires the dsh-a2ui client plugin; this receipt alone does not confirm display.'}],
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
