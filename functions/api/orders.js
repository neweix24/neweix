import {json,settings,uid,normPhone,validPhone} from '../lib/util.js';

export async function onRequestPost({request,env}){
  const DB=env.DB,b=await request.json().catch(()=>({}));
  const s=await settings(DB);
  if(s.open===false)return json({error:'দোকান এখন বন্ধ'},503);

  const name=String(b.name||'').trim().slice(0,80);
  const address=String(b.address||'').trim().slice(0,300);
  const phone=normPhone(b.phone);
  const items=(Array.isArray(b.items)?b.items:[]).filter(i=>i&&i.id&&i.q>0).slice(0,50);
  if(!name||!address||!validPhone(phone)||!items.length)return json({error:'তথ্য সঠিক নয়'},400);

  // দাম ও স্টক সবসময় ডাটাবেস থেকে নেওয়া হয়, ব্রাউজারের দাম বিশ্বাস করা হয় না
  const ids=items.map(i=>i.id);
  const{results}=await DB.prepare(`SELECT id,name,price,stock FROM nx_products WHERE active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all();
  const by=Object.fromEntries(results.map(r=>[r.id,r]));
  const lines=[];
  for(const i of items){
    const p=by[i.id],q=Math.floor(+i.q);
    if(!p)return json({error:'একটি পণ্য আর পাওয়া যায় না'},409);
    if(p.stock<q)return json({error:p.name+' এর স্টক কম আছে'},409);
    lines.push({id:p.id,name:p.name,price:p.price,q});
  }
  const subtotal=lines.reduce((t,l)=>t+l.price*l.q,0);

  let discount=0,promoId=null,promoCode=null;
  if(b.promo){
    const p=await DB.prepare('SELECT * FROM nx_promos WHERE active=1 AND lower(code)=lower(?)').bind(String(b.promo)).first();
    const today=new Date().toISOString().slice(0,10);
    if(p&&!(p.expires&&p.expires<today)&&!(p.limit>0&&p.used>=p.limit)&&subtotal>=(p.min||0)){
      discount=Math.min(subtotal,p.type==='percent'?subtotal*p.value/100:p.value);
      promoId=p.id;promoCode=p.code;
    }
  }
  const total=subtotal-discount;
  const now=new Date().toISOString();
  const orderNo='NX'+Math.floor(100000+Math.random()*900000);
  const itemsText=lines.map(l=>`${l.name} ×${l.q}`).join(', ');

  const st=[
    DB.prepare('INSERT INTO nx_orders(id,orderNo,name,phone,address,itemsText,items,subtotal,discount,total,promo,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(uid(),orderNo,name,phone,address,itemsText,JSON.stringify(lines),subtotal,discount,total,promoCode,'pending',now),
    DB.prepare('INSERT INTO nx_customers(id,phone,name,address,orders,joined) VALUES(?,?,?,?,1,?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,address=excluded.address,orders=orders+1')
      .bind(uid(),phone,name,address,now),
    ...lines.map(l=>DB.prepare('UPDATE nx_products SET stock=stock-?,sold=sold+? WHERE id=? AND stock>=?').bind(l.q,l.q,l.id,l.q))
  ];
  if(promoId)st.push(DB.prepare('UPDATE nx_promos SET used=used+1 WHERE id=?').bind(promoId));
  await DB.batch(st);

  // PART2: এখানে Google Sheets-এ অর্ডার/কাস্টমার পাঠানো হবে
  return json({orderNo,total});
}