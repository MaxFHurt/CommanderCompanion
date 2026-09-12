export function roomCode(){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>a[Math.floor(Math.random()*a.length)]).join('')}
let peerLoadPromise=null;
async function peerCtor(){
  if(window.Peer)return window.Peer;
  if(!peerLoadPromise)peerLoadPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-peerjs]');
    if(existing){existing.addEventListener('load',()=>window.Peer?resolve(window.Peer):reject(new Error('Networking library loaded without PeerJS.')),{once:true});existing.addEventListener('error',()=>reject(new Error('Unable to load networking library. Check internet access.')),{once:true});return}
    const script=document.createElement('script');script.src='https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';script.async=true;script.dataset.peerjs='true';
    script.onload=()=>window.Peer?resolve(window.Peer):reject(new Error('Networking library loaded without PeerJS.'));
    script.onerror=()=>reject(new Error('Unable to load networking library. Check internet access.'));
    document.head.appendChild(script);
  });
  return peerLoadPromise;
}
export async function createHostNetwork(code,{onConnection,onData,onStatus=()=>{}}={}){
  const Peer=await peerCtor(); const peer=new Peer(`ccv07-${code.toLowerCase()}`); const conns=new Set();
  peer.on('open',()=>onStatus('connected'));peer.on('error',e=>onStatus(`error:${e.type}`));
  peer.on('connection',c=>{conns.add(c);c.on('open',()=>onConnection?.(c));c.on('data',d=>onData?.(d,c));c.on('close',()=>conns.delete(c))});
  return {peer,code,broadcast:data=>conns.forEach(c=>c.open&&c.send(data)),connections:conns,destroy:()=>peer.destroy()};
}
export async function joinHostNetwork(code,{onData,onStatus=()=>{}}={}){
  const Peer=await peerCtor(); const peer=new Peer(); let conn;
  await new Promise((resolve,reject)=>{peer.on('open',resolve);peer.on('error',reject)});
  conn=peer.connect(`ccv07-${code.toLowerCase()}`,{reliable:true});
  conn.on('open',()=>onStatus('connected'));conn.on('data',d=>onData?.(d,conn));conn.on('error',e=>onStatus(`error:${e.type}`));conn.on('close',()=>onStatus('disconnected'));
  return {peer,conn,send:data=>conn.open&&conn.send(data),destroy:()=>peer.destroy()};
}
