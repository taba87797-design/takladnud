const API = "/api/v1";
const $ = selector => document.querySelector(selector);
const notice = $("#notice");
let authMode = "login";
let currentUser = null;
let selectedStall = null;
let noticeTimer;

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
  return body.data;
}

function showNotice(message, error = false) {
  notice.textContent = message;
  notice.classList.toggle("error", error);
  notice.classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove("show"), 4000);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function setAuthState(user) {
  currentUser = user;
  $("#auth-form").classList.toggle("hidden", Boolean(user));
  $("#seller-area").classList.toggle("hidden", !user);
  $("#seller-name").textContent = user ? `สวัสดี ${user.name}` : "";
  $("#account-button").textContent = user ? "บัญชีผู้ขาย" : "เข้าสู่ระบบ";
  if (user) { loadStore(); loadBookings(); } else $("#bookings").replaceChildren();
}

async function loadStalls() {
  const root = $("#stall-list");
  try {
    const rows = await api("/stalls");
    root.innerHTML = rows.length ? rows.map(stall => `<article class="stall-card"><strong>แผง ${escapeHTML(stall.stallCode)}</strong><span>${escapeHTML(stall.locationDescription)} · ${Number(stall.price).toLocaleString("th-TH")} บาท</span><button type="button" data-stall="${Number(stall.stallId)}" ${!stall.isAvailable ? "disabled" : ""}>${stall.isAvailable ? "เลือกแผงนี้" : "ไม่ว่าง"}</button></article>`).join("") : '<p class="empty-state">ยังไม่มีรายการแผงค้า</p>';
    root.querySelectorAll("[data-stall]").forEach(button => button.addEventListener("click", () => beginBooking(button.dataset.stall)));
  } catch (error) { root.innerHTML = `<p class="empty-state">${escapeHTML(error.message)}</p>`; }
}

async function loadStore() {
  try {
    const rows = await api("/me/stores");
    if (!rows[0]) return;
    const store = rows[0];
    const form = $("#store-form");
    form.elements.storeName.value = store.storeName || "";
    form.elements.category.value = store.category || "";
    form.elements.description.value = store.description || "";
    form.elements.contactText.value = store.contactText || "";
    form.dataset.storeId = store.storeId;
    form.querySelector("button[type=submit]").textContent = "บันทึกข้อมูลร้านแล้ว";
  } catch (error) { showNotice(error.message, true); }
}

async function loadBookings() {
  if (!currentUser) return;
  try {
    const rows = await api("/me/bookings");
    const root = $("#bookings");
    root.innerHTML = `<h3>ประวัติการจอง</h3>${rows.length ? rows.map(item => `<div class="booking-item"><span>แผง ${escapeHTML(item.stallCode)} · ${escapeHTML(item.storeName)}<br><small>${escapeHTML(item.status)} · ${Number(item.price).toLocaleString("th-TH")} บาท</small></span>${["pending", "confirmed"].includes(item.status) ? `<button class="text-button" data-cancel="${Number(item.bookingId)}">ยกเลิก</button>` : ""}</div>`).join("") : '<p class="empty-state">ยังไม่มีประวัติการจอง</p>'}`;
    root.querySelectorAll("[data-cancel]").forEach(button => button.addEventListener("click", async () => {
      if (!confirm("ยืนยันยกเลิกการจองนี้?")) return;
      try { await api(`/me/bookings/${button.dataset.cancel}/cancel`, { method: "PATCH" }); showNotice("ยกเลิกการจองแล้ว"); await Promise.all([loadBookings(), loadStalls()]); }
      catch (error) { showNotice(error.message, true); }
    }));
  } catch (error) { showNotice(error.message, true); }
}

const sampleStores = [
  { name: "ครัวบ้านสวน", category: "ร้านอาหาร", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85", description: "อาหารจานอร่อย ปรุงสดใหม่ทุกวัน", featured: true, popular: 98, rating: 4.9, isOpen: true, distance: .3 },
  { name: "ชื่นใจเครื่องดื่ม", category: "ร้านเครื่องดื่ม", image: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=85", description: "ชา กาแฟ และเครื่องดื่มเติมความสดชื่น", featured: true, popular: 92, rating: 4.8, isOpen: true, isNew: true, newOrder: 2, distance: .2 },
  { name: "ของชำป้าพร", category: "ร้านของชำ", image: "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&w=900&q=85", description: "ของใช้จำเป็นใกล้บ้าน แวะง่ายได้ทุกวัน", popular: 74, rating: 4.7, isOpen: false, distance: .5 },
  { name: "สวนผลไม้ริมรั้ว", category: "ร้านผักผลไม้", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=85", description: "ผักสดและผลไม้ตามฤดูกาลจากสวน", featured: true, popular: 85, rating: 4.9, isOpen: true, isNew: true, newOrder: 1, distance: .6 },
  { name: "บ้านขนมอบอุ่น", category: "ร้านขนม", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85", description: "ขนมอบหอมกรุ่นและขนมไทยทำมือ", popular: 81, rating: 4.8, isOpen: true, distance: .4 },
  { name: "ดินสอสีสัน", category: "อุปกรณ์การเรียน", image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=85", description: "สมุด ปากกา และอุปกรณ์การเรียนครบครัน", popular: 61, rating: 4.6, isOpen: false, isNew: true, newOrder: 3, distance: .8 },
  { name: "KFC", category: "ร้านไก่ทอด", image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=900&q=85", description: "ไก่ทอดกรอบและเมนูยอดนิยมจาก KFC", featured: true, popular: 100, rating: 4.9, isOpen: true, distance: .7 },
  { name: "เสื้อผ้าสไตล์ดี", category: "ร้านเสื้อผ้า", image: "/images/shop-clothing.jpg", description: "เสื้อผ้าแฟชั่นใส่สบาย มีหลายสไตล์ให้เลือก", popular: 88, rating: 4.8, isOpen: true, isNew: true, newOrder: 4, distance: .4 },
  { name: "บิวตี้เดย์", category: "ร้านเครื่องสำอาง", image: "/images/shop-cosmetics.jpg", description: "เครื่องสำอางและสกินแคร์ คัดไอเทมยอดนิยม", popular: 79, rating: 4.7, isOpen: true, isNew: true, newOrder: 5, distance: .6 },
  { name: "โมบายครบเครื่อง", category: "อุปกรณ์มือถือ", image: "/images/shop-mobile-accessories.jpg", description: "เคส ฟิล์มกันรอย และอุปกรณ์เสริมมือถือ", popular: 72, rating: 4.6, isOpen: true, distance: .5 },
  { name: "กรุบกรอบ", category: "ของกินเล่น", image: "/images/shop-snacks.jpg", description: "ขนมกินเล่นและของว่างอร่อยๆ สำหรับทุกวัย", popular: 86, rating: 4.8, isOpen: true, isNew: true, newOrder: 6, distance: .3 }
];

let likedStores = JSON.parse(localStorage.getItem("market-liked-stores") || "{}");
let storeLikeCounts = JSON.parse(localStorage.getItem("market-store-like-counts") || "{}");

function storeLikeKey(store) {
  return String(store.storeId ?? `sample:${store.name}`);
}

function storeLikeCount(store) {
  const key = storeLikeKey(store);
  return Number(storeLikeCounts[key] ?? store.likeCount ?? 0);
}

const storeStatus = JSON.parse(localStorage.getItem("market-store-status") || "{}");
const storeReviews = JSON.parse(localStorage.getItem("market-store-reviews") || "{}");
let userLocation = null;

function storeStatusOpen(store) {
  const key = storeLikeKey(store);
  return storeStatus[key] ?? store.isOpen ?? true;
}

function storeReviewList(store) {
  return storeReviews[storeLikeKey(store)] || [];
}

function renderStoreCard(store) {
  const key = storeLikeKey(store);
  const liked = Boolean(likedStores[key]);
  const reviews = storeReviewList(store);
  const avg = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : (store.rating || 4.8);
  const isOpen = storeStatusOpen(store);
  return `<article class="store-card" id="store-${escapeHTML(key.replace(/[^a-zA-Z0-9_-]/g, "-"))}"><div class="store-image-wrap"><img class="store-photo" src="${escapeHTML(store.image)}" alt="${escapeHTML(store.name)}" loading="lazy"><span class="store-status ${isOpen ? "is-open" : "is-closed"}">${isOpen ? "● เปิดอยู่" : "● ปิดแล้ว"}</span>${store.featured ? '<span class="featured-badge">แนะนำ</span>' : ""}</div><div class="store-card-body"><span class="store-category">${escapeHTML(store.category)}</span><h3>${escapeHTML(store.name)}</h3><p>${escapeHTML(store.description)}</p><div class="store-rating"><span>★ ${avg.toFixed(1)}</span><span>${reviews.length} รีวิว</span></div><button class="status-toggle" type="button" data-status="${escapeHTML(key)}">${isOpen ? "แจ้งว่าปิดร้าน" : "แจ้งว่าเปิดร้าน"}</button><a class="button store-view" href="#booking">ดูร้านค้า <span>↗</span></a><button class="store-like${liked ? " is-liked" : ""}" type="button" data-like="${escapeHTML(key)}" aria-pressed="${liked}" aria-label="${liked ? "ยกเลิกถูกใจ" : "ถูกใจ"} ${escapeHTML(store.name)}"><span class="like-heart" aria-hidden="true">♥</span><span>${liked ? "ถูกใจแล้ว" : "ถูกใจ"}</span><span class="like-count">${storeLikeCount(store).toLocaleString("th-TH")}</span></button><details class="review-details"><summary>อ่านรีวิว / เขียนรีวิว</summary><div class="review-list">${reviews.length ? reviews.slice(-2).reverse().map(review => `<p class="review-quote"><span>${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span> ${escapeHTML(review.text)}</p>`).join("") : '<p class="muted">ยังไม่มีรีวิว เป็นคนแรกที่แบ่งปันได้เลย</p>'}</div><form class="review-form" data-review="${escapeHTML(key)}"><label>คะแนน<select name="rating" aria-label="คะแนนรีวิว"><option value="5">★★★★★ ยอดเยี่ยม</option><option value="4">★★★★☆ ดีมาก</option><option value="3">★★★☆☆ ดี</option><option value="2">★★☆☆☆ พอใช้</option><option value="1">★☆☆☆☆ ควรปรับปรุง</option></select></label><label>รีวิวของคุณ<textarea name="text" rows="2" maxlength="240" required placeholder="เล่าความประทับใจของคุณ"></textarea></label><button type="submit" class="review-submit">ส่งรีวิว</button></form></details></div></article>`;
}

function renderShelf(selector, stores, emptyMessage) {
  const root = $(selector);
  root.innerHTML = stores.length ? stores.map(renderStoreCard).join("") : `<p class="empty-state">${emptyMessage}</p>`;
}

function distanceFromMarket(store, location) {
  const lat = store.lat || 16.88 + (store.y - 50) * 0.00012;
  const lng = store.lng || 99.12 + (store.x - 50) * 0.00012;
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(lat - location.latitude);
  const dLng = radians(lng - location.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(location.latitude)) * Math.cos(radians(lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderMap(stores) {
  const pins = $("#map-pins");
  pins.innerHTML = stores.map(store => `<button class="map-pin ${storeStatusOpen(store) ? "is-open" : "is-closed"}" style="--pin-x:${store.x}%;--pin-y:${store.y}%" type="button" data-pin="${escapeHTML(storeLikeKey(store))}" aria-label="${escapeHTML(store.name)} ${storeStatusOpen(store) ? "เปิดอยู่" : "ปิดแล้ว"}"><span>${escapeHTML(store.name)}</span></button>`).join("");
  pins.querySelectorAll("[data-pin]").forEach(pin => pin.addEventListener("click", () => {
    const store = stores.find(item => storeLikeKey(item) === pin.dataset.pin);
    if (store) showNotice(`${store.name} · ${storeStatusOpen(store) ? "กำลังเปิด" : "ปิดแล้ว"}`);
  }));
}

async function loadStores() {
  const query = $("#store-search").value.trim().toLocaleLowerCase("th-TH");
  try {
    const rows = await api(`/stores?q=${encodeURIComponent($("#store-search").value.trim())}`);
    const liveCards = rows.map((store, index) => ({ ...store, name: store.storeName, image: store.imageUrl || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=85", description: store.description || "แวะมาพบกันที่ตลาด", live: true, x: 15 + (index * 23) % 70, y: 20 + (index * 29) % 60, rating: 4.7, popular: 50 - index }));
    const samples = sampleStores.map((store, index) => ({ x: [16, 34, 55, 76, 27, 69, 48, 22, 43, 66, 82][index], y: [28, 64, 36, 74, 48, 19, 55, 82, 18, 43, 67][index], ...store }));
    const cards = [...liveCards, ...samples].filter(store => !query || `${store.name} ${store.category}`.toLocaleLowerCase("th-TH").includes(query));
    const sortedPopular = [...cards].sort((a, b) => (b.popular || storeLikeCount(b)) - (a.popular || storeLikeCount(a)));
    const sortedNew = [...cards].filter(store => store.isNew).sort((a, b) => (b.newOrder || 0) - (a.newOrder || 0));
    const nearby = [...cards].sort((a, b) => userLocation ? distanceFromMarket(a, userLocation) - distanceFromMarket(b, userLocation) : (a.distance || 9) - (b.distance || 9));
    renderShelf("#all-list", cards, "ไม่พบร้านที่ค้นหา");
    renderShelf("#featured-list", cards.filter(store => store.featured).slice(0, 3), "ยังไม่มีร้านแนะนำ");
    renderShelf("#popular-list", sortedPopular.slice(0, 2), "ยังไม่พบร้านยอดนิยม");
    renderShelf("#new-list", sortedNew.slice(0, 2), "รอต้อนรับร้านเปิดใหม่");
    renderShelf("#nearby-list", nearby.slice(0, 2), "ยังไม่พบร้านใกล้คุณ");
    renderMap(cards);
    document.querySelectorAll("[data-like]").forEach(button => button.addEventListener("click", () => {
      const store = cards.find(item => storeLikeKey(item) === button.dataset.like);
      if (!store) return;
      const key = storeLikeKey(store);
      const liked = Boolean(likedStores[key]);
      likedStores[key] = !liked;
      storeLikeCounts[key] = Math.max(0, storeLikeCount(store) + (liked ? -1 : 1));
      localStorage.setItem("market-liked-stores", JSON.stringify(likedStores));
      localStorage.setItem("market-store-like-counts", JSON.stringify(storeLikeCounts));
      loadStores();
    }));
    document.querySelectorAll("[data-status]").forEach(button => button.addEventListener("click", () => {
      const store = cards.find(item => storeLikeKey(item) === button.dataset.status);
      if (!store) return;
      const key = storeLikeKey(store);
      storeStatus[key] = !storeStatusOpen(store);
      localStorage.setItem("market-store-status", JSON.stringify(storeStatus));
      loadStores();
    }));
    document.querySelectorAll("[data-review]").forEach(form => form.addEventListener("submit", event => {
      event.preventDefault();
      const data = new FormData(form);
      const text = String(data.get("text") || "").trim();
      if (!text) return;
      const key = form.dataset.review;
      storeReviews[key] = [...(storeReviews[key] || []), { rating: Number(data.get("rating")), text, createdAt: Date.now() }].slice(-20);
      localStorage.setItem("market-store-reviews", JSON.stringify(storeReviews));
      loadStores();
      showNotice("ขอบคุณที่แบ่งปันรีวิวให้ร้านในชุมชน");
    }));
    const highlights = cards.flatMap(store => storeReviewList(store).slice(-1).map(review => ({ store, review }))).slice(0, 3);
    $("#review-highlights").innerHTML = highlights.length ? highlights.map(({ store, review }) => `<article class="community-quote"><span>★★★★★</span><p>“${escapeHTML(review.text)}”</p><strong>${escapeHTML(store.name)}</strong></article>`).join("") : '<p class="empty-state">รีวิวของคุณจะช่วยให้ร้านเล็กๆ เป็นที่รู้จักมากขึ้น</p>';
  } catch (error) {
    ["#all-list", "#featured-list", "#popular-list", "#new-list", "#nearby-list"].forEach(selector => $(selector).innerHTML = `<p class="empty-state">${escapeHTML(error.message)}</p>`);
  }
}

async function beginBooking(stallId) {
  if (!currentUser) { showNotice("กรุณาเข้าสู่ระบบผู้ขายก่อนจองแผง", true); $("#auth-form").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  try {
    const rows = await api("/me/stores");
    if (!rows.length) { showNotice("กรุณาบันทึกข้อมูลร้านก่อนจองแผง", true); $("#store-form").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    selectedStall = Number(stallId);
    const stall = (await api("/stalls")).find(item => Number(item.stallId) === selectedStall);
    if (!stall?.isAvailable) { showNotice("แผงนี้ไม่ว่างแล้ว กรุณาเลือกรายการใหม่", true); await loadStalls(); return; }
    $("#booking-summary").textContent = `แผง ${stall.stallCode} · ${stall.locationDescription} · ${Number(stall.price).toLocaleString("th-TH")} บาท · คำขอมีสถานะ pending`;
    $("#booking-dialog").showModal();
  } catch (error) { showNotice(error.message, true); }
}

$("#auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#auth-submit");
  button.disabled = true;
  try {
    const result = await api(`/auth/${authMode}`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    setAuthState(result.shop);
    showNotice(authMode === "register" ? "สมัครสมาชิกเรียบร้อย" : "เข้าสู่ระบบแล้ว");
    form.reset();
  } catch (error) { showNotice(error.message, true); }
  finally { button.disabled = false; }
});

document.querySelectorAll("[data-auth]").forEach(tab => tab.addEventListener("click", () => {
  authMode = tab.dataset.auth;
  document.querySelectorAll("[data-auth]").forEach(item => item.classList.toggle("active", item === tab));
  $("#name-field").classList.toggle("hidden", authMode !== "register");
  $("#auth-form").elements.name.required = authMode === "register";
  $("#auth-submit").textContent = authMode === "register" ? "สมัครผู้ขาย" : "เข้าสู่ระบบ";
  $("#auth-form").elements.password.autocomplete = authMode === "register" ? "new-password" : "current-password";
}));

$("#store-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api("/me/stores", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.querySelector("button[type=submit]").textContent = "บันทึกข้อมูลร้านแล้ว";
    showNotice("บันทึกข้อมูลร้านแล้ว");
  } catch (error) { showNotice(error.message, true); }
});

$("#logout-button").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST" }); setAuthState(null); showNotice("ออกจากระบบแล้ว"); }
  catch (error) { showNotice(error.message, true); }
});

$("#confirm-booking").addEventListener("click", async event => {
  event.preventDefault();
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const rows = await api("/me/stores");
    await api("/bookings", { method: "POST", body: JSON.stringify({ stallId: selectedStall, storeId: rows[0].storeId }) });
    $("#booking-dialog").close();
    showNotice("ส่งคำขอจองแล้ว สถานะ pending");
    await Promise.all([loadStalls(), loadBookings()]);
  } catch (error) { showNotice(error.message, true); }
  finally { button.disabled = false; }
});

$("#store-search").addEventListener("input", () => {
  clearTimeout(window.storeSearchTimer);
  window.storeSearchTimer = setTimeout(loadStores, 250);
});
$("#nearby-button").addEventListener("click", () => {
  if (!navigator.geolocation) { showNotice("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง", true); return; }
  $("#nearby-status").textContent = "กำลังขอตำแหน่งของคุณ...";
  navigator.geolocation.getCurrentPosition(position => {
    userLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    $("#nearby-status").textContent = "เรียงร้านตามระยะจากตำแหน่งของคุณแล้ว";
    loadStores();
  }, () => {
    $("#nearby-status").textContent = "ไม่สามารถเข้าถึงตำแหน่งได้ • แสดงร้านใกล้จุดกลางตลาดตัวอย่างแทน";
    showNotice("อนุญาตตำแหน่งในเบราว์เซอร์เพื่อค้นหาร้านใกล้คุณ", true);
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
});
$("#account-button").addEventListener("click", () => $("#booking").scrollIntoView({ behavior: "smooth" }));

async function initialize() {
  await Promise.all([loadStalls(), loadStores()]);
  try { setAuthState((await api("/auth/me")).shop); }
  catch { setAuthState(null); }
}

initialize();
