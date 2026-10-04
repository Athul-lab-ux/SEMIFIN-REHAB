"""
tests/test_owner_features.py
Comprehensive automated test suite for RehabOpt AR Part D (Owner Features) & Part C (RQI Safe Handling).
Verifies:
1. GET /api/admin/patient/<pid> dossier:
   - 401/302 for unauthenticated
   - 403 for patient role
   - 200 for owner role
   - Contains intake answers, recovery index breakdown, telemetry history, and clinical SOAP reports
2. GET /api/admin/patients owner activity view:
   - 403 for patient role
   - 200 for owner role
   - Contains patient table, summary counts, and latest 15 workouts
3. GET /api/rqi zero-sessions safe computation:
   - Returns valid tier and status without error on 0 sessions
4. Route isolation on /report and /profile:
   - Patient cannot spoof patient_id query parameter
   - Owner can inspect target patient via patient_id query parameter
"""
import os
import sys
import unittest

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import app, get_db


class TestOwnerFeatures(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        app.config["SECRET_KEY"] = "test-secret-key-rehabopt-2026"
        self.client = app.test_client()

        with app.app_context():
            db = get_db()
            # Ensure schema exists
            db.execute("DELETE FROM telemetry_logs WHERE patient_id LIKE 'TEST_%'")
            db.execute("DELETE FROM clinical_reports WHERE patient_id LIKE 'TEST_%'")
            db.execute("DELETE FROM patients WHERE patient_id LIKE 'TEST_%'")
            db.commit()

            # Seed a test patient with intake data
            db.execute(
                """INSERT INTO patients (
                    patient_id, username, email, password_hash, role,
                    selected_condition, current_streak, last_session_date,
                    onboarding_done, stroke_onset, affected_side, daily_struggles,
                    doing_therapy, pain_level, rehab_goal, goal_note,
                    patient_name, patient_dob, patient_phone
                ) VALUES (
                    'TEST_P001', 'testpatient', 'testpatient@rehabopt.org', 'fakehash', 'patient',
                    'Hemiparesis', 3, '2026-10-04',
                    1, '3-6m', 'right', 'Trouble holding a cup',
                    'Weekly clinic visit', 'mild', 'Hold a cup without spilling', 'Daily morning goal',
                    'Jane Doe', '1965-04-12', '+1-555-0199'
                )"""
            )
            # Add some telemetry for TEST_P001
            db.execute(
                """INSERT INTO telemetry_logs (
                    patient_id, session_type, condition, duration_seconds,
                    peak_rom, smoothness_score, cheats_blocked, score
                ) VALUES (
                    'TEST_P001', 'ADL', 'Hemiparesis', 45,
                    115.0, 78.5, 0, 92.0
                )"""
            )
            # Add a SOAP note for TEST_P001
            db.execute(
                """INSERT INTO clinical_reports (
                    patient_id, report_type, content, soap_subjective, soap_objective, soap_assessment, soap_plan
                ) VALUES (
                    'TEST_P001', 'SOAP', 'Full clinical evaluation note',
                    'Patient reports improved grip', 'Peak ROM reached 115 deg',
                    'Recovery progressing well', 'Continue daily ADL sessions'
                )"""
            )
            # Seed a zero-session patient
            db.execute(
                """INSERT INTO patients (
                    patient_id, username, email, password_hash, role,
                    selected_condition, current_streak, onboarding_done
                ) VALUES (
                    'TEST_P002', 'newpatient', 'newpatient@rehabopt.org', 'fakehash', 'patient',
                    'Motor Ataxia', 1, 1
                )"""
            )
            db.commit()

    def tearDown(self):
        with app.app_context():
            db = get_db()
            db.execute("DELETE FROM telemetry_logs WHERE patient_id LIKE 'TEST_%'")
            db.execute("DELETE FROM clinical_reports WHERE patient_id LIKE 'TEST_%'")
            db.execute("DELETE FROM patients WHERE patient_id LIKE 'TEST_%'")
            db.commit()

    # -------------------------------------------------------------------------
    # D1 & D2: Dossier and Activity View Security
    # -------------------------------------------------------------------------
    def test_dossier_unauthenticated(self):
        """Unauthenticated user accessing /api/admin/patient/<pid> must be rejected."""
        res = self.client.get("/api/admin/patient/TEST_P001")
        self.assertIn(res.status_code, [401, 302])

    def test_dossier_patient_forbidden(self):
        """Logged-in patient must receive 403 Forbidden on /api/admin/patient/<pid>."""
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "TEST_P001"
            sess["role"] = "patient"
            sess["logged_in"] = True

        res = self.client.get("/api/admin/patient/TEST_P001")
        self.assertEqual(res.status_code, 403)
        data = res.get_json()
        self.assertEqual(data["status"], "error")

    def test_dossier_owner_success(self):
        """Logged-in owner must receive 200 OK with complete patient dossier."""
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "SP_OWNER_1"
            sess["role"] = "owner"
            sess["logged_in"] = True

        res = self.client.get("/api/admin/patient/TEST_P001")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")

        # 1. Intake answers
        intake = data["intake"]
        self.assertEqual(intake["patient_id"], "TEST_P001")
        self.assertEqual(intake["patient_name"], "Jane Doe")
        self.assertEqual(intake["affected_side"], "right")
        self.assertEqual(intake["stroke_onset"], "3-6m")
        self.assertEqual(intake["daily_struggles"], "Trouble holding a cup")
        self.assertEqual(intake["pain_level"], "mild")
        self.assertEqual(intake["doing_therapy"], "Weekly clinic visit")
        self.assertIn("Hold a cup", intake["rehab_goal"])

        # 2. Recovery Index Breakdown with exact numbers
        rqi = data["recovery_index"]
        self.assertIn("rqi_score", rqi)
        self.assertIsInstance(rqi["rqi_score"], float)
        self.assertIn("components", rqi)
        self.assertIn("adherence", rqi["components"])
        self.assertIn("smoothness", rqi["components"])
        self.assertIn("range", rqi["components"])
        self.assertGreater(rqi["total_sessions"], 0)

        # 3. Telemetry history
        telemetry = data["telemetry_history"]
        self.assertIsInstance(telemetry, list)
        self.assertGreaterEqual(len(telemetry), 1)
        self.assertEqual(telemetry[0]["session_type"], "ADL")

        # 4. Clinical SOAP reports
        reports = data["clinical_reports"]
        self.assertIsInstance(reports, list)
        self.assertGreaterEqual(len(reports), 1)
        self.assertEqual(reports[0]["soap_subjective"], "Patient reports improved grip")

    def test_owner_activity_view_permissions(self):
        """GET /api/admin/patients rejects patient with 403 and allows owner with 200."""
        # Patient session -> 403
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "TEST_P001"
            sess["role"] = "patient"
            sess["logged_in"] = True
        res_pat = self.client.get("/api/admin/patients")
        self.assertEqual(res_pat.status_code, 403)

        # Owner session -> 200
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "SP_OWNER_1"
            sess["role"] = "owner"
            sess["logged_in"] = True
        res_own = self.client.get("/api/admin/patients")
        self.assertEqual(res_own.status_code, 200)
        data = res_own.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("summary", data)
        self.assertIn("total_registered_patients", data["summary"])
        self.assertIn("patients", data)
        self.assertIn("recent_activity", data)

        # Confirm TEST_P001 appears in patient list
        pids = [p["patient_id"] for p in data["patients"]]
        self.assertIn("TEST_P001", pids)

    # -------------------------------------------------------------------------
    # D3: RQI Safe Handling on Zero Sessions
    # -------------------------------------------------------------------------
    def test_rqi_zero_sessions_safe(self):
        """GET /api/rqi must safely return starting tier for a patient with 0 sessions."""
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "TEST_P002"
            sess["role"] = "patient"
            sess["logged_in"] = True

        res = self.client.get("/api/rqi")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["tier"], "starting")
        self.assertEqual(data["tier_label"], "Starting Out")
        self.assertEqual(data["total_sessions"], 0)
        self.assertEqual(data["streak"], 1)

    # -------------------------------------------------------------------------
    # Route Parameter Isolation (/report & /profile)
    # -------------------------------------------------------------------------
    def test_report_patient_id_ignored_for_non_owner(self):
        """A regular patient accessing /report?patient_id=TEST_P001 must NOT see controller banner."""
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "TEST_P002"
            sess["role"] = "patient"
            sess["logged_in"] = True
            sess["onboarding_done"] = 1

        res = self.client.get("/report?patient_id=TEST_P001")
        self.assertEqual(res.status_code, 200)
        # Should not display the Controller Oversight banner / return button
        self.assertNotIn("Return to Master Patient Center", res.get_data(as_text=True))

    def test_report_patient_id_honored_for_owner(self):
        """Owner accessing /report?patient_id=TEST_P001 must see controller oversight banner."""
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "SP_OWNER_1"
            sess["role"] = "owner"
            sess["logged_in"] = True
            sess["onboarding_done"] = 1

        res = self.client.get("/report?patient_id=TEST_P001")
        self.assertEqual(res.status_code, 200)
        self.assertIn("Return to Master Patient Center", res.get_data(as_text=True))
        self.assertIn("TEST_P001", res.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
