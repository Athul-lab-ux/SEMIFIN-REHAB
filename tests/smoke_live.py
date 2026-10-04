"""
tests/smoke_live.py — Live Deployment & Smoke Test Verification Script
======================================================================
Usage:
    python tests/smoke_live.py <BASE_URL> <OWNER_PASSWORD>

Example:
    python tests/smoke_live.py https://my-rehabopt-ar.onrender.com MyStrongOwnerPassword123!
    python tests/smoke_live.py http://127.0.0.1:5000 MyLocalOwnerPassword123!

Checks executed:
    a) GET /healthz returns status OK and prints active database engine
    b) Registers a unique test patient, logs in, and fetches the dashboard
    c) Logs in as SP_OWNER_1 and confirms new test patient appears in owner patient list
    d) Confirms patient session receives HTTP 403 on /api/admin/patients
    e) Prints [PASS] or [FAIL] for each step
"""
import sys
import uuid
import requests


def run_smoke_test(base_url, owner_password):
    base_url = base_url.rstrip("/")
    print("=" * 65)
    print(f"  REHABOPT AR — LIVE SMOKE TEST")
    print(f"  Target URL: {base_url}")
    print("=" * 65)

    all_passed = True
    test_run_id = uuid.uuid4().hex[:8]

    # -------------------------------------------------------------------------
    # Check A: Healthcheck & Database engine
    # -------------------------------------------------------------------------
    print("\n[1/4] Checking /healthz endpoint...")
    try:
        r_health = requests.get(f"{base_url}/healthz", timeout=15)
        if r_health.status_code == 200:
            data = r_health.json()
            db_engine = data.get("database", "unknown")
            if data.get("status") == "OK":
                print(f"  --> [PASS] /healthz returned 200 OK (Database engine: {db_engine})")
                if db_engine == "postgres":
                    print("             * Verified: PostgreSQL is ACTIVE in production.")
                else:
                    print("             * Note: Running on SQLite dialect (standard for local development).")
            else:
                print(f"  --> [FAIL] /healthz status was not OK: {data}")
                all_passed = False
        else:
            print(f"  --> [FAIL] /healthz returned HTTP {r_health.status_code}")
            all_passed = False
    except Exception as e:
        print(f"  --> [FAIL] Could not connect to /healthz: {e}")
        return False

    # -------------------------------------------------------------------------
    # Check B: Register unique patient, log in, and fetch dashboard
    # -------------------------------------------------------------------------
    print("\n[2/4] Registering test patient and verifying dashboard access...")
    patient_session = requests.Session()
    test_email = f"smoke_{test_run_id}@rehabopt-test.org"
    test_name = f"Smoke Patient {test_run_id}"
    test_password = f"SmokePass@{test_run_id}!"
    patient_id = None

    try:
        reg_payload = {
            "patient_name": test_name,
            "email": test_email,
            "password": test_password,
        }
        r_reg = patient_session.post(f"{base_url}/api/register", json=reg_payload, timeout=15)
        if r_reg.status_code == 200:
            reg_data = r_reg.json()
            patient_id = reg_data.get("patient_id")
            print(f"  --> [PASS] Patient registered successfully: ID={patient_id}, Email={test_email}")
        else:
            print(f"  --> [FAIL] Patient registration failed (HTTP {r_reg.status_code}): {r_reg.text}")
            all_passed = False

        if patient_id:
            # Login via credentials
            login_payload = {
                "identifier": test_email,
                "password": test_password,
            }
            r_login = patient_session.post(f"{base_url}/api/login", json=login_payload, timeout=15)
            if r_login.status_code == 200:
                print(f"  --> [PASS] Patient login succeeded via /api/login")
            else:
                print(f"  --> [FAIL] Patient login failed (HTTP {r_login.status_code}): {r_login.text}")
                all_passed = False

            # Verify Dashboard access
            r_dash = patient_session.get(f"{base_url}/dashboard", timeout=15)
            if r_dash.status_code == 200 and ("dashboard" in r_dash.text.lower() or "practice" in r_dash.text.lower() or "welcome" in r_dash.text.lower()):
                print(f"  --> [PASS] Dashboard loaded successfully (HTTP 200)")
            else:
                print(f"  --> [FAIL] Dashboard failed to load (HTTP {r_dash.status_code})")
                all_passed = False

    except Exception as e:
        print(f"  --> [FAIL] Patient workflow encountered exception: {e}")
        all_passed = False

    # -------------------------------------------------------------------------
    # Check C: Owner login and patient directory verification
    # -------------------------------------------------------------------------
    print("\n[3/4] Logging in as SP_OWNER_1 and checking patient directory...")
    owner_session = requests.Session()
    try:
        owner_login_payload = {
            "identifier": "SP_OWNER_1",
            "password": owner_password,
        }
        r_owner = owner_session.post(f"{base_url}/api/login", json=owner_login_payload, timeout=15)
        if r_owner.status_code == 200:
            owner_data = r_owner.json()
            if owner_data.get("role") == "owner":
                print(f"  --> [PASS] Controller SP_OWNER_1 logged in successfully (role: owner)")
            else:
                print(f"  --> [FAIL] Logged in but role is not owner: {owner_data}")
                all_passed = False
        else:
            print(f"  --> [FAIL] Controller login failed (HTTP {r_owner.status_code}): {r_owner.text}")
            print("             * Hint: Verify that OWNER_PASSWORD matches Render environment variable.")
            all_passed = False

        # Query owner patient list
        r_patients = owner_session.get(f"{base_url}/api/admin/patients", timeout=15)
        if r_patients.status_code == 200:
            p_data = r_patients.json()
            patients_list = p_data.get("patients", [])
            found = any(p.get("patient_id") == patient_id for p in patients_list) if patient_id else False
            if found:
                print(f"  --> [PASS] Newly registered patient {patient_id} confirmed in owner table!")
            else:
                print(f"  --> [FAIL] Patient {patient_id} not found in owner directory.")
                all_passed = False
        else:
            print(f"  --> [FAIL] Failed to fetch /api/admin/patients (HTTP {r_patients.status_code})")
            all_passed = False

    except Exception as e:
        print(f"  --> [FAIL] Owner workflow encountered exception: {e}")
        all_passed = False

    # -------------------------------------------------------------------------
    # Check D: Regular patient gets 403 on /api/admin/patients
    # -------------------------------------------------------------------------
    print("\n[4/4] Verifying patient isolation: GET /api/admin/patients must be 403...")
    try:
        r_forbidden = patient_session.get(f"{base_url}/api/admin/patients", timeout=15)
        if r_forbidden.status_code == 403:
            print(f"  --> [PASS] Patient session correctly received HTTP 403 Forbidden")
        else:
            print(f"  --> [FAIL] Expected HTTP 403, got HTTP {r_forbidden.status_code}")
            all_passed = False
    except Exception as e:
        print(f"  --> [FAIL] Security check encountered exception: {e}")
        all_passed = False

    # -------------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------------
    print("\n" + "=" * 65)
    if all_passed:
        print("  [SUCCESS] ALL SMOKE TESTS PASSED CLEANLY (100% OK)!")
        print("=" * 65)
        return True
    else:
        print("  [FAILURE] ONE OR MORE SMOKE CHECKS FAILED.")
        print("=" * 65)
        return False


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage:")
        print("    python tests/smoke_live.py <BASE_URL> <OWNER_PASSWORD>")
        print("\nExample:")
        print("    python tests/smoke_live.py https://my-rehabopt-ar.onrender.com MyStrongOwnerPass@123")
        sys.exit(1)

    url = sys.argv[1]
    pwd = sys.argv[2]
    success = run_smoke_test(url, pwd)
    sys.exit(0 if success else 1)
