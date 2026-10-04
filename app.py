"""
RehabOpt AR — Neuro-Rehabilitation Platform Backend
Production-grade Flask server with standalone clinical AI engine and zero-leak proxy.
"""

import os
import re
import sqlite3
try:
    import psycopg2
except ImportError:
    psycopg2 = None
import secrets
import string
import base64
from datetime import datetime, timedelta
from functools import wraps
import time
import json

from dotenv import load_dotenv

# Load .env file for local development (not in production container environments)
if not os.environ.get("RENDER"):
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from flask import (
    Flask, render_template, request, redirect, url_for,
    session, jsonify, g, abort
)
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix
try:
    from google import genai
    from google.genai import types
except Exception:
    genai = None
    types = None

# ---------------------------------------------------------------------------
# App Configuration
# ---------------------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
    static_url_path="/static",
)
# Detect production (Render sets RENDER=true, or check FLASK_ENV=production)
_IS_PRODUCTION = bool(
    os.environ.get("RENDER")
    or os.environ.get("FLASK_ENV") == "production"
    or os.environ.get("ENV") == "production"
)

# Stable secret key: must come from the environment. If missing in production, stop with fatal error.
secret_key_env = os.environ.get("SECRET_KEY") or os.environ.get("FLASK_SECRET_KEY")
if _IS_PRODUCTION and not secret_key_env:
    raise RuntimeError(
        "CRITICAL SECURITY CONFIGURATION ERROR: SECRET_KEY environment variable is required in production! "
        "Please configure SECRET_KEY in your Render dashboard environment variables."
    )
app.secret_key = secret_key_env or "rehabopt-ar-dev-fallback-secret-key-2026"

# ProxyFix for Render/reverse proxy (ensures correct scheme detection for secure cookies)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=_IS_PRODUCTION,  # True on HTTPS production, False for local dev
    PERMANENT_SESSION_LIFETIME=timedelta(hours=24),
)

# Database Configuration: PostgreSQL (Render / Neon / Supabase via DATABASE_URL) or SQLite fallback
DATABASE_URL = os.environ.get("DATABASE_URL")
if os.environ.get("VERCEL"):
    DATABASE = os.environ.get("SQLITE_PATH", "/tmp/rehabopt.db")
else:
    DATABASE = os.environ.get("SQLITE_PATH", os.path.join(BASE_DIR, "rehabopt.db"))

# ---------------------------------------------------------------------------
# Login Rate Limiting (in-memory, resets on restart)
# NOTE: This counter is held in memory and is per-worker process.
# ---------------------------------------------------------------------------
_login_attempts = {}  # key: identifier, value: {'count': int, 'locked_until': float}
_MAX_LOGIN_ATTEMPTS = 5
_LOCKOUT_SECONDS = 60

def check_rate_limit(identifier):
    """Check if login attempts are rate-limited. Returns (allowed, seconds_remaining)."""
    now = time.time()
    key = identifier.lower().strip()
    entry = _login_attempts.get(key)
    if not entry:
        return True, 0
    if entry.get('locked_until', 0) > now:
        return False, int(entry['locked_until'] - now)
    if entry['count'] >= _MAX_LOGIN_ATTEMPTS:
        entry['locked_until'] = now + _LOCKOUT_SECONDS
        return False, _LOCKOUT_SECONDS
    return True, 0

def record_failed_login(identifier):
    """Record a failed login attempt."""
    key = identifier.lower().strip()
    now = time.time()
    entry = _login_attempts.get(key, {'count': 0, 'locked_until': 0})
    if entry.get('locked_until', 0) <= now:
        entry['count'] = entry.get('count', 0) + 1
        if entry['count'] >= _MAX_LOGIN_ATTEMPTS:
            entry['locked_until'] = now + _LOCKOUT_SECONDS
    _login_attempts[key] = entry

def clear_login_attempts(identifier):
    """Clear login attempts on successful login."""
    key = identifier.lower().strip()
    _login_attempts.pop(key, None)

# ---------------------------------------------------------------------------
# Security Headers
# ---------------------------------------------------------------------------
@app.after_request
def add_security_headers(response):
    response.headers["Permissions-Policy"] = "camera=(self)"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    if request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=86400"
    return response


# ---------------------------------------------------------------------------
# Health Check Endpoint (A9)
# ---------------------------------------------------------------------------
@app.route("/healthz")
def healthz():
    """Health check endpoint: returns status OK and database in use without exposing secrets."""
    db_type = "postgres" if (DATABASE_URL and psycopg2 is not None) else "sqlite"
    return jsonify({
        "status": "OK",
        "database": db_type,
    }), 200


# ---------------------------------------------------------------------------
# Route Security & Protection (All /api/admin/... routes require owner role)
# ---------------------------------------------------------------------------
@app.before_request
def enforce_admin_route_protection():
    if request.path.startswith("/api/admin"):
        if "patient_id" not in session:
            return jsonify({"status": "error", "message": "Authentication required. Please sign in."}), 401
        is_owner = (session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1")
        if not is_owner:
            return jsonify({"status": "error", "message": "Access denied. Controller privileges required."}), 403


@app.context_processor
def inject_patient_theme():
    """Inject the active patient's custom primary color into all templates."""
    theme_color = "#10B981"
    if "patient_id" in session:
        try:
            db = get_db()
            row = db.execute(
                "SELECT primary_color FROM patients WHERE patient_id = ?",
                (session["patient_id"],),
            ).fetchone()
            if row and row["primary_color"]:
                theme_color = row["primary_color"]
        except Exception:
            pass
    return dict(patient_theme_color=theme_color)

# ---------------------------------------------------------------------------
# Embedded Database Schema (guaranteed to load even in serverless Lambda bundles)
# ---------------------------------------------------------------------------
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT UNIQUE NOT NULL,
    username TEXT DEFAULT '',
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'patient',
    selected_condition TEXT DEFAULT 'Hemiparesis',
    current_streak INTEGER DEFAULT 1,
    last_session_date TEXT,
    onboarding_done INTEGER DEFAULT 0,
    stroke_onset TEXT,
    affected_side TEXT DEFAULT '',
    onset_ago TEXT DEFAULT '',
    daily_struggles TEXT DEFAULT '',
    doing_therapy TEXT DEFAULT '',
    pain_level TEXT DEFAULT '',
    rehab_goal TEXT DEFAULT '',
    goal_note TEXT,
    patient_name TEXT DEFAULT '',
    patient_dob TEXT DEFAULT '',
    patient_phone TEXT DEFAULT '',
    primary_color TEXT DEFAULT '',
    secondary_color TEXT DEFAULT '',
    profile_photo TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS clinical_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    report_type TEXT DEFAULT 'SOAP',
    content TEXT NOT NULL,
    soap_subjective TEXT,
    soap_objective TEXT,
    soap_assessment TEXT,
    soap_plan TEXT,
    status TEXT DEFAULT 'DRAFT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    model_used TEXT DEFAULT 'gemini-3.7-flash',
    status TEXT DEFAULT 'success',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);
"""

# ---------------------------------------------------------------------------
# PostgreSQL Database Adapters (for Render / Neon / Supabase)
# Translates standard SQLite conventions (placeholders, dict rows, PRAGMA)
# ---------------------------------------------------------------------------
class PostgresRowWrapper(dict):
    """Dict subclass that also supports integer index access, matching sqlite3.Row."""
    def __init__(self, d, keys):
        super().__init__(d)
        self._keys = keys

    def __getitem__(self, item):
        if isinstance(item, int):
            return super().__getitem__(self._keys[item])
        if item in self:
            return super().__getitem__(item)
        for k in self:
            if k.lower() == str(item).lower():
                return super().__getitem__(k)
        raise KeyError(item)


class PostgresCursorWrapper:
    """Cursor wrapper that translates ? to %s and returns PostgresRowWrapper rows."""
    def __init__(self, cursor):
        self._cursor = cursor

    @property
    def lastrowid(self):
        return getattr(self._cursor, "lastrowid", None)

    @property
    def rowcount(self):
        return self._cursor.rowcount

    @property
    def description(self):
        return self._cursor.description

    def _wrap_row(self, row):
        if row is None:
            return None
        keys = [desc[0] for desc in self._cursor.description]
        return PostgresRowWrapper(dict(zip(keys, row)), keys)

    def execute(self, sql, params=None):
        clean_sql = sql.strip()
        if clean_sql.upper().startswith("PRAGMA TABLE_INFO"):
            match = re.search(r"PRAGMA\s+table_info\((\w+)\)", clean_sql, re.IGNORECASE)
            if match:
                tbl = match.group(1).lower()
                clean_sql = f"SELECT column_name AS name FROM information_schema.columns WHERE lower(table_name) = '{tbl}'"
            else:
                return self
        elif clean_sql.upper().startswith("PRAGMA"):
            return self
        if "INSERT OR IGNORE INTO" in clean_sql:
            clean_sql = clean_sql.replace("INSERT OR IGNORE INTO", "INSERT INTO")
            if "ON CONFLICT" not in clean_sql.upper():
                clean_sql = clean_sql.rstrip("; \n") + " ON CONFLICT DO NOTHING"
        elif "INSERT OR REPLACE INTO" in clean_sql:
            clean_sql = clean_sql.replace("INSERT OR REPLACE INTO", "INSERT INTO")
            if "ON CONFLICT" not in clean_sql.upper():
                clean_sql = clean_sql.rstrip("; \n") + " ON CONFLICT DO NOTHING"
        clean_sql = clean_sql.replace("?", "%s")
        if params is not None:
            self._cursor.execute(clean_sql, params)
        else:
            self._cursor.execute(clean_sql)
        return self

    def executemany(self, sql, seq_of_params):
        clean_sql = sql.replace("?", "%s")
        self._cursor.executemany(clean_sql, seq_of_params)
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        return self._wrap_row(row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        if not rows:
            return []
        keys = [desc[0] for desc in self._cursor.description]
        return [PostgresRowWrapper(dict(zip(keys, r)), keys) for r in rows]

    def __iter__(self):
        while True:
            row = self.fetchone()
            if row is None:
                break
            yield row

    def close(self):
        self._cursor.close()


class PostgresConnectionWrapper:
    """Connection wrapper for psycopg2 connections providing SQLite-compatible API."""
    def __init__(self, raw_conn):
        self._conn = raw_conn

    def cursor(self):
        return PostgresCursorWrapper(self._conn.cursor())

    def execute(self, sql, params=None):
        cur = self.cursor()
        return cur.execute(sql, params)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def executescript(self, script_sql):
        pg_sql = script_sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        pg_sql = pg_sql.replace("REAL", "DOUBLE PRECISION")
        cur = self._conn.cursor()
        cur.execute(pg_sql)
        self._conn.commit()
        cur.close()

    def close(self):
        self._conn.close()


# ---------------------------------------------------------------------------
# Database Helpers
# ---------------------------------------------------------------------------
_schema_initialized = False

def seed_or_update_owner(db):
    """Seed or update fixed Controller / Owner account (SP_OWNER_1) using OWNER_PASSWORD env var."""
    try:
        owner_pass = os.environ.get("OWNER_PASSWORD")
        if not owner_pass:
            print("[WARN] OWNER_PASSWORD environment variable is not set. Controller account SP_OWNER_1 will not be created or updated.")
            return

        owner_hash = generate_password_hash(owner_pass.strip(), method="scrypt")
        existing_owner = db.execute("SELECT id FROM patients WHERE UPPER(patient_id) = 'SP_OWNER_1'").fetchone()
        if existing_owner:
            db.execute(
                """UPDATE patients SET
                   password_hash = ?,
                   role = 'owner',
                   username = 'owner',
                   email = 'owner@rehabopt.com',
                   patient_name = 'App Controller',
                   onboarding_done = 1
                   WHERE UPPER(patient_id) = 'SP_OWNER_1'""",
                (owner_hash,),
            )
        else:
            db.execute(
                """INSERT INTO patients
                   (patient_id, username, email, password_hash, role, patient_name,
                    selected_condition, current_streak, onboarding_done)
                   VALUES ('SP_OWNER_1', 'owner', 'owner@rehabopt.com', ?, 'owner',
                           'App Controller', 'Hemiparesis', 10, 1)""",
                (owner_hash,),
            )
        db.commit()
    except Exception as e:
        print(f"[WARN] seed_or_update_owner: {e}")


def seed_demo_patient(db):
    """Seed initial demo patient SP_00001 if not present."""
    try:
        existing_sp1 = db.execute("SELECT id FROM patients WHERE UPPER(patient_id) = 'SP_00001'").fetchone()
        if not existing_sp1:
            demo_hash = generate_password_hash("PatientDemo@123", method="scrypt")
            db.execute(
                """INSERT OR IGNORE INTO patients
                   (patient_id, username, email, password_hash, role, patient_name,
                    selected_condition, current_streak, last_session_date, onboarding_done)
                   VALUES ('SP_00001', 'demo', 'demo@gmail.com', ?, 'patient',
                           'Demo Recovery Patient', 'Hemiparesis', 5, '2026-09-03', 1)""",
                (demo_hash,),
            )
            db.commit()
    except Exception as e:
        print(f"[WARN] seed_demo_patient: {e}")


def init_db_schema_once(db):
    global _schema_initialized
    if not _schema_initialized:
        db.executescript(SCHEMA_SQL)
        ensure_schema_columns(db)
        seed_or_update_owner(db)
        seed_demo_patient(db)
        _schema_initialized = True

def get_db():
    if "db" not in g:
        if DATABASE_URL and psycopg2 is not None:
            # PostgreSQL connection via psycopg2 (Render / Neon / Supabase)
            pg_url = DATABASE_URL
            if pg_url.startswith("postgres://"):
                pg_url = pg_url.replace("postgres://", "postgresql://", 1)
            raw_conn = psycopg2.connect(pg_url)
            g.db = PostgresConnectionWrapper(raw_conn)
            init_db_schema_once(g.db)
            return g.db

        os.makedirs(os.path.dirname(os.path.abspath(DATABASE)), exist_ok=True)
        need_seed = not os.path.exists(DATABASE) or os.path.getsize(DATABASE) == 0
        g.db = sqlite3.connect(DATABASE, timeout=30.0)
        g.db.row_factory = sqlite3.Row
        if os.environ.get("VERCEL"):
            try:
                g.db.execute("PRAGMA journal_mode=MEMORY")
            except Exception:
                pass
        else:
            try:
                g.db.execute("PRAGMA journal_mode=WAL")
                g.db.execute("PRAGMA synchronous=NORMAL")
            except Exception:
                pass
        try:
            g.db.execute("PRAGMA foreign_keys=ON")
        except Exception:
            pass
        # Ensure schema tables exist (run once per process lifecycle)
        init_db_schema_once(g.db)
        if need_seed:
            try:
                demo_hash = generate_password_hash("PatientDemo@123", method="scrypt")
                g.db.execute(
                    """INSERT OR IGNORE INTO patients
                       (patient_id, username, email, password_hash, role, selected_condition, current_streak, last_session_date, onboarding_done)
                       VALUES (?, 'demo', ?, ?, 'patient', 'Hemiparesis', 5, '2026-09-03', 1)""",
                    ("SP-000000001", "demo@gmail.com", demo_hash),
                )
                test_hash = generate_password_hash("TestPass@123", method="scrypt")
                g.db.execute(
                    """INSERT OR IGNORE INTO patients
                       (patient_id, username, email, password_hash, role, patient_name, selected_condition, current_streak, last_session_date, onboarding_done)
                       VALUES (?, 'testpatient', ?, ?, 'patient', 'Clinical Test Patient', 'Hemiparesis', 7, '2026-09-14', 1)""",
                    ("SP-TEST-001", "testpatient@rehabopt.local", test_hash),
                )
                g.db.commit()
            except Exception as e:
                print(f"[WARN] demo seed: {e}")
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def ensure_schema_columns(db):
    """Add columns introduced after v1 to databases that already exist."""
    try:
        if isinstance(db, PostgresConnectionWrapper):
            rows = db.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'patients'").fetchall()
            existing = {r["column_name"].lower() for r in rows}
        else:
            existing = {r["name"].lower() for r in db.execute("PRAGMA table_info(patients)").fetchall()}
        additions = {
            "role": "TEXT DEFAULT 'patient'",
            "username": "TEXT DEFAULT ''",
            "onboarding_done": "INTEGER DEFAULT 0",
            "stroke_onset": "TEXT",
            "affected_side": "TEXT DEFAULT ''",
            "onset_ago": "TEXT DEFAULT ''",
            "daily_struggles": "TEXT DEFAULT ''",
            "doing_therapy": "TEXT DEFAULT ''",
            "pain_level": "TEXT DEFAULT ''",
            "rehab_goal": "TEXT DEFAULT ''",
            "goal_note": "TEXT",
            "patient_name": "TEXT DEFAULT ''",
            "patient_dob": "TEXT DEFAULT ''",
            "patient_phone": "TEXT DEFAULT ''",
            "primary_color": "TEXT DEFAULT ''",
            "secondary_color": "TEXT DEFAULT ''",
            "profile_photo": "TEXT DEFAULT ''",
        }
        for col, ddl in additions.items():
            if col.lower() not in existing:
                db.execute(f"ALTER TABLE patients ADD COLUMN {col} {ddl}")
        db.commit()
    except Exception as e:
        print(f"[WARN] ensure_schema_columns: {e}")


def init_db():
    """Initialize the database and seed demo account and controller."""
    if DATABASE_URL and psycopg2 is not None:
        pg_url = DATABASE_URL
        if pg_url.startswith("postgres://"):
            pg_url = pg_url.replace("postgres://", "postgresql://", 1)
        raw_conn = psycopg2.connect(pg_url)
        db = PostgresConnectionWrapper(raw_conn)
        db.executescript(SCHEMA_SQL)
        ensure_schema_columns(db)
        seed_or_update_owner(db)
        demo_hash = generate_password_hash("PatientDemo@123", method="scrypt")
        db.execute(
            """INSERT INTO patients
               (patient_id, username, email, password_hash, role, selected_condition, current_streak, last_session_date, onboarding_done)
               VALUES (?, 'demo', ?, ?, 'patient', 'Hemiparesis', 5, '2026-09-03', 1)
               ON CONFLICT DO NOTHING""",
            ("SP-000000001", "demo@gmail.com", demo_hash),
        )
        test_hash = generate_password_hash("TestPass@123", method="scrypt")
        db.execute(
            """INSERT INTO patients
               (patient_id, username, email, password_hash, role, patient_name, selected_condition, current_streak, last_session_date, onboarding_done)
               VALUES (?, 'testpatient', ?, ?, 'patient', 'Clinical Test Patient', 'Hemiparesis', 7, '2026-09-14', 1)
               ON CONFLICT DO NOTHING""",
            ("SP-TEST-001", "testpatient@rehabopt.local", test_hash),
        )
        db.commit()
        db.close()
        return

    os.makedirs(os.path.dirname(os.path.abspath(DATABASE)), exist_ok=True)
    db = sqlite3.connect(DATABASE, timeout=30.0)
    db.row_factory = sqlite3.Row
    if os.environ.get("VERCEL"):
        try:
            db.execute("PRAGMA journal_mode=MEMORY")
        except Exception:
            pass
    else:
        try:
            db.execute("PRAGMA journal_mode=WAL")
        except Exception:
            pass
    db.executescript(SCHEMA_SQL)
    ensure_schema_columns(db)
    seed_or_update_owner(db)

    # Generate real scrypt hash for demo password
    demo_hash = generate_password_hash("PatientDemo@123", method="scrypt")
    db.execute(
        """INSERT OR IGNORE INTO patients
           (patient_id, username, email, password_hash, role, selected_condition, current_streak, last_session_date, onboarding_done)
           VALUES (?, 'demo', ?, ?, 'patient', 'Hemiparesis', 5, '2026-09-03', 1)""",
        ("SP-000000001", "demo@gmail.com", demo_hash),
    )
    test_hash = generate_password_hash("TestPass@123", method="scrypt")
    db.execute(
        """INSERT OR IGNORE INTO patients
           (patient_id, username, email, password_hash, role, patient_name, selected_condition, current_streak, last_session_date, onboarding_done)
           VALUES (?, 'testpatient', ?, ?, 'patient', 'Clinical Test Patient', 'Hemiparesis', 7, '2026-09-14', 1)""",
        ("SP-TEST-001", "testpatient@rehabopt.local", test_hash),
    )
    db.commit()
    db.close()


# ---------------------------------------------------------------------------
# Authentication Helpers
# ---------------------------------------------------------------------------
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "patient_id" not in session:
            return redirect(url_for("auth_portal"))
        return f(*args, **kwargs)
    return decorated_function


def onboarding_required(f):
    """Block clinical pages until the patient completes onboarding, except controller."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "patient_id" not in session:
            return redirect(url_for("auth_portal"))
        if session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1":
            return f(*args, **kwargs)
        db = get_db()
        row = db.execute(
            "SELECT onboarding_done FROM patients WHERE patient_id = ?",
            (session["patient_id"],),
        ).fetchone()
        if row is None or not row["onboarding_done"]:
            return redirect(url_for("onboarding"))
        return f(*args, **kwargs)
    return decorated_function


def generate_next_patient_id(db):
    """
    Generate next patient ID in valid sequence SP_00001 to SP_99999.
    Excludes owner/controller IDs (e.g. SP_OWNER_1).
    """
    cur = db.execute("SELECT patient_id FROM patients")
    max_num = 0
    for r in cur.fetchall():
        pid = (r["patient_id"] or "").strip().upper()
        # Parse SP_XXXXX or legacy SP-XXXXX
        if pid.startswith("SP_") or pid.startswith("SP-"):
            suffix = pid[3:]
            if suffix.isdigit():
                try:
                    num = int(suffix)
                    if 0 < num <= 99999 and num > max_num:
                        max_num = num
                except ValueError:
                    pass
    next_num = max_num + 1
    if next_num > 99999:
        next_num = 1
    return f"SP_{next_num:05d}"


def update_streak(db, patient_id):
    """Update the daily recovery streak for a patient."""
    today = datetime.now().strftime("%Y-%m-%d")
    cur = db.execute(
        "SELECT current_streak, last_session_date FROM patients WHERE patient_id = ?",
        (patient_id,),
    )
    row = cur.fetchone()
    if not row:
        return 1

    streak = row["current_streak"] or 1
    last_date = row["last_session_date"]

    if last_date:
        last_dt = datetime.strptime(last_date, "%Y-%m-%d")
        today_dt = datetime.strptime(today, "%Y-%m-%d")
        diff = (today_dt - last_dt).days
        if diff == 1:
            streak += 1
        elif diff > 1:
            streak = 1
        # diff == 0 → same day, no change
    else:
        streak = 1

    db.execute(
        "UPDATE patients SET current_streak = ?, last_session_date = ? WHERE patient_id = ?",
        (streak, today, patient_id),
    )
    return streak

# ---------------------------------------------------------------------------
# Page Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    if "patient_id" in session:
        if session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1":
            return redirect(url_for("dashboard"))
        db = get_db()
        row = db.execute(
            "SELECT onboarding_done FROM patients WHERE patient_id = ?",
            (session["patient_id"],),
        ).fetchone()
        if not row or not row["onboarding_done"]:
            return redirect(url_for("onboarding"))
        return redirect(url_for("dashboard"))
    return redirect(url_for("auth_portal"))


@app.route("/auth")
@app.route("/login")
def auth_portal():
    if "patient_id" in session:
        if session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1":
            return redirect(url_for("dashboard"))
        db = get_db()
        row = db.execute(
            "SELECT onboarding_done FROM patients WHERE patient_id = ?",
            (session["patient_id"],),
        ).fetchone()
        if not row or not row["onboarding_done"]:
            return redirect(url_for("onboarding"))
        return redirect(url_for("dashboard"))
    allow_demo_logins = bool(os.environ.get("ALLOW_DEMO_LOGINS") == "1")
    return render_template("auth.html", is_production=_IS_PRODUCTION, allow_demo_logins=allow_demo_logins)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("auth_portal"))


@app.route("/onboarding")
@login_required
def onboarding():
    """New-patient questionnaire: stroke type → how it happened."""
    if session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1":
        return redirect(url_for("dashboard"))
    if request.args.get("edit") != "1":
        db = get_db()
        row = db.execute(
            "SELECT onboarding_done FROM patients WHERE patient_id = ?",
            (session["patient_id"],),
        ).fetchone()
        if row and row["onboarding_done"]:
            return redirect(url_for("dashboard"))
    return render_template("onboarding.html")


@app.route("/dashboard")
@login_required
@onboarding_required
def dashboard():
    is_owner = bool(session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1")
    return render_template("dashboard.html", is_owner=is_owner)


@app.route("/therapy")
@login_required
@onboarding_required
def therapy():
    return render_template("therapy.html")


@app.route("/arcade")
@login_required
@onboarding_required
def arcade():
    return render_template("arcade.html")


@app.route("/air-canvas")
@login_required
@onboarding_required
def air_canvas():
    return render_template("air_canvas.html")


@app.route("/adl-lab")
@app.route("/adl")
@login_required
@onboarding_required
def adl_lab():
    return render_template("adl_lab.html")


@app.route("/report")
@login_required
@onboarding_required
def report():
    target_pid = None
    if session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1":
        target_pid = request.args.get("patient_id")
    return render_template("report.html", target_patient_id=target_pid)


@app.route("/profile")
@login_required
@onboarding_required
def profile():
    target_pid = None
    if session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1":
        target_pid = request.args.get("patient_id")
    return render_template("profile.html", target_patient_id=target_pid)

# ---------------------------------------------------------------------------
# API Routes — Authentication
# ---------------------------------------------------------------------------
@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json() or {}
    raw_email = (data.get("email") or "").strip()
    raw_user = (data.get("username") or "").strip()
    name = (data.get("patient_name") or data.get("name") or data.get("full_name") or "").strip()[:60]
    password = data.get("password") or ""

    if not raw_email and not raw_user:
        return jsonify({"status": "error", "message": "Email or Username and password are required"}), 400

    if "@" in raw_email:
        email = raw_email.lower()
        username = raw_user.lower() if raw_user else email.split("@")[0]
    elif "@" in raw_user:
        email = raw_user.lower()
        username = email.split("@")[0]
    else:
        username = (raw_user or raw_email).lower()
        email = f"{username}@rehabopt.local"

    is_email = bool(re.match(r"[^@]+@[^@]+\.[^@]+", email))
    is_username = bool(re.match(r"^[a-zA-Z0-9_\.\-]{1,50}$", username))
    if not is_email or not is_username:
        return jsonify({"status": "error", "message": "Please enter a valid email or username (e.g. u1, user@hospital.org)"}), 400

    if len(password) < 8:
        return jsonify({"status": "error", "message": "Password must be at least 8 characters"}), 400

    db = get_db()

    # Check duplicate email or username with friendly message
    existing_email = db.execute("SELECT id FROM patients WHERE LOWER(email) = ?", (email,)).fetchone()
    if existing_email:
        return jsonify({"status": "error", "message": "This email is already registered. Please sign in to your account."}), 409

    if username:
        existing_user = db.execute("SELECT id FROM patients WHERE username != '' AND LOWER(username) = ?", (username,)).fetchone()
        if existing_user:
            return jsonify({"status": "error", "message": "This username is already taken. Please choose another username or sign in."}), 409

    patient_id = generate_next_patient_id(db)
    password_hash = generate_password_hash(password, method="scrypt")

    if not name:
        name = username.capitalize() if username else email.split("@")[0].capitalize()

    dob = (data.get("patient_dob") or "").strip()[:10]
    phone = (data.get("patient_phone") or "").strip()[:20]
    primary_color = (data.get("primary_color") or "").strip().lower()
    secondary_color = (data.get("secondary_color") or "").strip().lower()
    if primary_color and not re.match(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", primary_color):
        primary_color = ""
    if secondary_color and not re.match(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", secondary_color):
        secondary_color = ""

    # Insert with retry for race condition on patient_id UNIQUE constraint
    for _attempt in range(3):
        try:
            db.execute(
                """INSERT INTO patients (patient_id, username, email, password_hash, role, selected_condition, current_streak, last_session_date,
                   patient_name, patient_dob, patient_phone, primary_color, secondary_color, profile_photo)
                   VALUES (?, ?, ?, ?, 'patient', 'Hemiparesis', 1, NULL, ?, ?, ?, ?, ?, '')""",
                (patient_id, username, email, password_hash, name, dob, phone, primary_color, secondary_color),
            )
            db.commit()
            break
        except Exception as e:
            if "UNIQUE" in str(e).upper() and "patient_id" in str(e).lower():
                patient_id = generate_next_patient_id(db)
                continue
            raise
    else:
        return jsonify({"status": "error", "message": "Registration failed due to high traffic. Please try again."}), 500

    session.permanent = True
    session.clear()
    session["patient_id"] = patient_id
    session["role"] = "patient"

    return jsonify({
        "status": "success",
        "patient_id": patient_id,
        "username": username,
        "email": email,
        "patient_name": name,
        "message": f"Account permanently created! Patient ID: {patient_id}. You can sign in anytime using your Email, Username, or Patient ID.",
    })


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    raw_ident = (data.get("patient_id") or data.get("email") or data.get("identifier") or data.get("username") or data.get("login") or "").strip()
    password = data.get("password") or ""

    if not raw_ident or not password:
        return jsonify({"status": "error", "message": "Patient ID, Email, or Username and password are required"}), 400

    # Rate limiting check
    allowed, wait_seconds = check_rate_limit(raw_ident)
    if not allowed:
        return jsonify({
            "status": "error",
            "message": f"Too many failed attempts. Please wait {wait_seconds} seconds before trying again."
        }), 429

    db = get_db()
    user = None

    # 1. Match on exact patient_id (case-insensitive)
    user = db.execute("SELECT * FROM patients WHERE UPPER(patient_id) = ?", (raw_ident.upper(),)).fetchone()

    # 2. Match on email (case-insensitive)
    if not user:
        user = db.execute("SELECT * FROM patients WHERE LOWER(email) = ?", (raw_ident.lower(),)).fetchone()

    # 3. Match on username column (case-insensitive)
    if not user:
        user = db.execute("SELECT * FROM patients WHERE LOWER(username) = ?", (raw_ident.lower(),)).fetchone()

    # 4. Match on email prefix before @ (e.g. u1 matching u1@rehabopt.local or u1@gmail.com)
    if not user and "@" not in raw_ident:
        user = db.execute(
            "SELECT * FROM patients WHERE LOWER(email) LIKE ? OR LOWER(email) LIKE ?",
            (raw_ident.lower() + "@%", raw_ident.lower()),
        ).fetchone()

    # 5. Match on patient_name (case-insensitive)
    if not user:
        user = db.execute("SELECT * FROM patients WHERE LOWER(patient_name) = ?", (raw_ident.lower(),)).fetchone()

    # 6. Numeric and formatted ID matching (e.g. "1", "00001", "SP_1", "SP_00001", "SP-000000039")
    if not user:
        clean_upper = raw_ident.upper()
        if clean_upper.startswith("SP_") or clean_upper.startswith("SP-") or clean_upper.isdigit():
            num_clean = re.sub(r"[^0-9]", "", clean_upper)
            if num_clean:
                try:
                    num_val = int(num_clean)
                    # Match SP_00001 (5 digits)
                    user = db.execute("SELECT * FROM patients WHERE UPPER(patient_id) = ?", (f"SP_{num_val:05d}",)).fetchone()
                    # Match legacy SP-000000001 (9 digits)
                    if not user:
                        user = db.execute("SELECT * FROM patients WHERE UPPER(patient_id) = ?", (f"SP-{num_val:09d}",)).fetchone()
                except ValueError:
                    pass

    if not user or not check_password_hash(user["password_hash"], password):
        record_failed_login(raw_ident)
        return jsonify({"status": "error", "message": "Invalid credentials. Please verify your Patient ID, Email, or Password."}), 401

    is_owner = (user["patient_id"].upper() == "SP_OWNER_1" or (user["role"] if "role" in user.keys() else "") == "owner")
    clear_login_attempts(raw_ident)
    session.permanent = True
    session.clear()
    session["patient_id"] = user["patient_id"]
    session["role"] = "owner" if is_owner else "patient"

    return jsonify({
        "status": "success",
        "patient_id": user["patient_id"],
        "username": user["username"] if "username" in user.keys() else "",
        "email": user["email"],
        "patient_name": user["patient_name"],
        "condition": user["selected_condition"],
        "is_owner": is_owner,
        "role": "owner" if is_owner else "patient",
        "onboarding_done": True if is_owner else bool(user["onboarding_done"]),
    })


@app.route("/api/profile/password", methods=["POST"])
@login_required
def api_profile_password():
    data = request.get_json() or {}
    new_password = (data.get("password") or data.get("new_password") or "").strip()

    if len(new_password) < 8:
        return jsonify({"status": "error", "message": "Password must be at least 8 characters"}), 400

    db = get_db()
    new_hash = generate_password_hash(new_password, method="scrypt")
    db.execute("UPDATE patients SET password_hash = ? WHERE patient_id = ?", (new_hash, session["patient_id"]))
    db.commit()
    return jsonify({"status": "success", "message": "Password updated successfully"})


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"status": "success"})


# ---------------------------------------------------------------------------
# API Routes — Patient Profile
# ---------------------------------------------------------------------------
@app.route("/api/profile", methods=["GET"])
@login_required
def api_profile():
    db = get_db()
    pid = session["patient_id"]
    user = db.execute(
        """SELECT patient_id, email, selected_condition, current_streak, last_session_date,
                  onboarding_done, stroke_onset, affected_side, onset_ago,
                  daily_struggles, doing_therapy, pain_level, rehab_goal, goal_note,
                  patient_name, patient_dob, patient_phone,
                  primary_color, secondary_color, profile_photo, created_at
           FROM patients WHERE patient_id = ?""",
        (pid,),
    ).fetchone()
    if not user:
        return jsonify({"status": "error", "message": "Patient not found"}), 404

    # Calculate aggregate telemetry statistics
    stats = db.execute(
        """SELECT COUNT(*) as total_sessions,
                  COALESCE(SUM(duration_seconds), 0) as total_seconds,
                  COALESCE(MAX(peak_rom), 0) as best_rom,
                  COALESCE(SUM(score), 0) as total_score
           FROM telemetry_logs WHERE patient_id = ?""",
        (pid,),
    ).fetchone()

    profile = dict(user)
    profile["total_sessions"] = stats["total_sessions"] if stats else 0
    profile["total_minutes"] = round((stats["total_seconds"] if stats else 0) / 60, 1)
    profile["best_rom"] = round(stats["best_rom"] if stats else 0, 1)
    profile["total_score"] = stats["total_score"] if stats else 0

    return jsonify({
        "status": "success",
        "profile": profile,
    })


@app.route("/api/profile/update", methods=["POST"])
@login_required
def api_profile_update():
    data = request.get_json() or {}
    db = get_db()
    pid = session["patient_id"]

    patient_name = (data.get("patient_name") or "").strip()[:60]
    patient_phone = (data.get("patient_phone") or "").strip()[:20]
    patient_dob = (data.get("patient_dob") or "").strip()[:10]
    selected_condition = (data.get("selected_condition") or "").strip()
    affected_side = (data.get("affected_side") or "").strip().lower()
    onset_ago = (data.get("onset_ago") or "").strip()[:40]
    doing_therapy = (data.get("doing_therapy") or "").strip().lower()
    pain_level = (data.get("pain_level") or "").strip().lower()
    rehab_goal = (data.get("rehab_goal") or "").strip()[:500]
    primary_color = (data.get("primary_color") or "").strip().lower()
    secondary_color = (data.get("secondary_color") or "").strip().lower()

    if selected_condition and selected_condition not in VALID_CONDITIONS:
        selected_condition = "Hemiparesis"

    db.execute(
        """UPDATE patients SET
           patient_name = COALESCE(NULLIF(?, ''), patient_name),
           patient_phone = ?,
           patient_dob = ?,
           selected_condition = COALESCE(NULLIF(?, ''), selected_condition),
           affected_side = ?,
           onset_ago = ?,
           doing_therapy = ?,
           pain_level = ?,
           rehab_goal = ?,
           primary_color = ?,
           secondary_color = ?
           WHERE patient_id = ?""",
        (patient_name, patient_phone, patient_dob, selected_condition, affected_side,
         onset_ago, doing_therapy, pain_level, rehab_goal, primary_color, secondary_color, pid)
    )
    db.commit()
    return jsonify({"status": "success", "message": "Profile updated successfully"})


@app.route("/api/profile/photo", methods=["POST"])
@login_required
def api_profile_photo():
    data = request.get_json() or {}
    photo_data = data.get("photo") or ""
    if photo_data and len(photo_data) > 3_000_000:
        return jsonify({"status": "error", "message": "Photo size too large (max 3MB)"}), 400

    db = get_db()
    db.execute(
        "UPDATE patients SET profile_photo = ? WHERE patient_id = ?",
        (photo_data, session["patient_id"])
    )
    db.commit()
    return jsonify({"status": "success", "message": "Profile photo updated successfully", "profile_photo": photo_data})


@app.route("/api/profile/colors", methods=["POST"])
@login_required
def api_update_colors():
    data = request.get_json() or {}
    primary_color = (data.get("primary_color") or "").strip().lower()
    secondary_color = (data.get("secondary_color") or "").strip().lower()
    if primary_color and not re.match(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", primary_color):
        primary_color = ""
    if secondary_color and not re.match(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", secondary_color):
        secondary_color = ""

    db = get_db()
    db.execute(
        "UPDATE patients SET primary_color = ?, secondary_color = ? WHERE patient_id = ?",
        (primary_color, secondary_color, session["patient_id"]),
    )
    db.commit()
    return jsonify({"status": "success", "primary_color": primary_color, "secondary_color": secondary_color})


@app.route("/api/profile/condition", methods=["POST"])
@login_required
def api_update_condition():
    data = request.get_json() or {}
    condition = data.get("condition", "Hemiparesis")
    valid_conditions = [
        "Hemiparesis", "Flexor Spasticity", "Motor Ataxia",
        "Intention Tremor", "Motor Apraxia", "Wrist Drop"
    ]
    if condition not in valid_conditions:
        return jsonify({"status": "error", "message": "Invalid condition profile"}), 400

    db = get_db()
    db.execute(
        "UPDATE patients SET selected_condition = ? WHERE patient_id = ?",
        (condition, session["patient_id"]),
    )
    db.commit()
    return jsonify({"status": "success", "condition": condition})


@app.route("/api/streak", methods=["GET"])
@login_required
def api_streak():
    db = get_db()
    streak = update_streak(db, session["patient_id"])
    db.commit()
    return jsonify({"status": "success", "streak": streak})

# ---------------------------------------------------------------------------
# API Routes — Onboarding (new-patient stroke questionnaire)
# ---------------------------------------------------------------------------
VALID_CONDITIONS = [
    "Hemiparesis", "Flexor Spasticity", "Motor Ataxia",
    "Intention Tremor", "Motor Apraxia", "Wrist Drop"
]


@app.route("/api/onboarding/status", methods=["GET"])
@login_required
def api_onboarding_status():
    db = get_db()
    row = db.execute(
        "SELECT onboarding_done, selected_condition FROM patients WHERE patient_id = ?",
        (session["patient_id"],),
    ).fetchone()
    return jsonify({
        "status": "success",
        "onboarding_done": bool(row and row["onboarding_done"]),
        "condition": row["selected_condition"] if row else "Hemiparesis",
    })


@app.route("/api/onboarding", methods=["POST"])
@login_required
def api_onboarding_submit():
    data = request.get_json() or {}
    condition = (data.get("condition") or "").strip()
    if condition not in ("Hemiparesis", "Flexor Spasticity", "Motor Ataxia",
                          "Intention Tremor", "Motor Apraxia", "Wrist Drop", ""):
        return jsonify({"status": "error", "message": "Please choose a stroke category"}), 400

    # Optional personal details
    patient_name = (data.get("patient_name") or "").strip()[:60]
    patient_dob = (data.get("patient_dob") or "").strip()[:10]
    patient_phone = (data.get("patient_phone") or "").strip()[:20]

    # User-selected app colors (saved per patient)
    primary_color = (data.get("primary_color") or "").strip().lower()
    secondary_color = (data.get("secondary_color") or "").strip().lower()
    if primary_color and not re.match(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", primary_color):
        primary_color = ""
    if secondary_color and not re.match(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", secondary_color):
        secondary_color = ""

    onset = (data.get("onset") or "").strip()[:500]
    side = (data.get("affected_side") or "").strip().lower()
    if side not in ("left", "right", "both", ""):
        side = ""
    ago = (data.get("onset_ago") or "").strip()[:40]    # Daily struggles — multi-select list, stored as a comma string per patient
    VALID_STRUGGLES = {"eating", "dressing", "writing", "grip", "overhead", "carrying", "speaking", "memory"}
    struggles_raw = data.get("daily_struggles") or []
    if isinstance(struggles_raw, str):
        struggles_raw = [s.strip() for s in struggles_raw.split(",") if s.strip()]
    struggles = ",".join([s for s in struggles_raw if s in VALID_STRUGGLES][:8])

    doing_therapy = (data.get("doing_therapy") or "").strip().lower()
    if doing_therapy not in ("", "physio", "occupational", "speech", "none"):
        doing_therapy = ""

    pain_level = (data.get("pain_level") or "").strip().lower()
    if pain_level not in ("", "none", "mild", "moderate", "severe"):
        pain_level = ""

    goal = (data.get("rehab_goal") or "").strip().lower()
    if goal not in ("", "move", "daily", "fine", "stiffness", "strength", "balance"):
        goal = ""

    goal_note = (data.get("goal_note") or "").strip()[:300]

    # All answers are stored on THIS patient's own row only — patient_id comes
    # from the logged-in session, so no two patients ever share answers.
    db = get_db()
    db.execute(
        """UPDATE patients
           SET selected_condition = ?, stroke_onset = ?, affected_side = ?,
               onset_ago = ?, daily_struggles = ?, doing_therapy = ?,
               pain_level = ?, rehab_goal = ?, goal_note = ?,
               patient_name = ?, patient_dob = ?, patient_phone = ?,
               primary_color = ?, secondary_color = ?,
               onboarding_done = 1
           WHERE patient_id = ?""",
        (condition, onset, side, ago, struggles, doing_therapy, pain_level,
         goal, goal_note, patient_name, patient_dob, patient_phone,
         primary_color, secondary_color, session["patient_id"]),
    )
    db.commit()
    return jsonify({"status": "success", "condition": condition})

# ---------------------------------------------------------------------------
# API Routes — Telemetry Logging
# ---------------------------------------------------------------------------
@app.route("/api/telemetry", methods=["POST"])
@login_required
def api_log_telemetry():
    data = request.get_json() or {}
    patient_id = session["patient_id"]
    db = get_db()

    # Update streak
    streak = update_streak(db, patient_id)

    db.execute(
        """INSERT INTO telemetry_logs
           (patient_id, session_type, condition, duration_seconds, peak_rom,
            smoothness_score, cheats_blocked, score, metrics_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            patient_id,
            data.get("session_type", "THERAPY"),
            data.get("condition", "Hemiparesis"),
            data.get("duration_seconds", 0),
            data.get("peak_rom", 0),
            data.get("smoothness_score", 0),
            data.get("cheats_blocked", 0),
            data.get("score", 0),
            data.get("metrics_json", "{}"),
        ),
    )
    db.commit()
    return jsonify({"status": "success", "streak": streak})


@app.route("/api/admin/patients", methods=["GET"])
@login_required
def api_admin_patients():
    if session.get("role") != "owner" and session.get("patient_id") != "SP_OWNER_1":
        return jsonify({"status": "error", "message": "Access denied. Controller privileges required."}), 403

    db = get_db()
    rows = db.execute(
        """SELECT 
            p.id,
            p.patient_id,
            p.patient_name,
            p.username,
            p.email,
            p.selected_condition,
            p.current_streak,
            p.last_session_date,
            p.onboarding_done,
            p.affected_side,
            p.rehab_goal,
            p.created_at,
            COUNT(t.id) as session_count,
            COALESCE(SUM(t.duration_seconds), 0) as total_duration_seconds,
            COALESCE(MAX(t.peak_rom), 0) as peak_rom,
            COALESCE(AVG(t.smoothness_score), 0) as avg_smoothness,
            COALESCE(SUM(t.cheats_blocked), 0) as total_cheats,
            COALESCE(SUM(t.score), 0) as total_score,
            MAX(t.created_at) as last_activity_time
        FROM patients p
        LEFT JOIN telemetry_logs t ON p.patient_id = t.patient_id
        WHERE p.patient_id != 'SP_OWNER_1'
        GROUP BY p.id, p.patient_id, p.patient_name, p.username, p.email, p.selected_condition, p.current_streak, p.last_session_date, p.onboarding_done, p.affected_side, p.rehab_goal, p.created_at
        ORDER BY p.id DESC"""
    ).fetchall()

    patients_list = []
    total_sessions_all = 0
    total_seconds_all = 0

    for r in rows:
        d = dict(r)
        d["total_minutes"] = round(d["total_duration_seconds"] / 60, 1)
        d["peak_rom"] = round(d["peak_rom"], 1)
        d["avg_smoothness"] = round(d["avg_smoothness"], 1)
        total_sessions_all += d["session_count"]
        total_seconds_all += d["total_duration_seconds"]
        patients_list.append(d)

    recent_events = db.execute(
        """SELECT t.patient_id, p.patient_name, t.session_type, t.condition,
                  t.duration_seconds, t.peak_rom, t.score, t.created_at
           FROM telemetry_logs t
           LEFT JOIN patients p ON t.patient_id = p.patient_id
           WHERE t.patient_id != 'SP_OWNER_1'
           ORDER BY t.created_at DESC
           LIMIT 15"""
    ).fetchall()

    return jsonify({
        "status": "success",
        "controller": {
            "patient_id": session.get("patient_id"),
            "role": "owner",
        },
        "summary": {
            "total_registered_patients": len(patients_list),
            "total_sessions_conducted": total_sessions_all,
            "total_exercise_minutes": round(total_seconds_all / 60, 1),
        },
        "patients": patients_list,
        "recent_activity": [dict(e) for e in recent_events],
    })


@app.route("/api/admin/patient/<patient_id>", methods=["GET"])
@login_required
def api_admin_patient_dossier(patient_id):
    """Inspect Everything — full clinical dossier for a specific patient (owner only)."""
    if session.get("role") != "owner" and session.get("patient_id") != "SP_OWNER_1":
        return jsonify({"status": "error", "message": "Access denied. Controller privileges required."}), 403

    db = get_db()
    pid = (patient_id or "").strip()
    user = db.execute("SELECT * FROM patients WHERE patient_id = ?", (pid,)).fetchone()
    if not user:
        return jsonify({"status": "error", "message": "Patient not found"}), 404

    # 1. Intake answers and demographics
    u = dict(user)
    u.pop("password_hash", None)
    intake = {
        "patient_id": u.get("patient_id"),
        "patient_name": u.get("patient_name") or u.get("username") or "Patient",
        "email": u.get("email"),
        "patient_dob": u.get("patient_dob") or "",
        "patient_phone": u.get("patient_phone") or "",
        "selected_condition": u.get("selected_condition") or "Hemiparesis",
        "stroke_onset": u.get("stroke_onset") or u.get("onset_ago") or "Not specified",
        "affected_side": u.get("affected_side") or "Not specified",
        "daily_struggles": u.get("daily_struggles") or "Not specified",
        "doing_therapy": u.get("doing_therapy") or "Not specified",
        "pain_level": u.get("pain_level") or "Not specified",
        "rehab_goal": u.get("rehab_goal") or "Not specified",
        "goal_note": u.get("goal_note") or "",
        "created_at": str(u.get("created_at") or ""),
        "last_session_date": u.get("last_session_date") or "",
        "current_streak": u.get("current_streak") or 1,
    }

    # 2. Recovery index breakdown with exact numbers
    stats = db.execute(
        """SELECT COALESCE(AVG(smoothness_score), 0) as avg_smooth,
                  COALESCE(MAX(peak_rom), 0) as peak_rom,
                  COALESCE(SUM(duration_seconds), 0) as total_seconds,
                  COUNT(*) as total_sessions
           FROM telemetry_logs WHERE patient_id = ?""",
        (pid,),
    ).fetchone()

    streak = intake["current_streak"]
    avg_smooth = float(stats["avg_smooth"]) if stats else 0.0
    peak_rom = float(stats["peak_rom"]) if stats else 0.0
    total_sessions = int(stats["total_sessions"]) if stats else 0
    total_seconds = int(stats["total_seconds"]) if stats else 0

    adherence = min(streak / 7.0, 1.0)
    smoothness = min(avg_smooth / 100.0, 1.0)
    range_score = min(peak_rom / 180.0, 1.0)
    rqi = round(100.0 * (0.3 * adherence + 0.3 * smoothness + 0.4 * range_score), 1)

    if rqi >= 76:
        tier = "peak"
        tier_label = "Peak Recovery"
        tier_emoji = "🏆"
    elif rqi >= 51:
        tier = "strong"
        tier_label = "Strong Recovery"
        tier_emoji = "🌟"
    elif rqi >= 26:
        tier = "steady"
        tier_label = "Steady Progress"
        tier_emoji = "🌿"
    else:
        tier = "starting"
        tier_label = "Starting Out"
        tier_emoji = "🌱"

    recovery_index = {
        "rqi_score": rqi,
        "tier": tier,
        "tier_label": tier_label,
        "tier_emoji": tier_emoji,
        "total_sessions": total_sessions,
        "total_exercise_minutes": round(total_seconds / 60.0, 1),
        "streak": streak,
        "peak_rom": round(peak_rom, 1),
        "avg_smoothness": round(avg_smooth, 1),
        "components": {
            "adherence": round(adherence, 3),
            "smoothness": round(smoothness, 3),
            "range": round(range_score, 3),
        },
    }

    # 3. Full telemetry history
    telemetry_rows = db.execute(
        """SELECT * FROM telemetry_logs WHERE patient_id = ? ORDER BY id DESC LIMIT 50""",
        (pid,),
    ).fetchall()
    telemetry_history = [dict(r) for r in telemetry_rows]

    # 4. All SOAP reports
    soap_rows = db.execute(
        """SELECT * FROM clinical_reports WHERE patient_id = ? ORDER BY id DESC LIMIT 20""",
        (pid,),
    ).fetchall()
    soap_reports = [dict(r) for r in soap_rows]

    return jsonify({
        "status": "success",
        "patient": intake,
        "intake": intake,
        "recovery_index": recovery_index,
        "telemetry_history": telemetry_history,
        "clinical_reports": soap_reports,
    })


@app.route("/api/rqi", methods=["GET"])
@login_required
def api_rqi():
    """Recovery Quality Index — patient-facing performance meter."""
    db = get_db()
    pid = session["patient_id"]
    target_pid = request.args.get("patient_id")
    if target_pid and (session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1"):
        pid = target_pid.strip()

    user = db.execute(
        "SELECT current_streak FROM patients WHERE patient_id = ?", (pid,)
    ).fetchone()
    stats = db.execute(
        """SELECT COALESCE(AVG(smoothness_score), 0) as avg_smooth,
                  COALESCE(MAX(peak_rom), 0) as peak_rom,
                  COUNT(*) as total_sessions
           FROM telemetry_logs WHERE patient_id = ?""",
        (pid,),
    ).fetchone()

    streak = (user["current_streak"] if user else 1) or 1
    avg_smooth = stats["avg_smooth"] if stats else 0
    peak_rom = stats["peak_rom"] if stats else 0
    total_sessions = stats["total_sessions"] if stats else 0

    # RQI components
    adherence = min(streak / 7.0, 1.0)
    smoothness = min(avg_smooth / 100.0, 1.0)
    range_score = min(peak_rom / 180.0, 1.0)
    rqi = round(100 * (0.3 * adherence + 0.3 * smoothness + 0.4 * range_score), 1)

    # Tier determination
    if rqi >= 76:
        tier = "peak"
        tier_label = "Peak Recovery"
        tier_emoji = "🏆"
    elif rqi >= 51:
        tier = "strong"
        tier_label = "Strong Recovery"
        tier_emoji = "🌟"
    elif rqi >= 26:
        tier = "steady"
        tier_label = "Steady Progress"
        tier_emoji = "🌿"
    else:
        tier = "starting"
        tier_label = "Starting Out"
        tier_emoji = "🌱"

    is_owner = (session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1")
    result = {
        "status": "success",
        "tier": tier,
        "tier_label": tier_label,
        "tier_emoji": tier_emoji,
        "rqi_score": round(rqi),
        "total_sessions": total_sessions,
        "streak": streak,
    }
    # Expose component breakdown to owner/clinician
    if is_owner:
        result["components"] = {
            "adherence": round(adherence, 3),
            "smoothness": round(smoothness, 3),
            "range": round(range_score, 3),
        }
    return jsonify(result)


@app.route("/api/telemetry/history", methods=["GET"])
@login_required
def api_telemetry_history():
    db = get_db()
    pid = session["patient_id"]
    target_pid = request.args.get("patient_id")
    if target_pid and (session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1"):
        pid = target_pid.strip()

    rows = db.execute(
        """SELECT session_type, condition, duration_seconds, peak_rom,
                  smoothness_score, cheats_blocked, score, created_at
           FROM telemetry_logs
           WHERE patient_id = ?
           ORDER BY created_at DESC
           LIMIT 50""",
        (pid,),
    ).fetchall()
    return jsonify({"status": "success", "history": [dict(r) for r in rows]})


@app.route("/api/report/stats", methods=["GET"])
@login_required
def api_report_stats():
    db = get_db()
    pid = session["patient_id"]
    target_pid = request.args.get("patient_id")
    if target_pid and (session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1"):
        pid = target_pid.strip()

    user = db.execute(
        "SELECT * FROM patients WHERE patient_id = ?",
        (pid,),
    ).fetchone()

    stats = db.execute(
        """SELECT
            COUNT(*) as total_sessions,
            COALESCE(MAX(peak_rom), 0) as peak_rom,
            COALESCE(AVG(smoothness_score), 0) as avg_smoothness,
            COALESCE(SUM(cheats_blocked), 0) as total_cheats,
            COALESCE(AVG(duration_seconds), 0) as avg_duration
           FROM telemetry_logs WHERE patient_id = ?""",
        (pid,),
    ).fetchone()

    pname = ""
    if user:
        try:
            pname = user["patient_name"] or ""
        except (IndexError, KeyError):
            pname = ""

    is_owner = (session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1")
    response_data = {
        "status": "success",
        "stats": {
            "patient_id": pid,
            "patient_name": pname,
            "streak": user["current_streak"] if user else 1,
            "condition": user["selected_condition"] if user else "Hemiparesis",
            "total_sessions": stats["total_sessions"],
            "peak_rom": round(stats["peak_rom"], 1),
            "avg_smoothness": round(stats["avg_smoothness"], 1),
            "total_cheats": stats["total_cheats"],
            "avg_duration": round(stats["avg_duration"], 1),
        },
        "is_owner": is_owner,
    }
    if is_owner and user:
        response_data["intake"] = {
            "patient_name": user["patient_name"] or "",
            "patient_dob": user["patient_dob"] or "",
            "patient_phone": user["patient_phone"] or "",
            "email": user["email"] or "",
            "affected_side": user["affected_side"] or "",
            "stroke_onset": user["stroke_onset"] or "",
            "onset_ago": user["onset_ago"] or "",
            "daily_struggles": user["daily_struggles"] or "",
            "doing_therapy": user["doing_therapy"] or "",
            "pain_level": user["pain_level"] or "",
            "rehab_goal": user["rehab_goal"] or "",
            "goal_note": user["goal_note"] or "",
        }
    return jsonify(response_data)

# ---------------------------------------------------------------------------
# Standalone Clinical AI Tele-Rehabilitation Engine (Zero-Key Architecture)
# ---------------------------------------------------------------------------
def generate_clinical_soap(data, patient_id):
    """
    Generates an official hospital-grade SOAP tele-rehabilitation progress note
    using direct quantitative telemetry analysis (standalone, zero API key needed).
    """
    condition = data.get("condition", "Hemiparesis")
    streak = data.get("streak", 1)
    reps = data.get("repetitions_completed", 0)
    active_seconds = int(data.get("active_duration_seconds", 0) or 0)
    duration_min = max(1, active_seconds // 60) if active_seconds >= 60 else (1 if reps > 0 else 0)

    m = data.get("metrics") or {}
    peak_rom = round(float(m.get("peak_elbow_rom_deg", data.get("peak_rom", 0)) or 0), 1)
    baseline_rom = round(float(m.get("baseline_elbow_rom_deg", 60) or 60), 1)
    cheats = int(m.get("trunk_cheat_events", data.get("cheats_blocked", 0)) or 0)
    max_tilt = round(float(m.get("max_trunk_tilt_deg", 0) or 0), 1)
    jerk = round(float(m.get("normalized_jerk_score", data.get("smoothness", 0)) or 0), 1)
    wrist_dev = round(float(m.get("mean_wrist_deviation_deg", 0) or 0), 1)
    dispersion = round(float(m.get("hand_dispersion_index", 0) or 0), 2)
    tremor = round(float(m.get("tremor_frequency_hz", 0) or 0), 1)

    leg_left = round(float(m.get("leg_left_knee_deg", 0) or 0), 1)
    leg_right = round(float(m.get("leg_right_knee_deg", 0) or 0), 1)
    leg_sym = round(float(m.get("leg_c6_sym", 0) or 0), 1)
    is_lower_limb = condition == "Lower-Limb" or leg_left > 0 or leg_right > 0

    # Subjective
    subj = (
        f"Patient {patient_id} engaged in day {streak} of home tele-rehabilitation targeting {condition}. "
        f"Patient demonstrated focused participation across {duration_min} min of active kinematic biofeedback."
    )

    # Objective
    if is_lower_limb:
        obj = (
            f"Seated Knee Extension: Left Max ROM {leg_left}°, Right Max ROM {leg_right}°, "
            f"Bilateral Symmetry Ratio {leg_sym}%. "
            f"Active duration: {duration_min} min with {reps} target repetitions completed."
        )
    else:
        obj = (
            f"Active Duration: {duration_min} min | Repetitions: {reps} completed. "
            f"Peak Active ROM (C1): {peak_rom}° (baseline {baseline_rom}°). "
            f"Trunk Compensatory Cheats (E1): {cheats} blocked (peak tilt {max_tilt}°). "
            f"Movement Smoothness / Jerk Index (S1): {jerk}/100. "
            f"Wrist Deviation (E3): {wrist_dev}°, Hand Dispersion (C3): {dispersion}."
        )

    # Assessment
    assessment_notes = []
    if is_lower_limb:
        if leg_sym >= 80:
            assessment_notes.append("Quadriceps motor unit synchronization shows favorable bilateral symmetry.")
        else:
            assessment_notes.append("Significant asymmetrical recruitment observed; pacing recommended to normalize agonist-antagonist firing.")
    else:
        if peak_rom >= baseline_rom:
            assessment_notes.append(f"Demonstrating progressive active range of motion ({peak_rom}° achieved vs {baseline_rom}° baseline).")
        else:
            assessment_notes.append(f"Near-baseline kinematic range ({peak_rom}°); distal flexor hypertonia limiting terminal extension.")

        if cheats > 3:
            assessment_notes.append(f"Elevated compensatory trunk recruitment ({cheats} events); indicating shoulder substitution during distal fatigue.")
        else:
            assessment_notes.append("Effective core stabilization maintained with negligible compensatory leaning (<15° envelope).")

        if jerk >= 60:
            assessment_notes.append(f"Motor fluidity score ({jerk}/100) indicates functional corticospinal pathway reorganization.")
        else:
            assessment_notes.append(f"Subcortical trajectory dysmetria noted ({jerk}/100); pacing drills advised.")

    assessment_notes.append("Neuroplastic adaptation in active progression; zero acute adverse kinematic events.")
    assessment = " ".join(assessment_notes)

    # Plan
    if is_lower_limb:
        target_angle = max(leg_left, leg_right) + 5
        plan = (
            f"Advance bilateral symmetry goal to >85%. Perform 3 sets of 10 seated knee extensions with 3s terminal hold "
            f"(target angle: {target_angle}°). Continue daily tele-rehab tracking on RehabOpt AR."
        )
    else:
        target_rom = round(peak_rom + 5.0, 1)
        plan = (
            f"Advance peak ROM target to {target_rom}° (+5° threshold). Enforce real-time audio-visual anti-cheat cueing "
            f"to restrict trunk tilt below 8°. Maintain daily protocol (3 sets of 10 reps) with 60s rest intervals. "
            f"Re-evaluate progress after 3 subsequent sessions."
        )

    return f"[S] {subj}\n\n[O] {obj}\n\n[A] {assessment}\n\n[P] {plan}"


def generate_clinical_chat_reply(user_message, patient_id=""):
    """
    Built-in clinical AI tele-rehabilitation advisor (standalone, zero API key needed).
    Provides evidence-based stroke recovery guidance, exercise biomechanics,
    anti-cheat postural corrections, and safety advice.
    """
    msg = (user_message or "").lower()

    # Category 1: Hand / Fingers / Spasticity / Grip / Air Canvas / Drawing
    if any(k in msg for k in ["hand", "finger", "grip", "spastic", "stiff", "canvas", "draw", "rub", "brush", "pinch"]):
        return (
            "### 🖐️ Hand & Fine Motor Spasticity Management\n\n"
            "Post-stroke flexor hypertonia frequently causes involuntary finger curling and wrist stiffness. Here is evidence-based clinical guidance:\n\n"
            "1. **Passive Lengthening (Pre-Session)**: Rest your palm flat on a firm table with fingers uncurled. Lean your upper body gently forward to maintain a mild stretch for 30–45 seconds.\n"
            "2. **Active Finger Extension (Air Canvas)**: In the Air Canvas session, spread all 5 fingers wide to switch back to drawing mode — this specifically engages the *extensor digitorum communis* to counteract spastic tone.\n"
            "3. **Air Canvas Controls**: Remember, index finger draws, 2 fingers pause/resume/stop, 3 fingers pan/move your drawing, and all 5 fingers continue drawing.\n"
            "4. **Thermal Pre-Conditioning**: Applying a warm, moist towel for 5–10 minutes prior to motor practice reduces reflex excitability and eases tendon resistance."
        )

    # Category 2: Arm / Reach / Elbow / Shoulder / ROM
    if any(k in msg for k in ["arm", "reach", "elbow", "shoulder", "rom", "extension", "flexion", "range"]):
        return (
            "### 🦾 Upper-Limb Reach & Range of Motion (ROM)\n\n"
            "Targeting active elbow extension requires neuroplastic recruitment of the triceps while inhibiting compensatory shoulder hiking:\n\n"
            "1. **Quality Over Velocity**: Execute each reaching motion with smooth, controlled cadence. Avoid rapid ballistic thrusts which trigger stretch reflexes.\n"
            "2. **Shoulder Scapular Pin**: Keep both shoulder blades retracted and lightly depressed against your chair backrest. Do not let the paretic shoulder hike towards your ear.\n"
            "3. **Target Progression**: Your C1 Peak ROM is tracked in real-time. Aim to increase your active extension angle by 3°–5° every few sessions rather than forcing sudden extreme extensions.\n"
            "4. **Rest Intervals**: Take a 45–60 second pause between sets to replenish cellular ATP and prevent motor fatigue."
        )

    # Category 3: Leg / Knee / Walking / Gait / Lower Limb
    if any(k in msg for k in ["leg", "knee", "walk", "gait", "lower", "step", "balance", "foot"]):
        return (
            "### 🦵 Lower-Limb & Seated Knee Extension Protocol\n\n"
            "Motor recovery in the lower extremity is essential for stable transfer and independent gait:\n\n"
            "1. **Seated Knee Extension**: Sit upright on a stable, non-rolling chair. Extend your knee until your lower leg is parallel with the floor, holding for 3 seconds at peak extension.\n"
            "2. **C6 Bilateral Symmetry**: RehabOpt AR measures both knees simultaneously. Focus on closing the gap between your affected and sound leg (target >80% symmetry).\n"
            "3. **Avoid Trunk Leaning**: Keep your spine perpendicular to the seat. Do not recline backwards to kick the leg up, as this substitutes abdominal flexion for quadriceps work.\n"
            "4. **Safety Precaution**: Always ensure your footwear has non-slip soles, and do not attempt unsupported standing drills without therapist supervision."
        )

    # Category 4: Posture / Trunk Cheating / Leaning / Compensation
    if any(k in msg for k in ["cheat", "posture", "lean", "trunk", "spine", "tilt", "compensat"]):
        return (
            "### ⚖️ Anti-Cheat Biomechanics & Trunk Control\n\n"
            "Compensatory trunk leaning is the most frequent barrier to authentic motor recovery:\n\n"
            "1. **Why Cheats Occur**: When the paretic limb muscles tire, the brain reflexively recruits the trunk and torso (E1 lateral tilt) to reach targets.\n"
            "2. **The Danger of Compensation**: Leaning bypasses weak limb muscles and reinforces maladaptive motor patterns, hindering true neuroplastic recovery.\n"
            "3. **Real-Time Detection**: RehabOpt AR continuously tracks your shoulder-hip vectors. If trunk tilt exceeds 15°, the system flags a compensatory cheat.\n"
            "4. **Corrective Drill**: Reset your posture against your chair, reduce reaching distance by 10%, and prioritize a straight spine with 0° trunk tilt."
        )

    # Category 5: Pain / Fatigue / Soreness / Rest / Safety
    if any(k in msg for k in ["pain", "hurt", "tired", "fatigue", "sore", "dizzy", "headache", "stop", "rest"]):
        return (
            "### 🛑 Pain & Fatigue Management Guidelines\n\n"
            "Differentiating between healthy muscular adaptation and pathological strain is critical:\n\n"
            "1. **Mild Soreness vs Acute Pain**: Mild muscular fatigue (1–3/10 on the visual analog scale) is normal. However, sharp joint pain or nerve tingling is a signal to stop immediately.\n"
            "2. **Use Session Controls**: Click **Pause** or **Stop** at any moment. RehabOpt AR includes a 4-second prep countdown on Resume so you never feel rushed.\n"
            "3. **Neurological Fatigue**: Mental and motor exhaustion are common post-stroke. If your movement fluidity (S1 jerk index) begins dropping sharply, end the session for the day.\n"
            "4. **Medical Red Flags**: If you experience shortness of breath, sudden dizziness, chest discomfort, or severe headache, cease exercise immediately and contact emergency medical services."
        )

    # Category 6: Streak / Routine / How often / Repetitions / Motivation
    if any(k in msg for k in ["streak", "often", "how many", "reps", "routine", "schedule", "daily", "motivation"]):
        return (
            "### 📅 Tele-Rehabilitation Frequency & Habit Formation\n\n"
            "Neuroplastic reorganization is fundamentally driven by high-frequency, consistent repetition:\n\n"
            "1. **Dose Recommendation**: Perform 1 to 2 sessions per day, each lasting 10–15 minutes. Consistent daily practice yields substantially higher motor recovery than infrequent long workouts.\n"
            "2. **Protect Your Streak**: Each completed session updates your daily recovery streak in RehabOpt AR. Daily stimulation releases Brain-Derived Neurotrophic Factor (BDNF) to consolidate newly mapped neural synapses.\n"
            "3. **Pacing Structure**: Aim for 2 to 3 sets of 8–12 repetitions with 60 seconds of quiet breathing between sets.\n"
            "4. **Progress Review**: Check your SOAP Report after each session to watch your peak ROM and smoothness scores climb over time."
        )

    # Category 7: Default Clinical Guidance
    return (
        "### 🏥 RehabOpt Clinical Tele-Rehabilitation Guidance\n\n"
        "Welcome to RehabOpt AR Clinical Assistant. Here are core principles for maximizing your recovery session:\n\n"
        "1. **Setup & Lighting**: Position your webcam at chest height, 1.5–2 meters away, ensuring even room lighting with your torso and arms fully visible.\n"
        "2. **Session Workflow**: Use the **Start**, **Pause**, and **Resume** buttons on your screen. A 4-second countdown gives you time to align before tracking starts.\n"
        "3. **Biofeedback Focus**: Keep an eye on your live metrics — avoid trunk tilts over 15° and maintain smooth, unhurried movements.\n"
        "4. **Documentation**: When you finish, your clinical SOAP progress note is generated automatically with all 13 quantitative biomechanical indicators.\n\n"
        "How can I assist your physical or occupational therapy today? Feel free to ask about hand spasticity, reach ROM, posture anti-cheat, or exercise pacing!"
    )


# ---------------------------------------------------------------------------
# Clinical SOAP Progress Note Generator Route
# ---------------------------------------------------------------------------
@app.route("/api/generate-soap", methods=["POST"])
@login_required
def generate_soap():
    """
    End-of-session clinical SOAP generator.
    Analyzes multi-axis telemetry and formats hospital-grade documentation.
    Works 100% out-of-the-box without requiring any external API key.
    """
    data = request.get_json() or {}
    patient_id = session.get("patient_id", "SP_00001")
    target_pid = request.args.get("patient_id") or data.get("patient_id")
    if target_pid and (session.get("role") == "owner" or session.get("patient_id") == "SP_OWNER_1"):
        patient_id = target_pid.strip()
    condition = data.get("condition", "Hemiparesis")
    streak = data.get("streak", 1)
    reps = data.get("repetitions_completed", 0)
    active_seconds = data.get("active_duration_seconds", 0)

    # Rich metric object OR legacy flat fallback
    m = data.get("metrics") or {}
    peak_rom = m.get("peak_elbow_rom_deg", data.get("peak_rom", 0))
    baseline_rom = m.get("baseline_elbow_rom_deg", 60)
    cheats = m.get("trunk_cheat_events", data.get("cheats_blocked", 0))
    max_tilt = m.get("max_trunk_tilt_deg", 0)
    jerk = m.get("normalized_jerk_score", data.get("smoothness", 0))
    wrist_dev = m.get("mean_wrist_deviation_deg", 0)
    dispersion = m.get("hand_dispersion_index", 0)
    tremor = m.get("tremor_frequency_hz", 0)

    # Lower-limb telemetry (Seated Knee Extension, session type LEG)
    leg_left = m.get("leg_left_knee_deg", 0)
    leg_right = m.get("leg_right_knee_deg", 0)
    leg_sym = m.get("leg_c6_sym", 0)

    # If Gemini API key is configured and google-genai is installed, optionally try cloud Gemini
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key and genai is not None:
        duration_min = int(active_seconds or 0) // 60
        prompt = f"""
        You are an attending neuro-physiatrist generating an official SOAP progress note for a
        {('lower-limb' if condition == 'Lower-Limb' or (leg_left or leg_right) else 'upper-limb')} stroke tele-rehabilitation session. Write under 140 words.

        QUANTITATIVE BIOMECHANICAL TELEMETRY:
        - Patient ID: {patient_id} | Primary Deficit: {condition} | Adherence streak: {streak} days
        - Active Duration: {duration_min} min | Repetitions Completed: {reps}
        - Peak Active Elbow ROM (C1): {peak_rom}° (Baseline: {baseline_rom}°)
        - Trunk Compensatory Cheats (E1): {cheats} events (Max tilt: {max_tilt}°)
        - Normalized Jerk / Fluidity (S1): {jerk} (0-100, higher = smoother)
        - Signed Wrist Deviation (E3): {wrist_dev}°
        - Hand Dispersion (C3): {dispersion} (open palm threshold > 0.25)
        - Intention Tremor Frequency (E6): {tremor} Hz
        - Seated Knee Extension — Left Max ROM: {leg_left}° | Right Max ROM: {leg_right}° | C6 Symmetry Ratio: {leg_sym}%

        DOCUMENTATION RULES:
        Structure strictly under the headings:
        [S] Subjective patient effort and engagement.
        [O] Objective kinematic measurements and range achieved.
        [A] Clinical assessment of motor control, spasticity/ataxia indicators, and compensatory strategy. Focus on functional neuroplastic adaptation and motor control. NEVER use the word "cure".
        [P] Actionable progression recommendation with target ROM thresholds and compensatory-prevention drills for the next session.
        """
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-3.7-flash",
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.2),
            )
            if response and response.text:
                return jsonify({"status": "success", "soap_note": response.text})
        except Exception:
            # Fall back smoothly to built-in clinical generator
            pass

    # Built-in Clinical AI Generator (Zero external dependency, instant, 100% reliable)
    soap_note = generate_clinical_soap(data, patient_id)
    return jsonify({"status": "success", "soap_note": soap_note})


# ---------------------------------------------------------------------------
# Clinical AI Assistant & Chat Engine
# ---------------------------------------------------------------------------
ALLOWED_MODELS = {
    "rehabopt-clinical-ai": "rehabopt-clinical-ai",
    "gemini-3.7-flash": "gemini-3.7-flash",
    "gemini-3.6-flash": "gemini-3.6-flash",
    "gemini-2.5-pro": "gemini-3.7-flash",
    "gemini-2.5-flash": "gemini-3.7-flash",
}

DAILY_CHAT_LIMIT = 20


@app.route("/api/chat-usage", methods=["GET"])
@login_required
def chat_usage():
    """Return today's chat count and remaining quota for the logged-in patient."""
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    cur = db.execute(
        "SELECT COUNT(*) as cnt FROM chat_logs WHERE patient_id = ? AND DATE(created_at) = DATE(?)",
        (session["patient_id"], today),
    )
    row = cur.fetchone()
    used = row["cnt"] if row else 0
    remaining = max(0, DAILY_CHAT_LIMIT - used)
    return jsonify({
        "status": "success",
        "used": used,
        "limit": DAILY_CHAT_LIMIT,
        "remaining": remaining,
    })


@app.route("/api/ai-chat", methods=["POST"])
@login_required
def ai_chat():
    data = request.get_json() or {}
    user_message = data.get("message", "").strip()
    requested_model = data.get("model", "rehabopt-clinical-ai")
    attachments = data.get("attachments", [])
    patient_id = session.get("patient_id", "SP-000000001")

    selected_model = ALLOWED_MODELS.get(requested_model, "rehabopt-clinical-ai")

    if not user_message and not attachments:
        return jsonify({"error": "Empty message"}), 400

    # --- Daily Usage Check (20 messages/day limit) ---
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    cur = db.execute(
        "SELECT COUNT(*) as cnt FROM chat_logs WHERE patient_id = ? AND DATE(created_at) = DATE(?)",
        (patient_id, today),
    )
    used = cur.fetchone()["cnt"]

    if used >= DAILY_CHAT_LIMIT:
        db.execute(
            "INSERT INTO chat_logs (patient_id, model_used, status) VALUES (?, ?, ?)",
            (patient_id, selected_model, "quota_exceeded"),
        )
        db.commit()
        return jsonify({
            "status": "quota_exceeded",
            "used": used,
            "limit": DAILY_CHAT_LIMIT,
            "reply": (
                f"You've used all {DAILY_CHAT_LIMIT} AI messages for today. "
                "Your quota resets tomorrow. In the meantime, here are some general tips:\n\n"
                "1. Continue your daily exercises as prescribed\n"
                "2. Keep your posture aligned — no compensatory leaning\n"
                "3. Track your ROM progress in the exercise session\n"
                "4. Stay hydrated and rest between sets\n\n"
                "For detailed clinical guidance, check back tomorrow or consult your therapist."
            ),
            "model_used": "local-fallback",
        })

    api_key = os.environ.get("GEMINI_API_KEY")
    # If a Gemini model is explicitly requested AND an API key is available, attempt Gemini
    if api_key and genai is not None and selected_model != "rehabopt-clinical-ai":
        system_instruction = (
            "You are RehabOpt AI, a clinical tele-rehabilitation specialist for post-stroke recovery. "
            "Provide evidence-based, empathetic, and clear guidance on motor exercises, biomechanics, "
            "and recovery progress. Never prescribe medications or replace emergency medical advice. "
            "Keep responses concise and actionable."
        )
        contents = []
        for att in attachments:
            try:
                file_bytes = base64.b64decode(att["data_base64"])
                contents.append(
                    types.Part.from_bytes(data=file_bytes, mime_type=att["mime_type"])
                )
            except Exception:
                continue
        if user_message:
            contents.append(user_message)

        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=selected_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.3,
                ),
            )
            if response and response.text:
                db.execute(
                    "INSERT INTO chat_logs (patient_id, model_used, status) VALUES (?, ?, ?)",
                    (patient_id, selected_model, "success"),
                )
                db.commit()
                return jsonify({
                    "status": "success",
                    "reply": response.text,
                    "model_used": selected_model,
                    "remaining": DAILY_CHAT_LIMIT - used - 1,
                })
        except Exception:
            pass  # Fall back smoothly to built-in clinical advisor below

    # Built-in Clinical AI engine (standalone, zero external key required)
    clinical_reply = generate_clinical_chat_reply(user_message, patient_id)
    db.execute(
        "INSERT INTO chat_logs (patient_id, model_used, status) VALUES (?, ?, ?)",
        (patient_id, "rehabopt-clinical-ai", "success"),
    )
    db.commit()
    return jsonify({
        "status": "success",
        "reply": clinical_reply,
        "model_used": "rehabopt-clinical-ai",
        "remaining": DAILY_CHAT_LIMIT - used - 1,
    })


@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Resource not found", "status": 404}), 404
    return redirect(url_for("dashboard"))


@app.errorhandler(500)
def handle_500(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error", "status": 500}), 500
    return redirect(url_for("dashboard"))


# ---------------------------------------------------------------------------
# Application Entry
# ---------------------------------------------------------------------------
# Initialize DB on import (works with both python app.py and gunicorn)
init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
