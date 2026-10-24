import React, {useEffect,useMemo,useState} from 'react';
import {MessageProcessor,type SurfaceModel,type Subscription} from '@a2ui/web_core/v0_9';
import {setMarkdownRenderer} from '@a2ui/web_core/v0_9/basic_catalog';
import {renderMarkdown} from '@a2ui/markdown-it';
import {A2uiSurface,type ReactCatalogComponent} from '@a2ui/react/v0_9';
import type {ActionPayload} from '@a2ui/web_core';
import {validateAction,validateDocument,MAX_ACTIONS,MAX_ACTION_HISTORY_BYTES,type Message} from './protocol';
import {recording,type Recording} from './replay';
import {rendererCatalog} from './catalog';

// Keep the initial preview offline: sanitized Markdown is retained, while
// links/media cannot navigate or load remote content from untrusted text.
setMarkdownRenderer(async (text,options)=>{
  const html=await renderMarkdown(text,options);
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('img,video,audio,iframe,object,embed,source').forEach(el=>el.remove());
  doc.querySelectorAll('[href],[src],[srcset]').forEach(el=>{el.removeAttribute('href');el.removeAttribute('src');el.removeAttribute('srcset');});
  return doc.body.innerHTML;
});
export class SurfaceSession {
  readonly processor:MessageProcessor<ReactCatalogComponent>;
  private readonly actionLog:Message[]=[];
  private actionAttempts=0;
  private reservedActionBytes=2;
  get actions():readonly Message[]{return structuredClone(this.actionLog);}
  private messages:Message[]=[];
  lastError:string|null=null;
  private statusListeners=new Set<()=>void>();
  // One bit per active surface (at most eight under document validation), not
  // an error history. Never retain or display the runtime's untrusted payload.
  private runtimeStates=new Map<string,{surface:SurfaceModel<ReactCatalogComponent>;observed:boolean;subscription:Subscription}>();
  private lifecycleSubscriptions:Subscription[]=[];
  private runtimeStatusQueued=false;
  private disposed=false;
  hasRuntimeWarning(surfaceId:string):boolean {
    const state=this.runtimeStates.get(surfaceId);
    return !!state?.observed&&this.processor.model.surfacesMap.get(surfaceId)===state.surface;
  }
  dismissRuntimeWarning(surfaceId:string):void {
    const state=this.runtimeStates.get(surfaceId);
    if(!state?.observed)return;
    state.observed=false;this.notifyRuntimeStatus();
  }
  private notifyRuntimeStatus(){
    // A binder can emit during React render. Coalesce notices and notify after
    // that render rather than updating a different component while it renders.
    if(this.disposed||this.runtimeStatusQueued)return;
    this.runtimeStatusQueued=true;
    queueMicrotask(()=>{
      this.runtimeStatusQueued=false;
      if(!this.disposed)for(const listener of this.statusListeners)listener();
    });
  }
  private observeRuntimeError(surface:SurfaceModel<ReactCatalogComponent>){
    const state=this.runtimeStates.get(surface.id);
    if(this.disposed||state?.surface!==surface||this.processor.model.surfacesMap.get(surface.id)!==surface||state.observed)return;
    state.observed=true;this.notifyRuntimeStatus();
  }
  subscribeStatus(listener:()=>void){this.statusListeners.add(listener);return()=>{this.statusListeners.delete(listener);};}
  constructor(private send:(action:Message)=>Promise<void>=async()=>{},private canSend=true) {
    this.processor=new MessageProcessor<ReactCatalogComponent>([rendererCatalog],async(action:ActionPayload)=>{
      try{
      if(!this.canSend)throw new Error('ACTION_PENDING: wait for final document validation');
      const version=[...this.messages].reverse().find(m=>m.createSurface?.surfaceId===action.surfaceId)?.version;
      if(!version)throw new Error('Unknown action surface');
      const message={version,action};
      validateAction(message);
      const bytes=new TextEncoder().encode(JSON.stringify(message)).length+1;
      if(this.actionAttempts>=MAX_ACTIONS || this.reservedActionBytes+bytes>MAX_ACTION_HISTORY_BYTES)throw new Error('ACTION_LIMIT: session interaction budget reached');
      // Reserve before await: concurrent clicks cannot exceed the limit.
      this.actionAttempts++;this.reservedActionBytes+=bytes;
      try{await this.send(message);this.actionLog.push(structuredClone(message));}
      catch(error){this.reservedActionBytes-=bytes;throw error;}
      this.lastError=null;
      }catch(error){this.lastError=error instanceof Error?error.message:'Action delivery was not confirmed';}
      for(const listener of this.statusListeners)listener();
    });
    // Register before append/restore and before any renderer can evaluate a
    // binding. These public hooks precede SurfaceView's later subscriptions.
    this.lifecycleSubscriptions=[this.processor.onSurfaceCreated(surface=>{
      if(this.disposed||this.processor.model.surfacesMap.get(surface.id)!==surface)return;
      const previous=this.runtimeStates.get(surface.id);
      previous?.subscription.unsubscribe();
      this.runtimeStates.set(surface.id,{surface,observed:false,subscription:surface.onError.subscribe(()=>this.observeRuntimeError(surface))});
      if(previous?.observed)this.notifyRuntimeStatus();
    }),this.processor.onSurfaceDeleted(id=>{
      const state=this.runtimeStates.get(id);
      // A delayed deletion for an old instance must not clear its replacement.
      if(!state||this.processor.model.surfacesMap.get(id)===state.surface)return;
      state.subscription.unsubscribe();this.runtimeStates.delete(id);
      if(state.observed)this.notifyRuntimeStatus();
    })];
  }
  append(messages:Message[],complete=false) {
    validateDocument([...this.messages,...messages],complete);
    // The official renderer owns mutable data models. Never lend it caller or
    // authored-history objects: edits must live only in renderer snapshots.
    const authored=structuredClone(messages);
    this.processor.processMessages(structuredClone(authored));
    this.messages.push(...authored);
  }
  export():Recording {
    const snapshots:Message[]=[];
    for(const [id,surface] of this.processor.model.surfacesMap) {
      snapshots.push({version:[...this.messages].reverse().find(m=>m.createSurface?.surfaceId===id)?.version??'v0.9',updateDataModel:{surfaceId:id,path:'/',value:structuredClone(surface.dataModel.get('/'))}});
    }
    return recording(this.messages,this.actionLog,snapshots);
  }
  restore(value:Recording){
    if(this.messages.length)throw new Error('REPLAY: restore requires an empty session');
    const checked=recording(value.messages,value.actions,value.snapshots);
    this.append(checked.messages,true);
    this.processor.processMessages(checked.snapshots);
    this.actionLog.push(...checked.actions);
    this.actionAttempts=checked.actions.length;
    this.reservedActionBytes=new TextEncoder().encode(JSON.stringify(checked.actions)).length;
  }
  dispose(){
    this.disposed=true;this.canSend=false;
    this.lifecycleSubscriptions.forEach(subscription=>subscription.unsubscribe());
    this.lifecycleSubscriptions=[];
    for(const state of this.runtimeStates.values())state.subscription.unsubscribe();
    this.runtimeStates.clear();this.statusListeners.clear();this.processor.dispose();
  }
}
export function SurfaceView({session}:{session:SurfaceSession}) {
  const [,refresh]=useState(0);
  useEffect(()=>{
    const sync=()=>refresh(x=>x+1);
    const a=session.processor.onSurfaceCreated(sync),b=session.processor.onSurfaceDeleted(sync);
    const stop=session.subscribeStatus(sync);
    sync();return()=>{a.unsubscribe();b.unsubscribe();stop();};
  },[session]);
  return <div className="a2ui-container">
    {session.lastError&&<p role="alert">{session.lastError}</p>}
    {Array.from(session.processor.model.surfacesMap.values()).map(surface=><React.Fragment key={surface.id}>
      {session.hasRuntimeWarning(surface.id)&&<div role="alert">
        <p>Runtime warning observed. Some content may be unavailable. Dismissing this notice does not confirm recovery.</p>
        <button type="button" onClick={()=>session.dismissRuntimeWarning(surface.id)}>Dismiss runtime warning</button>
      </div>}
      <A2uiSurface surface={surface}/>
    </React.Fragment>)}
  </div>;
}
export function DocumentSurface({messages,send}:{messages:Message[];send:(action:Message)=>Promise<void>}) {
  const session=useMemo(()=>{const s=new SurfaceSession(send);s.append(messages,true);return s;},[messages,send]);
  useEffect(()=>()=>session.dispose(),[session]);
  return <SurfaceView session={session}/>;
}
