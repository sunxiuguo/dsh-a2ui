import {test,expect} from '@playwright/test';
for(const version of ['v0.9','v0.9.1'])for(const part of ['date','time'])test(`${version} clearing combined ${part} blocks explicit required submit and survives replay`,async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const surfaceId='synthetic-schedule';
 const check={condition:{call:'required',args:{value:{path:'/when'}}},message:'Select a date and time'};
 const recording={format:'dsh-a2ui-recording/1',messages:[
  {version,createSurface:{surfaceId,catalogId:'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json'}},
  {version,updateDataModel:{surfaceId,path:'/',value:{when:'2026-10-24T14:30:00'}}},
  {version,updateComponents:{surfaceId,components:[
   {id:'root',component:'Column',children:['when','submit']},
   {id:'when',component:'DateTimeInput',enableDate:true,enableTime:true,label:'Synthetic appointment',value:{path:'/when'},checks:[check]},
   {id:'submit',component:'Button',child:'label',checks:[check],action:{event:{name:'save_synthetic',context:{when:{path:'/when'}}}}},
   {id:'label',component:'Text',text:'Save synthetic'}]}}
 ],actions:[],snapshots:[]};
 async function restore(value:unknown){await page.goto('/');await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();await page.getByRole('textbox',{name:'Portable recording',exact:true}).fill(JSON.stringify(value));await page.getByRole('button',{name:'Restore recording',exact:true}).click();await expect(page.getByRole('status')).toContainText('Restored');}
 async function exported(){await page.getByRole('button',{name:'Export recording',exact:true}).click();return JSON.parse(await page.getByRole('textbox',{name:'Portable recording',exact:true}).inputValue());}
 await restore(recording);await expect(page.locator('input[type=time]')).toHaveValue('14:30');
 await page.locator(`input[type=${part}]`).fill('');await page.locator(`input[type=${part}]`).press('Tab');
 await expect(page.locator('input[type=date]')).toHaveValue('');await expect(page.locator('input[type=time]')).toHaveValue('');
 await expect(page.getByRole('button',{name:'Save synthetic',exact:true})).toBeDisabled();
 await expect(page.getByText('Select a date and time',{exact:true}).first()).toBeVisible();
 const empty=await exported();expect(empty.snapshots[0].updateDataModel.value.when).toBe('');expect(empty.actions).toHaveLength(0);
 await restore(empty);await expect(page.locator('input[type=date]')).toHaveValue('');await expect(page.locator('input[type=time]')).toHaveValue('');
 await expect(page.getByRole('button',{name:'Save synthetic',exact:true})).toBeDisabled();await expect(page.locator('pre')).toHaveText('No actions sent.');
 await page.locator('input[type=date]').fill('2026-11-05');await page.locator('input[type=date]').press('Tab');await expect(page.locator('input[type=time]')).toHaveValue('00:00');
 await page.locator('input[type=time]').fill('09:15');await page.locator('input[type=time]').press('Tab');
 await page.getByRole('button',{name:'Save synthetic',exact:true}).click();const completed=await exported();
 expect(completed.actions).toHaveLength(1);expect(completed.actions[0].action.context.when).toBe('2026-11-05T09:15:00');
 await restore(completed);await expect(page.locator('input[type=date]')).toHaveValue('2026-11-05');await expect(page.locator('input[type=time]')).toHaveValue('09:15');
 await expect(page.locator('pre')).toHaveText('No actions sent.');expect((await exported()).actions).toEqual(completed.actions);expect(errors).toEqual([]);
});
