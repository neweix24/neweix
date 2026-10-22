import {json,sign,verify,uid} from '../../lib/util.js';

const T={
  categories:{t:'nx_categories',c:['name','sort','active'],o:'sort'},
  products:{t:'nx_products',c:['name','price','old','cat','stock','img','desc','active'],o:'rowid DESC'},
  promos:{t:'nx_promos',c:['code','type','value','min','limit','expires','active'],o:'rowid DESC'},
  landing:{t:'nx_landing',c:['slug','title','banner','body','products','active'],o:'rowid DESC'}
};
const STATUS=['pending','confirmed','shipped','delivered','cancelled'];
const val=v=>v===true?1:v===false?0:v===undefined?null:v;

export async function onRequest({request,env,params}){
  const DB=env.DB,m=request.method,seg=params.path||[],a=seg[0];
  if(!env.ADMIN_PASSWORD||!env.ADMIN_SECRET)return json({error:'ADMIN_PASSWORD/ADMIN_SECRET সেট করা নেই'},500);

  if(a==='login'&&m==='POST'){
    const b=await request.json().catch(()=>({}));
    const user=env.ADMIN_USER||env.ADMIN_USERNAME;
    if((user&&b.username!==user)||b.password!==env.ADMIN_PASSWORD){await new Promise(r=>setTimeout(r,800));return json({error:'bad'},401)}
    return json({token:await sign(env.ADMIN_SECRET,{role:'admin'})});
  }

  const u=await verify(env.ADMIN_SECRET,(request.headers.get('Authorization')||'').replace('Bearer ',''));
  if(!u||u.role!=='admin')return json({error:'auth'},401);
  const body=m==='POST'?await request.json().catch(()=>({})):{};

  if(T[a]){
    const c=T[a],cols=c.c.map(k=>`"${k}"`);
    if(m==='GET'){const{results}=await DB.prepare(`SELECT * FROM ${c.t} ORDER BY ${c.o}`).all();return json(results)}
    if(m==='POST'){
      const vals=c.c.map(k=>val(body[k]));
      try{
        if(body.id){
          await DB.prepare(`UPDATE ${c.t} SET ${cols.map(k=>k+'=?').join(',')} WHERE id=?`).bind(...vals,body.id).run();
          return json({id:body.id});
        }
        const id=uid();
        await DB.prepare(`INSERT INTO ${c.t} (id,${cols.join(',')}) VALUES (?${',?'.repeat(cols.length)})`).bind(id,...vals).run();
        return json({id});
      }catch(e){return json({error:'সংরক্ষণ হয়নি (নাম/কোড আগে থেকে থাকতে পারে)'},400)}
    }
    if(m==='DELETE'){
      await DB.prepare(`DELETE FROM ${c.t} WHERE id=?`).bind(new URL(request.url).searchParams.get('id')).run();
      return json({ok:1});
    }
  }

  if(a==='orders'||a==='delivery'){
    if(m==='GET'){
      const w=a==='delivery'?"WHERE status!='cancelled'":'';
      const{results}=await DB.prepare(`SELECT * FROM nx_orders ${w} ORDER BY created DESC LIMIT 200`).all();
      return json(results);
    }
    if(m==='POST'){
      if(!STATUS.includes(body.status))return json({error:'status'},400);
      await DB.prepare('UPDATE nx_orders SET status=?,courier=COALESCE(?,courier),tracking=COALESCE(?,tracking) WHERE id=?')
        .bind(body.status,body.courier??null,body.tracking??null,body.id).run();
      return json({ok:1});
    }
  }

  if(a==='customers'&&m==='GET'){
    const{results}=await DB.prepare('SELECT * FROM nx_customers ORDER BY joined DESC LIMIT 500').all();
    return json(results);
  }

  if(a==='settings'){
    const{results}=await DB.prepare('SELECT k,v FROM nx_settings').all();
    if(m==='GET'){
      const o={};for(const r of results){try{o[r.k]=JSON.parse(r.v)}catch(e){o[r.k]=r.v}}
      return json(o);
    }
    if(m==='POST'){
      const st=Object.entries(body).map(([k,v])=>DB.prepare('INSERT INTO nx_settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k,JSON.stringify(v)));
      if(st.length)await DB.batch(st);
      return json({ok:1});
    }
  }

  if(a==='analytics'&&m==='GET'){
    const D="date(created,'+6 hours')=date('now','+6 hours')";
    const[tot,td,cu,pe,top]=await Promise.all([
      DB.prepare("SELECT COUNT(*) n,COALESCE(SUM(total),0) s FROM nx_orders WHERE status!='cancelled'").first(),
      DB.prepare(`SELECT COUNT(*) n,COALESCE(SUM(total),0) s FROM nx_orders WHERE status!='cancelled' AND ${D}`).first(),
      DB.prepare('SELECT COUNT(*) n FROM nx_customers').first(),
      DB.prepare("SELECT COUNT(*) n FROM nx_orders WHERE status='pending'").first(),
      DB.prepare("SELECT json_extract(j.value,'$.name') name,SUM(json_extract(j.value,'$.q')) qty FROM nx_orders o,json_each(o.items) j WHERE o.status!='cancelled' GROUP BY name ORDER BY qty DESC LIMIT 5").all()
    ]);
    return json({orders:tot.n,revenue:tot.s,today:td.n,todaySales:td.s,customers:cu.n,pending:pe.n,top:top.results});
  }

  return json({error:'not found'},404);
}