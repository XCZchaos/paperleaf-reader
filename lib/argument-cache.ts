import type {ArgumentStudy} from './argument-types';
// Large paper artifacts use IndexedDB, scoped to the signed-in Paperleaf account.
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const request=indexedDB.open('paperleaf-argument-studies',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('studies');
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
async function operation<T>(key:string,mode:IDBTransactionMode,act:(store:IDBObjectStore)=>IDBRequest):Promise<T>{
 const db=await database();try{return await new Promise<T>((resolve,reject)=>{
  const transaction=db.transaction('studies',mode),request=act(transaction.objectStore('studies'));let result:T;
  request.onsuccess=()=>{result=request.result};transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||Error('本机保存中断'));
 });}finally{db.close()}
}
export function readArgumentCache(accountId:string,paperId:string){return operation<ArgumentStudy|undefined>(accountId+':'+paperId,'readonly',store=>store.get(accountId+':'+paperId));}
export function writeArgumentCache(accountId:string,study:ArgumentStudy){return operation<IDBValidKey>(accountId+':'+study.paperId,'readwrite',store=>store.put(study,accountId+':'+study.paperId));}
