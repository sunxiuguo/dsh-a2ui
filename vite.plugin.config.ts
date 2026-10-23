import {defineConfig} from 'vite';
import {licenseAudit} from './scripts/license-audit';
export default defineConfig({plugins:[licenseAudit()],build:{outDir:'lib',lib:{entry:'src/dsh/tool.ts',formats:['es'],fileName:()=> 'index.js'},rollupOptions:{external:(id)=>id.startsWith('@deepseek-ai/')}}});
