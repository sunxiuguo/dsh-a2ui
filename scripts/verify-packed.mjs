import {mkdtempSync,rmSync} from 'node:fs';
import {dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temp=mkdtempSync(resolve(root,'.packed-acceptance-'));
try {
 const rows=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',temp],{cwd:root,encoding:'utf8'}));
 assert.equal(rows.length,1);assert.equal(basename(rows[0].filename),rows[0].filename);
 execFileSync('tar',['-xzf',resolve(temp,rows[0].filename),'-C',temp],{cwd:root,stdio:'inherit'});
 for(const script of ['verify-packed-host.mjs','verify-profile-client.mjs'])execFileSync(process.execPath,[resolve(root,'scripts',script),resolve(temp,'package')],{cwd:root,stdio:'inherit'});
} finally {rmSync(temp,{recursive:true,force:true});}
