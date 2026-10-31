"use client";
import { useCallback,useEffect,useState } from "react";
type Mission={id:string;title:string;mission_type:string;reward_amount:number;total_claims:number;max_total_claims:number;is_enabled:boolean};
type Campaign={id:string;title:string;description:string;status:string;starts_at:string;ends_at:string;max_total_claims:number;max_claims_per_user:number;total_claims:number;missions:Mission[]};
export default function EixVerseCampaignControl(){
 const [rows,setRows]=useState<Campaign[]>([]);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 const [title,setTitle]=useState("");const [description,setDescription]=useState("");const [start,setStart]=useState("");const [end,setEnd]=useState("");const [budget,setBudget]=useState("100");const [campaignId,setCampaignId]=useState("");
 const [missionTitle,setMissionTitle]=useState("");const [missionType,setMissionType]=useState("daily_checkin");const [reward,setReward]=useState("5");const [missionBudget,setMissionBudget]=useState("100");const [status,setStatus]=useState("draft");
 const load=useCallback(async()=>{const r=await fetch("/api/supreme/eixverse/campaigns",{cache:"no-store"});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error||"Campaign লোড করা যায়নি");setRows(Array.isArray(j.campaigns)?j.campaigns:[]);},[]);
 useEffect(()=>{void load().catch(e=>setMessage(e.message));},[load]);
 async function save(action:"campaign"|"mission",data:Record<string,unknown>){setBusy(true);setMessage("");try{const r=await fetch("/api/supreme/eixverse/campaigns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,data})});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error||"সংরক্ষণ ব্যর্থ");setMessage("পরিবর্তন সংরক্ষিত হয়েছে।");await load();}catch(e){setMessage(e instanceof Error?e.message:"সংরক্ষণ ব্যর্থ");}finally{setBusy(false);}}
 return <section className="space-y-6 text-white">
  {message&&<p className="rounded-xl border border-white/10 p-3 text-sm">{message}</p>}
  <form onSubmit={e=>{e.preventDefault();void save("campaign",{...(campaignId?{id:campaignId}:{}),title,description,starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),max_total_claims:Number(budget),max_claims_per_user:1,status});}} className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
   <h2 className="text-xl font-bold">নতুন Campaign তৈরি</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">
    <input required minLength={3} maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Campaign নাম" className="rounded-xl bg-black/30 p-3"/>
    <input required type="number" min="1" max="1000000" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="সর্বোচ্চ Claim" className="rounded-xl bg-black/30 p-3"/>
    <select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-xl bg-black/30 p-3"><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active (সময় এখন চলমান হতে হবে)</option><option value="paused">Paused</option><option value="closed">Closed</option></select>
    <input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} className="rounded-xl bg-black/30 p-3"/>
    <input required type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} className="rounded-xl bg-black/30 p-3"/>
    <textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000} placeholder="বিবরণ" className="rounded-xl bg-black/30 p-3 sm:col-span-2"/>
   </div><button disabled={busy} className="mt-4 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-black text-black disabled:opacity-40">Campaign সংরক্ষণ</button>
  </form>
  <form onSubmit={e=>{e.preventDefault();void save("mission",{campaign_id:campaignId,title:missionTitle,mission_type:missionType,reward_amount:Number(reward),max_total_claims:Number(missionBudget),max_claims_per_user:1,is_enabled:true});}} className="rounded-2xl border border-white/10 bg-white/[.04] p-5">
   <h2 className="text-xl font-bold">Mission যোগ করুন</h2><p className="mt-1 text-xs text-white/45">আগে Campaign তালিকা থেকে একটি Campaign নির্বাচন করুন।</p><div className="mt-4 grid gap-3 sm:grid-cols-2">
    <select required value={campaignId} onChange={e=>setCampaignId(e.target.value)} className="rounded-xl bg-black/30 p-3"><option value="">Campaign নির্বাচন</option>{rows.filter(c=>c.status!=="closed").map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select>
    <input required minLength={3} maxLength={120} value={missionTitle} onChange={e=>setMissionTitle(e.target.value)} placeholder="Mission নাম" className="rounded-xl bg-black/30 p-3"/>
    <select value={missionType} onChange={e=>setMissionType(e.target.value)} className="rounded-xl bg-black/30 p-3"><option value="daily_checkin">Daily Check-in</option><option value="delivered_order">Delivered Order (৭ দিন পর)</option><option value="verified_review">Verified Review</option><option value="qualified_referral">Qualified Referral</option></select>
    <input required type="number" min="1" max="1000000" value={reward} onChange={e=>setReward(e.target.value)} placeholder="Eixon reward" className="rounded-xl bg-black/30 p-3"/>
    <input required type="number" min="1" max="1000000" value={missionBudget} onChange={e=>setMissionBudget(e.target.value)} placeholder="সর্বোচ্চ Claim" className="rounded-xl bg-black/30 p-3"/>
   </div><button disabled={busy||!campaignId} className="mt-4 rounded-xl border border-emerald-200/30 px-5 py-3 text-sm font-bold text-emerald-100 disabled:opacity-40">Mission সংরক্ষণ ও চালু</button>
  </form>
  <div className="space-y-3"><h2 className="text-xl font-bold">Campaign তালিকা</h2>{rows.map(c=><article key={c.id} className="rounded-2xl border border-white/10 p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{c.title}</h3><p className="mt-1 text-xs text-white/45">{c.status} · {c.total_claims}/{c.max_total_claims} Claims</p></div><button onClick={()=>{setCampaignId(c.id);setTitle(c.title);setDescription(c.description);setStatus(c.status);setStart(new Date(c.starts_at).toISOString().slice(0,16));setEnd(new Date(c.ends_at).toISOString().slice(0,16));setBudget(String(c.max_total_claims));setMessage("Campaign নির্বাচন করা হয়েছে। উপরের ফর্মে পরিবর্তন করে সংরক্ষণ করতে পারবেন।");}} className="text-xs font-bold text-emerald-200 underline">Mission যোগের জন্য নির্বাচন</button></div><div className="mt-3 space-y-2">{c.missions.map(m=><p key={m.id} className="text-sm text-white/70">{m.title} · {m.mission_type} · {m.reward_amount} Eixon · {m.total_claims}/{m.max_total_claims} {m.is_enabled?"· Enabled":"· Disabled"}</p>)}</div></article>)}</div>
  <p className="text-xs leading-5 text-amber-100/60">নোট: Campaign Draft অবস্থায় তৈরি হয়। Eixon পুরস্কার পেতে EixPay earning এবং campaign_action rule Supreme-কে আলাদাভাবে চালু করতে হবে।</p>
 </section>;
}
