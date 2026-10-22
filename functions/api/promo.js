import {json} from '../lib/util.js';

export async function onRequestGet({request,env}){
  const code=(new URL(request.url).searchParams.get('code')||'').trim();
  const p=await env.DB.prepare('SELECT code,type,value,"min",used,"limit",expires FROM nx_promos WHERE active=1 AND lower(code)=lower(?)').bind(code).first();
  const today=new Date().toISOString().slice(0,10);
  const bad=!p||(p.expires&&p.expires<today)||(p.limit>0&&p.used>=p.limit);
  return bad?json({valid:false}):json({valid:true,code:p.code,type:p.type,value:p.value,min:p.min});
}