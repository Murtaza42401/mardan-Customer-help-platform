-- ═══════════════════════════════════════════════════════════════
--  MARDAN HELP PORTAL — PostgreSQL Database Schema
--  Run this in Railway / Supabase / any PostgreSQL instance
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ───────────────────────────────────────────────────────
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    first_name      VARCHAR(50) NOT NULL,
    last_name       VARCHAR(50) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    area            VARCHAR(100) DEFAULT 'City Center',
    avatar_url      VARCHAR(500),
    role            VARCHAR(20) DEFAULT 'citizen' CHECK (role IN ('citizen','admin','moderator')),
    points          INTEGER DEFAULT 0,
    verified        BOOLEAN DEFAULT FALSE,
    last_login      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_points ON users(points DESC);

-- ─── PROBLEMS ────────────────────────────────────────────────────
CREATE TABLE problems (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title               VARCHAR(200) NOT NULL,
    description         TEXT NOT NULL,
    category            VARCHAR(50) NOT NULL CHECK (category IN (
                            'Road','Water','Garbage','Electric','Health','Emergency','Other')),
    location            VARCHAR(100) NOT NULL,
    landmark            VARCHAR(200),
    priority            VARCHAR(20) DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Emergency')),
    status              VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','progress','done','rejected')),
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
    latitude            DECIMAL(10,8) DEFAULT 34.1988,
    longitude           DECIMAL(11,8) DEFAULT 72.0247,
    verified            BOOLEAN DEFAULT FALSE,
    fake_reports        INTEGER DEFAULT 0,
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_problems_status ON problems(status);
CREATE INDEX idx_problems_category ON problems(category);
CREATE INDEX idx_problems_location ON problems(location);
CREATE INDEX idx_problems_user ON problems(user_id);
CREATE INDEX idx_problems_created ON problems(created_at DESC);

-- ─── PROBLEM IMAGES ──────────────────────────────────────────────
CREATE TABLE problem_images (
    id          SERIAL PRIMARY KEY,
    problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    image_url   VARCHAR(500) NOT NULL,
    is_proof    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_images_problem ON problem_images(problem_id);

-- ─── VOTES ───────────────────────────────────────────────────────
CREATE TABLE votes (
    id          SERIAL PRIMARY KEY,
    problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(problem_id, user_id)
);

CREATE INDEX idx_votes_problem ON votes(problem_id);
CREATE INDEX idx_votes_user ON votes(user_id);

-- ─── COMMENTS ────────────────────────────────────────────────────
CREATE TABLE comments (
    id          SERIAL PRIMARY KEY,
    problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    is_official BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_comments_problem ON comments(problem_id);

-- ─── PROGRESS UPDATES ────────────────────────────────────────────
CREATE TABLE progress_updates (
    id          SERIAL PRIMARY KEY,
    problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    admin_id    INTEGER NOT NULL REFERENCES users(id),
    description TEXT NOT NULL,
    percentage  INTEGER NOT NULL,
    proof_url   VARCHAR(500),
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_progress_problem ON progress_updates(problem_id);

-- ─── EMERGENCY ALERTS ────────────────────────────────────────────
CREATE TABLE emergency_alerts (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    message     TEXT NOT NULL,
    location    VARCHAR(200),
    latitude    DECIMAL(10,8),
    longitude   DECIMAL(11,8),
    resolved    BOOLEAN DEFAULT FALSE,
    admin_notes TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_emergency_resolved ON emergency_alerts(resolved);
CREATE INDEX idx_emergency_created ON emergency_alerts(created_at DESC);

-- ─── ACTIVITIES ──────────────────────────────────────────────────
CREATE TABLE activities (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL,
    target_id   INTEGER,
    description TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activities_created ON activities(created_at DESC);

-- ─── CAMPAIGNS (DONATIONS) ───────────────────────────────────────
CREATE TABLE campaigns (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    problem_id  INTEGER REFERENCES problems(id),
    target      DECIMAL(12,2) NOT NULL,
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── CONTRIBUTIONS ───────────────────────────────────────────────
CREATE TABLE contributions (
    id          SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    amount      DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    message     TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contributions_campaign ON contributions(campaign_id);

-- ─── FAKE REPORT FLAGS ───────────────────────────────────────────
CREATE TABLE fake_flags (
    id          SERIAL PRIMARY KEY,
    problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    reason      TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(problem_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════
--  SEED DATA — Demo admin + initial data
-- ═══════════════════════════════════════════════════════════════
-- Password: admin1234 (bcrypt hashed)
INSERT INTO users (first_name, last_name, email, password_hash, area, role, points, verified) VALUES
('Admin', 'Mardan', 'admin@mardan.pk', '$2a$12$placeholder_hash_here', 'City Center', 'admin', 9999, true),
('Ahmad', 'Khan', 'demo@mardan.pk', '$2a$12$placeholder_hash_here', 'City Center', 'citizen', 340, true);

-- Sample campaigns
INSERT INTO campaigns (title, description, target) VALUES
('Katlang Road Repair Fund', 'Community fund to repair Katlang Road potholes', 1000000),
('Shergarh Water Pipeline', 'New water pipeline for 500+ families in Shergarh', 500000),
('Street Light Restoration', 'Solar street lights for 3 dark areas of Mardan', 250000);

-- ═══════════════════════════════════════════════════════════════
--  USEFUL VIEWS
-- ═══════════════════════════════════════════════════════════════
CREATE VIEW problem_summary AS
SELECT 
    p.id, p.title, p.category, p.location, p.status, p.priority,
    p.progress_percentage, p.latitude, p.longitude, p.created_at,
    u.first_name || ' ' || u.last_name AS reporter_name,
    u.verified AS reporter_verified,
    COUNT(DISTINCT v.id) AS vote_count,
    COUNT(DISTINCT c.id) AS comment_count
FROM problems p
LEFT JOIN users u ON p.user_id = u.id
LEFT JOIN votes v ON v.problem_id = p.id
LEFT JOIN comments c ON c.problem_id = p.id
GROUP BY p.id, u.id;

CREATE VIEW dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM problems) AS total,
    (SELECT COUNT(*) FROM problems WHERE status = 'pending') AS pending,
    (SELECT COUNT(*) FROM problems WHERE status = 'progress') AS in_progress,
    (SELECT COUNT(*) FROM problems WHERE status = 'done') AS resolved,
    (SELECT COUNT(*) FROM users WHERE role = 'citizen') AS citizens,
    (SELECT COUNT(*) FROM emergency_alerts WHERE resolved = false) AS open_emergencies;
