// Test-process egress guard. Does not change machine/network settings.
// Keep native loopback HTTP and WebSocket intact; reject outside destinations.
import net from 'node:net';
import {syncBuiltinESMExports} from 'node:module';
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 if(Array.isArray(args[0]))args=args[0];
 const first=args[0];
 const opts=typeof first==='object'&&first!==null&&!Array.isArray(first)?first:undefined;
 const host=opts?.host ?? (typeof args[1]==='string'?args[1]:'localhost');
 const local=['127.0.0.1','::1'].includes(host);
 if(opts?.path||typeof first==='string'||!local){
  process.stdout.write('DSH_A2UI_EGRESS_REJECTED\n');
  throw new Error('Synthetic host blocks non-loopback egress');
 }
 return Reflect.apply(connect,this,args);
};
syncBuiltinESMExports();
