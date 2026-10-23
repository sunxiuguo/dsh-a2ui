import {it,expect} from 'vitest';
import type {Context} from '@deepseek-ai/cordis';
import type {ToolDefinition,ToolRunContext} from '@deepseek-ai/dsh-tools';
import type {JsonValue} from '@deepseek-ai/dsh-util-values';
import {apply} from '../src/dsh/tool';
import {demoMessages} from '../demo/fixture';
// Real SDK defineTool with a synthetic registry, not an installed DSH host.
function register(){let tool:ToolDefinition|undefined;apply({tools:{register:(value:ToolDefinition)=>{tool=value;}}} as unknown as Context);return tool!;}
it('real SDK tool validates and persists protocol metadata without claiming display',async()=>{
 const tool=register();expect(tool.name).toBe('render_a2ui');
 const value=await tool.execute({messages:demoMessages},{callId:'synthetic-call',signal:new AbortController().signal} as ToolRunContext) as JsonValue;
 const meta=tool.output.presentationMeta!({},value) as any;
 expect(meta.kind).toBe('dsh-a2ui/1');expect(meta.messages).toEqual(demoMessages);
 expect(JSON.stringify(tool.output.render({},value))).toContain('does not confirm display');
});
it('real SDK tool rejects invalid messages and already cancelled calls',async()=>{
 const tool=register();const controller=new AbortController();
 await expect(tool.execute({messages:[]},{callId:'synthetic',signal:controller.signal} as ToolRunContext)).rejects.toThrow();
 controller.abort();await expect(tool.execute({messages:demoMessages},{callId:'synthetic',signal:controller.signal} as ToolRunContext)).rejects.toThrow();
});
