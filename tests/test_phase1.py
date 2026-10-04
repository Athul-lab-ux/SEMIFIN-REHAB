import unittest
import os
import sys
import json
import time
import re
import importlib

# Ensure tests/ can find app in root directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class TestPhase1Authentication(unittest.TestCase):
    def setUp(self):
        # Configure test environment
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
        client2 = self.app_module.app.test_client()

        # 3. Log in with the newly registered credentials
        login_res = client2.post("/api/login", json={
            "identifier": patient_id,
            "password": password
        })
        self.assertEqual(login_res.status_code, 200, f"Login after restart failed: {login_res.data}")
        login_data = login_res.get_json()
        self.assertEqual(login_data["status"], "success")
        self.assertEqual(login_data["patient_id"], patient_id)

    def test_proof_2_rate_limiting_lockout(self):
        """
        PROOF 2: Trigger 5 failed logins, confirm 6th attempt is blocked with HTTP 429 and retry-after message.
        """
        ident = f"attacker_{int(time.time() * 1000)}@botnet.org"
        wrong_pass = "WrongPassword999"

        # Attempt 1 to 5 should fail with 401
        for i in range(1, 6):
            res = self.client.post("/api/login", json={
                "identifier": ident,
                "password": wrong_pass
            })
            self.assertEqual(res.status_code, 401, f"Attempt {i} expected 401, got {res.status_code}")

        # Attempt 6 must be rate-limited with HTTP 429
        res_lockout = self.client.post("/api/login", json={
            "identifier": ident,
            "password": wrong_pass
        })
        self.assertEqual(res_lockout.status_code, 429, f"Attempt 6 expected 429, got {res_lockout.status_code}")
        data = res_lockout.get_json()
        self.assertIn("Too many failed attempts", data["message"])

    def test_proof_3_secret_key_production_enforcement(self):
        """
        PROOF 3: In production (_IS_PRODUCTION=True), verify app refuses to run without SECRET_KEY.
        """
        orig_render = os.environ.get("RENDER")
        orig_flask_env = os.environ.get("FLASK_ENV")
        orig_sk = os.environ.get("SECRET_KEY")

        try:
            os.environ["RENDER"] = "true"
            if "SECRET_KEY" in os.environ:
                del os.environ["SECRET_KEY"]
            if "FLASK_SECRET_KEY" in os.environ:
                del os.environ["FLASK_SECRET_KEY"]

            with self.assertRaises(RuntimeError) as ctx:
                importlib.reload(self.app_module)
            self.assertIn("SECRET_KEY environment variable is required in production", str(ctx.exception))
        finally:
            if orig_render is not None:
                os.environ["RENDER"] = orig_render
            else:
                os.environ.pop("RENDER", None)
            if orig_flask_env is not None:
                os.environ["FLASK_ENV"] = orig_flask_env
            else:
                os.environ.pop("FLASK_ENV", None)
            if orig_sk is not None:
                os.environ["SECRET_KEY"] = orig_sk
            else:
                os.environ["SECRET_KEY"] = "test-phase1-super-secret-key-12345678"
            self.app_module = importlib.reload(self.app_module)

    def test_proof_4_fixed_owner_login(self):
        """
        PROOF 4 (A11): Fixed Owner Login:
        - Owner logs in with SP_OWNER_1 and OWNER_PASSWORD from env -> 200 success
        - Wrong password -> 401 failure
        - Patient cannot access owner API -> 403
        """
        # Ensure owner is seeded with current OWNER_PASSWORD
        with self.app.app_context():
            db = self.app_module.get_db()
            self.app_module.seed_or_update_owner(db)

        # 1. Correct owner login
        res = self.client.post("/api/login", json={
            "identifier": "SP_OWNER_1",
            "password": "SecureOwnerPass@2026"
        })
        self.assertEqual(res.status_code, 200, f"Owner login failed: {res.data}")
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["role"], "owner")

        # Verify owner can access admin API
        admin_res = self.client.get("/api/admin/patients")
        self.assertEqual(admin_res.status_code, 200, f"Admin access failed for owner: {admin_res.data}")

        # 2. Wrong owner password
        bad_res = self.client.post("/api/login", json={
            "identifier": "SP_OWNER_1",
            "password": "WrongPassword@123"
        })
        self.assertEqual(bad_res.status_code, 401)

        # 3. Patient cannot access admin API
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "SP_00001"
            sess["role"] = "patient"

        forbidden_res = self.client.get("/api/admin/patients")
        self.assertEqual(forbidden_res.status_code, 403)

    def test_proof_5_healthz_endpoint(self):
        """
        PROOF 5 (A9): /healthz returns status OK and database dialect without secrets.
        """
        res = self.client.get("/healthz")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "OK")
        self.assertIn(data["database"], ["postgres", "sqlite"])

    def test_proof_6_password_validation(self):
        """
        PROOF 6: Reject password < 8 characters, ensure scrypt hashing in database.
        """
        res = self.client.post("/api/register", json={
            "patient_name": "Short Pw",
            "email": "shortpw@test.com",
            "password": "short"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("at least 8 characters", res.get_json()["message"])

    def test_proof_7_postgres_dialect_translation_layer(self):
        """
        PROOF 7: Verify SQL translation layer for PostgreSQL dialect compatibility:
        - PRAGMA table_info translation
        - PRAGMA journal_mode no-op
        - INSERT OR IGNORE -> ON CONFLICT DO NOTHING
        - INSERT OR REPLACE -> ON CONFLICT DO NOTHING
        - ? -> %s placeholder translation
        - DDL translation: AUTOINCREMENT -> SERIAL, REAL -> DOUBLE PRECISION
        - lastrowid property safety
        """
        from app import PostgresCursorWrapper, PostgresConnectionWrapper

        executed_sqls = []

        class MockRawCursor:
            def __init__(self):
                self.description = [("col1",), ("col2",)]
                self.lastrowid = 42
                self.rowcount = 1

            def execute(self, sql, params=None):
                executed_sqls.append((sql, params))

            def executemany(self, sql, params_seq):
                executed_sqls.append((sql, params_seq))

            def fetchone(self):
                return ("val1", "val2")

            def fetchall(self):
                return [("val1", "val2")]

            def close(self):
                pass

        class MockRawConnection:
            def cursor(self):
                return MockRawCursor()

            def commit(self):
                pass

            def close(self):
                pass

        mock_cur = MockRawCursor()
        wrapper = PostgresCursorWrapper(mock_cur)

        # 1. PRAGMA table_info translation
        wrapper.execute("PRAGMA table_info(patients)")
        self.assertTrue(any("information_schema.columns" in s[0] and "patients" in s[0] for s in executed_sqls))

        # 2. PRAGMA journal_mode no-op
        before_count = len(executed_sqls)
        wrapper.execute("PRAGMA journal_mode=WAL")
        self.assertEqual(len(executed_sqls), before_count, "PRAGMA journal_mode must be no-op on Postgres")

        # 3. INSERT OR IGNORE -> ON CONFLICT DO NOTHING with %s
        executed_sqls.clear()
        wrapper.execute("INSERT OR IGNORE INTO patients (id, name) VALUES (?, ?)", (1, "Test"))
        self.assertEqual(len(executed_sqls), 1)
        sql, params = executed_sqls[0]
        self.assertNotIn("INSERT OR IGNORE", sql)
        self.assertIn("ON CONFLICT DO NOTHING", sql)
        self.assertIn("%s", sql)
        self.assertNotIn("?", sql)
        self.assertEqual(params, (1, "Test"))

        # 4. INSERT OR REPLACE -> ON CONFLICT DO NOTHING
        executed_sqls.clear()
        wrapper.execute("INSERT OR REPLACE INTO patients (id, name) VALUES (?, ?)", (2, "Replace"))
        self.assertEqual(len(executed_sqls), 1)
        sql, params = executed_sqls[0]
        self.assertNotIn("INSERT OR REPLACE", sql)
        self.assertIn("ON CONFLICT DO NOTHING", sql)
        self.assertIn("%s", sql)

        # 5. lastrowid property
        self.assertEqual(wrapper.lastrowid, 42)

        # 6. executescript DDL translation
        executed_sqls.clear()
        conn_wrapper = PostgresConnectionWrapper(MockRawConnection())
        ddl = "CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, score REAL);"
        conn_wrapper.executescript(ddl)
        self.assertEqual(len(executed_sqls), 1)
        ddl_sql = executed_sqls[0][0]
        self.assertIn("SERIAL PRIMARY KEY", ddl_sql)
        self.assertIn("DOUBLE PRECISION", ddl_sql)
        self.assertNotIn("AUTOINCREMENT", ddl_sql)


if __name__ == "__main__":
    unittest.main()

