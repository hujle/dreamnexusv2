require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { check, validationResult, matchedData } = require('express-validator');
const helmet = require('helmet');
const DATA_FILE = path.join(__dirname, 'data', 'servers.json');
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret';
const DISCORD_API_BASE = process.env.DISCORD_API_BASE || 'https://discord.com/api/v10';
const CHECK_CRON = process.env.CHECK_CRON || '0 3 * * *';

// security parameters
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCK_MINUTES = 60;
const BCRYPT_SALT_ROUNDS = 10;

// precompute hashed admin password (stored in memory only)
let ADMIN_PASSWORD_HASH = null;
(async () => {
  try {
    ADMIN_PASSWORD_HASH = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);
    console.log('Admin password hashed in memory.');
  } catch (err) {
    console.error('Failed to hash admin password:', err);
    process.exit(1);
  }
})();

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https://cdn.discordapp.com", "https://images.discordapp.net"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"]
    }
  }
}));

app.set('trust proxy', 1); // If behind proxy (Cloudflare), trust it so secure cookies and IP work correctly.

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session store: Copilot says MemoryStore is OK for small test, but not for production, and better replace it with Redis store (connect-redis).
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // secure: true, accoring to Copilot, requires HTTPS, but I'm only testing now, so it's set to false. CHANGE IT LATER!
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// --- Rate limiters ---
// Public API limiter
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});

// Admin API limiter
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});

// Login-specific limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // allow bursts but we also track attempts separately
  standardHeaders: true,
  legacyHeaders: false
});

// Apply public limiter to public API
app.use('/api/servers', publicLimiter);

// Apply admin limiter to admin endpoints
app.use(['/api/servers', '/api/servers/*', '/admin', '/admin/*'], adminLimiter);

// Apply login limiter to login route
app.use('/admin/login', loginLimiter);

// Simple in-memory login attempts tracker (per IP)
// For production consider Redis to persist across processes - ok, ok, Copilot-san, I got you...
const loginAttempts = new Map(); // ip -> { count, lockUntil: timestamp }

function getIp(req) {
  // trust proxy set above; req.ip will reflect X-Forwarded-For
  return req.ip || req.connection.remoteAddress || 'unknown';
}

function isLocked(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (rec.lockUntil && Date.now() < rec.lockUntil) return true;
  return false;
}

function remainingAttempts(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return LOGIN_MAX_ATTEMPTS;
  return Math.max(0, LOGIN_MAX_ATTEMPTS - rec.count);
}

function recordFailedAttempt(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, lockUntil: null };
  rec.count = (rec.count || 0) + 1;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    rec.lockUntil = Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000;
  }
  loginAttempts.set(ip, rec);
}

function resetAttempts(ip) {
  loginAttempts.delete(ip);
}

// Utilities for file DB
async function readServers() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
      await fs.writeFile(DATA_FILE, '[]', 'utf8');
      return [];
    }
    throw err;
  }
}

async function writeServers(list) {
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

// Helpers for Discord invite checks
function extractInviteCode(invite) {
  if (!invite) return null;
  try {
    if (invite.includes('discord')) {
      const u = new URL(invite.startsWith('http') ? invite : 'https://' + invite);
      const parts = u.pathname.split('/');
      return parts.pop() || parts.pop();
    }
    return invite.trim();
  } catch (err) {
    const m = invite.split('/').pop();
    return m || null;
  }
}

// --- Rate-limited invite checking queue (one request per 5 seconds) ---
let lastInviteCheckTs = 0;
const INVITE_MIN_INTERVAL_MS = 5000; // 5 seconds
const inviteQueue = [];
let inviteQueueProcessing = false;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// original axios-based check moved to checkInviteRaw (rename existing checkInvite to this)
async function checkInviteRaw(inviteCode) {
  const url = `${DISCORD_API_BASE}/invites/${encodeURIComponent(inviteCode)}?with_counts=true`;
  try {
    const resp = await axios.get(url, {
      headers: { 'User-Agent': 'DiscordList/1.0' },
      validateStatus: status => true
    });
    if (resp.status === 200 && resp.data) {
      const data = resp.data;
      return { ok: true, guild_id: data.guild?.id || null, guild_name: data.guild?.name || null, member_count: data.approximate_member_count ?? null, presence_count: data.approximate_presence_count ?? null, icon: data.guild?.icon ?? null };
    } else {
      return { ok: false, status: resp.status, body: resp.data || null, retryAfter: parseRetryAfter(resp) };
    }
  } catch (err) {
    console.error('checkInviteRaw error', err.message);
    return { ok: false, error: err.message };
  }
}

function parseRetryAfter(resp) {
  // Respect Retry-After header if present (seconds or ms)
  try {
    const ra = resp.headers && (resp.headers['retry-after'] || resp.headers['Retry-After']);
    if (!ra) return null;
    const n = Number(ra);
    if (!Number.isNaN(n)) return n * 1000;
    return null;
  } catch (e) { return null; }
}

// Enqueue a check function and process sequentially
function enqueueInviteCheck(fn) {
  return new Promise((resolve) => {
    inviteQueue.push({ fn, resolve });
    processInviteQueue().catch(err => console.error('invite queue error', err));
  });
}

async function processInviteQueue() {
  if (inviteQueueProcessing) return;
  inviteQueueProcessing = true;
  while (inviteQueue.length) {
    const item = inviteQueue.shift();
    const now = Date.now();
    const wait = Math.max(0, INVITE_MIN_INTERVAL_MS - (now - lastInviteCheckTs));
    if (wait > 0) await sleep(wait);

    // run the actual check
    let result;
    try {
      result = await item.fn();
    } catch (err) {
      result = { ok: false, error: err.message || 'unknown' };
    }

    // if remote asked to retry later, respect it by sleeping that long before next item
    const retryAfter = result && (result.retryAfter || null);
    lastInviteCheckTs = Date.now();
    item.resolve(result);

    if (retryAfter && typeof retryAfter === 'number' && retryAfter > 0) {
      // ensure we wait at least retryAfter before next request
      await sleep(retryAfter);
      lastInviteCheckTs = Date.now();
    }
  }
  inviteQueueProcessing = false;
}

// Public wrapper used by the rest of the code
async function checkInvite(inviteCode) {
  return enqueueInviteCheck(() => checkInviteRaw(inviteCode));
}
// --- End of rate-limited queue ---

async function performCheckOnServer(server, { force = false } = {}) {
  const now = new Date().toISOString();

  if (!force && server.invalid) {
    return { skipped: true, reason: 'Already invalid.' };
  }

  const code = extractInviteCode(server.invite);
  if (!code) {
    server.invalid = true;
    server.invalid_reason = `Could not parse invite.`;
    server.invalid_since = now;
    server.last_checked = now;
    return { ok: false, reason: 'Parse failed.' };
  }

  const result = await checkInvite(code);
  await sleep(200);

  if (result.ok) {
    server.approx_member_count = result.member_count;
    server.approx_presence_count = result.presence_count;
    server.last_checked = now;
    server.invalid = false;
    server.invalid_reason = null;
    server.invalid_since = null;
    if (!server.name && result.guild_name) server.name = result.guild_name;
    if (!server.icon && result.icon && result.guild_id) {
      server.icon = `https://cdn.discordapp.com/icons/${result.guild_id}/${result.icon}.png`;
    }
    return { ok: true };
  } else {
    server.invalid = true;
    server.invalid_reason = result.status ? `status ${result.status}` : (result.error || 'unknown');
    server.invalid_since = now;
    server.last_checked = now;
    return { ok: false, reason: server.invalid_reason };
  }
}

// Static files
app.use(express.static(path.join(__dirname)));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// Redirect /admin -> admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Validation rules
// Invite must be full URL: https://discord.gg/<code> or https://discord.com/invite/<code>
const inviteUrlRegex = /^https:\/\/(discord\.gg\/[A-Za-z0-9_-]+|discord\.com\/invite\/[A-Za-z0-9_-]+)$/i;

const validateInvite = check('invite')
  .exists().withMessage('Invite is required.')
  .bail()
  .isString().withMessage('Invite must be a string.')
  .bail()
  .custom(value => {
    if (!inviteUrlRegex.test(value.trim())) {
      throw new Error('Invite must be a full URL of form https://discord.gg/* or https://discord.com/invite/*.');
    }
    return true;
  });

const validateCategory = check('category')
  .optional({ nullable: true })
  .isString().withMessage('Category must be set in plain text.')
  .isLength({ max: 60 }).withMessage('Category name is too long.')
  .trim()
  .escape();

const validateNotes = check('notes')
  .optional({ nullable: true })
  .isString().withMessage('Note must be set in plain text.')
  .isLength({ max: 120 }).withMessage('Note is too long.')
  .trim()
  .escape();

// Helper to handle validation results
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array().map(e => e.msg) });
  }
  // replace body with sanitized data
  req.validData = matchedData(req, { locations: ['body'] });
  next();
}

// Public API: list servers
app.get('/api/servers', publicLimiter, async (req, res) => {
  try {
    const list = await readServers();
    res.json(list);
  } catch (err) {
    console.error('Read error', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Admin: login with attempt limit and bcrypt compare
app.post('/admin/login', loginLimiter, async (req, res) => {
  const ip = getIp(req);
  if (isLocked(ip)) {
    return res.status(429).json({ error: `Too many failed attempts. Try again later.` });
  }

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });

  try {
    const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (ok) {
      resetAttempts(ip);
      req.session.isAdmin = true;
      return res.json({ ok: true });
    } else {
      recordFailedAttempt(ip);
      const remaining = remainingAttempts(ip);
      if (isLocked(ip)) {
        return res.status(429).json({ error: `Too many failed attempts. Locked for ${LOGIN_LOCK_MINUTES} minutes.` });
      }
      return res.status(401).json({ error: 'Invalid password', remainingAttempts: remaining });
    }
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Admin logout
app.post('/admin/logout', requireAuth, async (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ ok: true });
  });
});

// Admin: add server (validate invite, category, notes)
// Use adminLimiter to protect admin endpoints
app.post('/api/servers',
  adminLimiter,
  requireAuth,
  validateInvite, validateCategory, validateNotes, handleValidation,
  async (req, res) => {
    try {
      const { invite, category, notes } = req.validData;
      const list = await readServers();
      const id = uuidv4();

      const newItem = {
        id,
        invite,
        name: null,
        icon: null,
        notes: notes || null,
        category: category || null,
        type: null,
        warn: null,
        invalid: false,
        invalid_reason: null,
        invalid_since: null,
        last_checked: null,
        approx_member_count: null,
        approx_presence_count: null
      };

      // Immediately attempt to fetch Discord info
      const code = extractInviteCode(invite);
      if (!code) {
        newItem.invalid = true;
        newItem.invalid_reason = 'could not parse invite';
        newItem.invalid_since = new Date().toISOString();
        newItem.last_checked = newItem.invalid_since;
      } else {
        const result = await checkInvite(code);
        const now = new Date().toISOString();
        newItem.last_checked = now;
        if (result.ok) {
          newItem.name = result.guild_name || null;
          newItem.approx_member_count = result.member_count;
          newItem.approx_presence_count = result.presence_count;
          if (result.icon && result.guild_id) {
            newItem.icon = `https://cdn.discordapp.com/icons/${result.guild_id}/${result.icon}.png`;
          }
          newItem.invalid = false;
        } else {
          newItem.invalid = true;
          newItem.invalid_reason = result.status ? `status ${result.status}` : (result.error || 'unknown');
          newItem.invalid_since = now;
        }
      }

      list.push(newItem);
      await writeServers(list);
      res.status(201).json(newItem);
    } catch (err) {
      console.error('Add server error', err);
      res.status(500).json({ error: 'Internal error' });
    }
  }
);

// Admin: edit server (validate invite if provided, category/notes)
app.put('/api/servers/:id',
  adminLimiter,
  requireAuth,
  // conditional validation: if invite present, validate it; category/notes optional
  (req, res, next) => {
    if ('invite' in req.body) validateInvite(req, res, next);
    else next();
  },
  validateCategory, validateNotes, handleValidation,
  async (req, res) => {
    try {
      const id = req.params.id;
      const updates = req.validData; // sanitized subset
      const list = await readServers();
      const idx = list.findIndex(s => s.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });

      const server = list[idx];

      if ('invite' in updates && updates.invite && updates.invite !== server.invite) {
        server.invite = updates.invite;
        // reset auto fields
        server.invalid = false;
        server.invalid_reason = null;
        server.invalid_since = null;
        server.last_checked = null;
        server.approx_member_count = null;
        server.approx_presence_count = null;
        server.name = null;
        server.icon = null;

        // immediate forced check
        try {
          await performCheckOnServer(server, { force: true });
        } catch (err) {
          console.error('Immediate check after invite update failed', err);
        }
      }

      if ('category' in updates) server.category = updates.category;
      if ('notes' in updates) server.notes = updates.notes;

      await writeServers(list);
      res.json(server);
    } catch (err) {
      console.error('Edit server error', err);
      res.status(500).json({ error: 'Internal error' });
    }
  }
);

// Admin: delete server
app.delete('/api/servers/:id', adminLimiter, requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    let list = await readServers();
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const removed = list.splice(idx, 1)[0];
    await writeServers(list);
    res.json({ removed });
  } catch (err) {
    console.error('Delete server error', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Manual check (single)
app.post('/api/servers/:id/check', adminLimiter, requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const list = await readServers();
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const server = list[idx];
    const result = await performCheckOnServer(server, { force: true });
    list[idx] = server;
    await writeServers(list);
    res.json({ id, result, server });
  } catch (err) {
    console.error('Manual check error', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Manual check (all)
app.post('/api/servers/check-all', adminLimiter, requireAuth, async (req, res) => {
  try {
    const force = req.query.force === 'false' ? false : true;
    const list = await readServers();
    const results = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const r = await performCheckOnServer(s, { force });
      results.push({ id: s.id, invite: s.invite, result: r });
      await sleep(200);
    }
    await writeServers(list);
    res.json({ ok: true, force, results });
  } catch (err) {
    console.error('Check-all error', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Daily check: skip already invalid
async function runDailyCheck() {
  console.log(new Date().toISOString(), 'Starting daily invite check...');
  try {
    const list = await readServers();
    let changed = false;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.invalid) continue;
      const result = await performCheckOnServer(s, { force: false });
      if (result.ok || result.ok === false) changed = true;
      await sleep(200);
    }
    if (changed) {
      await writeServers(list);
      console.log('Daily check: data updated.');
    } else {
      console.log('Daily check: no changes.');
    }
  } catch (err) {
    console.error('Daily check failed', err);
  }
}

cron.schedule(CHECK_CRON, () => {
  runDailyCheck().catch(err => console.error('cron error', err));
}, { timezone: 'UTC' });

// Optionally run on start
runDailyCheck().catch(err => console.error('initial check failed', err));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});