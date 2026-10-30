import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,fireEvent,screen,waitFor,cleanup} from '@testing-library/react';
import {peekValue} from '@a2ui/web_core/reactivity';
import {ReplyV1Session,ReplyV1Document} from '../src/experimental/v1-reply/surface';
import {validateReplyV1Document,validateReplyV1Action} from '../src/experimental/v1-reply/protocol';
import {replyFixture} from './reply-v1.fixture';
afterEach(cleanup);
describe('opt-in v1 reply choices',()=>{
 it('validates a complete canonical v1 document',()=>expect(validateReplyV1Document(replyFixture())).toEqual(replyFixture()));
 it.each(['version','component','function','RPC','catalog','extra','missing-userMessage'] as const)('rejects unsupported %s',kind=>{
  const messages:any=replyFixture();const c=messages[0].createSurface;
  if(kind==='version')messages[0].version='v0.9';
  if(kind==='component')c.components[4]={id:'literalLabel',component:'Image',url:'https://example.com/never'};
  if(kind==='function')c.components[1].action.event.userMessage={'@call':'formatString',args:{value:'hidden'}};
  if(kind==='RPC')messages.push({version:'v1.0',callRendererFunction:{surfaceId:c.surfaceId,functionCallId:'call',callFunction:{'@call':'openUrl',args:{url:'https://example.com'}}}});
  if(kind==='catalog')c.catalogId='https://example.com/foreign';
  if(kind==='extra')c.components[1].checks=[];
  if(kind==='missing-userMessage')delete c.components[1].action.event.userMessage;
  expect(()=>validateReplyV1Document(messages)).toThrow();
 });
 it('preserves literal/dynamic userMessage and event identity through rendered clicks',async()=>{
  const send=vi.fn(async(_:any)=>{});const messages:any=replyFixture();
  messages.push({version:'v1.0',updateDataModel:{surfaceId:'reply-surface',path:'/reply',value:{text:'Updated synthetic',id:'choice-2'}}});
  render(<ReplyV1Document messages={messages} send={send}/>);
  fireEvent.click(screen.getByRole('button',{name:'Choose dynamic'}));
  await waitFor(()=>expect(send).toHaveBeenCalledTimes(1));
  expect(send.mock.calls[0][0]).toMatchObject({version:'v1.0',action:{name:'reply',surfaceId:'reply-surface',sourceComponentId:'dynamic',userMessage:'Updated synthetic',context:{choice:'choice-2'}}});
  fireEvent.click(screen.getByRole('button',{name:'Choose literal'}));await waitFor(()=>expect(send).toHaveBeenCalledTimes(2));
  expect(send.mock.calls[1][0].action.userMessage).toBe('Literal synthetic reply');
  expect(()=>validateReplyV1Action(send.mock.calls[0][0])).not.toThrow();
 });
 it('does not emit historical actions on replay',async()=>{
  const send=vi.fn(async(_:any)=>{}),s=new ReplyV1Session(replyFixture(),send);
  const node:any=peekValue(s.resolvers.get('reply-surface')!.rootNode);const child:any=(peekValue(node.props) as any).children[0];
  await s.invoke('reply-surface',child);expect(send).toHaveBeenCalledTimes(1);
  const recording=s.export();s.dispose();
  const restored=ReplyV1Session.replay(recording,send);expect(send).toHaveBeenCalledTimes(1);expect(restored.export()).toEqual(recording);restored.dispose();
 });
 it('revokes retained callbacks after session disposal',async()=>{
  const send=vi.fn(async(_:any)=>{}),s=new ReplyV1Session(replyFixture(),send);
  const node:any=peekValue(s.resolvers.get('reply-surface')!.rootNode),child:any=(peekValue(node.props) as any).children[0];
  s.dispose();await s.invoke('reply-surface',child);expect(send).not.toHaveBeenCalled();
 });
 it('keeps failed delivery explicit and never auto retries',async()=>{
  const send=vi.fn(async(_:any):Promise<void>=>{throw Error('synthetic transport ambiguity');});
  render(<ReplyV1Document messages={replyFixture()} send={send}/>);
  fireEvent.click(screen.getByRole('button',{name:'Choose dynamic'}));await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('has not been retried');expect(send).toHaveBeenCalledTimes(1);
  send.mockResolvedValueOnce(undefined);fireEvent.click(screen.getByRole('button',{name:'Choose dynamic'}));await waitFor(()=>expect(send).toHaveBeenCalledTimes(2));
 });
 it('rejects malformed resolved userMessage',()=>expect(()=>validateReplyV1Action({version:'v1.0',action:{name:'reply',surfaceId:'s',sourceComponentId:'b',timestamp:new Date().toISOString(),context:{},userMessage:42}})).toThrow());
});

describe('reply slice structural and admission boundaries',()=>{
 it.each(['missing-root','missing-child','cycle','shared-child','nested-button','unknown-update','reused-surface','unsafe-path','unreachable'] as const)('rejects %s before rendering',kind=>{
  const m:any=replyFixture();const c=m[0].createSurface;
  if(kind==='missing-root')c.components[0].id='notRoot';
  if(kind==='missing-child')c.components[0].children.push('absent');
  if(kind==='cycle')c.components[0].children.push('root');
  if(kind==='shared-child')c.components[0].children.push('dynamic');
  if(kind==='nested-button')c.components[1].child='literal';
  if(kind==='unknown-update')m.unshift({version:'v1.0',updateDataModel:{surfaceId:'unknown',path:'/x',value:'x'}});
  if(kind==='reused-surface')m.push({version:'v1.0',deleteSurface:{surfaceId:c.surfaceId}},structuredClone(m[0]));
  if(kind==='unsafe-path')c.components[1].action.event.userMessage={'@path':'/__proto__/x'};
  if(kind==='unreachable')c.components.push({id:'unused',component:'Text',text:'not rendered'});
  expect(()=>validateReplyV1Document(m)).toThrow();
 });
 it('does not dispatch a missing or wrong-type dynamically resolved reply',async()=>{
  for(const value of [42,null]){
   const send=vi.fn(async(_:any)=>{}),m:any=replyFixture();m.push({version:'v1.0',updateDataModel:{surfaceId:'reply-surface',path:'/reply/text',value}});
   const s=new ReplyV1Session(m,send);const root:any=peekValue(s.resolvers.get('reply-surface')!.rootNode),node:any=(peekValue(root.props) as any).children[0];
   await s.invoke('reply-surface',node);expect(send).not.toHaveBeenCalled();expect(s.error).not.toBeNull();s.dispose();
  }
 });
 it('bounds concurrent attempts before waiting for transport',async()=>{
  const finish:(()=>void)[]=[];const send=vi.fn((_:any)=>new Promise<void>(resolve=>finish.push(resolve)));
  const s=new ReplyV1Session(replyFixture(),send);const root:any=peekValue(s.resolvers.get('reply-surface')!.rootNode),node:any=(peekValue(root.props) as any).children[0];
  const pending=Array.from({length:130},()=>s.invoke('reply-surface',node));expect(send).toHaveBeenCalledTimes(128);
  for(const done of finish)done();await Promise.all(pending);expect(s.export().actions).toHaveLength(128);s.dispose();
 });
});


describe('committed reply resource ownership',()=>{
 it('survives StrictMode replay, preserves equal documents and retires replacements/unmount',async()=>{
  const disposed:ReplyV1Session[]=[];
  const original=ReplyV1Session.prototype.dispose;
  const disposal=vi.spyOn(ReplyV1Session.prototype,'dispose').mockImplementation(function(this:ReplyV1Session){disposed.push(this);original.call(this);});
  const send=vi.fn(async(_:any):Promise<void>=>{throw Error('synthetic ambiguity');});
  const messages=replyFixture();
  const view=(m:any)=><React.StrictMode><ReplyV1Document messages={m} send={send}/></React.StrictMode>;
  try{
   const mounted=render(view(messages));
   expect(screen.getAllByRole('button')).toHaveLength(2);
   expect(disposed.length).toBeGreaterThan(0);
   expect(disposed.every(s=>!s.isActive())).toBe(true);
   fireEvent.click(screen.getByRole('button',{name:'Choose dynamic'}));
   await screen.findByRole('alert');expect(send).toHaveBeenCalledTimes(1);
   const count=disposed.length;
   mounted.rerender(view(structuredClone(messages)));
   expect(disposed).toHaveLength(count);
   expect(screen.getByRole('alert').textContent).toContain('has not been retried');
   expect(send).toHaveBeenCalledTimes(1);
   const changed:any=structuredClone(messages);
   changed.push({version:'v1.0',updateDataModel:{surfaceId:'reply-surface',path:'/reply/text',value:'Replacement synthetic'}});
   mounted.rerender(view(changed));
   expect(disposed).toHaveLength(count+1);
   expect(screen.queryByRole('alert')).toBeNull();
   send.mockResolvedValueOnce(undefined);
   fireEvent.click(screen.getByRole('button',{name:'Choose dynamic'}));
   await waitFor(()=>expect(send).toHaveBeenCalledTimes(2));
   expect(send.mock.calls[1][0].action.userMessage).toBe('Replacement synthetic');
   mounted.unmount();expect(disposed).toHaveLength(count+2);
   expect(disposed.every(s=>!s.isActive()&&s.resolvers.size===0)).toBe(true);
  }finally{disposal.mockRestore();}
 });
});


describe('reply label admission',()=>{
 it.each([undefined,null,42,'','   '])('does not render an active choice or invoke when label is %s',async value=>{
  const messages:any=replyFixture();messages[0].createSurface.components[2].text={'@path':'/label'};
  if(value!==undefined)messages[0].createSurface.dataModel.label=value;
  const send=vi.fn(async(_:any)=>{});
  render(<ReplyV1Document messages={messages} send={send}/>);
  const button=screen.getAllByRole('button')[0] as HTMLButtonElement;
  expect(button.disabled).toBe(true);fireEvent.click(button);expect(send).not.toHaveBeenCalled();
  const session=new ReplyV1Session(messages,send);
  try{
   const root:any=peekValue(session.resolvers.get('reply-surface')!.rootNode);
   await session.invoke('reply-surface',(peekValue(root.props) as any).children[0]);
   expect(send).not.toHaveBeenCalled();
  }finally{session.dispose();}
 });
});
