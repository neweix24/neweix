// functions/api/supreme-login.js
export async function onRequestPost(context) {
  const { request } = context;
  
  // আপনার Supabase URL এবং Key (এখানে সরাসরি দেওয়া হলো যাতে সহজে কাজ করে)
  const SUPABASE_URL = 'https://grhybvlhdnzlopwbaqun.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyaHlidmxoZG56bG9wd2JhcXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NDYyMjEsImV4cCI6MjEwODIyMjIyMX0.27nR0VFbxwVYQKb5A06BRwizp02CHAmoD9IRMwiJ0Ss';

  try {
    const { email, password } = await request.json();

    // ১. Supabase Auth দিয়ে পাসওয়ার্ড চেক
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    if (!authRes.ok) {
      return new Response(JSON.stringify({ error: 'ভুল ইমেইল বা পাসওয়ার্ড!' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const authData = await authRes.json();
    const userId = authData.user.id;

    // ২. ডাটাবেস থেকে রোল চেক (সুপ্রিম কি না)
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/admins?id=eq.${userId}&select=role`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${authData.access_token}`
      }
    });

    const dbData = await dbRes.json();

    if (!dbData || dbData.length === 0 || dbData[0].role !== 'supreme') {
      return new Response(JSON.stringify({ error: 'আপনি সুপ্রিম নন! অ্যাক্সেস ডিনাইড।' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // ৩. সফল হলে টোকেন পাঠানো
    return new Response(JSON.stringify({ success: true, token: authData.access_token }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'সার্ভার সমস্যা হয়েছে!' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}