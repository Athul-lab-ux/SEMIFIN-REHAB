-- RehabOpt AR Database Schema
-- Neuro-Rehabilitation Platform

-- Patients Table
CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    selected_condition TEXT DEFAULT 'Hemiparesis',
    current_streak INTEGER DEFAULT 1,
    last_session_date TEXT,
    onboarding_done INTEGER DEFAULT 0,      -- 0 = must complete the onboarding questions
    stroke_onset TEXT,                      -- "how did it happen" (typed or voice-to-text)
    affected_side TEXT DEFAULT '',          -- left | right | both
    onset_ago TEXT DEFAULT '',              -- how long ago the stroke happened
    daily_struggles TEXT DEFAULT '',        -- comma list: hardest daily tasks (eating,dressing,...)
    doing_therapy TEXT DEFAULT '',          -- physio | occupational | speech | none
    pain_level TEXT DEFAULT '',             -- none | mild | moderate | severe
    rehab_goal TEXT DEFAULT '',             -- move | daily | fine | stiffness | strength | balance
    goal_note TEXT,                         -- short personal recovery goal (typed or voice-to-text)
    patient_name TEXT DEFAULT '',            -- optional display name
    patient_dob TEXT DEFAULT '',             -- optional date of birth (YYYY-MM-DD)
    patient_phone TEXT DEFAULT '',           -- optional phone number
    primary_color TEXT DEFAULT '',           -- user's chosen primary accent
    secondary_color TEXT DEFAULT '',         -- user's chosen secondary accent
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clinical Telemetry Session Logs
CREATE TABLE IF NOT EXISTS telemetry_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    session_type TEXT NOT NULL,
    condition TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    peak_rom REAL DEFAULT 0.0,
    smoothness_score REAL DEFAULT 0.0,
    cheats_blocked INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    metrics_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

-- AI Chat Daily Usage Logs
CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    model_used TEXT DEFAULT 'gemini-3.7-flash',
    status TEXT DEFAULT 'success',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

-- Pre-seed Initial Demonstration Account (already onboarded → skips questions)
INSERT OR IGNORE INTO patients (patient_id, email, password_hash, selected_condition, current_streak, last_session_date, onboarding_done)
VALUES (
    'SP-000000001',
    'demo@gmail.com',
    'scrypt:32768:8:1$e4a1b7c9d0f12345$testpasswordhash',
    'Hemiparesis',
    5,
    '2026-09-03',
    1
);
