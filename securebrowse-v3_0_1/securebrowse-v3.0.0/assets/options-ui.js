const backendUrl = "http://127.0.0.1:8000";

document.addEventListener("DOMContentLoaded", () => {
  const get = (key) => chrome.storage.local.get(key);
  const set = (values) => chrome.storage.local.set(values);
  const element = (id) => document.getElementById(id);
  const settingsInputs = {
    protectionEnabled: element("chk-global-protection"),
    adBlockerEnabled: element("chk-ad-blocker"),
    redirectBlockerEnabled: element("chk-redirect-blocker"),
    bettingBlockerEnabled: element("chk-betting-blocker"),
    protectionLevel: element("sel-protection-level"),
  };
  const settingsDefaults = {
    protectionEnabled: true,
    adBlockerEnabled: true,
    redirectBlockerEnabled: true,
    bettingBlockerEnabled: true,
    protectionLevel: "medium",
  };

  async function loadSettings() {
    const { settings, backendApiKey = "" } = await get([
      "settings",
      "backendApiKey",
    ]);
    const currentSettings = { ...settingsDefaults, ...settings };
    for (const [key, input] of Object.entries(settingsInputs)) {
      if (input.type === "checkbox") {
        input.checked = currentSettings[key] !== false;
      } else {
        input.value = currentSettings[key];
      }
    }
    element("txt-backend-api-key").value = backendApiKey;
  }

  async function saveSettings() {
    const settings = {};
    for (const [key, input] of Object.entries(settingsInputs)) {
      settings[key] =
        input.type === "checkbox" ? input.checked : input.value;
    }
    await set({ settings });
  }

  function normalizeDomain(value) {
    let hostname;
    try {
      const input = value.trim();
      hostname = new URL(
        input.includes("://") ? input : `https://${input}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, "")
        .replace(/\.$/, "");
    } catch {
      hostname = "";
    }

    if (
      !hostname ||
      hostname.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(
        hostname,
      )
    ) {
      throw new Error("Enter a valid domain name.");
    }
    return hostname;
  }

  function showEmpty(container, message) {
    const item = document.createElement("div");
    item.textContent = message;
    item.style.cssText =
      "padding:15px; color:var(--text-sub); text-align:center;";
    container.replaceChildren(item);
  }

  function showEmptyHistory(message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = message;
    cell.style.cssText =
      "text-align:center; color:var(--text-sub); padding:30px;";
    row.append(cell);
    element("history-rows").replaceChildren(row);
  }

  async function loadDomainList(key, containerId) {
    const container = element(containerId);
    const values = (await get(key))[key] || [];
    if (values.length === 0) {
      showEmpty(container, "No domains added.");
      return;
    }

    const rows = values.map((domain) => {
      const row = document.createElement("div");
      row.className = "rule-item";
      const name = document.createElement("span");
      name.className = "rule-domain";
      name.textContent = domain;
      const remove = document.createElement("button");
      remove.className = "rule-delete";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        try {
          const current = (await get(key))[key] || [];
          await set({ [key]: current.filter((item) => item !== domain) });
          await loadDomainList(key, containerId);
        } catch (error) {
          console.error(`Failed to remove ${key} entry:`, error);
          alert("The domain could not be removed. Check the extension console.");
        }
      });
      row.append(name, remove);
      return row;
    });
    container.replaceChildren(...rows);
  }

  async function addDomain(input, key, containerId) {
    let domain;
    try {
      domain = normalizeDomain(input.value);
    } catch (error) {
      alert(error.message);
      return;
    }

    try {
      const current = (await get(key))[key] || [];
      if (!current.includes(domain)) {
        await set({ [key]: [...current, domain] });
        fetch(`${backendUrl}/${key}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        }).catch((error) =>
          console.error(`Failed to sync ${key} entry with backend:`, error),
        );
      }
      input.value = "";
      await loadDomainList(key, containerId);
    } catch (error) {
      console.error(`Failed to save ${key} entry:`, error);
      alert("The domain could not be saved. Check the extension console.");
    }
  }

  async function loadBlockedDomains() {
    const rows = element("blocked-domains-rows");
    const { blockedDomainMeta = {} } = await get("blockedDomainMeta");
    const entries = Object.entries(blockedDomainMeta).sort(
      ([, first], [, second]) => second.blockedAt - first.blockedAt,
    );
    if (entries.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "No domains currently blocked.";
      cell.style.cssText =
        "text-align:center; color:var(--text-sub); padding:30px;";
      row.append(cell);
      rows.replaceChildren(row);
      return;
    }

    const renderedRows = entries.map(([domain, metadata]) => {
      const row = document.createElement("tr");
      const sourceLabels = {
        "url-scan": "URL Scan",
        "redirect-loop": "Redirect Loop Detector",
        "manual-blacklist": "Manual Blacklist",
      };
      const values = [
        domain,
        sourceLabels[metadata.source] || metadata.source || "Unknown",
        new Date(metadata.blockedAt).toLocaleString(),
        new Date(metadata.blockedAt + 7 * 24 * 60 * 60 * 1000)
          .toLocaleDateString(),
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }

      const actionCell = document.createElement("td");
      const unblock = document.createElement("button");
      unblock.className = "btn btn-primary";
      unblock.type = "button";
      unblock.textContent = "Trust & Unblock";
      unblock.style.cssText = "padding:6px 10px; font-size:12px;";
      unblock.addEventListener("click", async () => {
        try {
          const { whitelist = [] } = await get("whitelist");
          if (!whitelist.includes(domain)) {
            await set({ whitelist: [...whitelist, domain] });
          }
          await loadDomainList("whitelist", "whitelist-items");
        } catch (error) {
          console.error("Failed to trust and unblock domain:", error);
          alert("The domain could not be unblocked. Check the extension console.");
        }
      });
      actionCell.append(unblock);
      row.append(actionCell);
      return row;
    });
    rows.replaceChildren(...renderedRows);
  }

  async function loadDiagnostics() {
    const container = element("diagnostics-rows");
    const { diagnosticsLog = [] } = await get("diagnosticsLog");
    if (diagnosticsLog.length === 0) {
      container.textContent = "No diagnostics logged.";
      return;
    }

    const rows = diagnosticsLog
      .slice()
      .reverse()
      .map((entry) => {
        const row = document.createElement("div");
        row.style.cssText =
          "padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);";
        row.textContent = `[${new Date(entry.at).toLocaleTimeString()}] ${entry.msg}`;
        return row;
      });
    container.replaceChildren(...rows);
  }

  async function loadHistory() {
    const rows = element("history-rows");
    try {
      const response = await fetch(`${backendUrl}/history?limit=50`);
      if (!response.ok) {
        throw new Error(`Backend returned HTTP ${response.status}`);
      }
      const history = await response.json();
      if (!Array.isArray(history) || history.length === 0) {
        showEmptyHistory("No recent threat scans.");
        return;
      }

      const renderedRows = history.map((entry) => {
        const row = document.createElement("tr");
        const urlCell = document.createElement("td");
        const link = document.createElement("a");
        link.textContent = String(entry.url || "");
        link.style.cssText = "color:var(--text-main); text-decoration:none;";
        try {
          const url = new URL(entry.url);
          if (url.protocol === "http:" || url.protocol === "https:") {
            link.href = url.href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
          }
        } catch {
          link.removeAttribute("href");
        }
        urlCell.append(link);
        row.append(urlCell);

        const status = String(entry.status || "");
        const statusCell = document.createElement("td");
        const badge = document.createElement("span");
        badge.className =
          "badge " +
          ({
            SAFE: "badge-safe",
            SUSPICIOUS: "badge-suspicious",
            DANGEROUS: "badge-dangerous",
          }[status] || "");
        badge.textContent = status;
        statusCell.append(badge);
        const values = [
          `${entry.risk_score ?? ""}/100`,
          statusCell,
          String(entry.action || ""),
          new Date(entry.created_at).toLocaleString(),
        ];
        for (const value of values) {
          const cell = document.createElement("td");
          if (value instanceof Node) {
            cell.append(value);
          } else {
            cell.textContent = value;
          }
          row.append(cell);
        }
        return row;
      });
      rows.replaceChildren(...renderedRows);
    } catch (error) {
      console.error("Failed to load scan history:", error);
      showEmptyHistory("Unable to connect to the threat database backend.");
    }
  }

  async function refresh() {
    try {
      await Promise.all([
        loadSettings(),
        loadDomainList("whitelist", "whitelist-items"),
        loadDomainList("blacklist", "blacklist-items"),
        loadBlockedDomains(),
        loadDiagnostics(),
        loadHistory(),
      ]);
    } catch (error) {
      console.error("Failed to refresh the SecureBrowse dashboard:", error);
      alert("Some dashboard data could not be loaded. Check the extension console.");
    }
  }

  for (const input of Object.values(settingsInputs)) {
    input.addEventListener("change", () => {
      void saveSettings().catch((error) => {
        console.error("Failed to save extension settings:", error);
        alert("Settings could not be saved. Check the extension console.");
      });
    });
  }
  element("txt-backend-api-key").addEventListener("change", (event) => {
    void set({ backendApiKey: event.target.value.trim() }).catch((error) => {
      console.error("Failed to save the backend API key:", error);
      alert("The API key could not be saved. Check the extension console.");
    });
  });
  element("btn-add-whitelist").addEventListener("click", () =>
    void addDomain(
      element("txt-whitelist-domain"),
      "whitelist",
      "whitelist-items",
    ),
  );
  element("btn-add-blacklist").addEventListener("click", () =>
    void addDomain(
      element("txt-blacklist-domain"),
      "blacklist",
      "blacklist-items",
    ),
  );
  element("btn-sync").addEventListener("click", () => void refresh());
  element("btn-clear-history").addEventListener("click", () => {
    if (!confirm("Are you sure you want to clear your local blocked counts and stats?")) {
      return;
    }
    void set({
      stats: { adsBlocked: 0, redirectsBlocked: 0, scansPerformed: 0 },
    })
      .then(() => alert("Blocked statistics and counts cleared successfully."))
      .catch((error) => {
        console.error("Failed to clear local statistics:", error);
        alert("Statistics could not be cleared. Check the extension console.");
      });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.blockedDomainMeta) {
      void loadBlockedDomains().catch(console.error);
    }
    if (changes.diagnosticsLog) {
      void loadDiagnostics().catch(console.error);
    }
  });

  void refresh();
});
