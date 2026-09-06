"""
RehabOpt AR — Neuro-Rehabilitation Platform Backend
Production-grade Flask server with zero-leak Gemini AI proxy.
"""

import os
import re
import sqlite3
import secrets
import string
import base64
from datetime import datetime, timedelta
from functools import wraps

from dotenv import load_dotenv

# Load .env file (API keys stay on server, never exposed to client)
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from flask import (
    Flask, render_template, request, redirect, url_for,
    session, jsonify, g, abort
)
from werkzeug.security import generate_password_hash, check_password_hash
from google import genai
from google.genai import types

# ---------------------------------------------------------------------------
# App Configuration
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,  # Set True in HTTPS production
    PERMANENT_SESSION_LIFETIME=timedelta(hours=2),
)

DATABASE = os.path.join(os.path.dirname(__file__), "rehabopt.db")

# ---------------------------------------------------------------------------
# Security Headers
# ---------------------------------------------------------------------------
@app.after_request
def add_security_headers(response):
    response.headers["Permissions-Policy"] = "camera=(self)"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response

# ---------------------------------------------------------------------------
# Database Helpers
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def ensure_schema_columns(db):
    """Add columns introduced after v1 to databases that already exist."""
    existing = {r["name"] for r in db.execute("PRAGMA table_info(patients)").fetchall()}
    additions = {
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
    }
    for col, ddl in additions.items():
        if col not in existing:
            db.execute(f"ALTER TABLE patients ADD COLUMN {col} {ddl}")


def init_db():
    """Initialize the database and seed demo account."""
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    schema_path = os.path.join(os.path.dirname(__file__), "database", "schema.sql")
    with open(schema_path, "r") as f:
        db.executescript(f.read())
    ensure_schema_columns(db)

    # Generate real scrypt hash for demo password
    demo_hash = generate_password_hash("PatientDemo@123", method="scrypt")
    db.execute(
        """INSERT OR REPLACE INTO patients
           (patient_id, email, password_hash, selected_condition, current_streak, last_session_date, onboarding_done)
           VALUES (?, ?, ?, ?, ?, ?, 1)""",
        ("SP-000000001", "demo@gmail.com", demo_hash, "Hemiparesis", 5, "2026-09-03"),
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
    """Block clinical pages until the patient completes onboarding."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "patient_id" not in session:
            return redirect(url_for("auth_portal"))
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
    cur = db.execute("SELECT patient_id FROM patients")
    max_num = 0
    for r in cur.fetchall():
        pid = r["patient_id"] or ""
        if "-" in pid:
            try:
                num = int(pid.split("-")[1])
                if num > max_num:
                    max_num = num
            except ValueError:
                pass
    return f"SP-{max_num + 1:09d}"


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
        return redirect(url_for("dashboard"))
    return redirect(url_for("auth_portal"))


@app.route("/auth")
def auth_portal():
    if "patient_id" in session:
        return redirect(url_for("dashboard"))
    return render_template("auth.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("auth_portal"))


@app.route("/onboarding")
@login_required
def onboarding():
    """New-patient questionnaire: stroke type → how it happened."""
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
    return render_template("dashboard.html")


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
@login_required
@onboarding_required
def adl_lab():
    return render_template("adl_lab.html")


@app.route("/leg")
@login_required
@onboarding_required
def leg():
    return render_template("leg.html")


@app.route("/report")
@login_required
@onboarding_required
def report():
    return render_template("report.html")

# ---------------------------------------------------------------------------
# API Routes — Authentication
# ---------------------------------------------------------------------------
@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"status": "error", "message": "Email and password are required"}), 400

    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
        return jsonify({"status": "error", "message": "Invalid email format"}), 400

    if len(password) < 8:
        return jsonify({"status": "error", "message": "Password must be at least 8 characters"}), 400

    db = get_db()

    # Check duplicate email
    existing = db.execute("SELECT id FROM patients WHERE email = ?", (email,)).fetchone()
    if existing:
        return jsonify({"status": "error", "message": "Email already registered"}), 409

    patient_id = generate_next_patient_id(db)
    password_hash = generate_password_hash(password, method="scrypt")

    name = (data.get("patient_name") or "").strip()[:60]
    dob = (data.get("patient_dob") or "").strip()[:10]
    phone = (data.get("patient_phone") or "").strip()[:20]
    primary_color = (data.get("primary_color") or "").strip().lower()
    secondary_color = (data.get("secondary_color") or "").strip().lower()
    if primary_color and not re.match(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", primary_color):
        primary_color = ""
    if secondary_color and not re.match(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", secondary_color):
        secondary_color = ""

    db.execute(
        """INSERT INTO patients (patient_id, email, password_hash, selected_condition, current_streak, last_session_date,
           patient_name, patient_dob, patient_phone, primary_color, secondary_color)
           VALUES (?, ?, ?, 'Hemiparesis', 1, NULL, ?, ?, ?, ?, ?)""",
        (patient_id, email, password_hash, name, dob, phone, primary_color, secondary_color),
    )
    db.commit()

    return jsonify({
        "status": "success",
        "patient_id": patient_id,
        "message": f"Account created! Your Patient ID is {patient_id}",
    })


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    patient_id = (data.get("patient_id") or "").strip().upper()
    password = data.get("password") or ""

    if not patient_id or not password:
        return jsonify({"status": "error", "message": "Patient ID and password are required"}), 400

    db = get_db()
    user = db.execute("SELECT * FROM patients WHERE patient_id = ?", (patient_id,)).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    session.permanent = True
    session["patient_id"] = user["patient_id"]
    session["email"] = user["email"]

    return jsonify({
        "status": "success",
        "patient_id": user["patient_id"],
        "condition": user["selected_condition"],
    })


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
    user = db.execute(
        """SELECT patient_id, email, selected_condition, current_streak, last_session_date,
                  onboarding_done, stroke_onset, affected_side, onset_ago,
                  daily_struggles, doing_therapy, pain_level, rehab_goal, goal_note,
                  patient_name, patient_dob, patient_phone,
                  primary_color, secondary_color
           FROM patients WHERE patient_id = ?""",
        (session["patient_id"],),
    ).fetchone()
    if not user:
        return jsonify({"status": "error", "message": "Patient not found"}), 404

    profile = dict(user)
    return jsonify({
        "status": "success",
        "profile": profile,
    })


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
    if condition == "LowerLimb":
        condition = "Lower-Limb"
    valid_conditions = [
        "Hemiparesis", "Flexor Spasticity", "Motor Ataxia",
        "Intention Tremor", "Motor Apraxia", "Wrist Drop", "Lower-Limb"
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
    "Intention Tremor", "Motor Apraxia", "Wrist Drop", "Lower-Limb"
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
    if condition == "LowerLimb":
        condition = "Lower-Limb"
    if condition not in ("Hemiparesis", "Flexor Spasticity", "Motor Ataxia",
                          "Intention Tremor", "Motor Apraxia", "Wrist Drop",
                          "Lower-Limb", ""):
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


@app.route("/api/telemetry/history", methods=["GET"])
@login_required
def api_telemetry_history():
    db = get_db()
    rows = db.execute(
        """SELECT session_type, condition, duration_seconds, peak_rom,
                  smoothness_score, cheats_blocked, score, created_at
           FROM telemetry_logs
           WHERE patient_id = ?
           ORDER BY created_at DESC
           LIMIT 50""",
        (session["patient_id"],),
    ).fetchall()
    return jsonify({"status": "success", "history": [dict(r) for r in rows]})


@app.route("/api/report/stats", methods=["GET"])
@login_required
def api_report_stats():
    db = get_db()
    pid = session["patient_id"]

    user = db.execute(
        "SELECT patient_id, patient_name, current_streak, selected_condition FROM patients WHERE patient_id = ?",
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

    return jsonify({
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
    })

# ---------------------------------------------------------------------------
# Gemini Server-Side Proxy (Zero-Leak Architecture)
# ---------------------------------------------------------------------------
@app.route("/api/generate-soap", methods=["POST"])
@login_required
def generate_soap():
    """
    End-of-session clinical SOAP proxy (zero-leak).
    Accepts either the rich payload from report.js
        { condition, streak, repetitions_completed, active_duration_seconds, metrics: {...} }
    or the legacy flat payload { condition, peak_rom, smoothness, cheats_blocked }.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"status": "error", "message": "Server AI key unconfigured"}), 500

    data = request.get_json() or {}
    patient_id = session["patient_id"]
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

    duration_min = int(active_seconds or 0) // 60

    client = genai.Client(api_key=api_key)
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
        response = client.models.generate_content(
            model="gemini-3.7-flash",
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2),
        )
        return jsonify({"status": "success", "soap_note": response.text})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ---------------------------------------------------------------------------
# Gemini-Style AI Assistant — Zero-Leak Server Proxy
# ---------------------------------------------------------------------------
ALLOWED_MODELS = {
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
        "SELECT COUNT(*) as cnt FROM chat_logs WHERE patient_id = ? AND DATE(created_at) = ?",
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
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured on server"}), 503

    data = request.get_json() or {}
    user_message = data.get("message", "").strip()
    requested_model = data.get("model", "gemini-3.7-flash")
    attachments = data.get("attachments", [])  # List of { mime_type, data_base64 }
    patient_id = session["patient_id"]

    # Validate model selection against allowlist — fallback to gemini-3.7-flash
    selected_model = ALLOWED_MODELS.get(requested_model, "gemini-3.7-flash")

    if not user_message and not attachments:
        return jsonify({"error": "Empty message"}), 400

    # --- Daily Usage Check (20 messages/day limit) ---
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    cur = db.execute(
        "SELECT COUNT(*) as cnt FROM chat_logs WHERE patient_id = ? AND DATE(created_at) = ?",
        (patient_id, today),
    )
    used = cur.fetchone()["cnt"]

    if used >= DAILY_CHAT_LIMIT:
        # Log the attempt as quota exceeded
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

    # System instruction for stroke rehabilitation context
    system_instruction = (
        "You are RehabOpt AI, a clinical tele-rehabilitation specialist for post-stroke recovery. "
        "Provide evidence-based, empathetic, and clear guidance on motor exercises, biomechanics, "
        "and recovery progress. Never prescribe medications or replace emergency medical advice. "
        "Keep responses concise and actionable."
    )

    client = genai.Client(api_key=api_key)

    # Build contents array supporting multimodal attachments
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
        response = client.models.generate_content(
            model=selected_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.3,
            ),
        )
        # Log successful usage
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
    except Exception as e:
        # Log failed attempt
        db.execute(
            "INSERT INTO chat_logs (patient_id, model_used, status) VALUES (?, ?, ?)",
            (patient_id, selected_model, "error"),
        )
        db.commit()
        return jsonify({"error": f"AI service error: {str(e)}"}), 500


# ---------------------------------------------------------------------------
# Application Entry
# ---------------------------------------------------------------------------
# Initialize DB on import (works with both python app.py and gunicorn)
init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
