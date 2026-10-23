import {describe,it,expect} from 'vitest';
import catalog from '../vendor/a2ui/catalog.json';
import {CATALOG_ID,validateDocument,type Message} from '../src/protocol';
// Synthetic minimal fixtures: schema acceptance is not renderer/host acceptance.
const fixtures:Record<string,Message>={
 Text:{text:'Synthetic'}, Image:{url:'https://example.invalid/image.png'},Icon:{name:'info'},
 Video:{url:'https://example.invalid/video.mp4'},AudioPlayer:{url:'https://example.invalid/audio.mp3'},
 Row:{children:['label']},Column:{children:['label']},List:{children:['label']},Card:{child:'label'},
 Tabs:{tabs:[{title:'Synthetic tab',child:'label'}]},Modal:{trigger:'label',content:'body'},Divider:{},
 Button:{child:'label',action:{event:{name:'synthetic',context:{}}}},TextField:{label:'Synthetic field',value:{path:'/value'}},
 CheckBox:{label:'Synthetic checkbox',value:false},ChoicePicker:{options:[{label:'One',value:'one'}],value:['one']},
 Slider:{max:10,value:3},DateTimeInput:{value:'2026-10-23',enableDate:true}
};
const blocked=new Set(['Image','Video','AudioPlayer']);
function document(name:string):Message[]{return [
 {version:'v0.9.1',createSurface:{surfaceId:'catalog-test',catalogId:CATALOG_ID}},
 {version:'v0.9.1',updateComponents:{surfaceId:'catalog-test',components:[{id:'root',component:name,...fixtures[name]},{id:'label',component:'Text',text:'Synthetic label'},{id:'body',component:'Text',text:'Synthetic body'}]}}
];}
it('has an explicit fixture for every component in the pinned official catalog',()=>expect(Object.keys(fixtures).sort()).toEqual(Object.keys(catalog.components).sort()));
describe.each(Object.keys(fixtures))('%s contract',name=>{
 it(blocked.has(name)?'is explicitly excluded by deployment policy':'accepts the official minimal shape',()=>{
  if(blocked.has(name))expect(()=>validateDocument(document(name))).toThrow('POLICY_RESOURCE');
  else expect(()=>validateDocument(document(name))).not.toThrow();
 });
 if(!blocked.has(name))it('rejects unknown component properties rather than dropping them',()=>{
  const messages=document(name);messages[1].updateComponents.components[0].inventedProperty=true;
  expect(()=>validateDocument(messages)).toThrow('SCHEMA');
 });
});
const functions:Record<string,{args:Message;returnType:string}>={
 required:{args:{value:'x'},returnType:'boolean'},regex:{args:{value:'x',pattern:'^x$'},returnType:'boolean'},
 length:{args:{value:'x',min:1},returnType:'boolean'},numeric:{args:{value:3,min:1},returnType:'boolean'},
 email:{args:{value:'synthetic@example.invalid'},returnType:'boolean'},formatString:{args:{value:'Synthetic'},returnType:'string'},
 formatNumber:{args:{value:3},returnType:'string'},formatCurrency:{args:{value:3,currency:'USD'},returnType:'string'},
 formatDate:{args:{value:'2026-10-23',format:'yyyy-MM-dd'},returnType:'string'},pluralize:{args:{value:2,other:'items'},returnType:'string'},
 openUrl:{args:{url:'https://example.invalid'},returnType:'void'},and:{args:{values:[true,false]},returnType:'boolean'},
 or:{args:{values:[true,false]},returnType:'boolean'},not:{args:{value:false},returnType:'boolean'}
};
it('has a fixture for every official catalog function',()=>expect(Object.keys(functions).sort()).toEqual(Object.keys(catalog.functions).sort()));
function functionDocument(name:string):Message[]{const messages=document('Text');const value={call:name,...functions[name]};
 messages[1].updateComponents.components[0]=functions[name].returnType==='boolean'?{id:'root',component:'CheckBox',label:'Synthetic',value}:{id:'root',component:'Text',text:value};return messages;}
describe.each(Object.keys(functions))('%s function contract',name=>{
 it(name==='openUrl'?'is explicitly excluded by deployment policy':'accepts its official argument shape',()=>{
  if(name==='openUrl')expect(()=>validateDocument(functionDocument(name))).toThrow('POLICY_NAVIGATION');
  else expect(()=>validateDocument(functionDocument(name))).not.toThrow();
 });
 if(name!=='openUrl')it('rejects invalid argument shape',()=>{
  const messages=functionDocument(name);const root=messages[1].updateComponents.components[0];(root.text??root.value).args={unexpected:123};
  expect(()=>validateDocument(messages)).toThrow('SCHEMA');
 });
});
