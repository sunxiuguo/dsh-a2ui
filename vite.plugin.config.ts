import {defineConfig} from 'vite';
import {licenseAudit} from './scripts/license-audit';
export default defineConfig({plugins:[licenseAudit()],build:{outDir:'lib',lib:{entry:{index:'src/dsh/tool.ts',client:'src/dsh/client.tsx'},formats:['es'],fileName:(_format,name)=>name+'.js'},rollupOptions:{external:(id)=>id==='react'||id==='react-dom'||id.startsWith('react/')||id.startsWith('react-dom/')||id.startsWith('@deepseek-ai/')}}});
