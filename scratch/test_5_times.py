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

    def test_opencv_skeleton_specifications(self):
        # Verify air canvas, adl, arcade, and therapy engines have OpenCV colors & 21 landmarks
        for js_file in ['air_canvas_engine.js', 'adl_engine.js', 'arcade_engine.js', 'therapy_engine.js']:
            path = os.path.join(os.path.dirname(__file__), '..', 'static', 'js', js_file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Check Red dots / wrist (#FF0000 or #EF4444)
            self.assertTrue('#FF0000' in content or '#EF4444' in content, f"{js_file} missing Red landmark color")
            # Check 21 landmarks loop / reference
            self.assertTrue('21' in content or 'HAND_CONNECTIONS' in content, f"{js_file} missing full hand landmark support")
            # Check Green / Cyan bones (#00FF00 or #00E5FF or (0, 229, 255))
            self.assertTrue('#00FF00' in content or '#00E5FF' in content or '0, 229, 255' in content, f"{js_file} missing hand bone color")

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
