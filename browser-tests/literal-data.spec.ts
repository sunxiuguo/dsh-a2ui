import {test,expect} from '@playwright/test';
const catalogId='https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
for(const version of ['v0.9','v0.9.1'])test(`${version} literal catalog metadata submits and restores without media or navigation`,async({page,context})=>{
 const blocked:string[]=[];await context.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();blocked.push(route.request().url());return route.abort();});
 await page.addInitScript(()=>{(window as any).__navigationAttempts=[];window.open=((...args:unknown[])=>{(window as any).__navigationAttempts.push(args);return null;}) as typeof window.open;});
 const surfaceId='literal-metadata';const messages=[
  {version,createSurface:{surfaceId,catalogId}},
  {version,updateDataModel:{surfaceId,path:'/',value:{metadata:{component:'',call:''}}}},
  {version,updateComponents:{surfaceId,components:[
   {id:'root',component:'Column',children:['type','operation','submit']},
   {id:'type',component:'TextField',label:'Documented component type',value:{path:'/metadata/component'}},
   {id:'operation',component:'TextField',label:'Documented operation name',value:{path:'/metadata/call'}},
   {id:'submit',component:'Button',child:'caption',action:{event:{name:'save_metadata',context:{metadata:{path:'/metadata'}}}}},
   {id:'caption',component:'Text',text:'Save metadata'}
  ]}}];
 await page.goto('/');await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Portable recording',exact:true});await editor.fill(JSON.stringify({format:'dsh-a2ui-recording/1',messages,actions:[],snapshots:[]}));
 await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await page.getByRole('textbox',{name:'Documented component type',exact:true}).fill('Image');await page.getByRole('textbox',{name:'Documented operation name',exact:true}).fill('openUrl');
 await page.getByRole('button',{name:'Save metadata',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);
 await page.getByRole('button',{name:'Export recording',exact:true}).click();const saved=JSON.parse(await editor.inputValue());
 expect(await page.evaluate(()=>(window as any).__navigationAttempts)).toEqual([]);expect(blocked).toEqual([]);
 expect(saved.actions).toHaveLength(1);expect(saved.actions[0].action.context).toEqual({metadata:{component:'Image',call:'openUrl'}});
 await page.reload();await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();await editor.fill(JSON.stringify(saved));await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Documented component type',exact:true})).toHaveValue('Image');await expect(page.getByRole('textbox',{name:'Documented operation name',exact:true})).toHaveValue('openUrl');
 await expect(page.locator('pre')).toHaveText('No actions sent.');expect(await page.evaluate(()=>(window as any).__navigationAttempts)).toEqual([]);expect(blocked).toEqual([]);
 await expect(page.locator('a2ui-image,a2ui-video,a2ui-audioplayer,img,video,audio')).toHaveCount(0);
});

for(const version of ['v0.9','v0.9.1'])test(`${version} model-bound formatString cannot navigate and recovers after an edit`,async({page,context})=>{
 const external:string[]=[];await context.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort();});
 await page.addInitScript(()=>{(window as any).__navigationAttempts=[];window.open=((...args:unknown[])=>{(window as any).__navigationAttempts.push(args);return null;}) as typeof window.open;});
 const surfaceId='guarded-template';const messages=[
  {version,createSurface:{surfaceId,catalogId}},
  {version,updateDataModel:{surfaceId,path:'/',value:{template:'Before ${openUrl(url: "https://example.invalid/synthetic")} after'}}},
  {version,updateComponents:{surfaceId,components:[
   {id:'root',component:'Column',children:['edit','output']},
   {id:'edit',component:'TextField',label:'Synthetic template',value:{path:'/template'}},
   {id:'output',component:'Text',text:{call:'formatString',args:{value:{path:'/template'}},returnType:'string'}}
  ]}}];
 await page.goto('/');await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();const editor=page.getByRole('textbox',{name:'Portable recording',exact:true});
 await editor.fill(JSON.stringify({format:'dsh-a2ui-recording/1',messages,actions:[],snapshots:[]}));await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Synthetic template',exact:true})).toBeVisible();
 await expect(page.getByText('Before after',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__navigationAttempts)).toEqual([]);
 await page.getByRole('textbox',{name:'Synthetic template',exact:true}).fill('Recovered ${required(value: "ok")}');
 await expect(page.getByText('Recovered true',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__navigationAttempts)).toEqual([]);expect(external).toEqual([]);
});
