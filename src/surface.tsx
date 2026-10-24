import React, {useEffect,useMemo,useState} from 'react';
import {MessageProcessor} from '@a2ui/web_core/v0_9';
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
  dispose(){this.canSend=false;this.statusListeners.clear();this.processor.dispose();}
}
export function SurfaceView({session}:{session:SurfaceSession}) {
  const [,refresh]=useState(0);
  useEffect(()=>{
    const sync=()=>refresh(x=>x+1);
    const a=session.processor.onSurfaceCreated(sync),b=session.processor.onSurfaceDeleted(sync);
    const stop=session.subscribeStatus(sync);
    sync();return()=>{a.unsubscribe();b.unsubscribe();stop();};
  },[session]);
  return <div className="a2ui-container">{session.lastError&&<p role="alert">{session.lastError}</p>}{Array.from(session.processor.model.surfacesMap.values()).map(surface=><A2uiSurface key={surface.id} surface={surface}/>)}</div>;
}
export function DocumentSurface({messages,send}:{messages:Message[];send:(action:Message)=>Promise<void>}) {
  const session=useMemo(()=>{const s=new SurfaceSession(send);s.append(messages,true);return s;},[messages,send]);
  useEffect(()=>()=>session.dispose(),[session]);
  return <SurfaceView session={session}/>;
}
