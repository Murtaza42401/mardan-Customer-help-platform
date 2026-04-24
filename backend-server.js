// ═══════════════════════════════════════════════════════════════
//  MARDAN HELP PORTAL — Node.js + Express Backend
//  Production-ready REST API
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.get("/", (req, res) => {
  res.send("API is running");
});
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ──────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// ── DATABASE ────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── FILE UPLOAD ─────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  }
});

// ── AUTH MIDDLEWARE ─────────────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'mhp_secret_2025');
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};
const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  });
};

// ════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  const { first_name, last_name, email, password, phone, area } = req.body;
  if (!first_name || !last_name || !email || !password)
    return res.status(400).json({ error: 'All required fields must be filled' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, phone, area)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, first_name, last_name, email, area, points, role`,
      [first_name, last_name, email, hashed, phone, area]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'mhp_secret_2025', { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'mhp_secret_2025', { expiresIn: '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, phone, area, avatar_url, points, role, verified, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
//  USER ROUTES
// ════════════════════════════════════════════════════════════════
app.put('/api/users/profile', auth, async (req, res) => {
  const { first_name, last_name, phone, area } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET first_name=$1, last_name=$2, phone=$3, area=$4, updated_at=NOW()
       WHERE id=$5 RETURNING id, first_name, last_name, email, phone, area, avatar_url, points`,
      [first_name, last_name, phone, area, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [url, req.user.id]);
  res.json({ avatar_url: url });
});
app.get('/api/users/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, phone, area, role, points, verified, avatar_url
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/users/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, area, points, avatar_url,
       (SELECT COUNT(*) FROM problems WHERE user_id = users.id) as report_count
       FROM users ORDER BY points DESC LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
//  PROBLEMS ROUTES
// ════════════════════════════════════════════════════════════════
app.get('/api/problems', async (req, res) => {
  const { category, status, location, search, sort, page = 1, limit = 12 } = req.query;
  const offset = (page - 1) * limit;
  let where = ['1=1']; let params = [];
  if (category) { params.push(category); where.push(`p.category = $${params.length}`); }
  if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
  if (location) { params.push(location); where.push(`p.location = $${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length})`); }
  const sortMap = { newest:'p.created_at DESC', votes:'vote_count DESC', oldest:'p.created_at ASC' };
  const orderBy = sortMap[sort] || 'p.created_at DESC';
  try {
    const query = `
      SELECT p.*, u.first_name, u.last_name, u.avatar_url,
      (SELECT COUNT(*) FROM votes WHERE problem_id = p.id) as vote_count,
      (SELECT COUNT(*) FROM comments WHERE problem_id = p.id) as comment_count
      FROM problems p JOIN users u ON p.user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    const count = await pool.query(`SELECT COUNT(*) FROM problems p WHERE ${where.join(' AND ')}`, params.slice(0,-2));
    res.json({ problems: result.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/problems/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.first_name, u.last_name, u.avatar_url, u.verified as user_verified,
       (SELECT COUNT(*) FROM votes WHERE problem_id = p.id) as vote_count,
       (SELECT json_agg(pi) FROM problem_images pi WHERE pi.problem_id = p.id) as images,
       (SELECT json_agg(pu ORDER BY pu.created_at DESC) FROM progress_updates pu WHERE pu.problem_id = p.id) as updates
       FROM problems p JOIN users u ON p.user_id = u.id WHERE p.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/problems/my', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
       COUNT(DISTINCT v.id) as vote_count,
       COUNT(DISTINCT c.id) as comment_count
       FROM problems p
       LEFT JOIN votes v ON v.problem_id = p.id
       LEFT JOIN comments c ON c.problem_id = p.id
       WHERE p.user_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT 10`,
      [req.user.id]
    );
    res.json({ problems: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/problems', auth, upload.array('images', 5), async (req, res) => {
  const { title, description, category, location, landmark, priority, latitude, longitude } = req.body;
  if (!title || !description || !category || !location)
    return res.status(400).json({ error: 'Required fields missing' });
  try {
    const result = await pool.query(
      `INSERT INTO problems (user_id, title, description, category, location, landmark, priority, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, title, description, category, location, landmark, priority||'Medium',
       latitude||34.1988, longitude||72.0247]
    );
    const problem = result.rows[0];
    if (req.files?.length) {
      for (const file of req.files) {
        await pool.query('INSERT INTO problem_images (problem_id, image_url) VALUES ($1, $2)',
          [problem.id, `/uploads/${file.filename}`]);
      }
    }
    await pool.query('UPDATE users SET points = points + 50 WHERE id = $1', [req.user.id]);
    await pool.query('INSERT INTO activities (user_id, action_type, target_id, description) VALUES ($1,$2,$3,$4)',
      [req.user.id, 'report', problem.id, `Reported: ${title}`]);
    res.status(201).json(problem);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/problems/:id/vote', auth, async (req, res) => {
  const problemId = req.params.id;
  try {
    const existing = await pool.query('SELECT id FROM votes WHERE problem_id=$1 AND user_id=$2', [problemId, req.user.id]);
    if (existing.rows.length) {
      await pool.query('DELETE FROM votes WHERE problem_id=$1 AND user_id=$2', [problemId, req.user.id]);
      await pool.query('UPDATE users SET points = GREATEST(0, points - 10) WHERE id = $1', [req.user.id]);
      return res.json({ voted: false });
    }
    await pool.query('INSERT INTO votes (problem_id, user_id) VALUES ($1, $2)', [problemId, req.user.id]);
    await pool.query('UPDATE users SET points = points + 10 WHERE id = $1', [req.user.id]);
    res.json({ voted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/problems/:id/comments', auth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
  try {
    const result = await pool.query(
      'INSERT INTO comments (problem_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.user.id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/problems/:id/comments', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.first_name, u.last_name, u.avatar_url
       FROM comments c JOIN users u ON c.user_id = u.id
       WHERE c.problem_id = $1 ORDER BY c.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
//  PROGRESS UPDATES
// ════════════════════════════════════════════════════════════════
app.post('/api/problems/:id/progress', adminAuth, upload.array('proof', 3), async (req, res) => {
  const { description, percentage } = req.body;
  try {
    await pool.query(
      `INSERT INTO progress_updates (problem_id, admin_id, description, percentage)
       VALUES ($1,$2,$3,$4)`,
      [req.params.id, req.user.id, description, percentage]
    );
    await pool.query('UPDATE problems SET progress_percentage=$1 WHERE id=$2',
      [percentage, req.params.id]);
    if (parseInt(percentage) === 100)
      await pool.query("UPDATE problems SET status='done' WHERE id=$1", [req.params.id]);
    else if (parseInt(percentage) > 0)
      await pool.query("UPDATE problems SET status='progress' WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
//  DASHBOARD STATS
// ════════════════════════════════════════════════════════════════
app.get('/api/stats', async (req, res) => {
  try {
    const [total, pending, progress, done, users, categories] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM problems'),
      pool.query("SELECT COUNT(*) FROM problems WHERE status='pending'"),
      pool.query("SELECT COUNT(*) FROM problems WHERE status='progress'"),
      pool.query("SELECT COUNT(*) FROM problems WHERE status='done'"),
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query("SELECT category, COUNT(*) as count FROM problems GROUP BY category ORDER BY count DESC"),
    ]);
    res.json({
      total: parseInt(total.rows[0].count),
      pending: parseInt(pending.rows[0].count),
      in_progress: parseInt(progress.rows[0].count),
      resolved: parseInt(done.rows[0].count),
      citizens: parseInt(users.rows[0].count),
      resolution_rate: Math.round(parseInt(done.rows[0].count) / parseInt(total.rows[0].count) * 100) || 0,
      categories: categories.rows
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
//  EMERGENCY ALERTS
// ════════════════════════════════════════════════════════════════
app.post('/api/emergency', auth, async (req, res) => {
  const { message, location, latitude, longitude } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO emergency_alerts (user_id, message, location, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, message, location, latitude, longitude]
    );
    // In production: trigger email/SMS notification here
    res.status(201).json({ success: true, alert: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/emergency', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ea.*, u.first_name, u.last_name, u.phone
       FROM emergency_alerts ea JOIN users u ON ea.user_id = u.id
       ORDER BY ea.created_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ════════════════════════════════════════════════════════════════
app.put('/api/admin/problems/:id/status', adminAuth, async (req, res) => {
  const { status } = req.body;
  if (!['pending','progress','done'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  try {
    await pool.query('UPDATE problems SET status=$1, updated_at=NOW() WHERE id=$2', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/users/:id/verify', adminAuth, async (req, res) => {
  try {
    await pool.query('UPDATE users SET verified=true WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/problems/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM problems WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
//  ACTIVITY FEED
// ════════════════════════════════════════════════════════════════
app.get('/api/activities', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.first_name, u.last_name
       FROM activities a JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC LIMIT 30`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
//  DONATIONS / CAMPAIGNS
// ════════════════════════════════════════════════════════════════
app.get('/api/campaigns', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, (SELECT COALESCE(SUM(amount),0) FROM contributions WHERE campaign_id = c.id) as raised,
       (SELECT COUNT(*) FROM contributions WHERE campaign_id = c.id) as backers
       FROM campaigns c WHERE c.active = true ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/campaigns/:id/contribute', auth, async (req, res) => {
  const { amount, message } = req.body;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
  try {
    await pool.query('INSERT INTO contributions (campaign_id, user_id, amount, message) VALUES ($1,$2,$3,$4)',
      [req.params.id, req.user.id, amount, message]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── HEALTH CHECK ────────────────────────────────────────────────
// ── ROOT ROUTE ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("API is running");
});

// ── START ───────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🏙️ Mardan Help Portal API running on port ${PORT}`));

module.exports = app;
