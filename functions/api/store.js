import {json,settings} from '../lib/util.js';

export async function onRequestGet({env}){
  const DB=env.DB,s=await settings(DB);
  const[c,p]=await Promise.all([
    DB.prepare('SELECT id,name FROM nx_categories WHERE active=1 ORDER BY sort').all(),
    DB.prepare('SELECT id,name,price,"old",cat,img,stock FROM nx_products WHERE active=1 ORDER BY rowid DESC').all()
  ]);
  const L=a=>a.filter(x=>x.u);
  return json({
    shopOpen:s.open!==false,
    bullet:s.bulletOn===false?'':(s.bullet||''),
    categories:c.results,
    products:p.results,
    policies:L([{t:'রিটার্ন পলিসি',u:s.returnUrl},{t:'প্রাইভেসি পলিসি',u:s.privacyUrl}]),
    contact:L([{t:'WhatsApp',u:s.whatsapp},{t:'ইমেইল',u:s.email&&'mailto:'+s.email}]),
    social:L([{t:'Facebook',u:s.facebook}])
  });
}