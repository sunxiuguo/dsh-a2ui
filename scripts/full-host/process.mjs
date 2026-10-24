// Private process supervision. Never print child output: the native host announces a login token.
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
function signalTree(child,signal){if(!child.pid)return;try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}}
const privateCommands=new Set();
function groupAlive(child){if(!child.pid)return false;try{process.kill(-child.pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
export async function stopPrivateCommands(){
 const prune=()=>{for(const child of privateCommands)if(!groupAlive(child))privateCommands.delete(child);};
 prune();for(const child of privateCommands)signalTree(child,'SIGTERM');const until=Date.now()+5000;
 while(privateCommands.size&&Date.now()<until){await sleep(50);prune();}
 for(const child of privateCommands)signalTree(child,'SIGKILL');const end=Date.now()+3000;
 while(privateCommands.size&&Date.now()<end){await sleep(50);prune();}
 assert.equal(privateCommands.size,0,'Private package process cleanup not confirmed');
}

export function runPrivate(command,args,{cwd,env,timeout=90000}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:true});
  privateCommands.add(child);
  let output='';let settled=false;
  const timer=setTimeout(()=>{signalTree(child,'SIGTERM');setTimeout(()=>signalTree(child,'SIGKILL'),5000).unref();},timeout);
  child.stdout.on('data',chunk=>{output=(output+chunk.toString()).slice(-1024*1024);});
  child.stderr.on('data',()=>{}); // Drain privately; never mix warnings into npm --json output.
  child.on('error',()=>{privateCommands.delete(child);if(!settled){settled=true;clearTimeout(timer);reject(new Error('Private subprocess could not start'));}});
  child.on('close',code=>{if(!groupAlive(child))privateCommands.delete(child);if(settled)return;settled=true;clearTimeout(timer);if(code===0)resolve(output);else reject(new Error(`Private subprocess exited ${code}; raw output deliberately withheld`));});
 });
}
export function startPrivateHost(command,args,{cwd,env}) {
 const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:true});
 let output='';let exited=false;let spawnFailed=false;let deniedEgress=false;
 child.on('error',()=>{spawnFailed=true;});child.on('exit',()=>{exited=true;});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{const combined=output+chunk.toString();if(combined.includes('DSH_A2UI_EGRESS_REJECTED'))deniedEgress=true;output=combined.slice(-1024*1024);});
 return {
  observations(){return output.split(/\r?\n/).filter(line=>line.startsWith('DSH_A2UI_SYNTHETIC_EVENT ')).map(line=>JSON.parse(line.slice('DSH_A2UI_SYNTHETIC_EVENT '.length)));},
  egressRejected(){return deniedEgress;},
  async loginUrl(){
   const deadline=Date.now()+60000;
   while(Date.now()<deadline){
    if(exited||spawnFailed)throw new Error('Native host exited before readiness; private output withheld');
    const clean=output.replace(/\u001b\[[0-9;]*m/g,'');
    const candidates=clean.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/g)||[];
    if(candidates.length){const url=new URL(candidates.at(-1));assert.equal(url.hostname,'127.0.0.1');assert.ok(Number(url.port)>0);return url;}
    await sleep(100);
   }
   throw new Error('Native host did not announce loopback login before deadline');
  },
  async stop(){
   const alive=()=>{if(!child.pid)return false;try{process.kill(-child.pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
   if(alive()){signalTree(child,'SIGTERM');const deadline=Date.now()+8000;while(alive()&&Date.now()<deadline)await sleep(50);if(alive()){signalTree(child,'SIGKILL');const killDeadline=Date.now()+3000;while(alive()&&Date.now()<killDeadline)await sleep(50);}}
   output='';assert.equal(alive(),false,'Native host process group shutdown not confirmed');

  },
 };
}
