import {test,expect} from '@playwright/test';
test('real browser streaming, input, action, export and fresh-page replay without resending',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 // No external network is required for this synthetic acceptance flow.
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/');
 await page.getByRole('button',{name:'Stream synthetic example'}).click();
 await expect(page.getByRole('status')).toContainText('Validated.');
 const input=page.locator('input').first();
 await expect(input).toHaveValue('Ceramics for beginners');
 await input.fill('Synthetic browser edit');
 await page.getByRole('button',{name:'Preview request',exact:true}).click();
 await expect(page.locator('pre')).toContainText('Synthetic browser edit');
 await page.getByRole('button',{name:'Export recording'}).click();
 await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 const text=await page.getByRole('textbox',{name:'Portable recording',exact:true}).inputValue();
 const recording=JSON.parse(text);expect(recording.actions).toHaveLength(1);
 expect(recording.actions[0].action.context.topic).toBe('Synthetic browser edit');
 expect(recording.snapshots).toHaveLength(1);
 // Fresh document, not merely the same component's in-memory state.
 await page.reload();
 await page.getByText('Portable recording: inspect, paste, restore',{exact:true}).click();
 await page.getByRole('textbox',{name:'Portable recording',exact:true}).fill(text);
 await page.getByRole('button',{name:'Restore recording',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('1 historical actions NOT sent');
 await expect(page.locator('input').first()).toHaveValue('Synthetic browser edit');
 await expect(page.locator('pre')).toHaveText('No actions sent.');
 await page.getByRole('button',{name:'Export recording'}).click();
 const restored=JSON.parse(await page.getByRole('textbox',{name:'Portable recording',exact:true}).inputValue());
 expect(restored.actions).toEqual(recording.actions);expect(errors).toEqual([]);
});
