import fs from 'node:fs';
import path from 'node:path';
import type {Plugin} from 'vite';
/** Fail packaging if any bundled npm module lacks our retained full license. */
export function licenseAudit():Plugin{return {
 name:'retained-runtime-licenses',
 generateBundle(_options,bundle){
  const root=process.cwd();
  const index=JSON.parse(fs.readFileSync(path.join(root,'vendor/runtime-licenses/INDEX.json'),'utf8')) as Array<{name:string;version:string;directory:string;files:Record<string,string>}>;
  const found=new Map<string,unknown>();
  for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const moduleId of Object.keys(chunk.modules)){
   if(!moduleId.includes('/node_modules/')||moduleId.startsWith('\0'))continue;
   let dir=path.dirname(moduleId.split('?')[0]);
   let p:any;
   while(dir!==path.dirname(dir)){
    const file=path.join(dir,'package.json');
    if(fs.existsSync(file)){const candidate=JSON.parse(fs.readFileSync(file,'utf8'));if(candidate.name&&candidate.version){p=candidate;break;}}
    dir=path.dirname(dir);
   }
   if(!p)throw new Error('Cannot attribute bundled module: '+moduleId);
   const entry=index.find(e=>e.name===p.name&&e.version===p.version);if(!entry)throw new Error('Missing retained license for bundled '+p.name+'@'+p.version);
   found.set(p.name+'@'+p.version,entry);
  }
  this.emitFile({type:'asset',fileName:'bundled-dependencies.json',source:JSON.stringify([...found.values()],null,2)+'\n'});
  for(const entry of index)for(const file of Object.keys(entry.files))this.emitFile({type:'asset',fileName:'third-party-licenses/'+entry.directory+'/'+file,source:fs.readFileSync(path.join(root,'vendor/runtime-licenses',entry.directory,file))});
 }
};}
