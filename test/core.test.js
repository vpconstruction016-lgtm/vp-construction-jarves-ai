const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const client = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("backend dependencies and scripts are declared", () => {
  for (const dep of ["express", "pg", "bcryptjs", "jsonwebtoken", "openai", "helmet", "express-rate-limit"]) {
    assert.ok(pkg.dependencies[dep], dep + " dependency missing");
  }
  assert.match(pkg.scripts.check, /node --check server\.js/);
});

test("authentication uses password hashing and an HttpOnly SameSite cookie", () => {
  assert.match(server, /bcrypt\.hash\(password,\s*12\)/);
  assert.match(server, /bcrypt\.compare\(password/);
  assert.match(server, /httpOnly:\s*true/);
  assert.match(server, /sameSite:\s*"strict"/);
  assert.match(server, /app\.post\("\/api\/logout"/);
});

test("project records and audit events use PostgreSQL", () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS projects/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS audit_log/);
  assert.match(server, /app\.get\("\/api\/projects"/);
  assert.match(server, /app\.post\("\/api\/projects"/);
});

test("AI keys remain server-side and no-key state is explicit", () => {
  assert.match(server, /process\.env\.OPENAI_API_KEY/);
  assert.match(server, /process\.env\.GEMINI_API_KEY/);
  assert.match(server, /x-goog-api-key/);
  assert.match(server, /status\(503\).*GEMINI_API_KEY/s);
  assert.doesNotMatch(client, /OPENAI_API_KEY|GEMINI_API_KEY|sk-[A-Za-z0-9]{12}/);
});

test("mobile client contains login, project creation, and Jarves chat workflows", () => {
  assert.match(html, /id="authForm"/);
  assert.match(html, /id="projectForm"/);
  assert.match(html, /id="chatForm"/);
  assert.match(client, /api\("\/projects"/);
  assert.match(client, /api\("\/chat"/);
});
