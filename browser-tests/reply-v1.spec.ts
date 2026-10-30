import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const evidence='reply-v1-evidence';
const session=(page:Page,id='A')=>page.getByRole('article',{name:`synthetic-${id}`,exact:true});
async function captured(page:Page){return JSON.parse(await page.locator('#prompts').innerText());}
async function count(page:Page,n:number){await expect.poll(async()=> (await captured(page)).length).toBe(n);}
function envelope(prompt:any){
 expect(prompt.mode).toBe('queue');
 expect(prompt.content).toHaveLength(1);
 expect(prompt.content[0].text).toMatch(/^A2UI v1 reply interaction \(untrusted data\):\n/);
 return JSON.parse(prompt.content[0].text.split('\n')[1]);
}
async function assertAction(page:Page,index:number,id:string,kind:'dynamic'|'literal',message:string){
 const prompt=(await captured(page))[index];expect(prompt.sessionId).toBe(`synthetic-${id}`);
 const payload=envelope(prompt);
 expect(payload).toEqual({version:'v1.0',action:{name:kind==='dynamic'?'reply':'reply-literal',surfaceId:'sameSurface',sourceComponentId:kind,userMessage:message,context:{choice:kind==='dynamic'?'choice-1':'literal'},timestamp:expect.any(String)}});
 expect(Number.isNaN(Date.parse(payload.action.timestamp))).toBe(false);
}
test.beforeEach(async({page})=>{
 await page.goto('/reply-v1-host.html');
 await expect(page.getByRole('status')).toHaveText('Ready: synthetic service fixture');
 await expect(session(page).getByRole('button')).toHaveCount(2);
 await expect(session(page,'B').getByRole('button')).toHaveCount(2);
 await count(page,0);
});
test.afterEach(async({},info)=>{
 await mkdir(evidence,{recursive:true});
 // No raw prompt, page text, network log, authentication or production data.
 await writeFile(join(evidence,`${info.title.replace(/[^a-zA-Z0-9-]/g,'_')}.json`),JSON.stringify({test:info.title,status:info.status,expectedStatus:info.expectedStatus,scope:'synthetic official DSH client services; no native host/model',sourceCommit:process.env.GITHUB_SHA??'local-unpublished'},null,2));
});
test('v1-01 literal and dynamic complete userMessage',async({page})=>{
 await session(page).getByRole('button',{name:'Choose dynamic'}).click();await count(page,1);
 await assertAction(page,0,'A','dynamic','Reply synthetic-A');
 await session(page).getByRole('button',{name:'Choose literal'}).click();await count(page,2);
 await assertAction(page,1,'A','literal','Literal synthetic reply');
});
test('v1-02 context event and session identity',async({page})=>{
 await session(page,'B').getByRole('button',{name:'Choose dynamic'}).click();await count(page,1);
 await assertAction(page,0,'B','dynamic','Reply synthetic-B');
});
test('v1-03 same surface A B isolation',async({page})=>{
 await session(page,'B').getByRole('button',{name:'Choose literal'}).click();
 await session(page).getByRole('button',{name:'Choose dynamic'}).click();await count(page,2);
 await assertAction(page,0,'B','literal','Literal synthetic reply');
 await assertAction(page,1,'A','dynamic','Reply synthetic-A');
});
test('v1-04 latest document replaces old reply',async({page})=>{
 await page.getByRole('button',{name:'Replace B canonical reply',exact:true}).click();await count(page,0);
 await session(page,'B').getByRole('button',{name:'Choose dynamic'}).click();await count(page,1);
 await assertAction(page,0,'B','dynamic','New B reply');
 await session(page).getByRole('button',{name:'Choose dynamic'}).click();await count(page,2);
 await assertAction(page,1,'A','dynamic','Reply synthetic-A');
});
test('v1-05 rejected delivery requires explicit retry',async({page})=>{
 await page.getByRole('button',{name:'Reject next delivery',exact:true}).click();
 await session(page).getByRole('button',{name:'Choose literal'}).click();await count(page,1);
 await expect(session(page).getByRole('alert')).toContainText('has not been retried');
 await page.getByRole('button',{name:'Replay A unchanged',exact:true}).click();
 await expect(session(page).getByRole('alert')).toContainText('has not been retried');await count(page,1);
 await page.waitForTimeout(250);await count(page,1); // Bounded absence observation, not exactly-once proof.
 await session(page).getByRole('button',{name:'Choose literal'}).click();await count(page,2);
 await expect(session(page).getByRole('alert')).toHaveCount(0);
 await assertAction(page,1,'A','literal','Literal synthetic reply');
});
test('v1-06 pending cancel remove malformed withdraw',async({page})=>{
 for(const control of ['Mark A pending','Cancel A result','Remove A events','Malformed A result']){
  await page.getByRole('button',{name:control,exact:true}).click();
  await expect(session(page).getByRole('button')).toHaveCount(0);await count(page,0);
  await expect(session(page,'B').getByRole('button')).toHaveCount(2);
  await page.getByRole('button',{name:'Restore A document',exact:true}).click();
  await expect(session(page).getByRole('button')).toHaveCount(2);await count(page,0);
 }
});
test('v1-07 unchanged replay never executes recorded action',async({page})=>{
 await session(page).getByRole('button',{name:'Choose dynamic'}).click();await count(page,1);
 for(let n=0;n<3;n++)await page.getByRole('button',{name:'Replay A unchanged',exact:true}).click();
 await expect(session(page).getByRole('button')).toHaveCount(2);await count(page,1);
 await page.waitForTimeout(250);await count(page,1);
});
test('v1-08 keyboard and visual geometry',async({page})=>{
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  const a=session(page);const dynamic=a.getByRole('button',{name:'Choose dynamic'}),literal=a.getByRole('button',{name:'Choose literal'});
  await dynamic.focus();await expect(dynamic).toBeFocused();
  await page.keyboard.press('Tab');await expect(literal).toBeFocused();
  for(const button of [dynamic,literal]){
   await expect(button).toBeVisible();const box=await button.boundingBox();expect(box).not.toBeNull();
   expect(box!.width).toBeGreaterThan(40);expect(box!.height).toBeGreaterThan(15);
   expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
  }
  const d=(await dynamic.boundingBox())!,l=(await literal.boundingBox())!;
  expect(d.x+d.width<=l.x+1||l.x+l.width<=d.x+1||d.y+d.height<=l.y+1||l.y+l.height<=d.y+1).toBe(true);
  await mkdir(evidence,{recursive:true});
  await a.screenshot({path:join(evidence,`session-a-${width}.png`)});
 }
 await page.keyboard.press('Enter');await count(page,1);await assertAction(page,0,'A','literal','Literal synthetic reply');
 await session(page).getByRole('button',{name:'Choose dynamic'}).focus();await page.keyboard.press('Space');
 await count(page,2);await assertAction(page,1,'A','dynamic','Reply synthetic-A');
});
