/** Extract only fully parsed objects from a streaming {messages:[...]} tool call.
 * Never repair JSON or execute expressions; no partial object is rendered.
 */
export function completeMessages(text:string):unknown[]{
 if(text.length>262144)throw new Error('STREAM: argument limit exceeded');
 const start=/^\s*\{\s*"messages"\s*:\s*\[/.exec(text);
 if(!start)return [];
 let quoted=false,escape=false,depth=0,begin=-1;
 const result:unknown[]=[];
 for(let i=start[0].length;i<text.length;i++){
  const c=text[i];
  if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='{'||c==='['){if(depth===0)begin=i;depth++;}
  else if(c==='}'||c===']'){
   if(depth===0)break;
   depth--;if(depth===0&&begin>=0){result.push(JSON.parse(text.slice(begin,i+1)));begin=-1;}
  }else if(depth===0&&!/\s|,/.test(c))throw new Error('STREAM: non-object array element');
 }
 return result;
}
