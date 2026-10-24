import React,{useState,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {SurfaceSession,SurfaceView} from '../src/surface';
import {JsonlDecoder,type Message} from '../src/protocol';
import {importRecording} from '../src/replay';
import {demoMessages} from './fixture';
import validationMessages from './validation-fixture.json';
import './style.css';
function App(){
 const [actions,setActions]=useState<string[]>([]),[status,setStatus]=useState('Ready'),[file,setFile]=useState('');
 const sessionRef=useRef<SurfaceSession>();
 const [session,setSession]=useState(()=>new SurfaceSession(async action=>{setActions(a=>[...a,JSON.stringify(action)]);}));
 sessionRef.current=session;
 useEffect(()=>()=>session.dispose(),[session]);
 const fresh=()=>{const s=new SurfaceSession(async action=>{setActions(a=>[...a,JSON.stringify(action)]);});setSession(s);setActions([]);return s;};
 const stream=async(messages:Message[])=>{const s=fresh();const decoder=new JsonlDecoder();setStatus('Streaming synthetic JSONL');try{
   const text=messages.map(m=>JSON.stringify(m)).join('\n')+'\n';
   for(let i=0;i<text.length;i+=73){if(sessionRef.current!==s&&i>0)return;const parsed=decoder.push(text.slice(i,i+73));if(parsed.length)s.append(parsed);await new Promise(r=>setTimeout(r,35));}
   decoder.finish();setStatus('Validated. Edit the form and preview an action.');
 }catch(e){setStatus(String(e));}};
 const save=()=>{try{setFile(JSON.stringify(session.export(),null,2));setStatus('Recording exported below; input values retained.');}catch(e){setStatus(String(e));}};
 const restore=()=>{try{const r=importRecording(file);const s=fresh();s.restore(r);setStatus(`Restored ${r.messages.length} messages. ${r.actions.length} historical actions NOT sent.`);}catch(e){setStatus(String(e));}};
 return <main><header><p className="eyebrow">DSH A2UI · Protocol-first alpha</p><h1>One standard. A replayable conversation.</h1><p>Official A2UI runtime with accessible TextField and Slider views • strict basic-catalog validation • no external media or navigation</p></header><nav><button onClick={()=>stream(demoMessages)}>Stream synthetic example</button><button onClick={()=>stream(validationMessages)}>Stream validation example</button><button onClick={save}>Export recording</button><button onClick={restore}>Restore recording</button></nav><p role="status">{status}</p><section className="grid"><article><h2>Interactive surface</h2><p className="note">Independent synthetic demo. Actions go to this page’s log only, not to DSH or any service.</p><SurfaceView session={session}/></article><article><h2>Action roundtrip</h2><p>Resolved A2UI action envelopes after clicking the form.</p><pre>{actions.join('\n\n')||'No actions sent.'}</pre></article></section><details><summary>Portable recording: inspect, paste, restore</summary><textarea aria-label="Portable recording" value={file} onChange={e=>setFile(e.target.value)}/></details><footer>Experimental v0.1.0-alpha.10. This standalone preview is not proof of DSH host acceptance.</footer></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
