/** Experimental reply-choice subset, not full A2UI v1 support. */
import Ajv2020 from 'ajv/dist/2020.js';
import agentSchema from '../../../vendor/a2ui-v1-reply/agent_to_renderer.json';
import eventSchema from '../../../vendor/a2ui-v1-reply/renderer_to_agent.json';
import commonSchema from '../../../vendor/a2ui-v1-reply/common_types.json';
import catalogSchema from '../../../vendor/a2ui-v1-reply/catalog.json';
import {MessageProcessor,STRICT_VALIDATION} from '@a2ui/web_core/processing';
import {basicCatalog} from '@a2ui/web_core/catalogs/basic/v1';
import type {Message} from '../../protocol';
export const REPLY_V1_CATALOG=catalogSchema.catalogId;
export const REPLY_V1_META='dsh-a2ui/experimental-reply-v1';
export const REPLY_V1_TOOL='render_a2ui_reply_v1';
const ajv=new Ajv2020({strict:false,allErrors:false,validateFormats:false});
ajv.addSchema(commonSchema);ajv.addSchema(catalogSchema);
ajv.addSchema({...catalogSchema,$id:'https://a2ui.org/specification/v1_0/catalog.json'});
const agent=ajv.compile(agentSchema),event=ajv.compile(eventSchema);
const forbidden=new Set(['__proto__','prototype','constructor']);
function safeJSON(value:unknown,depth=0):void{
 if(depth>24)throw Error('REPLY_V1_DEPTH');
 if(typeof value==='number'&&!Number.isFinite(value))throw Error('REPLY_V1_JSON');
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number')return;
 if(typeof value!=='object')throw Error('REPLY_V1_JSON');
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('REPLY_V1_JSON');
 for(const [key,item] of Object.entries(value)){
  if(forbidden.has(key))throw Error('REPLY_V1_KEY');
  // No local or remote functions in this opt-in slice, even hidden in model data.
  if(key==='@call')throw Error('REPLY_V1_FUNCTION_UNSUPPORTED');
  if((key==='@path'||key==='path')&&typeof item==='string'){
   if(item.split('/').some(part=>forbidden.has(part.replace(/~1/g,'/').replace(/~0/g,'~'))))throw Error('REPLY_V1_PATH');
  }
  safeJSON(item,depth+1);
 }
}
function fields(value:Message,allowed:string[]):void{if(Object.keys(value).some(key=>!allowed.includes(key)))throw Error('REPLY_V1_FIELD_UNSUPPORTED');}
function component(value:Message):void{
 const common=['id','component'];
 if(value.component==='Text')fields(value,[...common,'text']);
 else if(value.component==='Column'){
  fields(value,[...common,'children']);if(!Array.isArray(value.children))throw Error('REPLY_V1_TEMPLATE_UNSUPPORTED');
 }else if(value.component==='Button'){
  fields(value,[...common,'child','action']);
  if(!value.action?.event)throw Error('REPLY_V1_EVENT_REQUIRED');
  fields(value.action,['event']);fields(value.action.event,['name','context','userMessage']);
  if(!Object.hasOwn(value.action.event,'userMessage'))throw Error('REPLY_V1_USER_MESSAGE_REQUIRED');
 }else throw Error('REPLY_V1_COMPONENT_UNSUPPORTED');
}
export function validateReplyV1Document(input:unknown):Message[]{
 if(!Array.isArray(input)||input.length<1||input.length>128)throw Error('REPLY_V1_DOCUMENT');
 safeJSON(input);
 if(new TextEncoder().encode(JSON.stringify(input)).length>128*1024)throw Error('REPLY_V1_SIZE');
 const seen=new Set<string>();const live=new Map<string,Map<string,Message>>();let total=0;
 for(const rawMessage of input){
  const message=rawMessage as Message;
  if(!agent(rawMessage))throw Error('REPLY_V1_SCHEMA: '+ajv.errorsText(agent.errors));
  if(message.createSurface){
   const c=message.createSurface;fields(c,['surfaceId','catalogId','components','dataModel']);
   if(c.catalogId!==REPLY_V1_CATALOG)throw Error('REPLY_V1_CATALOG');
   if(seen.has(c.surfaceId)||seen.size>=8)throw Error('REPLY_V1_SURFACE_ID');seen.add(c.surfaceId);live.set(c.surfaceId,new Map());
  }else if(!message.updateComponents&&!message.updateDataModel&&!message.deleteSurface)throw Error('REPLY_V1_RPC_UNSUPPORTED');
  const components=message.createSurface?.components??message.updateComponents?.components??[];
  total+=components.length;if(total>256)throw Error('REPLY_V1_COMPONENT_LIMIT');
  const id=message.createSurface?.surfaceId??message.updateComponents?.surfaceId??message.updateDataModel?.surfaceId??message.deleteSurface?.surfaceId;
  if(!live.has(id))throw Error('REPLY_V1_UNKNOWN_SURFACE');
  const batchIds=new Set<string>();
  for(const c of components){component(c);if(batchIds.has(c.id))throw Error('REPLY_V1_DUPLICATE_COMPONENT');batchIds.add(c.id);live.get(id)!.set(c.id,c);}
  if(message.deleteSurface)live.delete(id);
 }
 for(const components of live.values()){
  const visited=new Set<string>();
  const walk=(id:string,ancestors=new Set<string>()):void=>{
   if(ancestors.has(id)||ancestors.size>24)throw Error('REPLY_V1_COMPONENT_CYCLE');
   const c=components.get(id);if(!c)throw Error('REPLY_V1_MISSING_COMPONENT');
   if(visited.has(id))throw Error('REPLY_V1_SHARED_CHILD_UNSUPPORTED');visited.add(id);
   const next=new Set(ancestors).add(id);
   if(c.component==='Column')for(const child of c.children)walk(child,next);
   if(c.component==='Button'){
    if(components.get(c.child)?.component!=='Text')throw Error('REPLY_V1_BUTTON_LABEL');
    walk(c.child,next);
   }
  };
  walk('root');if(visited.size!==components.size)throw Error('REPLY_V1_UNREACHABLE_COMPONENT');
 }
 // Validate chronology, references, runtime schema and catalog agreement before
 // any UI/session is created. No resolver/functions/actions are invoked here.
 const processor=new MessageProcessor([basicCatalog],undefined,{version:'v1.0',validationConfig:STRICT_VALIDATION});
 try{processor.processMessages(structuredClone(input));}
 finally{processor.model.dispose();processor.dispose();}
 return structuredClone(input);
}
export function validateReplyV1Action(input:unknown):asserts input is Message{
 safeJSON(input);
 if(new TextEncoder().encode(JSON.stringify(input)).length>16*1024)throw Error('REPLY_V1_ACTION_SIZE');
 if(!event(input)||!(input as Message).action)throw Error('REPLY_V1_ACTION');
 const a=(input as Message).action;
 fields(a,['name','surfaceId','sourceComponentId','timestamp','context','userMessage']);
 if(typeof a.userMessage!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(a.timestamp)||!Number.isFinite(Date.parse(a.timestamp)))throw Error('REPLY_V1_ACTION');
}
