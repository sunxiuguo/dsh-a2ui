import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['test/reply-v1.host.acceptance.tsx'],environment:'jsdom',setupFiles:['./test/setup.ts'],pool:'forks',maxWorkers:1}});
