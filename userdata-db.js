const DB_NAME='commander-companion-userdata';
const DB_VERSION=1;
const STORE='kv';
function openDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in globalThis))return reject(new Error('IndexedDB unavailable'));
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('User data database open failed'));
  });
}
export async function durableGet(key){
  const db=await openDb();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get(key);req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error||new Error('User data read failed'))})}finally{db.close()}
}
export async function durableSet(key,value){
  const db=await openDb();
  try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(structuredClone(value),key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('User data save failed'));tx.onabort=()=>reject(tx.error||new Error('User data save aborted'))});return true}finally{db.close()}
}
export async function durableDelete(key){
  const db=await openDb();
  try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('User data delete failed'))});return true}finally{db.close()}
}
