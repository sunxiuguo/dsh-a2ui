import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import {SurfaceSession,SurfaceView} from '../src/surface';
import {CATALOG_ID,type Message,validateDocument} from '../src/protocol';

afterEach(cleanup);
const surfaceId='synthetic-slider';
function messages(version:string,accessibility?:Record<string,unknown>):Message[]{return [
 {version,createSurface:{surfaceId,catalogId:CATALOG_ID}},
 {version,updateDataModel:{surfaceId,path:'/',value:{label:'Synthetic amount',amount:3}}},
 {version,updateComponents:{surfaceId,components:[
  {id:'root',component:'Column',children:['amount','submit']},
  {id:'amount',component:'Slider',label:{path:'/label'},min:0,max:10,value:{path:'/amount'},...(accessibility?{accessibility}:{})},
  {id:'submit',component:'Button',child:'submit-label',action:{event:{name:'submit_amount',context:{amount:{path:'/amount'}}}}},
  {id:'submit-label',component:'Text',text:'Submit amount'},
 ]}},
];}
const model=(session:SurfaceSession)=>session.processor.model.surfacesMap.get(surfaceId)!.dataModel;
describe.each(['v0.9','v0.9.1'])('%s Slider native control',version=>{
 it('associates the reactive visible label with the native range',async()=>{
  const session=new SurfaceSession();session.append(messages(version),true);
  try{
   const view=render(<SurfaceView session={session}/>);
   await waitFor(()=>expect(view.container.querySelector('input[type=range]')).not.toBeNull());
   const input=view.container.querySelector<HTMLInputElement>('input[type=range]')!;
   expect(view.queryByRole('slider',{name:'Synthetic amount'})).toBe(input);
   expect(view.queryByLabelText('Synthetic amount',{exact:true})).toBe(input);
   expect(input.labels).toHaveLength(1);const id=input.id;
   act(()=>session.append([{version,updateDataModel:{surfaceId,path:'/label',value:'Renamed amount'}}]));
   await waitFor(()=>expect(view.getByRole('slider',{name:'Renamed amount'})).toBe(input));
   expect(input.id).toBe(id);expect(view.queryByRole('slider',{name:'Synthetic amount'})).toBeNull();
  }finally{session.dispose();}
 });
 it('applies reactive explicit name and help to the input, then removes stale attributes',async()=>{
  const data=messages(version,{label:{path:'/name'},description:{path:'/help'}});
  Object.assign(data[1].updateDataModel.value,{name:'Explicit amount',help:'Synthetic help'});
  const session=new SurfaceSession();session.append(data,true);
  try{
   const view=render(<SurfaceView session={session}/>);
   const input=await view.findByRole('slider',{name:'Explicit amount',description:'Synthetic help'});
   act(()=>session.append([{version,updateDataModel:{surfaceId,path:'/name',value:'Changed name'}},{version,updateDataModel:{surfaceId,path:'/help',value:'Changed help'}}]));
   await waitFor(()=>expect(view.getByRole('slider',{name:'Changed name',description:'Changed help'})).toBe(input));
   act(()=>session.append([{version,updateDataModel:{surfaceId,path:'/name',value:''}},{version,updateDataModel:{surfaceId,path:'/help',value:''}}]));
   await waitFor(()=>expect(view.getByRole('slider',{name:'Synthetic amount',description:''})).toBe(input));
   expect(input.getAttribute('aria-label')).toBeNull();expect(input.getAttribute('aria-description')).toBeNull();expect(input.getAttribute('aria-describedby')).toBeNull();
  }finally{session.dispose();}
 });
 it('preserves native min/max/default-step, writes numbers, and never emits an edit action',async()=>{
  const sent:Message[]=[];const session=new SurfaceSession(async action=>{sent.push(action);});session.append(messages(version),true);
  try{
   const view=render(<SurfaceView session={session}/>);const input=await view.findByRole('slider') as HTMLInputElement;
   expect(input.min).toBe('0');expect(input.max).toBe('10');expect(input.hasAttribute('step')).toBe(false);expect(input.value).toBe('3');
   fireEvent.input(input,{target:{value:'7'}});
   await waitFor(()=>expect(view.container.querySelector('.a2ui-slider-value')?.textContent).toBe('7'));
   expect(model(session).get('/amount')).toBe(7);expect(sent).toHaveLength(0);expect(session.actions).toHaveLength(0);
   act(()=>session.append([{version,updateDataModel:{surfaceId,path:'/amount',value:2}}]));
   await waitFor(()=>expect(input.value).toBe('2'));
   fireEvent.click(view.getByRole('button',{name:'Submit amount'}));await waitFor(()=>expect(sent).toHaveLength(1));
   expect(sent[0].action.context).toEqual({amount:2});
  }finally{session.dispose();}
 });
 it.each([3.5,20,-20])('retains authored number %s without silently normalizing model, snapshot or action',async value=>{
  // Browsers may sanitize the native range differently from jsdom. This test
  // asserts only the retained model contract, not browser rounding behavior.
  const data=messages(version);data[1].updateDataModel.value.amount=value;
  const sent:Message[]=[];const session=new SurfaceSession(async action=>{sent.push(action);});session.append(data,true);
  try{
   const view=render(<SurfaceView session={session}/>);await view.findByRole('slider');
   expect(model(session).get('/amount')).toBe(value);
   expect(view.container.querySelector('.a2ui-slider-value')?.textContent).toBe(String(value));
   expect(session.export().snapshots[0].updateDataModel.value.amount).toBe(value);
   fireEvent.click(view.getByRole('button',{name:'Submit amount'}));await waitFor(()=>expect(sent).toHaveLength(1));
   expect(sent[0].action.context).toEqual({amount:value});
  }finally{session.dispose();}
 });
 it.each(['step','steps'])('rejects non-v0.9 %s instead of silently introducing v1 behavior',property=>{
  const data=messages(version);data[2].updateComponents.components[1][property]=2;
  expect(()=>validateDocument(data)).toThrow('SCHEMA');
 });
 it('links failed checks and help, removes stale errors, and replays without sending',async()=>{
  const data=messages(version,{description:'Choose an amount'});
  const checks=[{condition:{call:'numeric',args:{value:{path:'/amount'},min:2,max:8},returnType:'boolean'},message:'Choose between 2 and 8'}];
  data[2].updateComponents.components[1].checks=checks;data[2].updateComponents.components[2].checks=checks;
  const sent:Message[]=[];const session=new SurfaceSession(async action=>{sent.push(action);});session.append(data,true);
  try{
   const view=render(<SurfaceView session={session}/>);const input=await view.findByRole('slider',{name:'Synthetic amount'}) as HTMLInputElement;
   fireEvent.input(input,{target:{value:'10'}});await waitFor(()=>expect(input.getAttribute('aria-invalid')).toBe('true'));
   expect(view.getByRole('slider',{name:'Synthetic amount',description:'Choose an amount Choose between 2 and 8'})).toBe(input);
   const ids=input.getAttribute('aria-describedby')!.split(' ');expect(ids.map(id=>document.getElementById(id)?.textContent)).toEqual(['Choose an amount','Choose between 2 and 8']);
   fireEvent.click(view.getByRole('button',{name:'Submit amount'}));expect(sent).toHaveLength(0);
   fireEvent.input(input,{target:{value:'6'}});await waitFor(()=>expect(input.getAttribute('aria-invalid')).toBeNull());
   expect(ids[1]&&document.getElementById(ids[1])).toBeNull();expect(view.getByRole('slider',{name:'Synthetic amount',description:'Choose an amount'})).toBe(input);
   fireEvent.click(view.getByRole('button',{name:'Submit amount'}));await waitFor(()=>expect(sent).toHaveLength(1));expect(sent[0].action.context).toEqual({amount:6});
   const saved=session.export();expect(saved.messages[1].updateDataModel.value.amount).toBe(3);view.unmount();
   const replaySend=vi.fn(async()=>{});const restored=new SurfaceSession(replaySend);
   try{restored.restore(saved);const replay=render(<SurfaceView session={restored}/>);expect((await replay.findByRole('slider',{name:'Synthetic amount'}) as HTMLInputElement).value).toBe('6');expect(restored.actions).toHaveLength(1);expect(replaySend).not.toHaveBeenCalled();}
   finally{restored.dispose();}
  }finally{session.dispose();}
 });
 it('keeps IDs and data isolated across repeated references and independent same-ID sessions',async()=>{
  const data=messages(version);data[2].updateComponents.components[0].children=['amount','amount'];
  const a=new SurfaceSession(),b=new SurfaceSession();a.append(data,true);b.append(data,true);
  try{
   const first=render(<SurfaceView session={a}/>),second=render(<SurfaceView session={b}/>);
   await waitFor(()=>expect(document.querySelectorAll('input[type=range]')).toHaveLength(4));
   const inputs=Array.from(document.querySelectorAll<HTMLInputElement>('input[type=range]'));
   expect(new Set(inputs.map(input=>input.id)).size).toBe(4);expect(inputs.every(input=>input.labels?.length===1)).toBe(true);
   expect(within(first.container).getAllByRole('slider',{name:'Synthetic amount'})).toHaveLength(2);
   expect(within(second.container).getAllByRole('slider',{name:'Synthetic amount'})).toHaveLength(2);
   fireEvent.input(inputs[0],{target:{value:'7'}});await waitFor(()=>expect(inputs[1].value).toBe('7'));expect(inputs.slice(2).map(input=>input.value)).toEqual(['3','3']);
  }finally{a.dispose();b.dispose();}
 });
 it('preserves exact order through mixed repeated-reference reorder, removal and rebuild',async()=>{
  const data=messages(version);data[2].updateComponents.components[0].children=['amount','amount','other'];
  data[2].updateComponents.components.push({id:'other',component:'Slider',label:'Other amount',max:10,value:8});
  const session=new SurfaceSession();session.append(data,true);const errors=vi.spyOn(console,'error');
  try{
   const view=render(<SurfaceView session={session}/>);
   const check=async(children:string[])=>waitFor(()=>{const inputs=Array.from(view.container.querySelectorAll<HTMLInputElement>('input[type=range]'));expect(inputs.map(input=>input.value)).toEqual(children.map(id=>id==='amount'?'3':'8'));expect(new Set(inputs.map(input=>input.id)).size).toBe(children.length);for(const input of inputs)expect(input.labels).toHaveLength(1);});
   await check(['amount','amount','other']);
   for(const children of [['amount','other','amount'],['other','amount','amount'],['amount','other'],['amount','other','amount','amount'],['other'],['amount','amount'],[],['amount','other','amount'],[],['other','amount','amount']]){
    act(()=>session.append([{version,updateComponents:{surfaceId,components:[{id:'root',component:'Column',children}]}}]));await check(children);
   }
   view.unmount();expect(view.container.querySelectorAll('input')).toHaveLength(0);expect(errors).not.toHaveBeenCalled();
  }finally{errors.mockRestore();session.dispose();}
 });
 it('uses template-relative numeric bindings without cross-item writes',async()=>{
  const data=messages(version);data[1].updateDataModel.value={items:[{label:'First amount',amount:2},{label:'Second amount',amount:5}]};
  data[2].updateComponents.components=[{id:'root',component:'List',children:{componentId:'amount',path:'/items'}},{id:'amount',component:'Slider',label:{path:'label'},max:10,value:{path:'amount'}}];
  const session=new SurfaceSession();session.append(data,true);
  try{const view=render(<SurfaceView session={session}/>);const second=await view.findByRole('slider',{name:'Second amount'});fireEvent.input(second,{target:{value:'9'}});expect(model(session).get('/items')).toEqual([{label:'First amount',amount:2},{label:'Second amount',amount:9}]);expect((view.getByRole('slider',{name:'First amount'}) as HTMLInputElement).value).toBe('2');}
  finally{session.dispose();}
 });
 it('retains official literal edit behavior until authored value replacement',async()=>{
  const data=messages(version);data[2].updateComponents.components[1].value=5;
  const session=new SurfaceSession();session.append(data,true);
  try{const view=render(<SurfaceView session={session}/>);const input=await view.findByRole('slider') as HTMLInputElement;fireEvent.input(input,{target:{value:'8'}});act(()=>session.append([{version,updateDataModel:{surfaceId,path:'/label',value:'New name'}}]));await waitFor(()=>expect(view.getByRole('slider',{name:'New name'})).toBe(input));expect(input.value).toBe('8');expect(model(session).get('/amount')).toBe(3);expect(data[2].updateComponents.components[1].value).toBe(5);act(()=>session.append([{version,updateComponents:{surfaceId,components:[{...data[2].updateComponents.components[1],value:4}]}}]));await waitFor(()=>expect(input.value).toBe('4'));}
  finally{session.dispose();}
 });
 it('preserves and removes wrapper hidden/live semantics on updates',async()=>{
  const data=messages(version,{hidden:true,live:'polite'});const session=new SurfaceSession();session.append(data,true);
  try{const view=render(<SurfaceView session={session}/>);await waitFor(()=>expect(view.container.querySelector('input')).not.toBeNull());const wrapper=view.container.querySelector('input')!.parentElement!.parentElement!;expect(wrapper.getAttribute('aria-hidden')).toBe('true');expect(wrapper.getAttribute('aria-live')).toBe('polite');expect(view.queryByRole('slider')).toBeNull();const amount=data[2].updateComponents.components[1];act(()=>session.append([{version,updateComponents:{surfaceId,components:[{...amount,accessibility:{hidden:false,live:'assertive'}}]}}]));await waitFor(()=>expect(view.getByRole('slider',{name:'Synthetic amount'})).not.toBeNull());expect(wrapper.getAttribute('aria-hidden')).toBe('false');expect(wrapper.getAttribute('aria-live')).toBe('assertive');act(()=>session.append([{version,updateComponents:{surfaceId,components:[{...amount,accessibility:{}}]}}]));await waitFor(()=>expect(wrapper.getAttribute('aria-hidden')).toBeNull());expect(wrapper.getAttribute('aria-live')).toBeNull();}
  finally{session.dispose();}
 });
});
it('preserves root-only Slider theme, weight and CSS customization',async()=>{
 const data=messages('v0.9');data[0].createSurface.theme={primaryColor:'#123456'};data[2].updateComponents.components=[{id:'root',component:'Slider',label:'Root amount',max:10,value:3,weight:2}];const session=new SurfaceSession();session.append(data,true);
 try{const view=render(<SurfaceView session={session}/>);const input=await view.findByRole('slider',{name:'Root amount'});const wrapper=input.closest('dsh-a2ui-slider') as HTMLElement;expect(wrapper.style.flexGrow).toBe('2');expect(wrapper.style.getPropertyValue('--a2ui-color-primary')).toBe('#123456');expect(wrapper.style.getPropertyValue('--a2ui-color-primary-light')).toContain('color-mix');expect((wrapper.constructor as typeof HTMLElement&{styles:{cssText:string}}).styles.cssText).toContain('--a2ui-slider-track-color');expect(view.container.querySelector('a2ui-slider')).toBeNull();expect(view.container.querySelectorAll('input')).toHaveLength(1);}
 finally{session.dispose();}
});
