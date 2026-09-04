/**
 * RehabOpt AR — Habit Consolidation Engine
 * Automated Daily Recovery Streak Counter
 */
const StreakManager = {
  getStreak() {
    return parseInt(localStorage.getItem("currentStreak") || "1", 10);
  },

  getLastSessionDate() {
    return localStorage.getItem("lastSessionDate") || null;
  },

  updateStreak() {
    const today = new Date().toISOString().split("T")[0];
    const lastDate = this.getLastSessionDate();

    let streak = this.getStreak();

    if (lastDate) {
      const last = new Date(lastDate);
      const now = new Date(today);
      const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        streak += 1;
      } else if (diffDays > 1) {
        streak = 1;
      }
      // diffDays === 0 → same day, no change
    } else {
      streak = 1;
    }

    localStorage.setItem("currentStreak", streak);
    localStorage.setItem("lastSessionDate", today);
    return streak;
  },

  renderBadge(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      const streak = this.getStreak();
      el.textContent = `🔥 ${streak} Days`;
    }
  },
};

Object.freeze(StreakManager);
