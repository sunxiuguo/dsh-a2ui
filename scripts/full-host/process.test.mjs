import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {runPrivate,startPrivateHost,stopPrivateCommands} from './process.mjs';
import {setTimeout as sleep} from 'node:timers/promises';
const env={PATH:process.env.PATH};
test('private subprocess returns success only to caller',async()=>{assert.equal(await runPrivate(process.execPath,['-e','process.stdout.write("synthetic")'],{env}),'synthetic');});
test('private subprocess error does not reveal output',async()=>{await assert.rejects(runPrivate(process.execPath,['-e','console.log("DO_NOT_EXPORT");process.exit(2)'],{env}),e=>!e.message.includes('DO_NOT_EXPORT')&&e.message.includes('exited 2'));});
test('host rejects missing readiness and is stopped',async()=>{const h=startPrivateHost(process.execPath,['-e','process.exit(1)'],{env});try{await assert.rejects(h.loginUrl(),/before readiness/);}finally{await h.stop();}});
test('test network guard rejects non-loopback before DNS',async()=>{const guard=resolve('scripts/full-host/network-guard.mjs');const code='import net from "node:net";try{net.connect(80,"synthetic.invalid");process.exit(3)}catch(e){if(!e.message.includes("blocks non-loopback"))throw e;}';const out=await runPrivate(process.execPath,['--import',guard,'--input-type=module','-e',code],{env});assert.equal(out.trim(),'DSH_A2UI_EGRESS_REJECTED');});
test('test network guard retains native loopback HTTP',async()=>{const guard=resolve('scripts/full-host/network-guard.mjs');const code='import http from "node:http";const s=http.createServer((q,r)=>r.end("synthetic"));await new Promise(r=>s.listen(0,"127.0.0.1",r));const r=await fetch(`http://127.0.0.1:${s.address().port}`);if(await r.text()!=="synthetic")process.exitCode=2;s.closeAllConnections();await new Promise(r=>s.close(r));';await runPrivate(process.execPath,['--import',guard,'--input-type=module','-e',code],{env});});
test('private command cleanup retains a live descendant after direct child closes',async()=>{
 // No DSH imports, server, real credential, filesystem writes, or external I/O.
 const code='const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});child.unref();console.log(JSON.stringify({group:process.pid}));';
 const {group}=JSON.parse(await runPrivate(process.execPath,['-e',code],{env}));
 assert.ok(Number.isInteger(group)&&group>0);
 const alive=()=>{try{process.kill(-group,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
 try{
  assert.equal(alive(),true,'The regression fixture needs a surviving same-group descendant');
  await stopPrivateCommands();
  assert.equal(alive(),false,'Cleanup must verify the group, not only its exited direct child');
 }finally{
  if(alive())process.kill(-group,'SIGTERM');
  for(let i=0;i<20&&alive();i++)await sleep(25);
  if(alive())process.kill(-group,'SIGKILL');
  for(let i=0;i<20&&alive();i++)await sleep(25);
  assert.equal(alive(),false,'The synthetic regression process group must be removed');
 }
});
