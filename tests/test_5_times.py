import unittest
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app, init_db, get_db

class TestRehabOptSystem(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['SECRET_KEY'] = 'test-secret-key-123'
        self.client = app.test_client()
        with app.app_context():
            init_db()
            db = get_db()
            # Ensure test patient exists with onboarding completed
            db.execute("""
                INSERT OR REPLACE INTO patients (
                    patient_id, email, password_hash, patient_name,
                    selected_condition, affected_side, current_streak, onboarding_done
                ) VALUES (
                    'SP-000000001', 'test@rehabopt.org', 'test-hash', 'Test Patient',
                    'Hemiparesis', 'Right', 5, 1
                )
            """)
            db.commit()

    def test_routes_accessible(self):
        # 1. Root redirects to auth portal
        res = self.client.get('/', follow_redirects=True)
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"Patient Portal", res.data)

        # 2. Auth portal direct
        res = self.client.get('/auth')
        self.assertEqual(res.status_code, 200)

        # 3. Authenticate session
        with self.client.session_transaction() as sess:
            sess['patient_id'] = 'SP-000000001'
            sess['patient_name'] = 'Test Patient'

        # 4. Dashboard
        res = self.client.get('/dashboard')
        self.assertEqual(res.status_code, 200)

        # 5. Session 1: Therapy / Exercise
        res = self.client.get('/therapy')
        self.assertEqual(res.status_code, 200)

        # 6. Session 2: Arcade / Games
        res = self.client.get('/arcade')
        self.assertEqual(res.status_code, 200)

        # 7. Session 3: Neon Air-Canvas / Drawing
        res = self.client.get('/air-canvas')
        self.assertEqual(res.status_code, 200)

        # 8. Session 4: ADL Functional Lab
        res = self.client.get('/adl')
        self.assertEqual(res.status_code, 200)

        # 9. Reports
        res = self.client.get('/report')
        self.assertEqual(res.status_code, 200)

        # 10. Profile
        res = self.client.get('/profile')
        self.assertEqual(res.status_code, 200)

    def test_kinematics_13_formulas(self):
        path = os.path.join(os.path.dirname(__file__), '..', 'static', 'js', 'kinematics.js')
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        formulas = [
            'calculateJointAngle',           # C1
            'isTargetIntercepted',           # C2
            'calculateHandDispersion',       # C3
            'calculatePlanarReach',          # C4
            'calculateRadialDeviation',      # C5
            'calculateBimanualCoordination', # C6
            'calculateTrunkTilt',            # E1
            'calculatePincerGrip',           # E2
            'calculateWristDeviation',       # E3
            'calculateOrthogonalPathError',  # E4
            'calculateKnuckleAspectRatio',   # E5
            'calculateTremorFrequency',      # E6
            'calculateSmoothness',           # S1
            'calculateVelocity',             # S2
            'calculateReactionLatency'       # S3
        ]
        for fn in formulas:
            self.assertIn(fn, content, f"Missing kinematic formula: {fn}")

    def test_mediapipe_skeleton_specifications(self):
        """Verify MediaPipe 21-landmark tracking and skeleton color rendering across engines."""
        for js_file in ['air_canvas_engine.js', 'adl_engine.js', 'arcade_engine.js', 'therapy_engine.js']:
            path = os.path.join(os.path.dirname(__file__), '..', 'static', 'js', js_file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Check Red dots / wrist (#FF0000 or #EF4444)
            self.assertTrue('#FF0000' in content or '#EF4444' in content, f"{js_file} missing Red landmark color")
            # Check MediaPipe 21 landmarks loop / reference
            self.assertTrue('21' in content or 'HAND_CONNECTIONS' in content, f"{js_file} missing full hand landmark support")
            # Check Green / Cyan bones (#00FF00 or #00E5FF or (0, 229, 255))
            self.assertTrue('#00FF00' in content or '#00E5FF' in content or '0, 229, 255' in content, f"{js_file} missing hand bone color")

    def test_arcade_layout_uncluttered(self):
        # Verify arcade.html has clean horizontal toolbar and zero formula clutter / side panels
        path = os.path.join(os.path.dirname(__file__), '..', 'templates', 'arcade.html')
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        self.assertIn('game-toolbar', content)
        self.assertIn('video-frame', content)
        self.assertNotIn('kpi-panel', content)
        self.assertNotIn('game-shelf', content)

    def test_adl_key_and_pin_features(self):
        # Verify adl_engine.js has 4 core tasks (balloon, watertanks, light, pin) and key/pill/thermostat/faucet removed
        path = os.path.join(os.path.dirname(__file__), '..', 'static', 'js', 'adl_engine.js')
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        self.assertIn('generateRandomPin', content)
        self.assertIn('randomPin', content)
        self.assertIn('switchOn', content)
        self.assertIn('balloonLevel', content)
        self.assertIn('triggerBalloonPump', content)
        self.assertIn('popBalloon', content)
        self.assertIn('waterTanks', content)
        self.assertIn('activeTankIndex', content)
        self.assertIn('secureActiveTank', content)
        self.assertNotIn('🔑 90° Door Key Turn', content)
        self.assertNotIn('💊 Pill Bottle Cap Twist', content)
        self.assertNotIn('drawThermostatTask', content)
        self.assertNotIn('drawFaucetTask', content)

    def test_telemetry_post(self):
        with self.client.session_transaction() as sess:
            sess['patient_id'] = 'SP-000000001'

        payload = {
            'session_type': 'Therapy',
            'condition': 'Hemiparesis',
            'duration_seconds': 45,
            'peak_rom': 92.5,
            'smoothness_score': 84.0,
            'cheats_blocked': 0,
            'score': 12,
            'metrics_json': json.dumps({'reps': 3})
        }
        res = self.client.post('/api/telemetry', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get('status'), 'success')
        self.assertIn('streak', data)

    def test_exercise_session_features(self):
        # 1. Verify therapy_engine.js has horizontal wrist pitch & 10s stuck popup
        engine_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'js', 'therapy_engine.js')
        with open(engine_path, 'r', encoding='utf-8') as f:
            engine = f.read()
        self.assertIn('wristPitch', engine)
        self.assertIn('wristVerticalAngle', engine)
        self.assertIn('showGuidancePopup(10', engine)
        self.assertIn('👉 CURRENT STEP: DO THIS NOW', engine)
        self.assertIn('peak_elbow_rom_deg', engine)

        # 2. Verify exercise_library.js has exactly 10 simple exercises across 6 stroke profiles
        lib_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'js', 'exercise_library.js')
        with open(lib_path, 'r', encoding='utf-8') as f:
            lib = f.read()
        import re
        ex_block = lib.split('const EXERCISES = [')[1].split('];')[0]
        ex_keys = re.findall(r'key:\s*"([^"]+)"', ex_block)
        self.assertEqual(len(ex_keys), 10, f"Expected exactly 10 simple exercises, found {len(ex_keys)}")
        self.assertIn('Horizontal Wrist Up & Down', lib)
        self.assertIn('Hand Open & Close', lib)
        self.assertIn('Elbow Extension & Flexion', lib)
        self.assertIn('wristPitch', lib)

        # 3. Verify /leg route is removed and cleanly redirects to /dashboard
        with self.client.session_transaction() as sess:
            sess['patient_id'] = 'SP-000000001'
        leg_res = self.client.get('/leg')
        self.assertEqual(leg_res.status_code, 302)
        self.assertEqual(leg_res.location, '/dashboard')

        # 4. Verify clinical SOAP note generation and report stats
        res = self.client.get('/api/report/stats')
        self.assertEqual(res.status_code, 200)
        stats = json.loads(res.data)
        self.assertEqual(stats.get('status'), 'success')
        self.assertIn('stats', stats)

    def test_auth_controller_and_id_format(self):
        import re

        # 1. Controller / Owner login with OWNER_PASSWORD
        os.environ['OWNER_PASSWORD'] = 'SecureOwnerTestPass@2026'
        with app.app_context():
            from app import seed_or_update_owner
            seed_or_update_owner(get_db())

        res = self.client.post('/api/login', json={'patient_id': 'SP_OWNER_1', 'password': 'SecureOwnerTestPass@2026'})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data.get('status'), 'success')
        self.assertTrue(data.get('is_owner'))
        self.assertEqual(data.get('patient_id'), 'SP_OWNER_1')

        # 2. Reject registration if password is under 8 characters
        for pw in ['short', '1234567', 'pass']:
            r = self.client.post('/api/register', json={
                'username': f'user_test_{pw[:4]}',
                'email': f'{pw[:4]}@hospital.org',
                'password': pw
            })
            self.assertEqual(r.status_code, 400)
            res_json = json.loads(r.data)
            self.assertIn('at least 8 characters', res_json.get('message', ''))

        # 3. Valid user registration receives SP_00001 to SP_99999 format
        import time
        uniq_id = f"test_{int(time.time() * 1000)}"
        reg_res = self.client.post('/api/register', json={
            'username': f'p_{uniq_id}',
            'email': f'{uniq_id}@hospital.org',
            'password': 'StrongPatientPass@2026'
        })
        self.assertEqual(reg_res.status_code, 200)
        reg_data = json.loads(reg_res.data)
        new_pid = reg_data.get('patient_id')
        self.assertTrue(bool(re.match(r'^SP_\d{5}$', new_pid)), f"Expected SP_XXXXX format, got {new_pid}")

        # 4. Master Patient Activity Center endpoint (/api/admin/patients) for Controller
        with self.client.session_transaction() as sess:
            sess['patient_id'] = 'SP_OWNER_1'
            sess['role'] = 'owner'
        admin_res = self.client.get('/api/admin/patients')
        self.assertEqual(admin_res.status_code, 200)
        admin_data = json.loads(admin_res.data)
        self.assertEqual(admin_data.get('status'), 'success')
        self.assertIn('summary', admin_data)
        self.assertIn('patients', admin_data)

        # 5. Non-controller access to /api/admin/patients is blocked with 403 Forbidden
        with self.client.session_transaction() as sess:
            sess['patient_id'] = new_pid
            sess['role'] = 'patient'
        non_admin_res = self.client.get('/api/admin/patients')
        self.assertEqual(non_admin_res.status_code, 403)

        # 6. Controller can inspect any patient via ?patient_id= parameter
        with self.client.session_transaction() as sess:
            sess['patient_id'] = 'SP_OWNER_1'
            sess['role'] = 'owner'
        insp_res = self.client.get(f'/api/report/stats?patient_id={new_pid}')
        self.assertEqual(insp_res.status_code, 200)
        insp_data = json.loads(insp_res.data)
        self.assertEqual(insp_data.get('stats', {}).get('patient_id'), new_pid)

if __name__ == '__main__':
    for iteration in range(1, 6):
        print(f"==================================================")
        print(f"  RUNNING FULL SYSTEM TEST SUITE (PASS {iteration}/5)")
        print(f"==================================================")
        suite = unittest.TestLoader().loadTestsFromTestCase(TestRehabOptSystem)
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        if not result.wasSuccessful():
            print(f"FAILED AT PASS {iteration}")
            exit(1)
        print(f"--> PASS {iteration}/5 PASSED CLEANLY (100% OK)\n")
    print("ALL 5 CONSECUTIVE TEST PASSES COMPLETED SUCCESSFULLY!")
