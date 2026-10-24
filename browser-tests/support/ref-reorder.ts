// Synthetic browser-only fixture. Imported by Vite, not shipped in the plugin.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {SurfaceSession,SurfaceView} from '../../src/surface';
export function mount(version:string){
 const session=new SurfaceSession();session.append([
  {version,createSurface:{surfaceId:'synthetic-ref-reorder',catalogId:'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json'}},
  {version,updateComponents:{surfaceId:'synthetic-ref-reorder',components:[
   {id:'root',component:'Column',children:['topic','topic','rename']},
   {id:'topic',component:'TextField',label:'Synthetic repeated topic',value:'Synthetic text'},
   {id:'rename',component:'TextField',label:'Synthetic separate name',value:'A topic'}
  ]}}
 ],true);
 const element=document.createElement('section');element.id='synthetic-ref-reorder';document.body.append(element);
 const root=createRoot(element);root.render(React.createElement(SurfaceView,{session}));
 return {
  reorder:(children:string[])=>session.append([{version,updateComponents:{surfaceId:'synthetic-ref-reorder',components:[{id:'root',component:'Column',children}]}}]),
  dispose:()=>{root.unmount();session.dispose();element.remove();},
 };
}
