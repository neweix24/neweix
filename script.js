const menuToggle = document.getElementById('menuToggle'), nav = document.querySelector('nav');
if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => nav.classList.toggle('open'));
  nav.querySelectorAll('a').forEach(l => l.addEventListener('click', () => nav.classList.remove('open')));
}
const yr = document.getElementById('year'); if (yr) yr.textContent = new Date().getFullYear();

const $ = id => document.getElementById(id);
const tk = n => '৳' + Number(n).toLocaleString('en-US');
const DELIVERY = { dhaka: 80, other: 130 }; // সার্ভারের orders/index.js-এর সাথে একই রাখুন
let products = [], cart = [];
try { cart = JSON.parse(localStorage.getItem('neweix_cart') || '[]'); } catch {}
const save = () => { try { localStorage.setItem('neweix_cart', JSON.stringify(cart)); } catch {} };
function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }

async function loadProducts() {
  const box = $('products');
  try {
    const d = await (await fetch('/api/products')).json();
    products = d.products || [];
    box.replaceChildren();
    if (!products.length) box.textContent = 'শীঘ্রই পণ্য আসছে।';
    products.forEach(p => {
      const c = el('article', null, 'pcard');
      if (p.image_url && p.image_url.startsWith('https://')) { const i = el('img'); i.src = p.image_url; i.alt = p.name; i.loading = 'lazy'; c.append(i); }
      c.append(el('h3', p.name), el('p', p.category || '', 'pcat'), el('strong', tk(p.price)));
      const b = el('button', p.stock > 0 ? 'কার্টে যোগ করুন' : 'স্টক শেষ', 'btn'); b.disabled = p.stock < 1;
      b.onclick = () => add(p.id); c.append(b); box.append(c);
    });
  } catch { box.textContent = 'পণ্য লোড করা যায়নি। পেজ রিফ্রেশ করুন।'; }
  render();
}
function add(id) {
  const p = products.find(x => x.id === id), l = cart.find(x => x.id === id), q = (l ? l.qty : 0) + 1;
  if (!p || q > p.stock || q > 20) return;
  if (l) l.qty = q; else cart.push({ id, qty: 1 });
  save(); render(); $('cart').classList.add('show');
}
function render() {
  cart = cart.filter(i => products.some(p => p.id === i.id));
  const box = $('cartItems'); box.replaceChildren(); let sub = 0, n = 0;
  cart.forEach(i => {
    const p = products.find(x => x.id === i.id); sub += p.price * i.qty; n += i.qty;
    const row = el('div', null, 'crow'); row.append(el('span', p.name + ' × ' + i.qty), el('span', tk(p.price * i.qty)));
    const rm = el('button', '✕', 'x'); rm.onclick = () => { cart = cart.filter(x => x !== i); save(); render(); };
    row.append(rm); box.append(row);
  });
  $('cartCount').textContent = n;
  const d = DELIVERY[$('area').value];
  $('cartTotal').textContent = cart.length ? 'সাবটোটাল ' + tk(sub) + ' + ডেলিভারি ' + tk(d) + ' = ' + tk(sub + d) : 'কার্ট খালি';
  $('orderForm').hidden = !cart.length;
}
$('cartBtn').onclick = () => $('cart').classList.toggle('show');
$('closeCart').onclick = () => $('cart').classList.remove('show');
$('area').onchange = render;
$('otpBtn').onclick = async () => {
  const b = $('otpBtn'), m = $('msg');
  b.disabled = true; m.textContent = 'OTP পাঠানো হচ্ছে...';
  try {
    const r = await fetch('/api/otp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: $('orderForm').elements.phone.value }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'OTP যায়নি');
    m.textContent = 'আপনার ফোনে OTP পাঠানো হয়েছে।';
    let s = 60; const t = setInterval(() => { b.textContent = --s + 's'; if (s <= 0) { clearInterval(t); b.textContent = 'আবার পাঠান'; b.disabled = false; } }, 1000);
  } catch (e) { m.textContent = 'সমস্যা: ' + e.message; b.disabled = false; }
};
$('orderForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target, b = f.querySelector('button[type=submit]'), m = $('msg'), F = f.elements;
  b.disabled = true; m.textContent = 'অর্ডার হচ্ছে...';
  try {
    const r = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: F.name.value, phone: F.phone.value, otp: F.otp.value, address: F.address.value, area: F.area.value, items: cart }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'অর্ডার হয়নি');
    cart = []; save(); f.reset(); $('otpBtn').textContent = 'OTP পাঠান';
    m.textContent = '✅ অর্ডার সফল! অর্ডার নম্বর #' + d.order_id + '। মোট ' + tk(d.total) + ' (ক্যাশ অন ডেলিভারি)। আমরা ফোন করে নিশ্চিত করব।';
    await loadProducts();
  } catch (e) { m.textContent = 'সমস্যা: ' + e.message; } finally { b.disabled = false; }
});
loadProducts();