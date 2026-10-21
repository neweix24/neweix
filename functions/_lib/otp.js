const enc = new TextEncoder();

// OTP কখনো সরাসরি ডাটাবেসে রাখা হয় না, শুধু হ্যাশ
export async function hashOtp(env, phone, code) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(`${env.SESSION_SECRET}:${phone}:${code}`));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// সঠিক হলে null, ভুল হলে বাংলা ত্রুটির বার্তা ফেরত দেয়
export async function checkOtp(env, phone, code) {
  const row = await env.DB.prepare(
    "SELECT code, expires_at, attempts FROM otp_codes WHERE phone = ?").bind(phone).first();
  if (!row || row.expires_at < Date.now()) return "OTP পাঠানো হয়নি বা মেয়াদ শেষ। নতুন OTP নিন";
  if ((row.attempts ?? 0) >= 5) return "অনেকবার ভুল হয়েছে। নতুন OTP নিন";
  if (!/^\d{6}$/.test(code) || row.code !== await hashOtp(env, phone, code)) {
    await env.DB.prepare(
      "UPDATE otp_codes SET attempts = COALESCE(attempts, 0) + 1 WHERE phone = ?").bind(phone).run();
    return "OTP সঠিক নয়";
  }
  return null;
}