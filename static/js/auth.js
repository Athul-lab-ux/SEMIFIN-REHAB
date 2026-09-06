/**
 * Auth Portal — Login/Register Logic
 */
document.addEventListener("DOMContentLoaded", () => {
  const signInTab = document.getElementById("sign-in-tab");
  const registerTab = document.getElementById("register-tab");
  const signInPanel = document.getElementById("sign-in-panel");
  const registerPanel = document.getElementById("register-panel");
  const toast = document.getElementById("toast");

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
    const pid = document.getElementById("si-patient-id").value.trim();
    const pw = document.getElementById("si-password").value;
    const btn = signInForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "⏳ Signing in...";

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: pid, password: pw }),
      });
      const data = await res.json();
      if (data.status === "success") {
        showToast("✅ Login successful! Redirecting...", "success");
        // First-time patients must complete onboarding before the dashboard
        setTimeout(async () => {
          try {
            const sres = await fetch("/api/onboarding/status");
            const sdata = await sres.json();
            window.location.href = sdata.onboarding_done ? "/dashboard" : "/onboarding";
          } catch (e) {
            window.location.href = "/dashboard";
          }
        }, 800);
      } else {
        showToast(`❌ ${data.message}`, "error");
      }
    } catch (err) {
      showToast("❌ Network error. Please try again.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "🔓 Sign In";
    }
  });

  // --- Register ---
  const registerForm = document.getElementById("register-form");
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("reg-email").value.trim();
    const pw = document.getElementById("reg-password").value;
    const pw2 = document.getElementById("reg-password2").value;
    const btn = registerForm.querySelector('button[type="submit"]');

    if (pw !== pw2) {
      showToast("❌ Passwords do not match", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "⏳ Creating account...";

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });
      const data = await res.json();
      if (data.status === "success") {
        showToast(
          `🎉 Patient ID Assigned: ${data.patient_id}`,
          "success"
        );
        // Copy to clipboard and switch to sign-in
        navigator.clipboard.writeText(data.patient_id).catch(() => {});
        document.getElementById("si-patient-id").value = data.patient_id;
        document.getElementById("si-password").value = "";
        setTimeout(() => signInTab.click(), 1500);
      } else {
        showToast(`❌ ${data.message}`, "error");
      }
    } catch (err) {
      showToast("❌ Network error. Please try again.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "📋 Register New Patient";
    }
  });

  // --- Demo Account ---
  document.getElementById("demo-btn").addEventListener("click", () => {
    document.getElementById("si-patient-id").value = "SP-000000001";
    document.getElementById("si-password").value = "PatientDemo@123";
    showToast("⚡ Demo credentials filled!", "info");
  });

  // --- Navigation Links ---
  document.getElementById("go-register").addEventListener("click", (e) => {
    e.preventDefault();
    registerTab.click();
  });
  document.getElementById("go-signin").addEventListener("click", (e) => {
    e.preventDefault();
    signInTab.click();
  });
});
