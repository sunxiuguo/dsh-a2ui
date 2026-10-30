import {defineConfig,type Plugin} from 'vite';
import {licenseAudit} from './scripts/license-audit';
// Wrap AFTER minification: render-time banners can leave hoisted helpers global.
const lazyClient:Plugin={name:'dsh-lazy-client-factory',enforce:'post',generateBundle(_options,bundle){
 const chunk=bundle['client.js'];
 if(!chunk||chunk.type!=='chunk')throw new Error('Expected one client entry');
 if(Object.values(bundle).some(item=>item.type==='chunk'&&item!==chunk))throw new Error('DSH client must not have shared chunks');
 chunk.code='window.__ModuleLoader__.load({id:"dsh-a2ui-reply-v1",factory:(require)=>{\"use strict\";const module={exports:{}};const exports=module.exports;\n'+chunk.code+'\nreturn module.exports;}});\n';
}};
export default defineConfig({plugins:[licenseAudit(),lazyClient],build:{outDir:'experimental-lib',emptyOutDir:false,lib:{entry:'src/experimental/v1-reply/client.tsx',formats:['cjs'],fileName:()=> 'client.js'},rollupOptions:{external:(id)=>id==='react'||id==='react-dom'||id.startsWith('react/')||id.startsWith('react-dom/')||id.startsWith('@deepseek-ai/'),output:{inlineDynamicImports:true}}}});
