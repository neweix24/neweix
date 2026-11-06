import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{3}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });

async function authorize() {
  const session = await createServerSupabaseClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { ok: false as const, error: "Authentication required.", status: 401 as const };
  const { data: profile, error: profileError } = await session.from("staff_profiles").select("role,is_active").eq("user_id", user.id).maybeSingle();
  if (profileError || profile?.role !== "supreme" || profile.is_active !== true) return { ok: false as const, error: "Only an active Supreme account can manage riders.", status: 403 as const };
  const { data: assurance, error: mfaError } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError || assurance?.currentLevel !== "aal2") return { ok: false as const, error: "Complete MFA verification.", status: 403 as const };
  return { ok: true as const, userId: user.id };
}
async function db() {
  const { env } = await getCloudflareContext();
  const e = env as Record<string, unknown>;
  const url = e.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = e.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof url !== "string" || typeof key !== "string" || !url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function mapError(message?: string) {
  if (message?.includes("SUPREME_ACTOR_NOT_AUTHORIZED")) return fail("Supreme authorization required.",403);
  if (message?.includes("DELIVERY_ORDER_NOT_FOUND")) return fail("Order not found.",404);
  if (message?.includes("NOT_NEWEIX_OWN_DELIVERY")) return fail("This order is not assigned to NEWEIX delivery.",409);
  if (message?.includes("DELIVERY_ORDER_TERMINAL")) return fail("A cancelled, returned or refunded order cannot be assigned.",409);
  if (message?.includes("DELIVERY_RIDER_NOT_ACTIVE")) return fail("The selected rider is inactive or missing.",409);
  if (message?.includes("RIDER_ORDER_ASSIGNMENT_MISMATCH")) return fail("Assign this rider to the order before recording payment.",409);
  if (message?.includes("23505")) return fail("This rider phone number or reference already exists.",409);
  return fail("Could not complete the rider operation.",400);
}
export async function GET() {
  try {
    const actor=await authorize(); if(!actor.ok) return fail(actor.error,actor.status);
    const supabase=await db();
    const [ridersResult,ordersResult,paymentsResult]=await Promise.all([
      supabase.from("neweix_delivery_riders").select("id,rider_code,full_name,phone,is_active,created_at").order("created_at",{ascending:false}),
      supabase.from("orders").select("id,order_number,status,delivery_status,delivery_fee,created_at,neweix_delivery_rider_id").eq("delivery_provider","neweix_own").not("status","in","(cancelled,returned,refunded)").order("created_at",{ascending:false}).limit(200),
      supabase.from("delivery_cost_entries").select("id,order_id,rider_id,amount,cost_date,source_reference,notes,created_at").eq("provider","neweix_own").eq("cost_type","rider_payment").order("cost_date",{ascending:false}).limit(200),
    ]);
    if(ridersResult.error||ordersResult.error||paymentsResult.error) {
      console.error("Rider dashboard query failed:",ridersResult.error?.message,ordersResult.error?.message,paymentsResult.error?.message);
      return fail("Could not load rider information.",503);
    }
    const orderMap=new Map((ordersResult.data??[]).map(o=>[o.id,o.order_number]));
    const riderMap=new Map((ridersResult.data??[]).map(r=>[r.id,r.full_name]));
    const payments=(paymentsResult.data??[]).map(p=>({...p,order_number:orderMap.get(p.order_id)??null,rider_name:riderMap.get(p.rider_id)??"রাইডার অনুপস্থিত"}));
    const totals=new Map<string,number>();
    for(const p of payments) if(p.rider_id) totals.set(p.rider_id,(totals.get(p.rider_id)??0)+Number(p.amount));
    return NextResponse.json({success:true,riders:(ridersResult.data??[]).map(r=>({...r,total_paid:totals.get(r.id)??0})),orders:ordersResult.data??[],payments},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { console.error("Rider GET failed:",error); return fail("A server error occurred.",500); }
}
export async function POST(request:Request) {
  try {
    const actor=await authorize(); if(!actor.ok) return fail(actor.error,actor.status);
    const raw=await request.text(); if(new TextEncoder().encode(raw).byteLength>8192) return fail("Request too large.",413);
    let body:unknown; try{body=JSON.parse(raw);}catch{return fail("Invalid JSON.",400);}
    if(!body||typeof body!=="object"||Array.isArray(body)) return fail("Invalid rider request.",400);
    const input=body as Record<string,unknown>; const supabase=await db();
    let data:unknown=null; let error:{message:string}|null=null;
    if(input.action==="create_rider") {
      if(typeof input.full_name!=="string"||typeof input.phone!=="string"||(input.notes!=null&&typeof input.notes!=="string")) return fail("Provide rider name and phone.",400);
      ({data,error}=await supabase.rpc("supreme_create_delivery_rider",{p_actor_id:actor.userId,p_full_name:input.full_name,p_phone:input.phone,p_notes:input.notes??null}));
    } else if(input.action==="assign_rider") {
      if(typeof input.order_id!=="string"||!UUID.test(input.order_id)||typeof input.rider_id!=="string"||!UUID.test(input.rider_id)) return fail("Select a valid order and rider.",400);
      ({data,error}=await supabase.rpc("supreme_assign_delivery_rider",{p_actor_id:actor.userId,p_order_id:input.order_id,p_rider_id:input.rider_id}));
    } else if(input.action==="record_payment") {
      if(typeof input.order_id!=="string"||!UUID.test(input.order_id)||typeof input.rider_id!=="string"||!UUID.test(input.rider_id)) return fail("Select a valid assigned order and rider.",400);
      if(typeof input.amount!=="number"||!Number.isFinite(input.amount)||input.amount<=0||input.amount>1000000000||Math.round(input.amount*100)!==input.amount*100) return fail("Enter a valid amount up to two decimal places.",400);
      if(typeof input.cost_date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(input.cost_date)) return fail("Select a valid payment date.",400);
      if(typeof input.source_type!=="string"||!["manual_receipt","cashbook","other"].includes(input.source_type)) return fail("Select a valid payment source.",400);
      if(input.source_reference!=null&&typeof input.source_reference!=="string") return fail("Invalid payment reference.",400);
      if(input.notes!=null&&typeof input.notes!=="string") return fail("Invalid payment note.",400);
      ({data,error}=await supabase.rpc("supreme_record_rider_payment",{p_actor_id:actor.userId,p_order_id:input.order_id,p_rider_id:input.rider_id,p_amount:input.amount,p_cost_date:input.cost_date,p_source_type:input.source_type,p_source_reference:input.source_reference??null,p_notes:input.notes??null}));
    } else return fail("Unknown rider action.",400);
    if(error){console.error("Rider operation failed:",error.message);return mapError(error.message);}
    return NextResponse.json({success:true,data},{status:201,headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { console.error("Rider POST failed:",error); return fail("A server error occurred.",500); }
}
