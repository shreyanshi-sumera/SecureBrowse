(() => {
  const backendUrl = "http://127.0.0.1:8000";
  const defaults = {
    protectionEnabled: true,
    adBlockerEnabled: true,
    redirectBlockerEnabled: true,
    bettingBlockerEnabled: true,
    protectionLevel: "medium",
  };

  document.addEventListener("DOMContentLoaded", () => {
    const app = document.getElementById("app");
    if (!app) return;

    app.innerHTML = `
      <div class="header-bar">
        <div class="brand">
          <span class="brand-icon">🛡️</span>
          <span class="brand-title">SecureBrowse</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="chk-popup-protection" aria-label="Enable SecureBrowse protection" disabled>
          <span class="slider"></span>
        </label>
      </div>
      <section class="site-card">
        <div class="section-title">🌐 Current Website</div>
        <div class="site-title" id="lbl-site-title">Loading tab...</div>
        <div class="site-url" id="lbl-site-url">...</div>
      </section>
      <section class="score-card">
        <div class="section-title">🛡️ Safety Rating</div>
        <div class="score-box">
          <div class="gauge-container">
            <svg class="gauge-svg">
              <circle class="gauge-bg" cx="45" cy="45" r="40"></circle>
              <circle class="gauge-value" id="gauge-progress" cx="45" cy="45" r="40"></circle>
            </svg>
            <div class="gauge-text">
              <span class="gauge-score" id="lbl-score">--</span>
              <span class="gauge-label">Score</span>
            </div>
          </div>
          <div class="status-info">
            <div class="status-badge" id="lbl-status">Loading...</div>
            <div class="status-desc" id="lbl-status-desc">Checking protection settings.</div>
          </div>
        </div>
      </section>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Ads Blocked</div>
          <div class="stat-value" id="lbl-ads-blocked">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Redirects Stopped</div>
          <div class="stat-value" id="lbl-redirects-blocked">0</div>
        </div>
      </div>
      <div class="actions-menu">
        <button class="btn btn-primary" id="btn-open-options">⚙️ Control Center & History</button>
        <button class="btn btn-secondary" id="btn-open-dashboard">📊 Web Analytics Dashboard</button>
      </div>
    `;

    const toggle = document.getElementById("chk-popup-protection");
    const status = document.getElementById("lbl-status");
    const description = document.getElementById("lbl-status-desc");
    const score = document.getElementById("lbl-score");
    const gauge = document.getElementById("gauge-progress");
    let settings = { ...defaults };

    function showProtectionState(enabled) {
      toggle.checked = enabled;
      toggle.setAttribute(
        "aria-label",
        enabled ? "Disable SecureBrowse protection" : "Enable SecureBrowse protection",
      );
      if (!enabled) {
        status.className = "status-badge";
        status.textContent = "Protection Off";
        description.textContent =
          "Threat, redirect, and betting protection are paused.";
        score.textContent = "--";
        gauge.style.strokeDashoffset = "251.2";
      }
    }

    function updateStats(stats = {}) {
      document.getElementById("lbl-ads-blocked").textContent = (
        stats.adsBlocked || 0
      ).toLocaleString();
      document.getElementById("lbl-redirects-blocked").textContent = (
        stats.redirectsBlocked || 0
      ).toLocaleString();
    }

    function setRiskResult(result) {
      const risk = Math.max(
        0,
        Math.min(100, Math.round(Number(result.risk_score) || 0)),
      );
      const statusName = String(result.status || "SAFE").toUpperCase();
      score.textContent = String(risk);
      gauge.style.strokeDashoffset = String(251.2 - (251.2 * risk) / 100);
      status.className = "status-badge";

      if (statusName === "DANGEROUS") {
        gauge.style.stroke = "#ef4444";
        status.classList.add("status-dangerous");
        status.textContent = "Dangerous";
      } else if (statusName === "SUSPICIOUS") {
        gauge.style.stroke = "#f59e0b";
        status.classList.add("status-suspicious");
        status.textContent = "Suspicious";
      } else {
        gauge.style.stroke = "#10b981";
        status.classList.add("status-safe");
        status.textContent = "Secured";
      }
      description.textContent =
        result.reasons?.[0] || "No threats detected by the configured scanner.";
    }

    async function scanActiveTab() {
      if (!settings.protectionEnabled) return;
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      const title = document.getElementById("lbl-site-title");
      const host = document.getElementById("lbl-site-url");
      if (!tab?.url) {
        title.textContent = "No active tab";
        host.textContent = "Cannot scan this page.";
        return;
      }

      title.textContent = tab.title || "Web Page";
      let hostname = tab.url;
      try {
        const parsedUrl = new URL(tab.url);
        hostname = parsedUrl.hostname.replace(/^www\./, "");
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          host.textContent = "Browser system page";
          setRiskResult({ risk_score: 0, status: "SAFE" });
          description.textContent =
            "SecureBrowse does not scan internal browser pages.";
          return;
        }
      } catch (error) {
        console.error("Could not parse active tab URL:", error);
      }
      host.textContent = hostname;
      status.textContent = "Scanning...";
      description.textContent = "Checking the current website.";

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6_000);
      try {
        const response = await fetch(`${backendUrl}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: tab.url }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Threat backend returned HTTP ${response.status}.`);
        }
        setRiskResult(await response.json());
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Could not scan the active tab:", error);
        }
        score.textContent = "--";
        gauge.style.strokeDashoffset = "251.2";
        status.className = "status-badge";
        status.textContent = "Scanner offline";
        description.textContent =
          "AI backend unreachable, so this page was not scanned. Start the backend (npm start).";
      } finally {
        clearTimeout(timeout);
      }
    }

    toggle.addEventListener("change", async () => {
      toggle.disabled = true;
      try {
        const stored = await chrome.storage.local.get("settings");
        const nextSettings = {
          ...defaults,
          ...stored.settings,
          protectionEnabled: toggle.checked,
        };
        await chrome.storage.local.set({ settings: nextSettings });
        settings = nextSettings;
        showProtectionState(settings.protectionEnabled);
        if (settings.protectionEnabled) {
          await scanActiveTab();
        }
      } catch (error) {
        console.error("Could not update SecureBrowse protection:", error);
        toggle.checked = !toggle.checked;
        status.textContent = "Setting not saved";
        description.textContent =
          "Protection state could not be changed. Try again.";
      } finally {
        toggle.disabled = false;
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes.settings) {
        settings = { ...defaults, ...changes.settings.newValue };
        showProtectionState(settings.protectionEnabled);
        if (settings.protectionEnabled) void scanActiveTab();
      }
      if (changes.stats) updateStats(changes.stats.newValue);
    });

    document
      .getElementById("btn-open-options")
      .addEventListener("click", () => chrome.runtime.openOptionsPage());
    document
      .getElementById("btn-open-dashboard")
      .addEventListener("click", () =>
        chrome.tabs.create({ url: "http://127.0.0.1:8000/" }),
      );

    void (async () => {
      try {
        const { settings: savedSettings, stats } =
          await chrome.storage.local.get(["settings", "stats"]);
        settings = { ...defaults, ...savedSettings };
        toggle.disabled = false;
        showProtectionState(settings.protectionEnabled);
        updateStats(stats);
        if (settings.protectionEnabled) await scanActiveTab();
      } catch (error) {
        console.error("Could not load SecureBrowse settings:", error);
        status.textContent = "Settings unavailable";
        description.textContent =
          "Extension settings could not be loaded. Protection state is unknown.";
      }
    })();
  });
})();
