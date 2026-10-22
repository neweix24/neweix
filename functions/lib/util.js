const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hkey=s=>crypto.subtle.importKey('raw',enc.encode(s),{name:'HMAC',hash:'SHA-256'},false,['sign']);
export const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const uid=()=>crypto.randomUUID().replace(/-/g,'').slice(0,10);
export const normPhone=p=>String(p||'').replace(/\D/g,'').replace(/^88/,'');
export const validPhone=p=>/^01\d{9}$/.test(p);
export async function sign(secret,data,ttl=7*864e5){
  const p=b64(enc.encode(JSON.stringify({...data,exp:Date.now()+ttl})));
  return p+'.'+b64(await crypto.subtle.sign('HMAC',await hkey(secret),enc.encode(p)));
}
export async function verify(secret,tok){
  try{
    const[p,s]=String(tok||'').split('.');
    const good=b64(await crypto.subtle.sign('HMAC',await hkey(secret),enc.encode(p)));
    if(good!==s)return null;
    const d=JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));
    return d.exp>Date.now()?d:null;
  }catch(e){return null}
}
export async function settings(DB){
  const{results}=await DB.prepare('SELECT k,v FROM nx_settings').all();
  const o={};
  for(const r of results){try{o[r.k]=JSON.parse(r.v)}catch(e){o[r.k]=r.v}}
  return o;
}