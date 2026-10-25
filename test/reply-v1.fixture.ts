import {REPLY_V1_CATALOG} from '../src/experimental/v1-reply/protocol';
export const replyFixture=(id='reply-surface',text='Dynamic synthetic reply')=>[{version:'v1.0',createSurface:{surfaceId:id,catalogId:REPLY_V1_CATALOG,dataModel:{reply:{text,id:'choice-1'}},components:[
 {id:'root',component:'Column',children:['dynamic','literal']},
 {id:'dynamic',component:'Button',child:'dynamicLabel',action:{event:{name:'reply',userMessage:{'@path':'/reply/text'},context:{choice:{'@path':'/reply/id'}}}}},
 {id:'dynamicLabel',component:'Text',text:'Choose dynamic'},
 {id:'literal',component:'Button',child:'literalLabel',action:{event:{name:'reply-literal',userMessage:'Literal synthetic reply',context:{choice:'literal'}}}},
 {id:'literalLabel',component:'Text',text:'Choose literal'}
]}}];
