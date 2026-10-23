import {it,expect} from 'vitest';
import {DataContext} from '@a2ui/web_core';
import {SurfaceSession} from '../src/surface';
import {CATALOG_ID} from '../src/protocol';
// Exercise the exact official evaluator through a real bridge-created surface.
const cases:[string,Record<string,unknown>,unknown][]=[
 ['required',{value:''},false],['required',{value:0},true],
 ['regex',{value:'AB12',pattern:'^[A-Z]{2}[0-9]{2}$'},true],['regex',{value:'bad',pattern:'^[A-Z]+$'},false],
 ['length',{value:'abc',min:3,max:3},true],['length',{value:'ab',min:3},false],
 ['numeric',{value:10,min:0,max:10},true],['numeric',{value:11,max:10},false],
 ['email',{value:'person@example.invalid'},true],['email',{value:'not an address'},false],
 ['formatString',{value:'Hello ${/name}'},'Hello Synthetic'],
 ['formatNumber',{value:1234.5,decimals:2,grouping:false},'1234.50'],
 ['formatCurrency',{value:12.5,currency:'USD'},'$12.50'],
 ['formatDate',{value:'2026-10-23T23:30:00+08:00',format:'yyyy-MM-dd HH:mm'},'2026-10-23 23:30'],
 ['formatDate',{value:'2026-02-30',format:'yyyy-MM-dd'},''],
 ['pluralize',{value:0,zero:'None',one:'One',other:'Many'},'None'],
 ['pluralize',{value:3,one:'One',other:'Many'},'Many'],
 ['and',{values:[true,false]},false],['and',{values:[true,true]},true],
 ['or',{values:[false,true]},true],['or',{values:[false,false]},false],['not',{value:false},true]
];
it.each(cases)('%s evaluates %j', (name,args,expected)=>{
 const s=new SurfaceSession();s.append([
 {version:'v0.9.1',createSurface:{surfaceId:'semantics',catalogId:CATALOG_ID}},
 {version:'v0.9.1',updateDataModel:{surfaceId:'semantics',path:'/',value:{name:'Synthetic'}}},
 {version:'v0.9.1',updateComponents:{surfaceId:'semantics',components:[{id:'root',component:'Text',text:'Synthetic'}]}}
 ],true);
 try {const context=new DataContext(s.processor.model.surfacesMap.get('semantics')!,'/');
 expect(context.resolveDynamicValue({call:name,args,returnType:typeof expected})).toEqual(expected);
 } finally{s.dispose();}
});
it('re-evaluates nested functions after streamed model updates and replay',()=>{
 const s=new SurfaceSession();s.append([
 {version:'v0.9.1',createSurface:{surfaceId:'nested',catalogId:CATALOG_ID}},
 {version:'v0.9.1',updateDataModel:{surfaceId:'nested',path:'/',value:{name:''}}},
 {version:'v0.9.1',updateComponents:{surfaceId:'nested',components:[{id:'root',component:'CheckBox',label:'Valid',value:{call:'not',args:{value:{call:'required',args:{value:{path:'/name'}},returnType:'boolean'}},returnType:'boolean'}}]}}
 ],true);
 const expression={call:'not',args:{value:{call:'required',args:{value:{path:'/name'}},returnType:'boolean'}},returnType:'boolean'};
 const context=new DataContext(s.processor.model.surfacesMap.get('nested')!,'/');
 expect(context.resolveDynamicValue(expression)).toBe(true);
 s.append([{version:'v0.9.1',updateDataModel:{surfaceId:'nested',path:'/name',value:'Synthetic'}}]);
 expect(context.resolveDynamicValue(expression)).toBe(false);
 const restored=new SurfaceSession();restored.restore(s.export());
 expect(new DataContext(restored.processor.model.surfacesMap.get('nested')!,'/').resolveDynamicValue(expression)).toBe(false);
 restored.dispose();s.dispose();
});
