const express = require("express");
const mariadb = require("mariadb");
const crypto = require("crypto");
const { promisify } = require("util");

const app = express();
app.set("json replacer", (key, value) => typeof value === "bigint" ? value.toString() : value);
const scrypt = promisify(crypto.scrypt);
const pool = mariadb.createPool({
  host: "10.200.210.117",
  port: 3306,
  user: "std11",
  password: "std11",
  database: "db_std11",
  connectionLimit: 5
});
const sessions = new Map();

app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

async function query(sql, values = []) {
  return pool.query(sql, values);
}

async function ensureSchema() {
  await query(`CREATE TABLE IF NOT EXISTS shops (
    shop_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT(1) NOT NULL DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS stores (
    store_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    shop_id BIGINT UNSIGNED NOT NULL UNIQUE,
    category VARCHAR(80) NOT NULL,
    store_name VARCHAR(150) NOT NULL,
    description TEXT,
    contact_text VARCHAR(120),
    is_public TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_store_shop FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS stalls (
    stall_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    stall_code VARCHAR(30) NOT NULL UNIQUE,
    location_description VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await query(`CREATE TABLE IF NOT EXISTS bookings (
    booking_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    stall_id BIGINT UNSIGNED NOT NULL,
    shop_id BIGINT UNSIGNED NOT NULL,
    store_id BIGINT UNSIGNED NOT NULL,
    price_at_booking DECIMAL(10,2) NOT NULL,
    status ENUM('pending','confirmed','rejected','cancelled') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_booking_stall_status (stall_id, status),
    INDEX idx_booking_shop (shop_id, created_at),
    CONSTRAINT fk_booking_stall FOREIGN KEY (stall_id) REFERENCES stalls(stall_id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_shop FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE RESTRICT,
    CONSTRAINT fk_booking_store FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await query(`INSERT IGNORE INTO stalls (stall_code, location_description, price) VALUES
    ('DEMO-01', 'โซนตัวอย่าง A · แถวหน้า', 100.00),
    ('DEMO-02', 'โซนตัวอย่าง A · แถวกลาง', 120.00),
    ('DEMO-03', 'โซนตัวอย่าง A · แถวใน', 100.00),
    ('DEMO-04', 'โซนตัวอย่าง B · แถวหน้า', 150.00),
    ('DEMO-05', 'โซนตัวอย่าง B · แถวกลาง', 120.00),
    ('DEMO-06', 'โซนตัวอย่าง B · แถวใน', 150.00)`);
}

function userFromRequest(req) {
  const sid = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith("sid="))?.slice(4);
  return sid ? sessions.get(sid) : null;
}

function requireUser(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "กรุณาเข้าสู่ระบบ" } });
  req.user = user;
  next();
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

app.get("/api/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(500).json({ status: "error", database: "unavailable" });
  }
});

app.post("/api/v1/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || "") || typeof password !== "string" || password.length < 8) {
    return fail(res, 422, "VALIDATION_ERROR", "กรุณากรอกชื่อ อีเมลที่ถูกต้อง และรหัสผ่านอย่างน้อย 8 ตัวอักษร");
  }
  try {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = (await scrypt(password, salt, 64)).toString("hex");
    const result = await query("INSERT INTO shops (name, email, password_hash) VALUES (?, ?, ?)", [name.trim(), email.toLowerCase().trim(), `${salt}:${hash}`]);
    const user = { shopId: Number(result.insertId), name: name.trim(), email: email.toLowerCase().trim() };
    const sid = crypto.randomBytes(32).toString("hex");
    sessions.set(sid, user);
    res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
    res.status(201).json({ data: { shop: user } });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return fail(res, 409, "ACCOUNT_EXISTS", "อีเมลนี้มีบัญชีแล้ว");
    console.error("Registration failed:", error.message);
    fail(res, 500, "INTERNAL_ERROR", "เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.post("/api/v1/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  try {
    const rows = await query("SELECT shop_id, name, email, password_hash FROM shops WHERE email = ? AND is_active = 1", [String(email || "").toLowerCase().trim()]);
    const row = rows[0];
    if (!row || typeof password !== "string") return fail(res, 401, "INVALID_CREDENTIALS", "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    const [salt, expected] = row.password_hash.split(":");
    const actual = await scrypt(password, salt, 64);
    if (!crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"))) return fail(res, 401, "INVALID_CREDENTIALS", "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    const user = { shopId: Number(row.shop_id), name: row.name, email: row.email };
    const sid = crypto.randomBytes(32).toString("hex");
    sessions.set(sid, user);
    res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
    res.json({ data: { shop: user } });
  } catch (error) {
    console.error("Login failed:", error.message);
    fail(res, 500, "INTERNAL_ERROR", "เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.post("/api/v1/auth/logout", requireUser, (req, res) => {
  const sid = req.headers.cookie.split(";").map(part => part.trim()).find(part => part.startsWith("sid="))?.slice(4);
  sessions.delete(sid);
  res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.status(204).end();
});

app.get("/api/v1/auth/me", requireUser, (req, res) => res.json({ data: { shop: req.user } }));

app.get("/api/v1/stalls", async (req, res) => {
  try {
    const rows = await query(`SELECT s.stall_id AS stallId, s.stall_code AS stallCode,
      s.location_description AS locationDescription, s.price,
      NOT EXISTS (SELECT 1 FROM bookings b WHERE b.stall_id=s.stall_id AND b.status IN ('pending','confirmed')) AS isAvailable
      FROM stalls s WHERE s.is_active=1 ORDER BY s.stall_code`);
    res.json({ data: rows });
  } catch (error) {
    console.error("Stall listing failed:", error.message);
    fail(res, 500, "INTERNAL_ERROR", "ไม่สามารถโหลดรายการแผงได้");
  }
});

app.get("/api/v1/stores", async (req, res) => {
  try {
    const term = `%${String(req.query.q || "").slice(0, 80)}%`;
    const rows = await query(`SELECT st.store_id AS storeId, st.store_name AS storeName, st.category,
      st.description, st.contact_text AS contactText, s.stall_code AS stallCode, s.location_description AS locationDescription
      FROM stores st JOIN bookings b ON b.store_id=st.store_id
      JOIN stalls s ON s.stall_id=b.stall_id
      WHERE st.is_public=1 AND b.status='confirmed' AND (st.store_name LIKE ? OR st.category LIKE ?)
      ORDER BY st.store_name`, [term, term]);
    res.json({ data: rows });
  } catch (error) {
    console.error("Public store listing failed:", error.message);
    fail(res, 500, "INTERNAL_ERROR", "ไม่สามารถโหลดร้านค้าได้");
  }
});

app.get("/api/v1/me/stores", requireUser, async (req, res) => {
  try {
    const rows = await query("SELECT store_id AS storeId, store_name AS storeName, category, description, contact_text AS contactText, is_public AS isPublic FROM stores WHERE shop_id=?", [req.user.shopId]);
    res.json({ data: rows });
  } catch (error) { fail(res, 500, "INTERNAL_ERROR", "ไม่สามารถโหลดข้อมูลร้านได้"); }
});

app.post("/api/v1/me/stores", requireUser, async (req, res) => {
  const { storeName, category, description = "", contactText = "", isPublic = true } = req.body || {};
  if (typeof storeName !== "string" || !storeName.trim() || typeof category !== "string" || !category.trim()) return fail(res, 422, "VALIDATION_ERROR", "กรุณากรอกชื่อร้านและประเภทสินค้า");
  if (typeof description !== "string" || typeof contactText !== "string") return fail(res, 422, "VALIDATION_ERROR", "รูปแบบข้อมูลร้านไม่ถูกต้อง");
  try {
    const existing = await query("SELECT store_id AS storeId FROM stores WHERE shop_id=?", [req.user.shopId]);
    if (existing[0]) {
      await query("UPDATE stores SET store_name=?, category=?, description=?, contact_text=?, is_public=? WHERE store_id=? AND shop_id=?", [storeName.trim(), category.trim(), description, contactText, isPublic ? 1 : 0, existing[0].storeId, req.user.shopId]);
      return res.json({ data: { storeId: Number(existing[0].storeId), storeName: storeName.trim(), category: category.trim() } });
    }
    const result = await query("INSERT INTO stores (shop_id, store_name, category, description, contact_text, is_public) VALUES (?, ?, ?, ?, ?, ?)", [req.user.shopId, storeName.trim(), category.trim(), description, contactText, isPublic ? 1 : 0]);
    res.status(201).json({ data: { storeId: Number(result.insertId), storeName: storeName.trim(), category: category.trim() } });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return fail(res, 409, "STORE_EXISTS", "บัญชีผู้ขายมีร้านอยู่แล้ว");
    console.error("Store save failed:", error.message);
    fail(res, 500, "INTERNAL_ERROR", "ไม่สามารถบันทึกร้านได้");
  }
});

app.post("/api/v1/bookings", requireUser, async (req, res) => {
  const stallId = Number(req.body?.stallId);
  const storeId = Number(req.body?.storeId);
  if (!Number.isSafeInteger(stallId) || stallId < 1 || !Number.isSafeInteger(storeId) || storeId < 1) return fail(res, 422, "VALIDATION_ERROR", "ข้อมูลแผงหรือร้านไม่ถูกต้อง");
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const stalls = await connection.query("SELECT stall_id, price FROM stalls WHERE stall_id=? AND is_active=1 FOR UPDATE", [stallId]);
    const stores = await connection.query("SELECT store_id FROM stores WHERE store_id=? AND shop_id=?", [storeId, req.user.shopId]);
    if (!stalls[0] || !stores[0]) {
      await connection.rollback();
      return fail(res, 404, "NOT_FOUND", "ไม่พบแผงหรือร้านของคุณ");
    }
    const occupied = await connection.query("SELECT booking_id FROM bookings WHERE stall_id=? AND status IN ('pending','confirmed') FOR UPDATE", [stallId]);
    if (occupied.length) {
      await connection.rollback();
      return fail(res, 409, "STALL_UNAVAILABLE", "แผงนี้มีผู้จองแล้ว");
    }
    const result = await connection.query("INSERT INTO bookings (stall_id, shop_id, store_id, price_at_booking, status) VALUES (?, ?, ?, ?, 'pending')", [stallId, req.user.shopId, storeId, stalls[0].price]);
    await connection.commit();
    res.status(201).json({ data: { bookingId: Number(result.insertId), stallId, storeId, price: stalls[0].price, status: "pending" } });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Booking failed:", error.message);
    fail(res, 500, "INTERNAL_ERROR", "ไม่สามารถสร้างการจองได้");
  } finally { if (connection) connection.release(); }
});

app.get("/api/v1/me/bookings", requireUser, async (req, res) => {
  try {
    const rows = await query(`SELECT b.booking_id AS bookingId, b.status, b.price_at_booking AS price,
      b.created_at AS createdAt, s.stall_code AS stallCode, st.store_name AS storeName
      FROM bookings b JOIN stalls s ON s.stall_id=b.stall_id JOIN stores st ON st.store_id=b.store_id
      WHERE b.shop_id=? ORDER BY b.created_at DESC`, [req.user.shopId]);
    res.json({ data: rows });
  } catch (error) { fail(res, 500, "INTERNAL_ERROR", "ไม่สามารถโหลดการจองได้"); }
});

app.patch("/api/v1/me/bookings/:id/cancel", requireUser, async (req, res) => {
  try {
    const result = await query("UPDATE bookings SET status='cancelled' WHERE booking_id=? AND shop_id=? AND status IN ('pending','confirmed')", [req.params.id, req.user.shopId]);
    if (!result.affectedRows) return fail(res, 409, "CANNOT_CANCEL", "ไม่พบรายการหรือรายการนี้ยกเลิกไม่ได้");
    res.json({ data: { bookingId: Number(req.params.id), status: "cancelled" } });
  } catch (error) { fail(res, 500, "INTERNAL_ERROR", "ไม่สามารถยกเลิกการจองได้"); }
});

app.use((error, req, res, next) => {
  console.error("Request failed:", error.message);
  fail(res, 500, "INTERNAL_ERROR", "เกิดข้อผิดพลาดภายในระบบ");
});

ensureSchema().then(() => app.listen(3111, () => {
  console.log("Server listening on port 3111");
})).catch(error => {
  console.error("Database initialization failed:", error.message);
  process.exitCode = 1;
});
