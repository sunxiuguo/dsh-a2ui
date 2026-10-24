import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,waitFor,within} from '@testing-library/react';
import {SurfaceSession,SurfaceView} from '../src/surface';
import {CATALOG_ID,type Message} from '../src/protocol';
import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
import {rendererCatalog} from '../src/catalog';
import validationFixture from '../demo/validation-fixture.json';

afterEach(cleanup);
type Variant='shortText'|'longText'|'number'|'obscured';
function messages(version:string,variant:Variant='shortText',accessibility?:Record<string,unknown>):Message[]{
 return [
  {version,createSurface:{surfaceId:'synthetic-a11y',catalogId:CATALOG_ID}},
  {version,updateDataModel:{surfaceId:'synthetic-a11y',path:'/',value:{label:'Synthetic field',value:'12'}}},
  {version,updateComponents:{surfaceId:'synthetic-a11y',components:[
   {id:'root',component:'Column',children:['field','submit']},
   {id:'field',component:'TextField',label:{path:'/label'},value:{path:'/value'},variant,...(accessibility?{accessibility}:{})},
   {id:'submit',component:'Button',child:'submit-label',action:{event:{name:'submit_synthetic',context:{value:{path:'/value'}}}}},
   {id:'submit-label',component:'Text',text:'Submit synthetic'},
  ]}},
 ];
}
describe.each(['v0.9','v0.9.1'])('%s TextField accessible control',version=>{
 it.each<Variant>(['shortText','longText','number','obscured'])('associates its dynamic visible label with the %s control',async variant=>{
  const session=new SurfaceSession();session.append(messages(version,variant),true);
  try{
   const view=render(<SurfaceView session={session}/>);
   await waitFor(()=>expect(view.container.querySelector('input,textarea')).not.toBeNull());
   const control=view.container.querySelector('input,textarea') as HTMLInputElement|HTMLTextAreaElement;
   expect(view.queryByLabelText('Synthetic field',{exact:true})).toBe(control);
   if(variant!=='obscured')expect(view.getByRole(variant==='number'?'spinbutton':'textbox',{name:'Synthetic field'})).toBe(control);
   expect(control.value).toBe('12');
   expect(control.tagName).toBe(variant==='longText'?'TEXTAREA':'INPUT');
   if(variant!=='longText')expect(control.getAttribute('type')).toBe(variant==='number'?'number':variant==='obscured'?'password':'text');
   fireEvent.input(control,{target:{value:'34'}});
   expect(session.processor.model.surfacesMap.get('synthetic-a11y')?.dataModel.get('/value')).toBe('34');
   const id=control.id;
   act(()=>session.append([{version,updateDataModel:{surfaceId:'synthetic-a11y',path:'/label',value:'Renamed synthetic field'}}]));
   await waitFor(()=>expect(view.getByLabelText('Renamed synthetic field',{exact:true})).toBe(control));
   expect(view.queryByLabelText('Synthetic field',{exact:true})).toBeNull();
   expect(control.id).toBe(id);
   expect(control.value).toBe('34');
  }finally{session.dispose();}
 });
 it('applies explicit accessibility label and description to the native input',async()=>{
  const session=new SurfaceSession();session.append(messages(version,'shortText',{label:'Synthetic accessible name',description:'Synthetic help'}),true);
  try{
   const view=render(<SurfaceView session={session}/>);
   await waitFor(()=>expect(view.container.querySelector('input')).not.toBeNull());
   expect(view.queryByRole('textbox',{name:'Synthetic accessible name'})).toBe(view.container.querySelector('input'));
   expect(view.container.querySelector('input')?.getAttribute('aria-description')).toBe('Synthetic help');
  }finally{session.dispose();}
 });
 it('preserves hidden and live on the wrapper and responds to component updates',async()=>{
  const data=messages(version,'shortText',{hidden:true,live:'polite'});
  const session=new SurfaceSession();session.append(data,true);
  try{
   const view=render(<SurfaceView session={session}/>);
   await waitFor(()=>expect(view.container.querySelector('input')).not.toBeNull());
   const wrapper=view.container.querySelector('dsh-a2ui-textfield')!;
   expect(wrapper.getAttribute('aria-hidden')).toBe('true');expect(wrapper.getAttribute('aria-live')).toBe('polite');
   expect(view.queryByRole('textbox',{name:'Synthetic field'})).toBeNull();
   const field=data[2].updateComponents.components[1];
   act(()=>session.append([{version,updateComponents:{surfaceId:'synthetic-a11y',components:[{...field,accessibility:{hidden:false,live:'assertive'}}]}}]));
   await waitFor(()=>expect(view.getByRole('textbox',{name:'Synthetic field'})).toBe(view.container.querySelector('input')));
   expect(wrapper.getAttribute('aria-hidden')).toBe('false');expect(wrapper.getAttribute('aria-live')).toBe('assertive');
   act(()=>session.append([{version,updateComponents:{surfaceId:'synthetic-a11y',components:[{...field,accessibility:{}}]}}]));
   await waitFor(()=>expect(wrapper.getAttribute('aria-hidden')).toBeNull());expect(wrapper.getAttribute('aria-live')).toBeNull();
  }finally{session.dispose();}
 });
 it('reactively resolves explicit accessibility names and help with visible-label fallback',async()=>{
  const data=messages(version,'shortText',{label:{path:'/name'},description:{path:'/help'}});
  data[1].updateDataModel.value.name='Explicit accessible name';data[1].updateDataModel.value.help='First help';
  const session=new SurfaceSession();session.append(data,true);
  try{
   const view=render(<SurfaceView session={session}/>);
   const input=await view.findByRole('textbox',{name:'Explicit accessible name',description:'First help'});
   act(()=>session.append([{version,updateDataModel:{surfaceId:'synthetic-a11y',path:'/name',value:'Renamed accessible name'}},{version,updateDataModel:{surfaceId:'synthetic-a11y',path:'/help',value:'Updated help'}}]));
   await waitFor(()=>expect(view.getByRole('textbox',{name:'Renamed accessible name',description:'Updated help'})).toBe(input));
   act(()=>session.append([{version,updateDataModel:{surfaceId:'synthetic-a11y',path:'/name',value:''}},{version,updateDataModel:{surfaceId:'synthetic-a11y',path:'/help',value:''}}]));
   await waitFor(()=>expect(view.getByRole('textbox',{name:'Synthetic field',description:''})).toBe(input));
   expect(input.getAttribute('aria-describedby')).toBeNull();expect(input.getAttribute('aria-label')).toBeNull();
  }finally{session.dispose();}
 });
 it('keeps repeated component references and independent same-ID sessions uniquely associated',async()=>{
  const data=messages(version);
  data[2].updateComponents.components[0].children=['field','field'];
  const a=new SurfaceSession(),b=new SurfaceSession();a.append(data,true);b.append(data,true);
  try{
   const first=render(<SurfaceView session={a}/>),second=render(<SurfaceView session={b}/>);
   await waitFor(()=>expect(document.querySelectorAll('input')).toHaveLength(4));
   const controls=Array.from(document.querySelectorAll('input'));
   expect(new Set(controls.map(input=>input.id)).size).toBe(4);
   expect(controls.every(input=>input.labels?.length===1&&input.labels[0].textContent==='Synthetic field')).toBe(true);
   expect(within(first.container).getAllByRole('textbox',{name:'Synthetic field'})).toHaveLength(2);
   expect(within(second.container).getAllByRole('textbox',{name:'Synthetic field'})).toHaveLength(2);
   fireEvent.input(controls[0],{target:{value:'Only session A'}});
   await waitFor(()=>expect(controls[1].value).toBe('Only session A'));
   expect(controls[2].value).toBe('12');expect(controls[3].value).toBe('12');
   act(()=>a.append([{version,updateComponents:{surfaceId:'synthetic-a11y',components:[{id:'root',component:'Column',children:['field']}]}}]));
   await waitFor(()=>expect(first.container.querySelectorAll('input')).toHaveLength(1));
   act(()=>a.append([{version,updateComponents:{surfaceId:'synthetic-a11y',components:[{id:'root',component:'Column',children:['field','field']}]}}]));
   await waitFor(()=>expect(first.container.querySelectorAll('input')).toHaveLength(2));
   const again=Array.from(first.container.querySelectorAll('input'));
   expect(new Set(again.map(input=>input.id)).size).toBe(2);
   fireEvent.input(again[1],{target:{value:'After repeated-reference rebuild'}});
   await waitFor(()=>expect(again[0].value).toBe('After repeated-reference rebuild'));
  }finally{a.dispose();b.dispose();}
 });
 it('preserves counts and values through every mixed repeated-reference permutation',async()=>{
  // Independent review caught a ghost-control regression in the rejected React
  // portal implementation. Keep its exact ordering oracle, not only shrink/grow.
  const data=messages(version);
  data[1].updateDataModel.value={topic:'Synthetic text',name:'A topic'};
  data[2].updateComponents.components=[
   {id:'root',component:'Column',children:['topic','topic','rename']},
   {id:'topic',component:'TextField',label:'Topic field',value:{path:'/topic'}},
   {id:'rename',component:'TextField',label:'Rename field',value:{path:'/name'}},
  ];
  const session=new SurfaceSession();session.append(data,true);
  const consoleErrors=vi.spyOn(console,'error');
  try{
   const view=render(<SurfaceView session={session}/>);
   const assertState=async(expected:string[])=>waitFor(()=>{
    const controls=Array.from(view.container.querySelectorAll<HTMLInputElement>('input'));
    expect(controls.map(input=>input.value),'target refs: '+JSON.stringify(expected)).toEqual(expected.map(id=>id==='topic'?'Synthetic text':'A topic'));
    expect(new Set(controls.map(input=>input.id)).size).toBe(expected.length);
    for(const input of controls)expect(input.labels).toHaveLength(1);
   });
   await assertState(['topic','topic','rename']);
   for(const children of [
    ['topic','rename','topic'],['rename','topic','topic'],['topic','rename'],
    ['topic','rename','topic','topic'],['rename'],['topic','topic'],[],
    ['topic','rename','topic'],['topic'],['rename','topic','topic'],[],
   ]){
    act(()=>session.append([{version,updateComponents:{surfaceId:'synthetic-a11y',components:[{id:'root',component:'Column',children}]}}]));
    await assertState(children);
   }
   view.unmount();expect(view.container.querySelectorAll('input')).toHaveLength(0);
   expect(consoleErrors).not.toHaveBeenCalled();
  }finally{consoleErrors.mockRestore();session.dispose();}
 });
 it('keeps template-relative writes and labels isolated by item',async()=>{
  const data=messages(version);
  data[1].updateDataModel.value={items:[{label:'Repeated label',value:'first'},{label:'Repeated label',value:'second'}]};
  data[2].updateComponents.components=[
   {id:'root',component:'List',children:{componentId:'field',path:'/items'}},
   {id:'field',component:'TextField',label:{path:'label'},value:{path:'value'}},
  ];
  const session=new SurfaceSession();session.append(data,true);
  try{
   const view=render(<SurfaceView session={session}/>);
   await waitFor(()=>expect(view.queryAllByRole('textbox',{name:'Repeated label'})).toHaveLength(2));
   const controls=view.getAllByRole('textbox',{name:'Repeated label'}) as HTMLInputElement[];
   expect(controls[0].id).not.toBe(controls[1].id);
   fireEvent.input(controls[1],{target:{value:'second edited'}});
   expect(session.processor.model.surfacesMap.get('synthetic-a11y')?.dataModel.get('/items')).toEqual([{label:'Repeated label',value:'first'},{label:'Repeated label',value:'second edited'}]);
   act(()=>session.append([{version,updateDataModel:{surfaceId:'synthetic-a11y',path:'/items/1/label',value:'Second field'}}]));
   await waitFor(()=>expect(view.getByRole('textbox',{name:'Second field'})).toBe(controls[1]));
   expect(view.getByRole('textbox',{name:'Repeated label'})).toBe(controls[0]);
  }finally{session.dispose();}
 });
 it('retains literal local edits without changing authored values or submitting them as model data',async()=>{
  const data=messages(version);data[2].updateComponents.components[1].value='literal';
  const session=new SurfaceSession();session.append(data,true);
  try{
   const view=render(<SurfaceView session={session}/>);
   const input=await view.findByLabelText('Synthetic field') as HTMLInputElement;
   fireEvent.input(input,{target:{value:'local literal edit'}});
   act(()=>session.append([{version,updateDataModel:{surfaceId:'synthetic-a11y',path:'/label',value:'New label'}}]));
   await waitFor(()=>expect(view.getByLabelText('New label')).toBe(input));
   expect(input.value).toBe('local literal edit');
   expect(session.processor.model.surfacesMap.get('synthetic-a11y')?.dataModel.get('/value')).toBe('12');
   expect(data[2].updateComponents.components[1].value).toBe('literal');
   act(()=>session.append([{version,updateComponents:{surfaceId:'synthetic-a11y',components:[{...data[2].updateComponents.components[1],value:'replacement'}]}}]));
   await waitFor(()=>expect(input.value).toBe('replacement'));
  }finally{session.dispose();}
 });
 it('links failed checks and help text, removes stale errors, and preserves action/replay behavior',async()=>{
  const data:Message[]=structuredClone(validationFixture).map(message=>({...message,version}));
  data[2].updateComponents.components[1].accessibility={description:'Synthetic format help'};
  const sent:Message[]=[];const session=new SurfaceSession(async action=>{sent.push(action);});session.append(data,true);
  try{
   const view=render(<SurfaceView session={session}/>);
   const input=await view.findByRole('textbox',{name:'Synthetic code'}) as HTMLInputElement;
   fireEvent.input(input,{target:{value:'bad'}});
   await waitFor(()=>expect(input.getAttribute('aria-invalid')).toBe('true'));
   const described=input.getAttribute('aria-describedby')!.split(' ').map(id=>document.getElementById(id)!.textContent);
   expect(described).toEqual(['Synthetic format help','Use two uppercase letters followed by two digits']);
   expect(view.getByRole('textbox',{name:'Synthetic code',description:'Synthetic format help Use two uppercase letters followed by two digits'})).toBe(input);
   fireEvent.click(view.getByRole('button',{name:'Preview valid code'}));expect(sent).toHaveLength(0);
   fireEvent.input(input,{target:{value:'CD34'}});
   await waitFor(()=>expect(input.getAttribute('aria-invalid')).toBeNull());
   expect(view.queryByText('Use two uppercase letters followed by two digits')).toBeNull();
   expect(view.getByRole('textbox',{name:'Synthetic code',description:'Synthetic format help'})).toBe(input);
   fireEvent.click(view.getByRole('button',{name:'Preview valid code'}));
   await waitFor(()=>expect(sent).toHaveLength(1));expect(sent[0].action.context).toEqual({code:'CD34'});
   const restored=new SurfaceSession(async()=>{throw Error('No replay sending');});
   try{
    restored.restore(session.export());view.unmount();
    const replay=render(<SurfaceView session={restored}/>);
    expect((await replay.findByRole('textbox',{name:'Synthetic code'}) as HTMLInputElement).value).toBe('CD34');
    expect(restored.actions).toHaveLength(1);expect(sent).toHaveLength(1);
   }finally{restored.dispose();}
  }finally{session.dispose();}
 });
});

it('changes only TextField/Slider/DateTimeInput presentation and disabled navigation, not the official catalog contract',()=>{
 expect(rendererCatalog).not.toBe(basicCatalog);
 expect(rendererCatalog.id).toBe(CATALOG_ID);
 expect(rendererCatalog.toJson()).toEqual(basicCatalog.toJson());
 expect(rendererCatalog.validationSchema).toEqual(basicCatalog.validationSchema);
 for(const [name,fn]of basicCatalog.functions){
  if(name==='openUrl'){expect(rendererCatalog.functions.get(name)).not.toBe(fn);expect(rendererCatalog.functions.get(name)!.schema).toBe(fn.schema);}
  else expect(rendererCatalog.functions.get(name)).toBe(fn);
 }
 for(const name of ['TextField','Slider','DateTimeInput']){
  expect(rendererCatalog.components.get(name)).not.toBe(basicCatalog.components.get(name));
  expect(rendererCatalog.components.get(name)?.schema).toBe(basicCatalog.components.get(name)?.schema);
 }
 for(const [name,implementation] of basicCatalog.components)if(!['TextField','Slider','DateTimeInput'].includes(name))expect(rendererCatalog.components.get(name)).toBe(implementation);
});

it('preserves root-only theme and weight on the visible flex wrapper',async()=>{
 const data=messages('v0.9');data[0].createSurface.theme={primaryColor:'#123456'};
 data[2].updateComponents.components=[{id:'root',component:'TextField',label:'Root field',weight:2}];
 const session=new SurfaceSession();session.append(data,true);
 try{
  const view=render(<SurfaceView session={session}/>);
  const input=await view.findByRole('textbox',{name:'Root field'});
  const wrapper=input.closest('dsh-a2ui-textfield') as HTMLElement;
  expect(wrapper.style.flexGrow).toBe('2');
  expect(wrapper.style.getPropertyValue('--a2ui-color-primary')).toBe('#123456');
  expect(wrapper.style.getPropertyValue('--a2ui-color-primary-light')).toContain('color-mix');
  expect((wrapper.constructor as typeof HTMLElement&{styles:{cssText:string}}).styles.cssText).toContain('--a2ui-textfield-border');
  expect(view.container.querySelector('a2ui-basic-textfield')).toBeNull();
  expect(view.container.querySelectorAll('input')).toHaveLength(1);
 }finally{session.dispose();}
});

it('does not require secure-context random UUID support for native label IDs',async()=>{
 vi.stubGlobal('crypto',{});
 const session=new SurfaceSession();
 try{
  session.append(messages('v0.9'),true);
  const view=render(<SurfaceView session={session}/>);
  const input=await view.findByRole('textbox',{name:'Synthetic field'}) as HTMLInputElement;
  expect(input.id).toMatch(/^dsh-a2ui-textfield-\d+$/);
  expect(input.labels).toHaveLength(1);
 }finally{session.dispose();vi.unstubAllGlobals();}
});
