import {test,expect} from '@playwright/test';
const catalogId='https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
for(const version of ['v0.9','v0.9.1'])test(`${version} native TextField names, label focus and dynamic labels survive portable replay`,async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const messages=['A','B'].flatMap(slot=>[
  {version,createSurface:{surfaceId:slot,catalogId}},
  {version,updateDataModel:{surfaceId:slot,path:'/',value:{name:`${slot} topic`,topic:'Synthetic text',notes:'Long notes',count:'3',secret:'Not a credential'}}},
  {version,updateComponents:{surfaceId:slot,components:[
   {id:'root',component:'Column',children:['rename','topic','notes','count','secret']},
   {id:'rename',component:'TextField',label:`${slot} rename label`,value:{path:'/name'}},
   {id:'topic',component:'TextField',label:{path:'/name'},value:{path:'/topic'}},
   {id:'notes',component:'TextField',variant:'longText',label:`${slot} notes`,value:{path:'/notes'}},
   {id:'count',component:'TextField',variant:'number',label:`${slot} count`,value:{path:'/count'}},
   {id:'secret',component:'TextField',variant:'obscured',label:`${slot} synthetic obscured value`,value:{path:'/secret'}}
  ]}}
 ]);
 await page.goto('/');await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Portable recording',exact:true});
 await editor.fill(JSON.stringify({format:'dsh-a2ui-recording/1',messages,actions:[],snapshots:[]}));
 await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Restored');
 for(const slot of ['A','B']){
  const topic=page.getByRole('textbox',{name:`${slot} topic`,exact:true});
  await expect(topic).toHaveValue('Synthetic text');
  await page.locator('label').filter({hasText:new RegExp(`^${slot} topic$`)}).click();
  await expect(topic).toBeFocused();
  await topic.fill(`${slot} edited`);
  await expect(page.getByRole('textbox',{name:`${slot} notes`,exact:true})).toHaveValue('Long notes');
  await expect(page.getByRole('spinbutton',{name:`${slot} count`,exact:true})).toHaveValue('3');
  await expect(page.getByLabel(`${slot} synthetic obscured value`,{exact:true})).toHaveAttribute('type','password');
 }
 await page.getByRole('textbox',{name:'A rename label',exact:true}).fill('A renamed topic');
 await expect(page.getByRole('textbox',{name:'A renamed topic',exact:true})).toHaveValue('A edited');
 await expect(page.getByRole('textbox',{name:'A topic',exact:true})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'B topic',exact:true})).toHaveValue('B edited');
 await page.getByRole('button',{name:'Export recording',exact:true}).click();const saved=await editor.inputValue();
 await page.reload();await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 await editor.fill(saved);await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'A renamed topic',exact:true})).toHaveValue('A edited');
 await expect(page.getByRole('textbox',{name:'B topic',exact:true})).toHaveValue('B edited');
 await expect(page.locator('pre')).toHaveText('No actions sent.');expect(errors).toEqual([]);
});

for(const version of ['v0.9','v0.9.1'])test(`${version} repeated references reorder without duplicate native controls`,async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/');
 // Mount the actual exported surface into a separate synthetic test root.
 // No runtime overrides, vendor changes, credentials or external resources.
 await page.evaluate(async(version)=>{
  const path='/browser-tests/support/ref-reorder.ts';
  const {mount}=await import(path);const fixture=mount(version);
  (window as any).__syntheticReorder=fixture.reorder;
  (window as any).__syntheticDispose=()=>{fixture.dispose();delete (window as any).__syntheticReorder;delete (window as any).__syntheticDispose;};
 },version);
 const fields=page.locator('#synthetic-ref-reorder input');
 try{
  await expect(fields).toHaveCount(3);
  for(const [children,values] of [
   [['topic','rename','topic'],['Synthetic text','A topic','Synthetic text']],
   [['rename','topic','topic'],['A topic','Synthetic text','Synthetic text']],
  ]){
   await page.evaluate(children=>(window as any).__syntheticReorder(children),children);
   // Wait for this exact order before sending the next update; count alone
   // could pass on the old DOM and accidentally coalesce the two updates.
   await expect.poll(()=>fields.evaluateAll(nodes=>nodes.map(node=>(node as HTMLInputElement).value))).toEqual(values);
   await expect(fields).toHaveCount(3);
  }
  await page.evaluate(()=>(window as any).__syntheticReorder([]));await expect(fields).toHaveCount(0);
  await page.evaluate(()=>(window as any).__syntheticReorder(['topic','rename','topic']));await expect(fields).toHaveCount(3);
  expect(errors).toEqual([]);
 }finally{await page.evaluate(()=>(window as any).__syntheticDispose());}
});
