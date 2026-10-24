import {test,expect} from '@playwright/test';
const catalogId='https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
for(const version of ['v0.9','v0.9.1'])test(`${version} runtime warning survives unrelated submit, can be acknowledged, and is not replay history`,async({page,context})=>{
 const external:string[]=[];const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Cannot update a component|Maximum update depth|Too many re-renders/.test(m.text()))pageErrors.push(m.text());});
 await context.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort();});
 await page.addInitScript(()=>{(window as any).__navigationAttempts=[];window.open=((...args:unknown[])=>{(window as any).__navigationAttempts.push(args);return null;}) as typeof window.open;});
 const bad='Before ${openUrl(url: "https://example.invalid/private-synthetic-marker")} after';
 const messages=['A','B'].flatMap(surfaceId=>[
  {version,createSurface:{surfaceId,catalogId}},
  {version,updateDataModel:{surfaceId,path:'/',value:{template:surfaceId==='A'?bad:'Healthy ${required(value: "ok")}'}}},
  {version,updateComponents:{surfaceId,components:[
   {id:'root',component:'Column',children:['edit','output','submit']},
   {id:'edit',component:'TextField',label:`${surfaceId} template`,value:{path:'/template'}},
   {id:'output',component:'Text',text:{call:'formatString',args:{value:{path:'/template'}},returnType:'string'}},
   {id:'submit',component:'Button',child:'caption',action:{event:{name:'confirm',context:{template:{path:'/template'}}}}},
   {id:'caption',component:'Text',text:`Submit ${surfaceId}`}
  ]}}
 ]);
 await page.goto('/');await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Portable recording',exact:true});
 await editor.fill(JSON.stringify({format:'dsh-a2ui-recording/1',messages,actions:[],snapshots:[]}));await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 const warnings=page.getByRole('alert');await expect(warnings).toHaveCount(1);
 await expect(warnings).not.toContainText('private-synthetic-marker');await expect(warnings).not.toContainText('openUrl');
 await expect(page.getByText('Before after',{exact:true})).toBeVisible();await expect(page.getByText('Healthy true',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Submit B',exact:true}).click();await expect(warnings).toHaveCount(1);
 await page.getByRole('textbox',{name:'A template',exact:true}).fill('Recovered ${required(value: "ok")}');
 await expect(page.getByText('Recovered true',{exact:true})).toBeVisible();await expect(warnings).toHaveCount(1);
 await page.getByRole('button',{name:/Dismiss runtime/}).click();await expect(warnings).toHaveCount(0);
 await page.getByRole('textbox',{name:'A template',exact:true}).fill(bad);await expect(warnings).toHaveCount(1);
 await page.getByRole('textbox',{name:'A template',exact:true}).fill('Final ${required(value: "ok")}');await expect(page.getByText('Final true',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Export recording',exact:true}).click();const saved=JSON.parse(await editor.inputValue());expect(Object.keys(saved).sort()).toEqual(['actions','format','messages','snapshots']);expect(saved.actions).toHaveLength(1);
 expect(await page.evaluate(()=>(window as any).__navigationAttempts)).toEqual([]);expect(external).toEqual([]);
 await page.reload();await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();await editor.fill(JSON.stringify(saved));await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByText('Final true',{exact:true})).toBeVisible();await expect(warnings).toHaveCount(0);await expect(page.locator('pre')).toHaveText('No actions sent.');
 await page.getByRole('textbox',{name:'A template',exact:true}).fill(bad);await expect(warnings).toHaveCount(1);
 await page.getByRole('button',{name:'Export recording',exact:true}).click();const stillBad=JSON.parse(await editor.inputValue());expect(Object.keys(stillBad).sort()).toEqual(['actions','format','messages','snapshots']);
 expect(await page.evaluate(()=>(window as any).__navigationAttempts)).toEqual([]);
 await page.reload();await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();await editor.fill(JSON.stringify(stillBad));await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(warnings).toHaveCount(1);await expect(warnings).not.toContainText('private-synthetic-marker');await expect(page.locator('pre')).toHaveText('No actions sent.');
 expect(await page.evaluate(()=>(window as any).__navigationAttempts)).toEqual([]);expect(external).toEqual([]);expect(pageErrors).toEqual([]);
});
