/**
 * RehabOpt AR — Gemini-Style AI Assistant Widget
 * Zero-leak: API key never reaches client. All calls go to /api/ai-chat.
 */
class RehabAIAssistant {
  constructor() {
    this.selectedModel = "gemini-2.5-flash";
    this.attachments = [];
    this.recognition = null;
    this.isRecording = false;
    this.drawerOpen = false;
    this.chatHistory = [];
    this.initSpeechRecognition();
    this.bindEvents();
    // Load quota on page load
    setTimeout(() => this.updateQuotaDisplay(), 500);
  }

  // === Speech Recognition ===
  initSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = "en-US";
      this.recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        const input = document.getElementById("ai-chat-input");
        input.value = input.value ? `${input.value} ${transcript}` : transcript;
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
        this.stopVoice();
      };
      this.recognition.onerror = () => this.stopVoice();
      this.recognition.onend = () => this.stopVoice();
    }
  }

  // === Event Bindings ===
  bindEvents() {
    // Launcher button
    document.getElementById("ai-launcher-btn").addEventListener("click", () => {
      this.toggleDrawer();
    });

    // Close button
    document.getElementById("ai-close-btn").addEventListener("click", () => {
      this.toggleDrawer();
    });

    // Send on Enter
    document.getElementById("ai-chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    document.getElementById("ai-chat-input").addEventListener("input", (e) => {
      e.target.style.height = "auto";
      e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px";
    });

    // Send button
    document.getElementById("ai-send-btn").addEventListener("click", () => {
      this.sendMessage();
    });

    // Voice button
    document.getElementById("btn-voice").addEventListener("click", () => {
      this.toggleVoice();
    });

    // Model selector pill
    document.getElementById("ai-model-pill").addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("ai-model-dropdown").classList.toggle("open");
      document.getElementById("ai-plus-menu").classList.remove("open");
    });

    // Model options
    document.querySelectorAll(".ai-model-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.setModel(btn.dataset.model, btn.dataset.label);
      });
    });

    // Plus button
    document.getElementById("ai-plus-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("ai-plus-menu").classList.toggle("open");
      document.getElementById("ai-model-dropdown").classList.remove("open");
    });

    // Plus menu options
    document.getElementById("opt-upload").addEventListener("click", () => {
      document.getElementById("ai-file-input").click();
      document.getElementById("ai-plus-menu").classList.remove("open");
    });

    document.getElementById("opt-telemetry").addEventListener("click", () => {
      this.attachTelemetry();
      document.getElementById("ai-plus-menu").classList.remove("open");
    });

    document.getElementById("opt-clear").addEventListener("click", () => {
      this.clearChat();
      document.getElementById("ai-plus-menu").classList.remove("open");
    });

    // File input change
    document.getElementById("ai-file-input").addEventListener("change", (e) => {
      this.handleFileUpload(e);
    });

    // Close dropdowns on outside click
    document.addEventListener("click", () => {
      document.getElementById("ai-model-dropdown").classList.remove("open");
      document.getElementById("ai-plus-menu").classList.remove("open");
    });
  }

  // === Drawer Toggle ===
  toggleDrawer() {
    this.drawerOpen = !this.drawerOpen;
    const drawer = document.getElementById("ai-drawer");
    const btn = document.getElementById("ai-launcher-btn");

    if (this.drawerOpen) {
      drawer.classList.add("open");
      btn.classList.add("open");
      btn.innerHTML = "✕";
      this.updateQuotaDisplay();
      setTimeout(() => {
        document.getElementById("ai-chat-input").focus();
      }, 300);
    } else {
      drawer.classList.remove("open");
      btn.classList.remove("open");
      btn.innerHTML = "💬";
    }
  }

  // === Voice Toggle ===
  toggleVoice() {
    if (!this.recognition) {
      alert("Voice recognition is not supported in this browser. Try Chrome.");
      return;
    }
    if (this.isRecording) {
      this.recognition.stop();
      this.stopVoice();
    } else {
      this.recognition.start();
      this.isRecording = true;
      document.getElementById("btn-voice").classList.add("recording-pulse");
    }
  }

  stopVoice() {
    this.isRecording = false;
    const btn = document.getElementById("btn-voice");
    if (btn) btn.classList.remove("recording-pulse");
  }

  // === Model Switching ===
  setModel(modelId, label) {
    this.selectedModel = modelId;
    document.getElementById("active-model-label").innerText = label;
    document.getElementById("ai-model-dropdown").classList.remove("open");
  }

  // === File Upload ===
  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result.split(",")[1];
      this.attachments.push({
        name: file.name,
        mime_type: file.type,
        data_base64: base64Data,
      });
      this.renderAttachmentBadges();
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  renderAttachmentBadges() {
    const container = document.getElementById("ai-attachments-preview");
    container.innerHTML = this.attachments
      .map(
        (att, idx) =>
          `<span class="att-badge">📎 ${att.name} <button onclick="assistant.removeAttachment(${idx})">×</button></span>`
      )
      .join("");
  }

  removeAttachment(index) {
    this.attachments.splice(index, 1);
    this.renderAttachmentBadges();
  }

  // === Attach Current Telemetry ===
  async attachTelemetry() {
    try {
      const res = await fetch("/api/report/stats");
      const data = await res.json();
      if (data.status === "success") {
        const s = data.stats;
        const telemetryText = `[Current Session Telemetry]\nCondition: ${s.condition}\nStreak: ${s.streak} days\nSessions: ${s.total_sessions}\nPeak ROM: ${s.peak_rom}°\nSmoothness: ${s.avg_smoothness}/100\nCheats Blocked: ${s.total_cheats}`;
        const input = document.getElementById("ai-chat-input");
        input.value = input.value
          ? `${input.value}\n\n${telemetryText}`
          : telemetryText;
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
      }
    } catch (err) {
      console.error("Telemetry attach error:", err);
    }
  }

  // === Quota Tracking ===
  async updateQuotaDisplay() {
    try {
      const res = await fetch("/api/chat-usage");
      const data = await res.json();
      if (data.status === "success") {
        const quotaEl = document.getElementById("ai-quota-bar");
        const quotaText = document.getElementById("ai-quota-text");
        if (quotaEl && quotaText) {
          const used = data.used;
          const limit = data.limit;
          const remaining = data.remaining;
          const pct = (used / limit) * 100;
          quotaText.textContent = `${remaining} of ${limit} messages left today`;
          quotaEl.style.width = `${pct}%`;
          // Color changes based on usage
          if (remaining === 0) {
            quotaEl.style.background = "#ff4444";
            quotaText.style.color = "#ff6b6b";
          } else if (remaining <= 5) {
            quotaEl.style.background = "#ff9a3c";
            quotaText.style.color = "#ff9a3c";
          } else {
            quotaEl.style.background = "#00ff88";
            quotaText.style.color = "#6edba0";
          }
        }
      }
    } catch (err) {
      // silent
    }
  }

  // === Send Message ===
  async sendMessage() {
    const input = document.getElementById("ai-chat-input");
    const message = input.value.trim();
    if (!message && this.attachments.length === 0) return;

    // Show user message
    this.appendMessage("user", message, this.attachments);
    input.value = "";
    input.style.height = "auto";
    const sentAttachments = [...this.attachments];
    this.attachments = [];
    this.renderAttachmentBadges();

    // Show loading
    const loaderId = this.appendLoadingIndicator();

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          model: this.selectedModel,
          attachments: sentAttachments,
        }),
      });

      const data = await res.json();
      this.removeLoadingIndicator(loaderId);

      if (data.status === "success") {
        this.appendMessage("ai", data.reply, [], data.model_used);
        // Update remaining count in success response
        if (data.remaining !== undefined) {
          const quotaText = document.getElementById("ai-quota-text");
          if (quotaText) {
            quotaText.textContent = `${data.remaining} of 20 messages left today`;
          }
        }
      } else if (data.status === "quota_exceeded") {
        // Show fallback response with special styling
        this.appendMessage("ai", data.reply, [], "quota-exceeded");
        // Show quota banner
        this.showQuotaExceededBanner(data.used, data.limit);
      } else {
        this.appendMessage(
          "error",
          data.error || "Unable to retrieve response."
        );
      }

      // Always update quota bar
      await this.updateQuotaDisplay();
    } catch (err) {
      this.removeLoadingIndicator(loaderId);
      this.appendMessage("error", "Network connection failed. Please try again.");
    }
  }

  showQuotaExceededBanner(used, limit) {
    const banner = document.getElementById("ai-quota-banner");
    if (banner) {
      banner.classList.add("visible");
    }
  }

  // === Chat UI Helpers ===
  appendMessage(sender, text, attachments = [], modelUsed = "") {
    const box = document.getElementById("ai-chat-messages");

    // Remove welcome message if present
    const welcome = box.querySelector(".ai-welcome");
    if (welcome) welcome.remove();

    const el = document.createElement("div");
    el.className = `chat-bubble chat-${sender}`;
    let html = "";

    if (attachments && attachments.length > 0) {
      html += `<div class="bubble-files">${attachments.map((a) => `<span>📎 ${a.name}</span>`).join(" ")}</div>`;
    }
    if (text) {
      // Simple markdown-like formatting
      const formatted = text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
      html += `<div class="bubble-text">${formatted}</div>`;
    }
    if (modelUsed) {
      if (modelUsed === "quota-exceeded") {
        html += `<span class="bubble-model-tag" style="color:#ff9a3c;">⏳ Daily limit reached — fallback tips</span>`;
        el.setAttribute("data-model", "quota-exceeded");
      } else {
        html += `<span class="bubble-model-tag">⚡ ${modelUsed}</span>`;
      }
    }

    el.innerHTML = html;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;

    this.chatHistory.push({ sender, text, modelUsed });
  }

  appendLoadingIndicator() {
    const box = document.getElementById("ai-chat-messages");
    const id = "loader-" + Date.now();
    const el = document.createElement("div");
    el.id = id;
    el.className = "chat-bubble chat-ai chat-loading";
    el.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return id;
  }

  removeLoadingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // === Clear Chat ===
  clearChat() {
    const box = document.getElementById("ai-chat-messages");
    box.innerHTML = `
      <div class="ai-welcome">
        <div class="ai-welcome-icon">🤖</div>
        <strong style="color:#ff9a3c;">RehabOpt AI</strong><br>
        Ask about exercises, pain, recovery progress, or upload a medical file.<br>
        <span style="color:#444;">Powered by Gemini • Zero-leak security</span>
      </div>
    `;
    this.chatHistory = [];
  }
}

// Initialize on every page
let assistant;
document.addEventListener("DOMContentLoaded", () => {
  assistant = new RehabAIAssistant();
});
