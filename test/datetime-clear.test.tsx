import React from 'react';
import {it,expect,afterEach,describe} from 'vitest';
import {render,cleanup,waitFor,fireEvent,act} from '@testing-library/react';
import {SurfaceSession,SurfaceView} from '../src/surface';
import {CATALOG_ID} from '../src/protocol';
afterEach(cleanup);
function deep(root:ParentNode,selector:string):any{const d=root.querySelector(selector);if(d)return d;for(const e of root.querySelectorAll('*'))if(e.shadowRoot){const r=deep(e.shadowRoot,selector);if(r)return r;}return null;}
for (const version of ['v0.9','v0.9.1']) describe(version,()=>{
function messages(gated:boolean){const check={condition:{call:'required',args:{value:{path:'/when'}}},message:'Select a date and time'};return [
{version,createSurface:{surfaceId:'synthetic-schedule',catalogId:CATALOG_ID}},
{version,updateDataModel:{surfaceId:'synthetic-schedule',path:'/',value:{when:'2026-10-24T14:30:00'}}},
{version,updateComponents:{surfaceId:'synthetic-schedule',components:[
{id:'root',component:'Column',children:['when','submit']},
{id:'when',component:'DateTimeInput',enableDate:true,enableTime:true,value:{path:'/when'},label:'Synthetic appointment',checks:[check]},
{id:'submit',component:'Button',child:'label',...(gated?{checks:[check]}:{}),action:{event:{name:'save_synthetic',context:{when:{path:'/when'}}}}},
{id:'label',component:'Text',text:'Save synthetic'}]}}];}
for(const part of ['date','time'])it(`clearing combined ${part}: observed model, action and replay`,async()=>{
const sent:any[]=[];const s=new SurfaceSession(async a=>{sent.push(a);});s.append(messages(false),true);
const view=render(<SurfaceView session={s}/>);await waitFor(()=>expect(deep(view.container,'input[type=time]')).toBeTruthy());
await act(async()=>{fireEvent.change(deep(view.container,`input[type=${part}]`),{target:{value:''}});});
const model=s.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/when');
fireEvent.click(deep(view.container,'button'));await waitFor(()=>expect(sent).toHaveLength(1));
const saved=s.export();view.unmount();let replaySends=0;const r=new SurfaceSession(async()=>{replaySends++;});r.restore(saved);
const replay=render(<SurfaceView session={r}/>);await waitFor(()=>expect(deep(replay.container,'input[type=time]')).toBeTruthy());
console.log(JSON.stringify({part,model,action:sent[0],replayModel:r.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/when'),replayDate:deep(replay.container,'input[type=date]').value,replayTime:deep(replay.container,'input[type=time]').value,replaySends}));
s.dispose();r.dispose();expect(model).toBe('');
});
it('explicit required gating blocks submission after user clears combined time',async()=>{
const sent:any[]=[];const s=new SurfaceSession(async a=>{sent.push(a);});s.append(messages(true),true);
const view=render(<SurfaceView session={s}/>);await waitFor(()=>expect(deep(view.container,'input[type=time]')).toBeTruthy());
await act(async()=>{fireEvent.change(deep(view.container,'input[type=time]'),{target:{value:''}});});
const button=deep(view.container,'button');console.log(JSON.stringify({buttonDisabled:button.disabled,model:s.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/when')}));
fireEvent.click(button);await act(async()=>{});console.log('sentAfterClear',JSON.stringify(sent));s.dispose();expect(button.disabled).toBe(true);expect(sent).toHaveLength(0);
});
for(const part of ['date','time'])it(`control: ${part}-only clearing uses empty and required gating works`,async()=>{
const m=messages(true);const c=(m[2] as any).updateComponents.components[1];c.enableDate=part==='date';c.enableTime=part==='time';(m[1] as any).updateDataModel.value.when=part==='date'?'2026-10-24':'14:30';
const sent:any[]=[];const s=new SurfaceSession(async a=>{sent.push(a);});s.append(m,true);
const view=render(<SurfaceView session={s}/>);await waitFor(()=>expect(deep(view.container,`input[type=${part}]`)).toBeTruthy());
await act(async()=>{fireEvent.change(deep(view.container,`input[type=${part}]`),{target:{value:''}});});
expect(s.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/when')).toBe('');expect(deep(view.container,'button').disabled).toBe(true);
fireEvent.click(deep(view.container,'button'));await act(async()=>{});expect(sent).toHaveLength(0);s.dispose();
});
it('control: valid combined edit emits and restores the requested date/time',async()=>{
const sent:any[]=[];const s=new SurfaceSession(async a=>{sent.push(a);});s.append(messages(true),true);
const view=render(<SurfaceView session={s}/>);await waitFor(()=>expect(deep(view.container,'input[type=time]')).toBeTruthy());
await act(async()=>{fireEvent.change(deep(view.container,'input[type=time]'),{target:{value:'16:45'}});});
expect(s.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/when')).toBe('2026-10-24T16:45:00');
fireEvent.click(deep(view.container,'button'));await waitFor(()=>expect(sent).toHaveLength(1));expect(sent[0].action.context.when).toBe('2026-10-24T16:45:00');
const r=new SurfaceSession(async()=>{throw Error('Replay must not send');});r.restore(s.export());expect(r.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/when')).toBe('2026-10-24T16:45:00');s.dispose();r.dispose();
});

for(const first of ['date','time'])it(`clear ${first}, clear other, then re-enter emits once and restores`,async()=>{
const sent:any[]=[];const s=new SurfaceSession(async a=>{sent.push(a);});s.append(messages(true),true);
const view=render(<SurfaceView session={s}/>);await waitFor(()=>expect(deep(view.container,'input[type=time]')).toBeTruthy());
const model=()=>s.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/when');
const change=async(part:string,value:string)=>{await act(async()=>{fireEvent.change(deep(view.container,`input[type=${part}]`),{target:{value}});});};
await change(first,'');expect(model()).toBe('');expect(deep(view.container,'button').disabled).toBe(true);
expect(deep(view.container,'input[type=date]').value).toBe('');expect(deep(view.container,'input[type=time]').value).toBe('');
await change(first==='date'?'time':'date','');expect(model()).toBe('');
await change('date','2026-11-05');expect(model()).toBe('2026-11-05T00:00:00');
await change('time','09:15');expect(model()).toBe('2026-11-05T09:15:00');expect(deep(view.container,'button').disabled).toBe(false);
fireEvent.click(deep(view.container,'button'));await waitFor(()=>expect(sent).toHaveLength(1));expect(sent[0].action.context.when).toBe(model());
const saved=s.export();expect(saved.actions).toHaveLength(1);view.unmount();let replaySends=0;const r=new SurfaceSession(async()=>{replaySends++;});r.restore(saved);
const restored=render(<SurfaceView session={r}/>);await waitFor(()=>expect(deep(restored.container,'input[type=time]')?.value).toBe('09:15'));
expect(deep(restored.container,'input[type=date]').value).toBe('2026-11-05');expect(replaySends).toBe(0);expect(r.export().actions).toEqual(saved.actions);s.dispose();r.dispose();
});
it('streamed offset value stays unmodified by render and date edit retains offset',async()=>{
const s=new SurfaceSession();s.append(messages(false),true);const view=render(<SurfaceView session={s}/>);
await act(async()=>s.append([{version,updateDataModel:{surfaceId:'synthetic-schedule',path:'/when',value:'2026-10-24T14:30:45+05:30'}}]));
await waitFor(()=>expect(deep(view.container,'input[type=time]')?.value).toBe('14:30'));
expect(s.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/when')).toBe('2026-10-24T14:30:45+05:30');
await act(async()=>{fireEvent.change(deep(view.container,'input[type=date]'),{target:{value:'2026-11-06'}});});
expect(s.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/when')).toBe('2026-11-06T14:30:45+05:30');s.dispose();
});

it('nested binding, time-first refill and repeated clear retain official semantics',async()=>{
const m=JSON.parse(JSON.stringify(messages(true)).replaceAll('/when','/booking/when'));
m[1].updateDataModel.value={booking:{when:'2026-10-24T14:30:00'}};
const s=new SurfaceSession();s.append(m,true);const view=render(<SurfaceView session={s}/>);await waitFor(()=>expect(deep(view.container,'input[type=time]')).toBeTruthy());
const model=()=>s.processor.model.surfacesMap.get('synthetic-schedule')!.dataModel.get('/booking/when');
for(let i=0;i<2;i++){
 await act(async()=>{fireEvent.change(deep(view.container,'input[type=date]'),{target:{value:''}});});
 expect(model()).toBe('');expect(view.container.textContent).toContain('Select a date and time');expect(deep(view.container,'button').disabled).toBe(true);
 await act(async()=>{fireEvent.change(deep(view.container,'input[type=time]'),{target:{value:'11:20'}});});
 const now=new Date();const localDate=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 expect(model()).toBe(`${localDate}T11:20:00`);expect(deep(view.container,'button').disabled).toBe(false);
}
s.dispose();
});

it('preserves official host accessibility name and description, including removal',async()=>{
const m=messages(false);const component=(m[2] as any).updateComponents.components[1];component.accessibility={label:'Appointment input',description:'Synthetic scheduling control',hidden:false,live:'polite'};
const s=new SurfaceSession();s.append(m,true);const view=render(<SurfaceView session={s}/>);
await waitFor(()=>expect(deep(view.container,'input[type=time]')).toBeTruthy());
const host=deep(view.container,'input[type=time]').closest('dsh-a2ui-datetimeinput, a2ui-datetimeinput');
expect(host.getAttribute('aria-label')).toBe('Appointment input');expect(host.getAttribute('aria-description')).toBe('Synthetic scheduling control');
expect(host.getAttribute('aria-hidden')).toBe('false');expect(host.getAttribute('aria-live')).toBe('polite');
const replacement={...component,accessibility:{label:'',description:'',live:''}};
await act(async()=>s.append([{version,updateComponents:{surfaceId:'synthetic-schedule',components:[replacement]}}]));
await waitFor(()=>expect(host.hasAttribute('aria-label')).toBe(false));expect(host.hasAttribute('aria-description')).toBe(false);expect(host.hasAttribute('aria-live')).toBe(false);s.dispose();
});
});
