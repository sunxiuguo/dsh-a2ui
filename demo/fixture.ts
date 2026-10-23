import {CATALOG_ID} from '../src/protocol';
export const demoMessages=[
 {version:'v0.9',createSurface:{surfaceId:'synthetic-workshop',catalogId:CATALOG_ID,sendDataModel:false}},
 {version:'v0.9',updateComponents:{surfaceId:'synthetic-workshop',components:[
  {id:'root',component:'Column',children:['heading','description','topic','submit']},
  {id:'heading',component:'Text',text:'Synthetic workshop request',variant:'h2'},
  {id:'description',component:'Text',text:'Independent demo. No booking, payment, or external request is made.'},
  {id:'topic',component:'TextField',label:'Workshop topic',value:{path:'/topic'},variant:'shortText'},
  {id:'submit',component:'Button',child:'label',action:{event:{name:'request_preview',context:{topic:{path:'/topic'}}}}},
  {id:'label',component:'Text',text:'Preview request'}]}},
 {version:'v0.9',updateDataModel:{surfaceId:'synthetic-workshop',path:'/',value:{topic:'Ceramics for beginners'}}}
];
