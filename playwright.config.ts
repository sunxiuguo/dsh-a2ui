import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./browser-tests',workers:1,fullyParallel:false,timeout:30000,
 reporter:'list',use:{baseURL:'http://127.0.0.1:4173',headless:true,channel:'chrome',
  launchOptions:{chromiumSandbox:true},trace:'off',screenshot:'off',video:'off'},
 webServer:{command:'npm run dev -- --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:30000}
});
