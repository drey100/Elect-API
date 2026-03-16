/* ═══════════════════════════════════════════════════════════
   ElectraBénin — Backend API
   Express · Neon PostgreSQL (pg) · Nodemailer
═══════════════════════════════════════════════════════════ */
'use strict';
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Pool }   = require('pg');

const app  = express();
const PORT = process.env.PORT || 5000;

/* ── Pool Neon ────────────────────────────────────────────── */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }   // requis pour Neon
});

/* Helper : exécuter une requête */
function q(text, params) {
  return pool.query(text, params).then(function(r){ return r.rows; });
}
function q1(text, params) {
  return pool.query(text, params).then(function(r){ return r.rows[0] || null; });
}

/* ── Nodemailer ───────────────────────────────────────────── */
const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

/* ── Middlewares ──────────────────────────────────────────── */
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET','POST','PUT','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '10mb' }));

/* ── Auth middleware ──────────────────────────────────────── */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant' });
  try {
    jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

/* ══════════════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════════════ */
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

/* ══════════════════════════════════════════════════════════
   PUBLICITÉS
══════════════════════════════════════════════════════════ */

// Public : pubs actives non expirées
app.get('/api/pubs', async (req, res) => {
  try {
    const rows = await q(`
      SELECT id, name, href, img, alt, contact, description, slot, duration
      FROM pubs
      WHERE active = true
        AND (expires IS NULL OR expires > CURRENT_DATE)
      ORDER BY created_at DESC
    `);
    // Cache 2 minutes côté client — accélère les rechargements
    res.set('Cache-Control', 'public, max-age=120');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin : toutes les pubs avec stats agrégées
app.get('/api/pubs/all', requireAuth, async (req, res) => {
  try {
    const rows = await q(`
      SELECT
        p.*,
        COUNT(CASE WHEN s.type='view'  THEN 1 END)::int AS views,
        COUNT(CASE WHEN s.type='click' THEN 1 END)::int AS clicks
      FROM pubs p
      LEFT JOIN stats s ON s.pub_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);
    res.set('Cache-Control', 'no-store');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Créer une pub
app.post('/api/pubs', requireAuth, async (req, res) => {
  const { name, href, img, alt, contact, description, slot, expires, duration } = req.body;
  if (!name || !href || !img)
    return res.status(400).json({ error: 'name, href et img sont requis' });
  try {
    const row = await q1(`
      INSERT INTO pubs (name, href, img, alt, contact, description, slot, expires, duration, active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
      RETURNING *
    `, [name, href, img, alt||name, contact||null, description||null,
        slot||'both', expires||null, duration||10]);
    res.status(201).json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Modifier une pub
app.put('/api/pubs/:id', requireAuth, async (req, res) => {
  const { name, href, img, alt, contact, description, slot, expires, duration } = req.body;
  if (!name || !href)
    return res.status(400).json({ error: 'name et href sont requis' });
  try {
    // Si pas de nouvelle image, on garde l'ancienne
    const current = await q1('SELECT img FROM pubs WHERE id=$1', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Pub introuvable' });
    const row = await q1(`
      UPDATE pubs SET
        name=$1, href=$2, img=$3, alt=$4, contact=$5,
        description=$6, slot=$7, expires=$8, duration=$9
      WHERE id=$10 RETURNING *
    `, [name, href, img||current.img, alt||name, contact||null,
        description||null, slot||'both', expires||null, duration||10, req.params.id]);
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Activer / désactiver
app.patch('/api/pubs/:id/toggle', requireAuth, async (req, res) => {
  try {
    const row = await q1(`
      UPDATE pubs SET active = NOT active WHERE id=$1 RETURNING *
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Pub introuvable' });
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Supprimer
app.delete('/api/pubs/:id', requireAuth, async (req, res) => {
  try {
    await q('DELETE FROM pubs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════
   CONFIGURATION
══════════════════════════════════════════════════════════ */
app.get('/api/config', async (req, res) => {
  try {
    const row = await q1('SELECT * FROM config WHERE id=1');
    res.json(row || { duration: 10, slot: 'both' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/config', requireAuth, async (req, res) => {
  const { duration, slot } = req.body;
  try {
    const row = await q1(`
      UPDATE config SET duration=$1, slot=$2, updated_at=NOW()
      WHERE id=1 RETURNING *
    `, [duration||10, slot||'both']);
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════
   STATISTIQUES
══════════════════════════════════════════════════════════ */
app.post('/api/stats/view/:id', async (req, res) => {
  try {
    await q('INSERT INTO stats (pub_id, type) VALUES ($1,$2)', [req.params.id, 'view']);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/stats/click/:id', async (req, res) => {
  try {
    await q('INSERT INTO stats (pub_id, type) VALUES ($1,$2)', [req.params.id, 'click']);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const rows = await q(`
      SELECT pub_id,
        COUNT(CASE WHEN type='view'  THEN 1 END)::int AS views,
        COUNT(CASE WHEN type='click' THEN 1 END)::int AS clicks
      FROM stats GROUP BY pub_id
    `);
    const agg = {};
    rows.forEach(function(r){ agg[r.pub_id] = { views: r.views, clicks: r.clicks }; });
    res.json(agg);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════════════════════
   MESSAGES DE CONTACT
══════════════════════════════════════════════════════════ */
app.post('/api/contact', async (req, res) => {
  const { nom, email, message } = req.body;
  if (!nom || !email || !message)
    return res.status(400).json({ error: 'nom, email et message sont requis' });
  try {
    // 1. Stocker en base
    await q(
      'INSERT INTO messages (nom, email, message) VALUES ($1,$2,$3)',
      [nom, email, message]
    );
    // 2. Envoyer l'email
    await mailer.sendMail({
      from:    `"ElectraBénin" <${process.env.SMTP_USER}>`,
      to:      process.env.CONTACT_DEST,
      replyTo: `"${nom}" <${email}>`,
      subject: `[ElectraBénin] Nouveau message de ${nom}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#f8f9fb;border-radius:10px;">
          <h2 style="color:#ed1f24;margin-bottom:4px;">Nouveau message</h2>
          <p style="color:#888;font-size:.85rem;margin-bottom:20px;">ElectraBénin · Formulaire de contact</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 12px;font-weight:700;background:#fff;border:1px solid #eee;width:110px;">Nom</td>
                <td style="padding:8px 12px;background:#fff;border:1px solid #eee;">${nom}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:700;background:#f4f5f7;border:1px solid #eee;">Email</td>
                <td style="padding:8px 12px;background:#f4f5f7;border:1px solid #eee;">
                  <a href="mailto:${email}" style="color:#3b5998;">${email}</a></td></tr>
            <tr><td style="padding:8px 12px;font-weight:700;background:#fff;border:1px solid #eee;vertical-align:top;">Message</td>
                <td style="padding:8px 12px;background:#fff;border:1px solid #eee;white-space:pre-wrap;">${message}</td></tr>
          </table>
          <p style="margin-top:20px;font-size:.75rem;color:#aaa;">Répondez directement à cet email pour contacter ${nom}.</p>
        </div>
      `
    });
    res.json({ ok: true });
  } catch(e) {
    console.error('Contact error:', e.message);
    // Si email échoue mais BDD OK, on informe sans bloquer
    if (e.message.includes('SMTP') || e.code === 'ECONNREFUSED') {
      return res.status(500).json({ error: 'Message enregistré mais email non envoyé.', saved: true });
    }
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const rows = await q('SELECT * FROM messages ORDER BY created_at DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/messages/:id/read', requireAuth, async (req, res) => {
  try {
    const row = await q1('UPDATE messages SET lu=true WHERE id=$1 RETURNING *', [req.params.id]);
    res.json(row);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/messages/:id', requireAuth, async (req, res) => {
  try {
    await q('DELETE FROM messages WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ── Health check ─────────────────────────────────────────── */
app.get('/health', (req, res) => res.json({ status: 'ok', app: 'ElectraBénin API' }));

/* ── Démarrage ────────────────────────────────────────────── */
app.listen(PORT, () => console.log(`✅ ElectraBénin API démarrée sur le port ${PORT}`));