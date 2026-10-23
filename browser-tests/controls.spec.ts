import {test,expect} from '@playwright/test';
const surfaceId='synthetic-controls';
const recording={format:'dsh-a2ui-recording/1',messages:[
 {version:'v0.9.1',createSurface:{surfaceId,catalogId:'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json'}},
 {version:'v0.9.1',updateDataModel:{surfaceId,path:'/',value:{agreed:false,amount:3,date:'2026-10-23',choice:['one']}}},
 {version:'v0.9.1',updateComponents:{surfaceId,components:[
 {id:'root',component:'Column',children:['check','slider','date','choice','submit']},
 {id:'check',component:'CheckBox',label:'Synthetic consent',value:{path:'/agreed'}},
 {id:'slider',component:'Slider',min:0,max:10,value:{path:'/amount'}},
 {id:'date',component:'DateTimeInput',label:'Synthetic date',enableDate:true,value:{path:'/date'}},
 {id:'choice',component:'ChoicePicker',label:'Synthetic choice',variant:'mutuallyExclusive',options:[{label:'One',value:'one'},{label:'Two',value:'two'}],value:{path:'/choice'}},
 {id:'submit',component:'Button',child:'submit-label',action:{event:{name:'controls',context:{agreed:{path:'/agreed'},amount:{path:'/amount'},date:{path:'/date'},choice:{path:'/choice'}}}}},
 {id:'submit-label',component:'Text',text:'Submit synthetic controls'}
 ]}}
],actions:[],snapshots:[]};
test('checkbox, slider, date and choice edits survive portable replay without action duplication',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/');await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 const editor=page.getByRole('textbox',{name:'Portable recording',exact:true});
 await editor.fill(JSON.stringify(recording));await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Restored');
 await page.getByRole('checkbox',{name:'Synthetic consent'}).check();
 const slider=page.getByRole('slider');await slider.focus();await slider.press('ArrowRight');
 await page.locator('input[type=date]').fill('2026-10-24');
 await page.getByText('Two',{exact:true}).click();
 await page.getByRole('button',{name:'Submit synthetic controls',exact:true}).click();
 await page.getByRole('button',{name:'Export recording'}).click();
 const saved=JSON.parse(await editor.inputValue());
 expect(saved.actions).toHaveLength(1);expect(saved.actions[0].action.context).toEqual({agreed:true,amount:4,date:'2026-10-24',choice:['two']});
 await page.reload();await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 await page.getByRole('textbox',{name:'Portable recording',exact:true}).fill(JSON.stringify(saved));
 await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'Synthetic consent'})).toBeChecked();
 await expect(page.getByRole('slider')).toHaveValue('4');await expect(page.locator('input[type=date]')).toHaveValue('2026-10-24');
 await expect(page.getByRole('radio',{name:'Two',exact:true})).toBeChecked();
 await expect(page.getByRole('radio',{name:'One',exact:true})).not.toBeChecked();
 await expect(page.locator('pre')).toHaveText('No actions sent.');
 await page.getByRole('button',{name:'Export recording'}).click();
 expect(JSON.parse(await page.getByRole('textbox',{name:'Portable recording',exact:true}).inputValue()).snapshots[0].updateDataModel.value.choice).toEqual(['two']);
 expect(errors).toEqual([]);
});
