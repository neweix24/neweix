import { hashOtp } from "../../_lib/otp.js";

const err = (m, s = 400) => Response.json({ error: m }, { status: s });

export async function onRequestPost({ request, env }) {
  try {
    if (!env.BULKSMS_API_KEY || !env.BULKSMS_SENDER_ID || !env.SESSION_SECRET)
      return err("SMS সেটআপ অসম্পূর্ণ", 500);

    const { phone } = await request.json();
    if (!/^01[3-9]\d{8}$/.test(String(phone ?? ""))) return err("সঠিক মোবাইল নম্বর দিন");

    // ৬০ সেকেন্ডের আগে আবার পাঠানো যাবে না (SMS ক্রেডিট বাঁচাতে)
    const old = await env.DB.prepare(
      "SELECT expires_at FROM otp_codes WHERE phone = ?").bind(phone).first();
    if (old && old.expires_at - Date.now() > 240000)
      return err("৬০ সেকেন্ড পর আবার চেষ্টা করুন", 429);

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    await env.DB.prepare(
      `INSERT INTO otp_codes (phone, code, expires_at, attempts) VALUES (?, ?, ?, 0)
       ON CONFLICT(phone) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0`
    ).bind(phone, await hashOtp(env, phone, code), Date.now() + 5 * 60 * 1000).run();

    const url = "https://bulksmsbd.net/api/smsapi?" + new URLSearchParams({
      api_key: env.BULKSMS_API_KEY,
      type: "text",
      number: "88" + phone,
      senderid: env.BULKSMS_SENDER_ID,
      message: `Neweix OTP: ${code}. Valid for 5 minutes. Do not share this code.`
    });
    const j = await (await fetch(url)).json().catch(() => ({}));

    if (Number(j.response_code) !== 202) {
      await env.DB.prepare("DELETE FROM otp_codes WHERE phone = ?").bind(phone).run();
      return err("SMS পাঠানো যায়নি, কিছুক্ষণ পর চেষ্টা করুন", 502);
    }
    return Response.json({ success: true });
  } catch {
    return err("OTP পাঠানো যায়নি", 500);
  }
}