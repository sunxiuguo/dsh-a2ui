import {defineConfig} from 'vite';
import {licenseAudit} from './scripts/license-audit';
export default defineConfig({plugins:[licenseAudit()]});
