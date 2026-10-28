const host = new Cordis.Context(), client = new Cordis.Context();
const handles = new Map(), refs = new Map(), targets = new Map(), windows = new Map();
const deliveries = []; let unmount, detach;
try {
  new SessionStore(host); new AgentRegistry(host); new SessionProjectionRegistry(host); new LlmRuntime(host);
  await host.plugin(SystemPrompt, {includeRuntimeContext:false});
  await host.plugin(ToolRuntime); await host.plugin(serverPlugin);
  const model = new WorkshopModel(); host.llm.registerAdapter(['synthetic'], model);
  const loop = host.plugin(AgentLoop, {agents:[], maxParallelToolCalls:1}); await loop;
  assert.equal(loop.state, 2);
  for (const id of ['synthetic-A','synthetic-B']) {
    handles.set(id, await host.agents.create({sessionId:id, agentOptions:{provider:'synthetic',model:'workshop'}}));
    assert.equal(handles.get(id).agent.id,id); windows.set(id, []);
  }
  const modules = loadClient(), conversation = modules['dsh-client-ui-conversation'];
  const connection = {generation:{getSnapshot:()=>undefined,subscribe:()=>()=>{}}};
  client.reflect.provide('connection', connection);
  client.reflect.provide('typert', {contexts:{registerClient:()=>{}}});
  client.reflect.provide('remote', {$on:()=>()=>{},$stream:options=>new modules['dsh-api-gateway'].RemoteStream(connection,options),session:{prompt:async input=>{
    assert.ok(handles.has(input.sessionId)); assert.equal(input.mode,'queue');
    deliveries.push(structuredClone(input));
    handles.get(input.sessionId).agent.followup(createUserMessage({source:{kind:'user'},content:input.content}));
    return {ok:true,value:{accepted:true}};
  }}});
  for(const name of ['dsh-api-session-controller','dsh-client-ui-renderer','dsh-client-ui-session']) modules[name].apply(client);
  new conversation.UiConversation(client,client.sessions);
  new conversation.ConversationController(client,{maxConcurrentFileUploads:1});
  client.uiConversation.views.register({target:'chat',create(){let nodes=new Map();return {
    replace({nodes:rows}){nodes=new Map(rows.map(node=>[node.key,node]));return [...nodes.values()];},
    apply({upserts}){for(const node of upserts)nodes.set(node.key,node);return [...nodes.values()];}
  };}});
  modules.plugin.apply(client);
  for(const [id,handle] of handles){
    const ref=client.sessions.retainAgentScope(id);refs.set(id,ref);
    ref.binding.eventSource.replace(handle.agent.session.snapshotEvents().map(event=>({type:'event',event})),false);
    const binding=client.uiConversation.binding(ref.binding);binding.activate('chat');targets.set(id,binding.target('chat'));
  }
  detach=host.on('session/event',(session,event)=>{
    assert.ok(refs.has(session.id));windows.get(session.id).push(event);
    refs.get(session.id).binding.eventSource.append({type:'event',event});
  });
  function View({id,renderSlot}){
    const target=targets.get(id),rows=React.useSyncExternalStore(target.subscribe,target.getSnapshot,target.getSnapshot);
    return React.createElement('article',{'aria-label':id},...rows.map(node=>React.createElement(React.Fragment,{key:node.key},renderSlot('conversation.chat.node',{node},{entryKey:'a2ui-document'}))));
  }
  client.slots.register({name:'root',children:{'conversation.chat.node':{kind:'keyed',scope:'session'}}},({SessionProvider,renderSlot})=>React.createElement(React.Fragment,null,...[...refs].map(([id,ref])=>React.createElement(SessionProvider,{key:id,session:ref},React.createElement(View,{id,renderSlot})))));
  const container=document.getElementById('example');await React.act(async()=>{unmount=client.uiRenderer.mount(container);});
  for(const [id,handle] of handles) await React.act(async()=>{await client.sessions.scope(id).get('conversation').send('Show me a synthetic workshop form.');await handle.agent.whenIdle();});
  assert.equal(model.requests.length,4);assert.equal(deliveries.length,2);
  const a=within(container).getByRole('article',{name:'synthetic-A'}),b=within(container).getByRole('article',{name:'synthetic-B'});
  assert.equal(within(a).getByRole('textbox').value,'Ceramics for beginners');
  assert.equal(within(b).getByRole('textbox').value,'Ceramics for beginners');
  const beforeA=structuredClone(windows.get('synthetic-A'));
  await React.act(async()=>{fireEvent.input(within(b).getByRole('textbox'),{target:{value:topic}});});
  assert.equal(within(a).getByRole('textbox').value,'Ceramics for beginners');
  for(const events of windows.values()) assert.equal(events.find(e=>e.type==='tool/result').data.meta.messages[2].updateDataModel.value.topic,'Ceramics for beginners');
  await React.act(async()=>{fireEvent.click(within(b).getByRole('button',{name:'Preview request'}));await handles.get('synthetic-B').agent.whenIdle();});
  assert.equal(deliveries.length,3);assert.equal(deliveries[2].sessionId,'synthetic-B');
  const action=JSON.parse(deliveries[2].content[0].text.split('\n')[1]).action;
  assert.equal(action.name,'request_preview');assert.equal(action.surfaceId,'synthetic-workshop');assert.equal(action.context.topic,topic);
  assert.equal(model.requests.length,6);assert.deepEqual(windows.get('synthetic-A'),beforeA);
  assert.ok(within(b).getByText(getDefaultNormalizer()('Synthetic preview for: '+topic)));
  assert.equal(within(a).queryByText(getDefaultNormalizer()('Synthetic preview for: '+topic)),null);
  assert.equal(within(a).getByRole('textbox').value,'Ceramics for beginners');
  for(const [id,count] of [['synthetic-A',1],['synthetic-B',2]]){
    const events=windows.get(id),turns=events.filter(e=>e.type==='turn/end'),results=events.filter(e=>e.type==='tool/result');
    assert.equal(turns.length,count);assert.equal(results.length,count);
    assert.ok(turns.every(e=>e.data.reason.kind==='completed'));
    assert.ok(results.every(e=>!e.data.message.isError&&e.data.meta.kind==='dsh-a2ui/1'));
  }
  await React.act(async()=>{refs.get('synthetic-B').binding.eventSource.replace(structuredClone(windows.get('synthetic-B')).map(event=>({type:'event',event})),false);await Promise.resolve();});
  assert.equal(deliveries.length,3);assert.equal(model.requests.length,6);assert.deepEqual(windows.get('synthetic-A'),beforeA);
  console.log(JSON.stringify({result:'PASS',sessions:2,completedTurns:{A:1,B:2},providerCalls:6,realToolResults:3,explicitActions:1,actionOwner:'synthetic-B',unchangedSessionA:true,replayTriggeredActions:0}));
} finally {
  if(unmount)await React.act(async()=>{unmount();});detach?.();for(const ref of refs.values())ref.release();
  await client.fiber.dispose();for(const handle of handles.values())await handle.dispose();await host.fiber.dispose();
  globalThis.fetch=originalFetch;delete globalThis.IS_REACT_ACT_ENVIRONMENT;dom.window.close();
  for(const [name,descriptor] of globals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}

