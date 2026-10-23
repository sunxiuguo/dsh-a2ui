import {describe,it,expect} from 'vitest';
import {validateDocument,JsonlDecoder} from '../src/protocol';
import {recording,restoreRecording} from '../src/replay';
import {demoMessages} from '../demo/fixture';
describe('strict protocol and replay',()=>{
 it('accepts the synthetic official basic catalog workflow',()=>expect(validateDocument(demoMessages)).toEqual(demoMessages));
 it('decodes every single-character transport boundary',()=>{const p=new JsonlDecoder();for(const c of demoMessages.map(x=>JSON.stringify(x)).join('\n'))p.push(c);expect(p.finish()).toEqual(demoMessages);});
 it('rejects orphan lifecycle operations',()=>expect(()=>validateDocument(demoMessages.slice(1))).toThrow('LIFECYCLE'));
 it('rejects duplicate creates',()=>expect(()=>validateDocument([demoMessages[0],...demoMessages])).toThrow('LIFECYCLE'));
 it('rejects unknown catalogs',()=>{const m=structuredClone(demoMessages);m[0].createSurface!.catalogId='https://evil.invalid';expect(()=>validateDocument(m)).toThrow('CATALOG');});
 it('rejects unknown components rather than silently dropping them',()=>{const m=structuredClone(demoMessages);m[1].updateComponents!.components[1].component='NotAComponent';expect(()=>validateDocument(m)).toThrow('SCHEMA');});
 it('rejects extra protocol properties',()=>expect(()=>validateDocument([{...demoMessages[0],html:'<script/>'}])).toThrow('SCHEMA'));
 it('rejects cycles',()=>{const m=structuredClone(demoMessages);m[1].updateComponents!.components[0].children=['root'];expect(()=>validateDocument(m)).toThrow('TOPOLOGY');});
 it('rejects dangling references',()=>{const m=structuredClone(demoMessages);m[1].updateComponents!.components[0].children=['missing'];expect(()=>validateDocument(m)).toThrow('TOPOLOGY');});
 it('allows incomplete streams but not incomplete final documents',()=>{const p=new JsonlDecoder();p.push(JSON.stringify(demoMessages[0])+'\n');expect(()=>p.finish()).toThrow('missing root');});
 it('rejects prototype keys',()=>expect(()=>validateDocument(JSON.parse('[{"__proto__":{}}]'))).toThrow('POLICY_KEY'));
 it('replays only messages, never recorded actions',()=>{const action={version:'v0.9',action:{name:'request_preview',surfaceId:'synthetic-workshop',sourceComponentId:'submit',timestamp:'2026-10-23T00:00:00Z',context:{topic:'Test'}}};const r=recording(demoMessages,[action]);let calls=0;restoreRecording(JSON.stringify(r),m=>{calls++;expect(m).toEqual(demoMessages);});expect(calls).toBe(1);});
});
it('accepts explicit v0.9.1 without rewriting the version',()=>{const m=demoMessages.map(x=>({...x,version:'v0.9.1'}));expect(validateDocument(m)).toEqual(m);});
it('rejects cyclic partial streaming state before rendering',()=>{const m=structuredClone(demoMessages);m[1].updateComponents!.components[0].children=['root'];expect(()=>validateDocument(m,false)).toThrow('TOPOLOGY');});
it('rejects media policy violations as policy, not schema corruption',()=>{const m=structuredClone(demoMessages) as any[];m[1].updateComponents.components.push({id:'remote',component:'Image',url:'https://example.org/image.png'});expect(()=>validateDocument(m)).toThrow('POLICY_RESOURCE');});
it('rejects unknown versions and version drift inside a surface',()=>{expect(()=>validateDocument([{...demoMessages[0],version:'v1.0'}])).toThrow('SCHEMA');expect(()=>validateDocument([demoMessages[0],{...demoMessages[1],version:'v0.9.1'}])).toThrow('VERSION');});
it('rejects Modal trigger/content cycles and dangling references from current catalog fields',()=>{
 const create=demoMessages[0];
 for(const modal of [{id:'root',component:'Modal',trigger:'root',content:'body'},{id:'root',component:'Modal',trigger:'trigger',content:'missing'}]){
  const messages=[create,{version:'v0.9',updateComponents:{surfaceId:'synthetic-workshop',components:[modal,{id:'trigger',component:'Text',text:'Open'},{id:'body',component:'Text',text:'Body'}]}}];
  expect(()=>validateDocument(messages)).toThrow('TOPOLOGY');
 }
});
it('rejects List template and Tabs child cycles',()=>{
 for(const root of [{id:'root',component:'List',children:{componentId:'root',path:'/items'}},{id:'root',component:'Tabs',tabs:[{title:'Self',child:'root'}]}]){
  expect(()=>validateDocument([demoMessages[0],{version:'v0.9',updateComponents:{surfaceId:'synthetic-workshop',components:[root]}}])).toThrow('TOPOLOGY');
 }
});
