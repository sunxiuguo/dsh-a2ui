import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/host-ui.acceptance.tsx'],environment:'jsdom',setupFiles:['./test/setup.ts'],pool:'forks',maxWorkers:1}});
