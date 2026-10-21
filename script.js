const products = [
 {id:1,name:"ওয়্যারলেস ইয়ারবাড",category:"ইলেকট্রনিকস",price:1250,oldPrice:1590,emoji:"🎧",tag:"জনপ্রিয়",description:"দৈনন্দিন ব্যবহারের জন্য ওয়্যারলেস ইয়ারবাড।"},
 {id:2,name:"ক্যাজুয়াল ব্যাকপ্যাক",category:"ফ্যাশন",price:950,oldPrice:1200,emoji:"🎒",tag:"সাশ্রয়ী",description:"কাজ, পড়াশোনা ও ভ্রমণের জন্য ব্যাগ।"},
 {id:3,name:"স্মার্ট ওয়াচ",category:"ইলেকট্রনিকস",price:1850,oldPrice:2200,emoji:"⌚",tag:"নতুন",description:"স্টাইলিশ স্মার্ট ওয়াচের নমুনা পণ্য।"},
 {id:4,name:"কটন টি-শার্ট",category:"ফ্যাশন",price:450,oldPrice:550,emoji:"👕",tag:"",description:"আরামদায়ক দৈনন্দিন টি-শার্ট।"},
 {id:5,name:"টেবিল ল্যাম্প",category:"ঘর ও জীবনযাপন",price:780,oldPrice:950,emoji:"💡",tag:"",description:"পড়ার টেবিল বা ঘরের জন্য ল্যাম্প।"},
 {id:6,name:"স্কিন কেয়ার সেট",category:"বিউটি",price:890,oldPrice:1100,emoji:"🧴",tag:"",description:"ব্যক্তিগত যত্নের জন্য নমুনা সেট।"},
 {id:7,name:"ব্লুটুথ স্পিকার",category:"ইলেকট্রনিকস",price:1450,oldPrice:1750,emoji:"🔊",tag:"জনপ্রিয়",description:"ছোট আকারের পোর্টেবল স্পিকার।"},
 {id:8,name:"পানির বোতল",category:"ঘর ও জীবনযাপন",price:320,oldPrice:400,emoji:"🥤",tag:"",description:"প্রতিদিন সঙ্গে রাখার পানির বোতল।"}
];
const fmt = n => "৳" + new Intl.NumberFormat("bn-BD").format(n);
const grid = document.getElementById("productGrid");
const empty = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
let category = "সব";
let query = "";
let cart = JSON.parse(localStorage.getItem("neweix-cart") || "[]");
let toastTimer;
function showToast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2600);}
function renderProducts(){
 let list=products.filter(p=>(category==="সব"||p.category===category)&&(`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(query.toLowerCase())));
 if(sortSelect.value==="low")list.sort((a,b)=>a.price-b.price);
 if(sortSelect.value==="high")list.sort((a,b)=>b.price-a.price);
 grid.innerHTML=list.map(p=>`<article class="product-card"><div class="product-image"><span class="placeholder" aria-hidden="true">${p.emoji}</span>${p.tag?`<span class="tag">${p.tag}</span>`:""}</div><div class="product-info"><span class="product-category">${p.category}</span><h3>${p.name}</h3><div class="price-row"><span class="price">${fmt(p.price)}</span><span class="old-price">${fmt(p.oldPrice)}</span></div><button class="add-btn" data-add="${p.id}">＋ কার্টে যোগ করুন</button></div></article>`).join("");
 empty.hidden=list.length>0;
}
function saveCart(){localStorage.setItem("neweix-cart",JSON.stringify(cart));renderCartCount();}
function renderCartCount(){document.getElementById("cartCount").textContent=cart.reduce((s,i)=>s+i.qty,0);}
function renderCart(){
 const items=document.getElementById("cartItems");
 if(!cart.length){items.innerHTML='<p class="empty-state">আপনার কার্ট এখন খালি।</p>';}
 else items.innerHTML=cart.map(i=>{const p=products.find(x=>x.id===i.id);return `<div class="cart-line"><div><h4>${p.name}</h4><small>${fmt(p.price)} × ${i.qty} = ${fmt(p.price*i.qty)}</small></div><div class="quantity"><button data-dec="${p.id}" aria-label="কমিয়ে দিন">−</button><b>${i.qty}</b><button data-inc="${p.id}" aria-label="বাড়িয়ে দিন">+</button></div></div>`}).join("");
 document.getElementById("cartTotal").textContent=fmt(cart.reduce((s,i)=>s+products.find(p=>p.id===i.id).price*i.qty,0));
}
function addToCart(id){const found=cart.find(i=>i.id===id);if(found)found.qty++;else cart.push({id,qty:1});saveCart();renderCart();showToast("পণ্যটি কার্টে যোগ হয়েছে।");}
function openCart(){document.getElementById("overlay").hidden=false;document.getElementById("cartDrawer").hidden=false;document.body.style.overflow="hidden";renderCart();}
function closeCart(){document.getElementById("overlay").hidden=true;document.getElementById("cartDrawer").hidden=true;document.body.style.overflow="";}
function openCheckout(){if(!cart.length){showToast("অর্ডার করার আগে কার্টে পণ্য যোগ করুন।");return;}closeCart();document.getElementById("checkoutModal").hidden=false;document.body.style.overflow="hidden";}
function closeCheckout(){document.getElementById("checkoutModal").hidden=true;document.body.style.overflow="";}
document.querySelectorAll(".category-chip").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".category-chip").forEach(b=>b.classList.remove("active"));btn.classList.add("active");category=btn.dataset.category;renderProducts();}));
document.getElementById("searchForm").addEventListener("submit",e=>{e.preventDefault();query=searchInput.value.trim();renderProducts();document.getElementById("products").scrollIntoView({behavior:"smooth"});});
searchInput.addEventListener("input",()=>{query=searchInput.value.trim();renderProducts();});
sortSelect.addEventListener("change",renderProducts);
grid.addEventListener("click",e=>{const b=e.target.closest("[data-add]");if(b)addToCart(Number(b.dataset.add));});
document.getElementById("cartOpen").addEventListener("click",openCart);
document.getElementById("cartClose").addEventListener("click",closeCart);
document.getElementById("overlay").addEventListener("click",closeCart);
document.getElementById("cartItems").addEventListener("click",e=>{const dec=e.target.closest("[data-dec]"),inc=e.target.closest("[data-inc]");if(!dec&&!inc)return;const id=Number((dec||inc).dataset[dec?"dec":"inc"]);const item=cart.find(i=>i.id===id);if(inc)item.qty++;else item.qty--;cart=cart.filter(i=>i.qty>0);saveCart();renderCart();});
document.getElementById("checkoutBtn").addEventListener("click",openCheckout);
document.getElementById("checkoutClose").addEventListener("click",closeCheckout);
document.getElementById("checkoutModal").addEventListener("click",e=>{if(e.target.id==="checkoutModal")closeCheckout();});
document.getElementById("checkoutForm").addEventListener("submit",e=>{
 e.preventDefault();
 const form=new FormData(e.currentTarget);
 const order={reference:"NW"+Date.now().toString().slice(-8),customer:{name:form.get("name"),phone:form.get("phone"),address:form.get("address")},payment:form.get("payment"),items:cart.map(i=>({name:products.find(p=>p.id===i.id).name,qty:i.qty,unitPrice:products.find(p=>p.id===i.id).price})),total:cart.reduce((s,i)=>s+products.find(p=>p.id===i.id).price*i.qty,0),createdAt:new Date().toISOString()};
 // Demo only: this order is shown locally and is NOT sent to a store/admin.
 alert("ডেমো অর্ডার রেফারেন্স: "+order.reference+"\\nমোট: "+fmt(order.total)+"\\n\\nগুরুত্বপূর্ণ: এটি শুধু এই ব্রাউজারে তৈরি ডেমো। দোকানদারের কাছে অর্ডার পাঠানো বা সংরক্ষণ করা হয়নি। লাইভ অর্ডারের জন্য সার্ভার/API যুক্ত করতে হবে।");
 closeCheckout();cart=[];saveCart();renderCart();e.currentTarget.reset();
});
document.getElementById("newsletterForm").addEventListener("submit",e=>{e.preventDefault();showToast("এটি ডেমো ফর্ম—ইমেইল এখনো সংরক্ষণ করা হচ্ছে না।");e.currentTarget.reset();});
document.getElementById("aboutLink").addEventListener("click",e=>{e.preventDefault();showToast("আপনার ব্যবসার পরিচিতি যোগ করুন।");});
document.getElementById("deliveryLink").addEventListener("click",e=>{e.preventDefault();showToast("আপনার ডেলিভারি নীতি যোগ করুন।");});
document.getElementById("privacyLink").addEventListener("click",e=>{e.preventDefault();showToast("লাইভ করার আগে গোপনীয়তা নীতি যোগ করুন।");});
document.getElementById("year").textContent=new Date().getFullYear();
renderProducts();renderCartCount();