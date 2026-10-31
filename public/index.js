const API = "/api/v1";
const $ = selector => document.querySelector(selector);
const notice = $("#notice");
let authMode = "login";
let currentUser = null;
let selectedStall = null;
let noticeTimer;

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
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
  { name: "ครัวบ้านสวน", category: "ร้านอาหาร", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85", description: "อาหารจานอร่อย ปรุงสดใหม่ทุกวัน" },
  { name: "ชื่นใจเครื่องดื่ม", category: "ร้านเครื่องดื่ม", image: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=85", description: "ชา กาแฟ และเครื่องดื่มเติมความสดชื่น" },
  { name: "ของชำป้าพร", category: "ร้านของชำ", image: "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&w=900&q=85", description: "ของใช้จำเป็นใกล้บ้าน แวะง่ายได้ทุกวัน" },
  { name: "สวนผลไม้ริมรั้ว", category: "ร้านผักผลไม้", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=85", description: "ผักสดและผลไม้ตามฤดูกาลจากสวน" },
  { name: "บ้านขนมอบอุ่น", category: "ร้านขนม", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85", description: "ขนมอบหอมกรุ่นและขนมไทยทำมือ" },
  { name: "ดินสอสีสัน", category: "อุปกรณ์การเรียน", image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=85", description: "สมุด ปากกา และอุปกรณ์การเรียนครบครัน" }
];

async function loadStores() {
  const root = $("#store-list");
  const query = $("#store-search").value.trim().toLocaleLowerCase("th-TH");
  try {
    const rows = await api(`/stores?q=${encodeURIComponent($("#store-search").value.trim())}`);
    const liveCards = rows.map(store => ({ ...store, name: store.storeName, image: store.imageUrl || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=85", description: store.description || "แวะมาพบกันที่ตลาด", live: true }));
    const samples = sampleStores.filter(store => `${store.name} ${store.category}`.toLocaleLowerCase("th-TH").includes(query));
    const cards = [...liveCards, ...samples].filter(store => !query || `${store.name} ${store.category}`.toLocaleLowerCase("th-TH").includes(query));
    root.innerHTML = cards.length ? cards.map(store => `<article class="store-card"><img class="store-photo" src="${escapeHTML(store.image)}" alt="${escapeHTML(store.name)}" loading="lazy"><div class="store-card-body"><span class="store-category">${escapeHTML(store.category)}</span><h3>${escapeHTML(store.name)}</h3>${store.live ? `<p>${escapeHTML(store.description)}</p><p>แผง ${escapeHTML(store.stallCode)} · ${escapeHTML(store.locationDescription)}</p>` : `<p>${escapeHTML(store.description)}</p>`}<a class="button store-view" href="#booking">ดูร้านค้า <span>↗</span></a></div></article>`).join("") : '<p class="empty-state">ยังไม่พบร้านค้า ลองค้นหาคำอื่น</p>';
  } catch (error) { root.innerHTML = `<p class="empty-state">${escapeHTML(error.message)}</p>`; }
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
$("#account-button").addEventListener("click", () => $("#booking").scrollIntoView({ behavior: "smooth" }));

async function initialize() {
  await Promise.all([loadStalls(), loadStores()]);
  try { setAuthState((await api("/auth/me")).shop); }
  catch { setAuthState(null); }
}

initialize();
