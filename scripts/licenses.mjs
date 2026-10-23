import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();const rootPackage=JSON.parse(fs.readFileSync('package.json','utf8'));
const output=path.join(root,'vendor/runtime-licenses');fs.mkdirSync(output,{recursive:true});
const visited=new Set();const index=[];
function resolve(name,base){let dir=base;while(true){const found=path.join(dir,'node_modules',name);if(fs.existsSync(path.join(found,'package.json')))return found;const parent=path.dirname(dir);if(parent===dir)throw Error('Cannot find '+name);dir=parent;}}
function visit(name,base){const dir=resolve(name,base);const p=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));const id=p.name+'@'+p.version;if(visited.has(id))return;visited.add(id);
 const dest=id.replace(/[@/]/g,'_');fs.mkdirSync(path.join(output,dest),{recursive:true});
 let licenseRoot=dir;
 if(p.name==='@lit-labs/ssr-dom-shim')licenseRoot=path.join(root,'vendor/lit');
 const licenses=fs.readdirSync(licenseRoot).filter(n=>/^(LICENSE|LICENCE|COPYING|NOTICE|AUTHORS)(\.|$|-)/i.test(n)&&fs.statSync(path.join(licenseRoot,n)).isFile());
 if(!licenses.length)throw Error('Missing full license for '+id);
 const hashes={};for(const file of licenses){const bytes=fs.readFileSync(path.join(licenseRoot,file));fs.writeFileSync(path.join(output,dest,file),bytes);hashes[file]=crypto.createHash('sha256').update(bytes).digest('hex');}
 index.push({name:p.name,version:p.version,license:p.license,repository:p.repository,source:'https://registry.npmjs.org/'+p.name,files:hashes,directory:dest,...(licenseRoot!==dir?{licenseSource:'https://github.com/lit/lit/blob/main/LICENSE',licenseGitBlob:'428e3385849054f8e0657b86d7ede515ea6e8c33',reason:'Published ssr-dom-shim package omits the full BSD license; official monorepo license retained.'}:{})});
 for(const dependency of Object.keys(p.dependencies??{}))visit(dependency,dir);
}
for(const name of Object.keys(rootPackage.dependencies))visit(name,root);
index.sort((a,b)=>a.name.localeCompare(b.name));fs.writeFileSync(path.join(output,'INDEX.json'),JSON.stringify(index,null,2)+'\n');console.log('Full license texts retained for '+index.length+' runtime dependency packages (including a conservative superset of bundled code).');
