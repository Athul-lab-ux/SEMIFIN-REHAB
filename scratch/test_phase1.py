import unittest
import os
import sys
import json
import time
import re
import importlib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class TestPhase1Authentication(unittest.TestCase):
    def setUp(self):
        # Ensure fresh state for each test
        os.environ["SECRET_KEY"] = "test-phase1-super-secret-key-12345678"
        os.environ["OWNER_PASSWORD"] = "SecureOwnerPass@2026"
        os.environ["ALLOW_DEMO_LOGINS"] = "1"
        import app
        self.app_module = app
        self.app = app.app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_proof_1_register_restart_login(self):
        """
        PROOF 1: Register a patient, re-create the app object (simulating a restart), log in again.
        Must persist in database and login must succeed.
        """
        timestamp = int(time.time() * 1000)
        email = f"patient_{timestamp}@hospital.org"
        password = "SecurePassword@123"

        # 1. Register new patient
        reg_res = self.client.post("/api/register", json={
            "patient_name": "Eleanor Vance",
            "email": email,
            "password": password
        })
        self.assertEqual(reg_res.status_code, 200, f"Register failed: {reg_res.data}")
        reg_data = reg_res.get_json()
        self.assertEqual(reg_data["status"], "success")
        patient_id = reg_data["patient_id"]
        self.assertTrue(re.match(r"^SP_\d{5}$", patient_id), f"Unexpected ID format: {patient_id}")

        # 2. Simulate server restart: reload the app module and create fresh test client
        self.app_module = importlib.reload(self.app_module)
        new_app = self.app_module.app
        new_app.config["TESTING"] = True
        new_client = new_app.test_client()

        # 3. Log in with the registered credentials using Patient ID
        login_res_id = new_client.post("/api/login", json={
            "patient_id": patient_id,
            "password": password
        })
        self.assertEqual(login_res_id.status_code, 200, f"Login by ID failed after restart: {login_res_id.data}")
        self.assertEqual(login_res_id.get_json()["status"], "success")
        self.assertEqual(login_res_id.get_json()["patient_id"], patient_id)

        # 4. Log in with Email (case-insensitive test)
        login_res_email = new_client.post("/api/login", json={
            "email": email.upper(),
            "password": password
        })
        self.assertEqual(login_res_email.status_code, 200, f"Login by email failed after restart: {login_res_email.data}")
        self.assertEqual(login_res_email.get_json()["status"], "success")

    def test_proof_3_six_wrong_passwords_triggers_60s_lock(self):
        """
        PROOF 3: 5 failed attempts allowed, 6th attempt triggers 60s lockout with HTTP 429.
        """
        test_user = f"lockout_test_{int(time.time() * 1000)}"
        # Clear rate limit state
        self.app_module.clear_login_attempts(test_user)

        # 5 wrong passwords should return 401
        for attempt in range(1, 6):
            res = self.client.post("/api/login", json={
                "patient_id": test_user,
                "password": f"WrongPass{attempt}"
            })
            self.assertEqual(res.status_code, 401, f"Attempt {attempt} should return 401, got {res.status_code}")
            data = res.get_json()
            self.assertEqual(data["message"], "Invalid credentials. Please verify your Patient ID, Email, or Password.")

        # 6th attempt MUST return 429 Rate Limit Lockout
        res_6 = self.client.post("/api/login", json={
            "patient_id": test_user,
            "password": "WrongPassword6"
        })
        self.assertEqual(res_6.status_code, 429, f"Attempt 6 should be locked out (429), got {res_6.status_code}")
        data_6 = res_6.get_json()
        self.assertIn("Too many failed attempts", data_6["message"])
        self.assertIn("seconds before trying again", data_6["message"])

        # Clean up
        self.app_module.clear_login_attempts(test_user)

    def test_proof_4_normal_patient_admin_endpoint_forbidden(self):
        """
        PROOF 4: A normal patient calling /api/admin/patient/anything or /api/admin/patients gets 403.
        """
        # Session with normal patient role
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "SP_00001"
            sess["role"] = "patient"

        # Calling /api/admin/patient/anything
        res1 = self.client.get("/api/admin/patient/anything")
        self.assertEqual(res1.status_code, 403, f"Expected 403, got {res1.status_code}")
        self.assertEqual(res1.get_json()["status"], "error")
        self.assertIn("Controller privileges required", res1.get_json()["message"])

        # Calling /api/admin/patients
        res2 = self.client.get("/api/admin/patients")
        self.assertEqual(res2.status_code, 403, f"Expected 403, got {res2.status_code}")
        self.assertIn("Controller privileges required", res2.get_json()["message"])

        # An unauthenticated request gets 401
        anon_client = self.app.test_client()
        res3 = anon_client.get("/api/admin/patients")
        self.assertEqual(res3.status_code, 401)

    def test_proof_5_zero_matches_for_old_password(self):
        """
        PROOF 5: Verify zero matches for old owner password across the entire repository.
        """
        target = "".join(["a", "t", "h", "u", "l", "@", "2", "0", "0", "7"])
        pattern = re.compile(re.escape(target), re.IGNORECASE)
        found = []
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        for root, dirs, files in os.walk(base_dir):
            if ".git" in root or ".gemini" in root or "__pycache__" in root:
                continue
            for file in files:
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        if pattern.search(f.read()):
                            found.append(filepath)
                except Exception:
                    pass
        self.assertEqual(len(found), 0, f"Found old password in files: {found}")

    def test_session_stores_only_patient_id_and_role(self):
        """
        Verify session object stores strictly patient_id and role upon login and registration.
        """
        reg_email = f"sess_test_{int(time.time() * 1000)}@hospital.org"
        res = self.client.post("/api/register", json={
            "patient_name": "Session Verification",
            "email": reg_email,
            "password": "ValidPassword@2026"
        })
        self.assertEqual(res.status_code, 200)

        # Inspect session keys
        with self.client.session_transaction() as sess:
            session_keys = set(sess.keys())
            # Only patient_id and role (plus optional permanent/fresh session flags from Flask)
            custom_keys = {k for k in session_keys if not k.startswith("_")}
            self.assertEqual(custom_keys, {"patient_id", "role"}, f"Unexpected session keys: {custom_keys}")
            self.assertEqual(sess["role"], "patient")

    def test_password_length_enforcement_at_least_8(self):
        """Verify registration and password update reject passwords under 8 characters."""
        # 1. Register with 7 characters
        res = self.client.post("/api/register", json={
            "email": "pass7@hospital.org",
            "password": "Short12"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("at least 8 characters", res.get_json()["message"])

        # 2. Register with 8 characters succeeds
        res_ok = self.client.post("/api/register", json={
            "email": f"pass8_{int(time.time()*1000)}@hospital.org",
            "password": "Valid008"
        })
        self.assertEqual(res_ok.status_code, 200)

    def test_duplicate_email_friendly_rejection(self):
        """Verify registering with duplicate email returns friendly 409 error."""
        dup_email = f"dup_{int(time.time()*1000)}@hospital.org"
        res1 = self.client.post("/api/register", json={
            "email": dup_email,
            "password": "Password123!"
        })
        self.assertEqual(res1.status_code, 200)

        res2 = self.client.post("/api/register", json={
            "email": dup_email,
            "password": "DifferentPassword123!"
        })
        self.assertEqual(res2.status_code, 409)
        self.assertIn("already registered", res2.get_json()["message"])

if __name__ == "__main__":
    unittest.main()
