import {validateDocument,validateMessage,validateAction,MAX_BYTES,MAX_ACTIONS,MAX_ACTION_HISTORY_BYTES,type Message} from './protocol';
export const MAX_RECORDING_BYTES=3*MAX_BYTES+4096;
export interface Recording {format:'dsh-a2ui-recording/1'; messages:Message[]; snapshots:Message[]; actions:Message[]}
/** Snapshots are separately bounded state, not extra entries in the input history. */
export function recording(messages:unknown,actions:unknown[]=[],snapshots:unknown[]=[]):Recording {
  const validated=validateDocument(messages);
  if(actions.length>MAX_ACTIONS)throw new Error('REPLAY: too many actions');
  for(const action of actions)validateAction(action);
  if(new TextEncoder().encode(JSON.stringify(actions)).length>MAX_ACTION_HISTORY_BYTES)throw new Error('REPLAY: action history byte limit exceeded');
  const active=new Map<string,string>();
  for(const m of validated){if(m.createSurface)active.set(m.createSurface.surfaceId,m.version);if(m.deleteSurface)active.delete(m.deleteSurface.surfaceId);}
  if(snapshots.length>8)throw new Error('REPLAY: too many snapshots');
  const seen=new Set<string>();
  for(const snapshot of snapshots){
    validateMessage(snapshot);
    const data=snapshot.updateDataModel;
    if(!data || data.path!=='/' || !Object.hasOwn(data,'value') || active.get(data.surfaceId)!==snapshot.version || seen.has(data.surfaceId))throw new Error('REPLAY: invalid active-surface snapshot');
    seen.add(data.surfaceId);
  }
  if(new TextEncoder().encode(JSON.stringify(snapshots)).length>MAX_BYTES)throw new Error('REPLAY: snapshot byte limit exceeded');
  const value:Recording={format:'dsh-a2ui-recording/1',messages:validated,snapshots:structuredClone(snapshots) as Message[],actions:structuredClone(actions) as Message[]};
  if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_RECORDING_BYTES)throw new Error('REPLAY: recording too large');
  return value;
}
export function importRecording(text:string):Recording {
  if(new TextEncoder().encode(text).length>MAX_RECORDING_BYTES)throw new Error('REPLAY: recording too large');
  const value=JSON.parse(text);
  if(value?.format!=='dsh-a2ui-recording/1'||!Array.isArray(value.actions)||!Array.isArray(value.snapshots))throw new Error('REPLAY: unsupported recording');
  return recording(value.messages,value.actions,value.snapshots);
}
/** Historical actions remain evidence. They are NEVER re-sent by this helper. */
export function restoreRecording(text:string,accept:(messages:Message[],snapshots:Message[])=>void):Recording {
  const value=importRecording(text);accept(value.messages,value.snapshots);return value;
}
