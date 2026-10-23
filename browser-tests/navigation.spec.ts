import {test,expect} from '@playwright/test';
const surfaceId='synthetic-navigation';
const recording={format:'dsh-a2ui-recording/1',actions:[],snapshots:[],messages:[
 {version:'v0.9.1',createSurface:{surfaceId,catalogId:'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json'}},
 {version:'v0.9.1',updateDataModel:{surfaceId,path:'/',value:{note:'Initial synthetic note'}}},
 {version:'v0.9.1',updateComponents:{surfaceId,components:[
 {id:'root',component:'Tabs',tabs:[{title:'Overview',child:'summary'},{title:'Edit details',child:'modal'}]},
 {id:'summary',component:'Text',text:'Synthetic overview'},
 {id:'modal',component:'Modal',trigger:'trigger',content:'form'},
 {id:'trigger',component:'Text',text:'Open synthetic editor'},
 {id:'form',component:'Column',children:['field','save']},
 {id:'field',component:'TextField',label:'Synthetic note',value:{path:'/note'}},
 {id:'save',component:'Button',child:'save-label',action:{event:{name:'save-note',context:{note:{path:'/note'}}}}},
 {id:'save-label',component:'Text',text:'Send synthetic note'}
 ]}}
]};
test('tabs and modal preserve bound edits through close, remount and fresh replay without accidental sends',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/');await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Portable recording',exact:true});
 await editor.fill(JSON.stringify(recording));await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByText('Synthetic overview',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit details',exact:true}).click();
 await expect(page.getByText('Synthetic overview',{exact:true})).toHaveCount(0);
 await page.getByText('Open synthetic editor',{exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('dialog').locator('input').fill('Changed synthetic note');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('pre')).toHaveText('No actions sent.');
 await page.getByText('Open synthetic editor',{exact:true}).click();
 await expect(page.getByRole('dialog').locator('input')).toHaveValue('Changed synthetic note');
 await page.getByRole('button',{name:'Send synthetic note',exact:true}).click();
 await expect(page.locator('pre')).toContainText('Changed synthetic note');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.getByRole('button',{name:'Edit details',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByText('Open synthetic editor',{exact:true}).click();
 await expect(page.getByRole('dialog').locator('input')).toHaveValue('Changed synthetic note');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Export recording',exact:true}).click();
 const saved=JSON.parse(await editor.inputValue());expect(saved.actions).toHaveLength(1);
 await page.reload();await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 await page.getByRole('textbox',{name:'Portable recording',exact:true}).fill(JSON.stringify(saved));
 await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByText('Synthetic overview',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit details',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByText('Open synthetic editor',{exact:true}).click();
 await expect(page.getByRole('dialog').locator('input')).toHaveValue('Changed synthetic note');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('pre')).toHaveText('No actions sent.');
 await page.getByRole('button',{name:'Export recording',exact:true}).click();
 expect(JSON.parse(await page.getByRole('textbox',{name:'Portable recording',exact:true}).inputValue()).actions).toEqual(saved.actions);
 expect(errors).toEqual([]);
});
