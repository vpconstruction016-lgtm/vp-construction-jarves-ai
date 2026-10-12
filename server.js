const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const OpenAI = require("openai");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be set to a random secret of at least 32 characters");
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "disable" ? false : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined),
  max: 5, connectionTimeoutMillis: 10000
});
const ai = () => process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

const auth = (req, res, next) => {
  try {
    const token = req.cookies.jarves_session;
    if (!token) return res.status(401).json({ error: "Please log in" });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: "Session expired. Please log in again." }); }
};
const session = (res, user) => res.cookie("jarves_session", jwt.sign({ id:user.id, email:user.email, role:user.role }, JWT_SECRET, { expiresIn:"12h" }), {
  httpOnly:true, secure:process.env.NODE_ENV==="production", sameSite:"strict", path:"/", maxAge:12*60*60*1000
});
const clean = v => typeof v === "string" ? v.trim() : "";
const fail = (res, err) => { console.error(err); return res.status(500).json({ error:"Server error. Check service logs." }); };

async function schema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '', area_sqft NUMERIC(12,2), status TEXT NOT NULL DEFAULT 'Planning',
      created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id),
      action TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
async function audit(userId, action) { await pool.query("INSERT INTO audit_log(user_id, action) VALUES($1,$2)", [userId, action]); }

app.get("/api/health", async (_req,res) => {
  try { await pool.query("SELECT 1"); res.json({ ok:true, database:"connected", aiConfigured:!!process.env.OPENAI_API_KEY }); }
  catch { res.status(503).json({ ok:false, database:"unavailable", aiConfigured:!!process.env.OPENAI_API_KEY }); }
});
app.get("/api/setup/status", async (_req,res) => {
  try { const r = await pool.query("SELECT COUNT(*)::int AS n FROM users"); res.json({ setupRequired:r.rows[0].n===0 }); } catch(e) { fail(res,e); }
});
app.post("/api/setup", async (req,res) => {
  const name=clean(req.body.name), email=clean(req.body.email).toLowerCase(), password=clean(req.body.password);
  if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<12)
    return res.status(400).json({ error:"Enter a name, valid email, and password with at least 12 characters." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN EXCLUSIVE MODE");
    const count=await client.query("SELECT COUNT(*)::int AS n FROM users");
    if(count.rows[0].n!==0) { await client.query("ROLLBACK"); return res.status(409).json({ error:"Initial owner is already configured. Please log in." }); }
    const hash=await bcrypt.hash(password,12);
    const saved=await client.query("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'owner') RETURNING id,email,name,role",[name,email,hash]);
    await client.query("COMMIT");
    session(res,saved.rows[0]); await audit(saved.rows[0].id,"owner_setup");
    res.status(201).json({ user:saved.rows[0] });
  } catch(e) { try{await client.query("ROLLBACK")}catch{}; fail(res,e); } finally { client.release(); }
});
app.post("/api/login", async (req,res) => {
  const email=clean(req.body.email).toLowerCase(), password=clean(req.body.password);
  try {
    const r=await pool.query("SELECT id,email,name,role,password_hash FROM users WHERE email=$1",[email]);
    if(!r.rowCount || !(await bcrypt.compare(password,r.rows[0].password_hash))) return res.status(401).json({ error:"Email or password is incorrect." });
    const u=r.rows[0]; session(res,u); await audit(u.id,"login");
    delete u.password_hash; res.json({ user:u });
  } catch(e) { fail(res,e); }
});
app.post("/api/logout", (_req,res) => res.clearCookie("jarves_session",{ path:"/", httpOnly:true, secure:process.env.NODE_ENV==="production", sameSite:"strict" }).json({ ok:true }));
app.get("/api/me", auth, async (req,res) => {
  try { const r=await pool.query("SELECT id,email,name,role FROM users WHERE id=$1",[req.user.id]); if(!r.rowCount) return res.status(401).json({error:"Account not found"}); res.json({user:r.rows[0]}); } catch(e) { fail(res,e); }
});
app.get("/api/projects", auth, async (_req,res) => {
  try { const r=await pool.query("SELECT id,name,client,location,area_sqft,status,created_at FROM projects ORDER BY created_at DESC LIMIT 200"); res.json({projects:r.rows}); } catch(e) { fail(res,e); }
});
app.post("/api/projects", auth, async (req,res) => {
  const name=clean(req.body.name), client=clean(req.body.client), location=clean(req.body.location);
  const area=req.body.area_sqft==="" || req.body.area_sqft==null ? null : Number(req.body.area_sqft);
  if(name.length<2 || name.length>160 || client.length>160 || location.length>200 || (area!==null && (!Number.isFinite(area)||area<0||area>1e9)))
    return res.status(400).json({error:"Check project name and area."});
  try { const r=await pool.query("INSERT INTO projects(name,client,location,area_sqft,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,name,client,location,area_sqft,status,created_at",[name,client,location,area,req.user.id]); await audit(req.user.id,"project_created"); res.status(201).json({project:r.rows[0]}); } catch(e) { fail(res,e); }
});
app.post("/api/chat", auth, async (req,res) => {
  const message=clean(req.body.message);
  if(!message || message.length>8000) return res.status(400).json({error:"Message must be between 1 and 8000 characters."});
  const client=ai(); if(!client) return res.status(503).json({error:"AI is not configured. Add OPENAI_API_KEY in the hosting secret settings."});
  try {
    const result=await client.chat.completions.create({ model:process.env.OPENAI_MODEL||"gpt-4.1-mini", messages:[
      {role:"system",content:"You are Jarves, the VP Construction engineering and business assistant. Help with Tamil Nadu construction estimating, BOQ, planning, site management and business workflows. State assumptions, distinguish estimates from verified measurements, and recommend qualified engineering review for structural safety. Never claim to have read data not provided."},
      {role:"user",content:message}
    ], max_tokens:900 });
    res.json({reply:result.choices?.[0]?.message?.content||"No answer returned."});
  } catch(e) { console.error("AI request failed",e.status||e.message); res.status(502).json({error:"AI request failed. Verify the server-side API key and model settings."}); }
});
app.use(express.static("public", { extensions:["html"] }));
app.use((err,_req,res,_next) => { if(err instanceof SyntaxError) return res.status(400).json({error:"Invalid JSON"}); console.error(err); res.status(500).json({error:"Server error"}); });
schema().then(()=>app.listen(PORT,()=>console.log("Jarves listening on",PORT))).catch(err=>{console.error("Startup/database schema failed",err); process.exit(1);});
