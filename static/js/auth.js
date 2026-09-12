/**
 * Auth Portal — Clinical Login & Permanent Patient Registration
 * Handles flexible identifiers (Patient ID, Email, Username, or Numeric ID)
 * and seamless routing for returning patients.
 */
document.addEventListener("DOMContentLoaded", () => {
  const signInTab = document.getElementById("sign-in-tab");
  const registerTab = document.getElementById("register-tab");
  const signInPanel = document.getElementById("sign-in-panel");
  const registerPanel = document.getElementById("register-panel");
  const toast = document.getElementById("toast");
  const siInput = document.getElementById("si-patient-id");

  // Pre-fill previous identifier if remembered on this device
  const savedIdent = localStorage.getItem("last_identifier") || localStorage.getItem("last_patient_id");
  if (savedIdent && siInput) {
    siInput.value = savedIdent;
  }

  // --- Tab Switching ---
  signInTab.addEventListener("click", () => {
    signInTab.classList.add("active");
    registerTab.classList.remove("active");
    signInPanel.classList.add("visible");
    registerPanel.classList.remove("visible");
  });

  registerTab.addEventListener("click", () => {
    registerTab.classList.add("active");
    signInTab.classList.remove("active");
    registerPanel.classList.add("visible");
    signInPanel.classList.remove("visible");
  });

  // --- Toast ---
  function showToast(message, type = "info") {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
      toast.className = "toast";
    }, 3500);
  }

  // --- Password Visibility Toggles ---
  document.querySelectorAll(".toggle-pw").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈";
      } else {
        input.type = "password";
        btn.textContent = "👁️";
      }
    });
  });

  // --- Sign In ---
  const signInForm = document.getElementById("sign-in-form");
  signInForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ident = document.getElementById("si-patient-id").value.trim();
    const pw = document.getElementById("si-password").value;
    const btn = signInForm.querySelector('button[type="submit"]');

    if (!ident || !pw) {
      showToast("⚠️ Please enter your Patient ID/Email and password", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "⏳ Signing in...";

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: ident, password: pw }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        const msg = (data && data.message) ? data.message : `Authentication error (${res.status}). Please verify your credentials.`;
        showToast(`❌ ${msg}`, "error");
        return;
      }

      if (data.status === "success") {
        showToast("✅ Welcome back! Loading your clinical workspace…", "success");
        localStorage.setItem("last_identifier", ident);
        localStorage.setItem("last_patient_id", data.patient_id);
        if (data.patient_name) localStorage.setItem("patient_name", data.patient_name);
        if (data.condition) localStorage.setItem("selectedCondition", data.condition);

        // If patient already completed onboarding, go straight to Dashboard; never ask steps again
        setTimeout(() => {
          window.location.href = data.onboarding_done ? "/dashboard" : "/onboarding";
        }, 500);
      } else {
        showToast(`❌ ${data.message || "Invalid credentials"}`, "error");
      }
    } catch (err) {
      console.error("Sign-in network error:", err);
      showToast("❌ Network error. Please check your connection and try again.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🔓 Sign In";
    }
  });

  // --- Register ---
  const registerForm = document.getElementById("register-form");
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const pw = document.getElementById("reg-password").value;
    const pw2 = document.getElementById("reg-password2").value;
    const btn = registerForm.querySelector('button[type="submit"]');

    if (!email || !pw) {
      showToast("⚠️ Email/Username and password are required", "error");
      return;
    }

    if (pw !== pw2) {
      showToast("❌ Passwords do not match", "error");
      return;
    }

    if (pw.length < 6) {
      showToast("❌ Password must be at least 6 characters", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "⏳ Creating permanent account...";

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_name: name, email, password: pw }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        const msg = (data && data.message) ? data.message : `Registration error (${res.status}). Please try again.`;
        showToast(`❌ ${msg}`, "error");
        return;
      }

      if (data.status === "success") {
        showToast(`🎉 Account Created! Your Patient ID is ${data.patient_id}`, "success");
        localStorage.setItem("last_identifier", data.patient_id);
        localStorage.setItem("last_patient_id", data.patient_id);
        if (data.patient_name) localStorage.setItem("patient_name", data.patient_name);

        // Pre-fill Sign-In field and switch tab smoothly
        document.getElementById("si-patient-id").value = data.patient_id;
        document.getElementById("si-password").value = pw;
        setTimeout(() => {
          signInTab.click();
          showToast(`ℹ️ You can now sign in using '${data.patient_id}' or '${email}'`, "info");
        }, 1200);
      } else {
        showToast(`❌ ${data.message || "Registration failed"}`, "error");
      }
    } catch (err) {
      console.error("Registration network error:", err);
      showToast("❌ Network connection failed. Please check your connection and try again.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "📋 Register Patient Profile";
    }
  });

  // --- Quick Demo Account ---
  const demoBtn = document.getElementById("demo-btn");
  if (demoBtn) {
    demoBtn.addEventListener("click", () => {
      document.getElementById("si-patient-id").value = "SP-000000001";
      document.getElementById("si-password").value = "PatientDemo@123";
      showToast("⚡ Demo credentials filled (SP-000000001)", "info");
    });
  }

  // --- Navigation Links ---
  const goRegister = document.getElementById("go-register");
  if (goRegister) {
    goRegister.addEventListener("click", (e) => {
      e.preventDefault();
      registerTab.click();
    });
  }

  const goSignin = document.getElementById("go-signin");
  if (goSignin) {
    goSignin.addEventListener("click", (e) => {
      e.preventDefault();
      signInTab.click();
    });
  }
});
