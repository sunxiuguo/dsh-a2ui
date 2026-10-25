import {defineConfig} from 'vite';
export default defineConfig({cacheDir:'.vite-reply-v1-cache',build:{outDir:'experimental-browser',rollupOptions:{input:'reply-v1-host.html'}}});
