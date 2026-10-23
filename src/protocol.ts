import Ajv2020 from 'ajv/dist/2020.js';
import serverSchema from '../vendor/a2ui/server_to_client.json';
import clientSchema from '../vendor/a2ui/client_to_server.json';
import commonSchema from '../vendor/a2ui/common_types.json';
import catalogSchema from '../vendor/a2ui/catalog.json';

export const CATALOG_ID = catalogSchema.catalogId;
export const MAX_BYTES = 256 * 1024;
export const MAX_MESSAGES = 512;
export const MAX_ACTION_BYTES = 16 * 1024;
export const MAX_ACTIONS = 128;
export const MAX_ACTION_HISTORY_BYTES = 256 * 1024;
export type Message = Record<string, any>;
const ajv = new Ajv2020({strict:false, allErrors:false, validateFormats:false});
ajv.addSchema(commonSchema);
ajv.addSchema(catalogSchema);
ajv.addSchema({...catalogSchema,$id:'https://a2ui.org/specification/v0_9/catalog.json'});
const server = ajv.compile(serverSchema);
const client = ajv.compile(clientSchema);
const forbiddenKeys = new Set(['__proto__','prototype','constructor']);
// This deliberately narrower deployment policy rejects external resource loading
// and navigation. It does not claim that the A2UI standard forbids these features.
const forbiddenComponents = new Set(['Image','Video','AudioPlayer']);
function inspect(value:unknown, depth=0):void {
  if(depth>32) throw new Error('POLICY_DEPTH: maximum JSON nesting exceeded');
  if(value===null || typeof value!=='object') return;
  for(const [key,item] of Object.entries(value)) {
    if(forbiddenKeys.has(key)) throw new Error('POLICY_KEY: unsafe object key');
    if(key==='component' && forbiddenComponents.has(String(item))) throw new Error('POLICY_RESOURCE: external media disabled');
    if(key==='call' && item==='openUrl') throw new Error('POLICY_NAVIGATION: openUrl disabled');
    if(key==='path' && typeof item==='string' && item.split('/').some(x=>forbiddenKeys.has(x))) throw new Error('POLICY_PATH: unsafe path');
    inspect(item,depth+1);
  }
}
export function validateMessage(value:unknown):asserts value is Message {
  inspect(value);
  if(!server(value)) throw new Error('SCHEMA: '+ajv.errorsText(server.errors));
  if((value as Message).createSurface?.catalogId && (value as Message).createSurface.catalogId!==CATALOG_ID) throw new Error('CATALOG: unsupported catalog');
}
export function validateAction(value:unknown):asserts value is Message {
  if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_ACTION_BYTES)throw new Error('ACTION_LIMIT: payload exceeds 16 KiB');
  inspect(value);
  if(!client(value) || !(value as Message).action) throw new Error('ACTION: invalid action envelope');
  if(!/^\d{4}-\d{2}-\d{2}T/.test((value as Message).action.timestamp) || !Number.isFinite(Date.parse((value as Message).action.timestamp))) throw new Error('ACTION: invalid timestamp');
}
/** Derive child references from the pinned catalog's actual property schemas.
 * Do not follow ComponentCommon: its own `id` identifies a node, not a child.
 * ChildList templates name a componentId; Tabs' item properties are traversed.
 */
export function componentChildren(component:Message):string[]{
  const children:string[]=[];
  const walk=(schema:any,value:any):void=>{
    if(value===undefined || !schema)return;
    if(schema.$ref?.endsWith('/ComponentId')){if(typeof value==='string')children.push(value);return;}
    if(schema.$ref?.endsWith('/ChildList')){
      if(Array.isArray(value))children.push(...value);
      else if(typeof value?.componentId==='string')children.push(value.componentId);
      return;
    }
    for(const branch of schema.allOf??[])walk(branch,value);
    for(const [key,prop] of Object.entries(schema.properties??{}))walk(prop,value?.[key]);
    if(schema.items && Array.isArray(value))for(const item of value)walk(schema.items,item);
  };
  walk((catalogSchema.components as Record<string,unknown>)[component.component],component);
  return children;
}
/** Atomic document validation: no partial acceptance or silent sanitization. */
export function validateDocument(input:unknown, complete=true):Message[] {
  if(!Array.isArray(input) || input.length===0 || input.length>MAX_MESSAGES) throw new Error('DOCUMENT: expected 1..512 messages');
  const serialized=JSON.stringify(input);
  if(new TextEncoder().encode(serialized).length>MAX_BYTES) throw new Error('DOCUMENT: byte limit exceeded');
  const states=new Map<string,Map<string,Message>>();
  const versions=new Map<string,string>();
  for(const message of input) {
    validateMessage(message);
    const op=Object.keys(message).find(k=>k!=='version')!;
    const payload=message[op]; const id=payload.surfaceId;
    if(op==='createSurface') {
      if(states.has(id)) throw new Error('LIFECYCLE: duplicate surface');
      if(states.size>=8) throw new Error('LIFECYCLE: maximum 8 surfaces');
      states.set(id,new Map()); versions.set(id,message.version);
    } else {
      const components=states.get(id);
      if(!components) throw new Error('LIFECYCLE: surface not created');
      if(versions.get(id)!==message.version) throw new Error('VERSION: mixed surface versions');
      if(op==='deleteSurface') {states.delete(id);versions.delete(id);}
      if(op==='updateComponents') {
        const seen=new Set<string>();
        for(const c of payload.components) {
          if(seen.has(c.id)) throw new Error('COMPONENT: duplicate id in update');
          seen.add(c.id);components.set(c.id,c);
        }
        if(components.size>256) throw new Error('COMPONENT: maximum 256 components');
      }
    }
  }
  for(const components of states.values()) {
    if(complete && !components.has('root')) throw new Error('TOPOLOGY: missing root');
    const stack=new Set<string>(); const done=new Set<string>();
    const visit=(id:string,depth:number)=>{
      if(depth>32 || stack.has(id)) throw new Error('TOPOLOGY: cycle or excessive depth');
      if(done.has(id))return;
      const c=components.get(id); if(!c){if(complete)throw new Error('TOPOLOGY: dangling child '+id);return;}
      stack.add(id);
      for(const child of componentChildren(c))visit(child,depth+1);
      stack.delete(id);done.add(id);
    }; for(const id of components.keys())visit(id,0);
  }
  return JSON.parse(serialized);
}
/** NDJSON transport: fragmented UTF-8 is decoded before this class receives text. */
export class JsonlDecoder {
  private buffer=''; private bytes=0; private messages:Message[]=[];
  push(chunk:string):Message[] {
    this.bytes+=new TextEncoder().encode(chunk).length;
    if(this.bytes>MAX_BYTES)throw new Error('STREAM: byte limit exceeded');
    this.buffer+=chunk;const lines=this.buffer.split('\n');this.buffer=lines.pop()!;
    const accepted:Message[]=[];
    for(const line of lines)if(line.trim()) {
      const m=JSON.parse(line);validateMessage(m);
      validateDocument([...this.messages,m],false);this.messages.push(m);accepted.push(m);
    }
    return accepted;
  }
  finish():Message[] {
    if(this.buffer.trim())this.push('\n');
    return validateDocument(this.messages);
  }
}
