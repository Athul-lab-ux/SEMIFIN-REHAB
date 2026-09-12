# 🏥 RehabOpt AR — Neuro-Rehabilitation Platform

A production-grade, clinical-grade web platform for post-stroke motor recovery through AI-powered gamified tele-rehabilitation.

## 🌟 Features

### Core Architecture
- **Edge-Native Landmark Perception**: Client-side MediaPipe (Pose + Hands) for 30 FPS 3D upper-limb tracking via WebAssembly/WebGL
- **Deterministic 13-Formula Biomechanical Engine**: Explicit mathematical kinematics (C1-C6, E1-E6, S1-S3) — no black-box AI
- **Built-in Clinical AI Tele-Rehab Engine**: Standalone zero-key intelligence for real-time clinical advisory and SOAP note synthesis (with zero-leak proxy architecture)

### 4 Core Practice Sessions
| Session | Name | Purpose |
|---------|------|---------|
| 🦾 Session 1 | **Exercise Drills** | Elbow goniometry, rep latching, anti-cheat trunk monitoring, Action Observation ghost guide |
| 🎮 Session 2 | **Games** | Flappy Kinetic + Fruit Ballistic gamified motor training with combo multipliers |
| 🎨 Session 3 | **Neon Air-Canvas** | Fingertip drawing with 10 parametric templates, ataxia corridor scoring, gesture control |
| 🔑 Session 4 | **ADL Functional Lab** | Key turn, light switch, thermostat dial, touchless PIN pad simulation |

### Clinical Platform
- **6 Stroke Deficit Profiles**: Hemiparesis, Flexor Spasticity, Motor Ataxia, Intention Tremor, Motor Apraxia, Wrist Drop
- **Multi-Patient Architecture**: Auto-incrementing Patient IDs (`SP-000000001`), scrypt password hashing, isolated SQLite data
- **AI SOAP Note Generation**: Hospital-grade clinical documentation generated natively from quantitative kinematic telemetry
- **1-Page PDF Export**: Print-optimized clinical report card
- **Daily Recovery Streak**: Persistent `🔥 X Days` counter across sessions

## 🚀 Quick Start

### 1. Clone & Setup
```bash
git clone https://github.com/your-username/rehabopt-ar.git
cd rehabopt-ar
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env:
# FLASK_SECRET_KEY=<random 32-char string>
# (Zero external API key needed — built-in Clinical AI works out-of-the-box!)
```

### 3. Run Locally
```bash
python app.py
# Opens at http://localhost:5000
```

### 4. Demo Account
- **Patient ID**: `SP-000000001`
- **Password**: `PatientDemo@123`

## 🏗️ Architecture

```
rehabopt-ar/
├── app.py                    # Flask backend (auth, routing, Gemini proxy)
├── database/schema.sql       # SQLite schema with patient isolation
├── static/
│   ├── css/                  # 7 themed stylesheets
│   │   ├── auth.css          # Neural re-wiring amber theme
│   │   ├── dashboard.css     # Biometric pulse lattice
│   │   ├── therapy.css       # Clinical telemetry HUD
│   │   ├── arcade.css        # Kinetic synth field
│   │   ├── air_canvas.css    # Bioluminescent darkroom
│   │   ├── adl.css           # Ergonomic workbench
│   │   └── report.css        # Executive medical slate + print
│   └── js/
│       ├── kinematics.js     # 13 biomechanical formulas
│       ├── camera.js         # Hardened webcam controller
│       ├── auth.js           # Authentication logic
│       ├── auth_canvas.js    # Neural ribbon animation
│       ├── dashboard.js      # Command center
│       ├── therapy_engine.js # Session 1 engine
│       ├── arcade_engine.js  # Session 2 engine
│       ├── air_canvas_engine.js # Session 3 engine
│       ├── adl_engine.js     # Session 4 engine
│       ├── report.js         # Report + AI SOAP
│       └── streak_manager.js # Habit consolidation
├── templates/                # 7 HTML views
├── Procfile                  # Render deployment
├── requirements.txt
└── .env.example
```

## 🔐 Security

- Zero API key dependency — built-in clinical intelligence runs standalone
- Optional `GEMINI_API_KEY` is **never** exposed to client-side code (server-side proxy only)
- `scrypt` password hashing via Werkzeug
- Session cookies: `HttpOnly`, `SameSite=Lax`
- Security headers: `Permissions-Policy`, `X-Content-Type-Options`, `X-Frame-Options`
- Data isolation: each patient sees only their own telemetry

## 🚢 Deploy to Render

1. Push to GitHub
2. Connect repo on [render.com](https://render.com)
3. Set environment variable:
   - `FLASK_SECRET_KEY` = random 32-char string
   *(No other keys required! Your app is fully functional out of the box.)*
4. Render auto-detects `Procfile` and deploys with Gunicorn

## 📱 Mobile Support

- `facingMode: "user"` forces front camera on mobile
- `playsinline` + `webkit-playsinline` for iOS Safari inline playback
- HTTPS required for camera access in production

## 🧪 Verification Checklist

1. **Zero-Leak Test**: DevTools on `/report` confirms no `GEMINI_API_KEY` in client code
2. **Camera Permissions**: Deploy over HTTPS, test on mobile Safari/Chrome
3. **Data Isolation**: Register user 1 → log out → register user 2 → confirm separate data

## 📄 License

MIT License — Built with ❤️ for neuro-rehabilitation
