-- ═══════════════════════════════════════════════════════
--  ElectraBénin — Schéma Supabase
--  Coller dans : Supabase > SQL Editor > New query
-- ═══════════════════════════════════════════════════════

-- ── Publicités ──────────────────────────────────────────
CREATE TABLE pubs (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  href        TEXT NOT NULL,
  img         TEXT NOT NULL,        -- base64 ou URL
  alt         TEXT,
  contact     TEXT,
  description TEXT,
  slot        TEXT DEFAULT 'both',  -- 'sidebar' | 'bottom' | 'both'
  active      BOOLEAN DEFAULT true,
  expires     DATE,
  duration    INTEGER DEFAULT 10,   -- secondes
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Configuration globale ────────────────────────────────
CREATE TABLE config (
  id        INTEGER PRIMARY KEY DEFAULT 1,  -- une seule ligne
  duration  INTEGER DEFAULT 10,
  slot      TEXT DEFAULT 'both',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO config (id, duration, slot) VALUES (1, 10, 'both')
  ON CONFLICT (id) DO NOTHING;

-- ── Messages de contact ──────────────────────────────────
CREATE TABLE messages (
  id         BIGSERIAL PRIMARY KEY,
  nom        TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  lu         BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Statistiques pubs (vues / clics) ────────────────────
CREATE TABLE stats (
  id         BIGSERIAL PRIMARY KEY,
  pub_id     BIGINT REFERENCES pubs(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('view','click')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes stats rapides
CREATE INDEX idx_stats_pub_id ON stats(pub_id);
CREATE INDEX idx_stats_type   ON stats(type);

-- ── Vue pratique pour le dashboard ──────────────────────
CREATE VIEW pubs_with_stats AS
SELECT
  p.*,
  COUNT(CASE WHEN s.type='view'  THEN 1 END) AS views,
  COUNT(CASE WHEN s.type='click' THEN 1 END) AS clicks
FROM pubs p
LEFT JOIN stats s ON s.pub_id = p.id
GROUP BY p.id
ORDER BY p.created_at DESC;
