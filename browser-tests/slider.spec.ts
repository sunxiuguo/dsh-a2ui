import {test,expect} from '@playwright/test';
const catalogId='https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
for(const version of ['v0.9','v0.9.1'])test(`${version} named Slider keyboard boundaries submit numeric state and restore without actions`,async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const messages=['A','B'].flatMap(slot=>[
  {version,createSurface:{surfaceId:slot,catalogId}},
  {version,updateDataModel:{surfaceId:slot,path:'/',value:{name:`${slot} level`,amount:0}}},
  {version,updateComponents:{surfaceId:slot,components:[
   {id:'root',component:'Column',children:['rename','level','submit']},
   {id:'rename',component:'TextField',label:`${slot} rename slider`,value:{path:'/name'}},
   {id:'level',component:'Slider',label:{path:'/name'},min:-5,max:5,value:{path:'/amount'},accessibility:{description:'Synthetic adjustment from minus five to five'}},
   {id:'submit',component:'Button',child:'submit-label',action:{event:{name:'level-selected',context:{amount:{path:'/amount'}}}}},
   {id:'submit-label',component:'Text',text:`Submit ${slot} level`}
  ]}}
 ]);
 await page.goto('/');await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Portable recording',exact:true});
 await editor.fill(JSON.stringify({format:'dsh-a2ui-recording/1',messages,actions:[],snapshots:[]}));
 await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Restored');
 const a=page.getByRole('slider',{name:'A level',exact:true}),b=page.getByRole('slider',{name:'B level',exact:true});
 await expect(a).toHaveValue('0');await expect(a).toHaveAccessibleDescription('Synthetic adjustment from minus five to five');
 await page.locator('label').filter({hasText:/^A level$/}).click();await expect(a).toBeFocused();
 await a.press('ArrowRight');await expect(a).toHaveValue('1');
 await a.press('End');await expect(a).toHaveValue('5');await a.press('ArrowRight');await expect(a).toHaveValue('5');
 await a.press('Home');await expect(a).toHaveValue('-5');await a.press('ArrowLeft');await expect(a).toHaveValue('-5');
 await a.press('ArrowRight');await expect(a).toHaveValue('-4');await expect(b).toHaveValue('0');
 await page.getByRole('textbox',{name:'A rename slider',exact:true}).fill('A updated level');
 await expect(page.getByRole('slider',{name:'A updated level',exact:true})).toHaveValue('-4');
 await expect(page.getByRole('slider',{name:'A level',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Submit A level',exact:true}).click();
 await page.getByRole('button',{name:'Export recording',exact:true}).click();const saved=JSON.parse(await editor.inputValue());
 expect(saved.actions).toHaveLength(1);expect(saved.actions[0].action.context).toEqual({amount:-4});
 await page.reload();await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 await editor.fill(JSON.stringify(saved));await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('slider',{name:'A updated level',exact:true})).toHaveValue('-4');await expect(page.getByRole('slider',{name:'B level',exact:true})).toHaveValue('0');
 await expect(page.locator('pre')).toHaveText('No actions sent.');expect(errors).toEqual([]);
});

// Characterize the inherited HTML/model boundary rather than silently changing
// authored data. A visible native clamp is not an input event or validation.
test('out-of-range authored Slider remains explicit inherited model/native mismatch',async({page,context})=>{
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const version='v0.9.1',surfaceId='boundary';
 const messages=[{version,createSurface:{surfaceId,catalogId}},
  {version,updateDataModel:{surfaceId,path:'/',value:{amount:20}}},
  {version,updateComponents:{surfaceId,components:[
   {id:'root',component:'Column',children:['slider','submit']},
   {id:'slider',component:'Slider',label:'Authored boundary',min:0,max:10,value:{path:'/amount'}},
   {id:'submit',component:'Button',child:'caption',action:{event:{name:'boundary',context:{amount:{path:'/amount'}}}}},
   {id:'caption',component:'Text',text:'Submit authored boundary'}
  ]}}];
 await page.goto('/');await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Portable recording',exact:true});
 await editor.fill(JSON.stringify({format:'dsh-a2ui-recording/1',messages,actions:[],snapshots:[]}));
 await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('slider',{name:'Authored boundary',exact:true})).toHaveValue('10');
 await page.getByRole('button',{name:'Submit authored boundary',exact:true}).click();
 await page.getByRole('button',{name:'Export recording',exact:true}).click();
 expect(JSON.parse(await editor.inputValue()).actions[0].action.context.amount).toBe(20);
});
