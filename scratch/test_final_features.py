import unittest
import os
import sys
import json
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app

class TestFinalProjectFeatures(unittest.TestCase):
    def setUp(self):
        self.app = app.app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_database_url_and_postgres_wrapper_classes(self):
        """Verify DATABASE_URL is defined and Postgres wrapper classes exist with expected API."""
        self.assertTrue(hasattr(app, "DATABASE_URL"))
        self.assertTrue(hasattr(app, "PostgresRowWrapper"))
        self.assertTrue(hasattr(app, "PostgresCursorWrapper"))
        self.assertTrue(hasattr(app, "PostgresConnectionWrapper"))

        # Verify PostgresRowWrapper indexing and dictionary compatibility
        row = app.PostgresRowWrapper({"id": 1, "patient_id": "SP_00001"}, ["id", "patient_id"])
        self.assertEqual(row["patient_id"], "SP_00001")
        self.assertEqual(row[1], "SP_00001")
        self.assertEqual(row[0], 1)
        self.assertEqual(row["PATIENT_ID"], "SP_00001")

    def test_owner_password_from_env_only(self):
        """Verify owner account password comes strictly from OWNER_PASSWORD env var."""
        os.environ["OWNER_PASSWORD"] = "FinalTestOwnerPass@2026"
        with self.app.app_context():
            app.seed_or_update_owner(app.get_db())

        res = self.client.post("/api/login", json={
            "patient_id": "SP_OWNER_1",
            "password": "FinalTestOwnerPass@2026"
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["is_owner"])

    def test_rqi_endpoint_patient_vs_owner(self):
        """Verify RQI endpoint returns tier to patient and full component stats to owner."""
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "SP_00001"
            sess["role"] = "patient"
            sess["is_owner"] = False

        res = self.client.get("/api/rqi")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("tier", data)
        self.assertIn("tier_label", data)
        self.assertNotIn("rqi_score", data)  # Hidden from normal patient

        # Now test as Owner
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "SP_OWNER_1"
            sess["role"] = "owner"
            sess["is_owner"] = True

        res_owner = self.client.get("/api/rqi?patient_id=SP_00001")
        self.assertEqual(res_owner.status_code, 200)
        data_owner = res_owner.get_json()
        self.assertIn("rqi_score", data_owner)  # Exposed to owner/controller
        self.assertIn("components", data_owner)

    def test_owner_dossier_in_report_stats(self):
        """Verify report stats includes full intake dossier when requested by controller."""
        with self.client.session_transaction() as sess:
            sess["patient_id"] = "SP_OWNER_1"
            sess["role"] = "owner"
            sess["is_owner"] = True

        res = self.client.get("/api/report/stats?patient_id=SP_00001")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("is_owner"))
        self.assertIn("intake", data)
        self.assertIn("affected_side", data["intake"])

    def test_pour_task_registered(self):
        """Verify Pour the Water task is registered in adl_lab.html and adl_engine.js."""
        with open("templates/adl_lab.html", "r", encoding="utf-8") as f:
            adl_html = f.read()
        self.assertIn("🫗 Pour the Water", adl_html)
        self.assertIn('data-task="pour"', adl_html)

        with open("static/js/adl_engine.js", "r", encoding="utf-8") as f:
            adl_js = f.read()
        self.assertIn("pour:", adl_js)
        self.assertIn("drawPourTask", adl_js)
        self.assertIn("pourGlassLevel", adl_js)

if __name__ == '__main__':
    unittest.main()
