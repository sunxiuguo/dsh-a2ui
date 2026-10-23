import {it,expect} from 'vitest';
import {definition} from '../src/dsh/node';
import {demoMessages} from '../demo/fixture';
// Synthetic events conform to the inspected SDK shape. This tests the real
// projection functions, not DSH event routing or persistence in a running host.
function begin(){
 const event={type:'tool/call',seq:1,data:{name:'render_a2ui',callId:'synthetic-call',arguments:JSON.stringify({messages:demoMessages})}};
 const match={event,location:{kind:'unresolved'}};
 return {state:definition.start!({} as any,match as any,{} as any),match};
}
function view(state:any,match:any){return definition.buildViewNode!({state,key:'k',id:'synthetic-call',start:match,matches:[match]} as any) as any;}
it('error result without metadata terminates preview and clears interactive document',()=>{
 const {state,match}=begin();expect(view(state,match).data.running).toBe(true);
 const event={type:'tool/result',surfaceOp:'append',seq:2,data:{message:{source:{callId:'synthetic-call'},isError:true}}};
 expect(definition.match(event as any)).toEqual({id:'synthetic-call',role:'update'});
 const failed=definition.update!({state} as any,{event} as any);
 const data=view(failed,match).data;expect(data.running).toBe(false);expect(data.messages).toEqual([]);expect(data.error).toContain('withdrawn');
 const late=definition.update!({state:failed} as any,{event:{type:'assistant/live-chunk',data:{chunk:{type:'tool-call-delta',argumentsDelta:'ignored'}}}} as any);
 expect(view(late,match).data).toEqual(data);
});
it('success without authoritative metadata also withdraws preview',()=>{
 const {state,match}=begin();const settled=definition.update!({state} as any,{event:{type:'tool/result',data:{message:{isError:false}}}} as any);
 expect(view(settled,match).data).toMatchObject({running:false,messages:[],error:expect.stringContaining('withdrawn')});
});
it('validated successful metadata settles and preserves canonical protocol document',()=>{
 const {state,match}=begin();const settled=definition.update!({state} as any,{event:{type:'tool/result',data:{message:{isError:false},meta:{kind:'dsh-a2ui/1',messages:demoMessages}}}} as any);
 expect(view(settled,match).data).toEqual({running:false,messages:demoMessages});
});
