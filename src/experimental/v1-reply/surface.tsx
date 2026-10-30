import React,{useEffect,useState,useLayoutEffect} from 'react';
import {MessageProcessor,STRICT_VALIDATION} from '@a2ui/web_core/processing';
import {basicCatalog} from '@a2ui/web_core/catalogs/basic/v1';
import {NodeResolver,ResolvedBinding,type ComponentNode} from '@a2ui/web_core/resolution';
import {effect,getValue,peekValue,type Signal} from '@a2ui/web_core/reactivity';
import {validateReplyV1Document,validateReplyV1Action} from './protocol';
import type {Message} from '../../protocol';
export class ReplyV1Session{
 readonly processor:MessageProcessor;
 readonly resolvers=new Map<string,NodeResolver>();
 readonly messages:Message[];
 private history:Message[]=[];
 private attempts=0;private reservedBytes=2;private disposed=false;
 private listeners=new Set<()=>void>();
 error:string|null=null;
 constructor(messages:unknown,private send:(message:Message)=>Promise<void>,private active=true){
  this.messages=validateReplyV1Document(messages);
  this.processor=new MessageProcessor([basicCatalog],async action=>{
   try{
    if(this.disposed||!this.active)throw Error('Action is no longer active.');
    const surface=this.processor.getSurface(action.surfaceId);
    if(!surface||surface.componentsModel.get(action.sourceComponentId)?.type!=='Button'||!this.resolvers.has(action.surfaceId))throw Error('Action surface is no longer active.');
    const message={version:'v1.0',action:structuredClone(action)};
    validateReplyV1Action(message);
    const bytes=new TextEncoder().encode(JSON.stringify(message)).length+1;
    if(this.attempts>=128||this.reservedBytes+bytes>256*1024)throw Error('Reply action budget reached.');
    this.attempts++;this.reservedBytes+=bytes;
    try{await this.send(message);this.history.push(structuredClone(message));}
    catch{this.reservedBytes-=bytes;throw Error('Action was not confirmed by DSH. It has not been retried. Check the conversation before trying again.');}
    this.error=null;
   }catch(error){this.error=error instanceof Error?error.message:'Action was not confirmed.';}
   if(!this.disposed)for(const listener of this.listeners)listener();
  },{version:'v1.0',validationConfig:STRICT_VALIDATION});
  this.processor.processMessages(structuredClone(this.messages));
  for(const [id,surface] of this.processor.getSurfaces())this.resolvers.set(id,new NodeResolver(surface));
 }
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 isActive(){return !this.disposed&&this.active;}
 async invoke(surfaceId:string,node:ComponentNode){
  if(!this.isActive()||node.disposed||node.state!=='resolved'||!this.resolvers.has(surfaceId))return;
  const props=peekValue(node.props);
  if(!replyLabelReady(props.child as ComponentNode))return;
  const action=props.action;
  if(node.type!=='Button'||typeof action!=='function')return;
  try{await action();}catch{this.error='Reply could not be resolved. No retry was made.';for(const listener of this.listeners)listener();}
 }
 /** A recording is evidence, not a queue of instructions to execute. */
 export(){return {kind:'experimental-reply-v1',messages:structuredClone(this.messages),actions:structuredClone(this.history)};}
 static replay(recording:unknown,send:(message:Message)=>Promise<void>){
  const r=recording as Message;
  if(!r||r.kind!=='experimental-reply-v1'||!Array.isArray(r.actions)||r.actions.length>128)throw Error('REPLY_V1_REPLAY');
  for(const a of r.actions)validateReplyV1Action(a);
  const bytes=new TextEncoder().encode(JSON.stringify(r.actions)).length;
  if(bytes>256*1024)throw Error('REPLY_V1_REPLAY');
  const session=new ReplyV1Session(r.messages,send);
  session.history=structuredClone(r.actions);session.attempts=r.actions.length;session.reservedBytes=bytes;
  return session;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.active=false;for(const resolver of this.resolvers.values())resolver.dispose();this.resolvers.clear();this.processor.model.dispose();this.processor.dispose();this.listeners.clear();}
}
function replyLabelReady(node:ComponentNode|undefined){
 if(!node||node.disposed||node.state!=='resolved'||node.type!=='Text')return false;
 const raw=peekValue(node.props).text;
 const text=raw instanceof ResolvedBinding?raw.value:raw;
 return typeof text==='string'&&text.trim().length>0;
}
function useSignal<T>(signal:Signal<T>):T{
 const [,refresh]=useState(0);
 useEffect(()=>effect(()=>{getValue(signal);refresh(n=>n+1);}),[signal]);
 return peekValue(signal);
}
function ReplyNode({node,session,surfaceId}:{node:ComponentNode;session:ReplyV1Session;surfaceId:string}){
 const props=useSignal(node.props);
 if(node.disposed||node.state!=='resolved')return <p role="alert">Reply content is unavailable.</p>;
 if(node.type==='Text'){
  const text=props.text instanceof ResolvedBinding?props.text.value:props.text;
  return typeof text==='string'?<span>{text}</span>:<span role="alert">Reply text is unavailable.</span>;
 }
 if(node.type==='Column')return <div>{(props.children as ComponentNode[]).map(child=><ReplyNode key={child.id} node={child} session={session} surfaceId={surfaceId}/>)}</div>;
 if(node.type==='Button')return <button type="button" disabled={!session.isActive()||!replyLabelReady(props.child as ComponentNode)} onClick={()=>{void session.invoke(surfaceId,node);}}><ReplyNode node={props.child as ComponentNode} session={session} surfaceId={surfaceId}/></button>;
 return <p role="alert">Unsupported reply content.</p>;
}
function Root({resolver,session,surfaceId}:{resolver:NodeResolver;session:ReplyV1Session;surfaceId:string}){
 const root=useSignal(resolver.rootNode);return root?<ReplyNode node={root} session={session} surfaceId={surfaceId}/>:null;
}
export function ReplyV1View({session}:{session:ReplyV1Session}){
 const [,refresh]=useState(0);useEffect(()=>session.subscribe(()=>refresh(n=>n+1)),[session]);
 return <div>{session.error&&<p role="alert">{session.error}</p>}{[...session.resolvers].map(([id,resolver])=><Root key={id} surfaceId={id} resolver={resolver} session={session}/>)}</div>;
}
export function ReplyV1Document({messages,send}:{messages:Message[];send:(message:Message)=>Promise<void>}){
 const key=JSON.stringify(messages);
 // Allocate resources only after commit. StrictMode may discard renders and
 // replay effect setup/cleanup: each setup must own a fresh, disposable session.
 const [owned,setOwned]=useState<{key:string;send:typeof send;session:ReplyV1Session}|null>(null);
 useLayoutEffect(()=>{
  const session=new ReplyV1Session(JSON.parse(key),send);
  setOwned({key,send,session});
  return()=>session.dispose();
 },[key,send]);
 // Never expose a previous document or sender while the replacement commits.
 return owned&&owned.key===key&&owned.send===send&&owned.session.isActive()?<ReplyV1View session={owned.session}/>:null;
}
