import { loadProfile } from './profile.js?v=07948';
import { listDecks } from './deck-store.js?v=07948';
import { durableSet } from './userdata-db.js?v=0738';

const PROFILE_KEY='ccv07-profile';
const DECKS_KEY='ccv07-decks';
const BACKUP_FORMAT='commander-companion-profile';
const BACKUP_VERSION=2;

function safeName(value){
  return String(value||'Commander-Companion').trim().replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'')||'Commander-Companion';
}

function validateBackup(raw){
  if(!raw||typeof raw!=='object')throw new Error('That file is not a Commander Companion profile backup.');
  if(raw.format!==BACKUP_FORMAT||![1,2].includes(Number(raw.backupVersion)))throw new Error('That Commander Companion backup format is not supported by this build.');
  if(!raw.profile||typeof raw.profile!=='object'||Array.isArray(raw.profile))throw new Error('The backup is missing valid profile data.');
  if(!Array.isArray(raw.decks))throw new Error('The backup is missing valid saved deck data.');
  return raw;
}

export function buildProfileBackup(){
  const profile=loadProfile();
  const decks=listDecks();
  return {
    format:BACKUP_FORMAT,
    backupVersion:BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
    profile,
    decks
  };
}

export async function saveProfileBackupFile(){
  const backup=buildProfileBackup();
  const player=safeName(backup.profile?.account?.displayName||'Commander-Companion');
  const date=new Date().toISOString().slice(0,10);
  const filename=`${player}-CommanderCompanion-${date}.ccsave`;
  const text=JSON.stringify(backup,null,2);
  const file=new File([text],filename,{type:'application/json'});

  if(navigator.share&&navigator.canShare?.({files:[file]})){
    await navigator.share({files:[file],title:'Commander Companion Profile Backup',text:'Save this Commander Companion profile backup to Files or iCloud Drive.'});
    return filename;
  }

  const url=URL.createObjectURL(file);
  const a=document.createElement('a');
  a.href=url;a.download=filename;a.style.display='none';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  return filename;
}

export async function restoreProfileBackupFile(file){
  if(!file)throw new Error('Choose a Commander Companion profile backup file.');
  const text=await file.text();
  let raw;
  try{raw=JSON.parse(text)}catch{throw new Error('That backup file could not be read.');}
  const backup=validateBackup(raw);

  const profile=structuredClone(backup.profile);
  const decks=structuredClone(backup.decks);
  let localOk=true;
  try{
    localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));
    localStorage.setItem(DECKS_KEY,JSON.stringify(decks));
  }catch{localOk=false;}

  let durableOk=true;
  try{
    await durableSet('profile',profile);
    await durableSet('decks',decks);
  }catch{durableOk=false;}

  if(!localOk&&!durableOk)throw new Error('The profile could not be restored because this browser is not allowing local storage.');
  return {profile,decks,exportedAt:backup.exportedAt||null};
}
