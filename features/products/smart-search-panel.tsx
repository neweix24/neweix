"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
type Product = { id: string; name: string; slug: string; description: string | null; price: number; compare_at_price: number | null; image_urls: string[] | null; stock: number; sku: string | null; relevance_score?: number };
type SearchResponse = { data?: Product[]; ai?: { used?: boolean; mode?: string }; error?: string };
function money(value: number) { return new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value); }
export default function SmartSearchPanel() {
 const [query,setQuery]=useState(""); const [products,setProducts]=useState<Product[]>([]); const [loading,setLoading]=useState(false); const [aiUsed,setAiUsed]=useState(false); const [error,setError]=useState("");
 const [minPrice,setMinPrice]=useState(""); const [maxPrice,setMaxPrice]=useState(""); const [inStock,setInStock]=useState(false); const [sort,setSort]=useState("relevance"); const [submitted,setSubmitted]=useState(false);
 const abortRef=useRef<AbortController|null>(null);
 async function runSearch(event?:FormEvent) {
  event?.preventDefault(); const term=query.trim(); if(!term){setProducts([]);setSubmitted(false);return;}
  abortRef.current?.abort(); const controller=new AbortController(); abortRef.current=controller; setLoading(true);setError("");setSubmitted(true);
  try { const params=new URLSearchParams({q:term,limit:"24",sort}); if(minPrice)params.set("minPrice",minPrice);if(maxPrice)params.set("maxPrice",maxPrice);if(inStock)params.set("inStock","true");
   const response=await fetch("/api/search?"+params.toString(),{cache:"no-store",signal:controller.signal}); const result=await response.json() as SearchResponse;
   if(!response.ok)throw new Error(result.error||"সার্চ করা যায়নি।");setProducts(Array.isArray(result.data)?result.data:[]);setAiUsed(Boolean(result.ai?.used));
  } catch(reason) { if(reason instanceof Error&&reason.name==="AbortError")return;setError(reason instanceof Error?reason.message:"সার্চ করা যায়নি।");setProducts([]); }
  finally { if(!controller.signal.aborted)setLoading(false); }
 }
 useEffect(()=>()=>abortRef.current?.abort(),[]);
 return <section aria-labelledby="smart-search-title" style={{width:"min(1160px, calc(100% - 32px))",margin:"32px auto",padding:20,border:"1px solid var(--border, #d8dfd8)",borderRadius:16}}>
  <div style={{marginBottom:14}}><p style={{margin:0,fontSize:12,fontWeight:800,letterSpacing:1.2}}>NEWEIX SMART SEARCH</p><h2 id="smart-search-title" style={{margin:"6px 0",fontSize:24}}>AI দিয়ে পণ্য খুঁজুন</h2><p style={{margin:0,opacity:.75}}>পণ্যের নাম, SKU অথবা নিজের প্রয়োজন বাংলায়, ইংরেজিতে বা Banglish-এ লিখুন।</p></div>
  <form onSubmit={runSearch} role="search"><label htmlFor="neweix-ai-search" className="sr-only">পণ্য খুঁজুন</label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <input id="neweix-ai-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="যেমন: ২০ হাজার টাকার মধ্যে ভালো ক্যামেরার ফোন" maxLength={160} style={{flex:"1 1 260px",minHeight:46,padding:"10px 14px",border:"1px solid var(--border, #cbd5cb)",borderRadius:10}}/>
   <button type="submit" disabled={loading||!query.trim()} style={{minHeight:46,padding:"10px 20px",borderRadius:10,fontWeight:800,background:"var(--primary, #c4f36b)",color:"#14200e"}}>{loading?"খুঁজছে…":"খুঁজুন"}</button></div>
   <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginTop:12}}>
    <input aria-label="সর্বনিম্ন দাম" type="number" min="0" value={minPrice} onChange={e=>setMinPrice(e.target.value)} placeholder="সর্বনিম্ন দাম" style={{width:130,minHeight:38,padding:8,border:"1px solid var(--border, #cbd5cb)",borderRadius:8}}/>
    <input aria-label="সর্বোচ্চ দাম" type="number" min="0" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} placeholder="সর্বোচ্চ দাম" style={{width:130,minHeight:38,padding:8,border:"1px solid var(--border, #cbd5cb)",borderRadius:8}}/>
    <label style={{display:"flex",alignItems:"center",gap:6}}><input type="checkbox" checked={inStock} onChange={e=>setInStock(e.target.checked)}/>শুধু স্টকে আছে</label>
    <select aria-label="ফলাফল সাজান" value={sort} onChange={e=>setSort(e.target.value)} style={{minHeight:38,padding:7,border:"1px solid var(--border, #cbd5cb)",borderRadius:8}}><option value="relevance">প্রাসঙ্গিকতা</option><option value="price_asc">দাম: কম থেকে বেশি</option><option value="price_desc">দাম: বেশি থেকে কম</option><option value="newest">নতুন পণ্য</option></select>
    {submitted&&<button type="button" onClick={()=>{setQuery("");setProducts([]);setSubmitted(false);setError("");}}>মুছুন</button>}</div></form>
  {submitted&&<p role="status" aria-live="polite" style={{margin:"14px 0 8px",fontSize:13}}>{loading?"পণ্য খোঁজা হচ্ছে…":error||products.length+"টি পণ্য পাওয়া গেছে"}{!loading&&!error&&aiUsed?" · AI Semantic Search সক্রিয়":""}</p>}
  {error&&<p role="alert">{error}</p>}{submitted&&!loading&&!error&&products.length===0&&<p>পণ্য পাওয়া যায়নি। অন্য শব্দ, বানান বা দামের সীমা দিয়ে চেষ্টা করুন।</p>}
  {products.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 210px), 1fr))",gap:14,marginTop:14}}>{products.map(p=><article key={p.id} style={{overflow:"hidden",border:"1px solid var(--border, #d8dfd8)",borderRadius:12}}>
   <Link href={"/products/"+encodeURIComponent(p.slug)} style={{display:"block",aspectRatio:"1 / 1",background:"var(--surface, #f3f5f1)"}}>{p.image_urls?.[0]?<img src={p.image_urls[0]} alt={p.name} loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{display:"grid",height:"100%",placeItems:"center"}}>NEWEIX</span>}</Link>
   <div style={{padding:12}}><Link href={"/products/"+encodeURIComponent(p.slug)} style={{fontWeight:750}}>{p.name}</Link><p style={{margin:"7px 0",fontWeight:800}}>{money(Number(p.price))}</p><small>{p.stock>0?"স্টকে আছে":"স্টক শেষ"}{p.sku?" · SKU: "+p.sku:""}</small></div></article>)}</div>}</section>;
}