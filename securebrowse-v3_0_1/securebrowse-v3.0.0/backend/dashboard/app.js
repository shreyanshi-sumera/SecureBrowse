"use strict";

let backendApiKey = "";

const elements = {
  authPanel: document.querySelector("#auth-panel"),
  authForm: document.querySelector("#auth-form"),
  apiKey: document.querySelector("#api-key"),
  healthDot: document.querySelector("#health-dot"),
  healthLabel: document.querySelector("#health-label"),
  notice: document.querySelector("#notice"),
  updatedAt: document.querySelector("#updated-at"),
  statScans: document.querySelector("#stat-scans"),
  statRisk: document.querySelector("#stat-risk"),
  statBlacklist: document.querySelector("#stat-blacklist"),
  statWhitelist: document.querySelector("#stat-whitelist"),
  historyCount: document.querySelector("#history-count"),
  historyBody: document.querySelector("#history-body"),
  blacklistCount: document.querySelector("#blacklist-count"),
  blacklistList: document.querySelector("#blacklist-list"),
  whitelistCount: document.querySelector("#whitelist-count"),
  whitelistList: document.querySelector("#whitelist-list"),
  scanForm: document.querySelector("#scan-form"),
  scanUrl: document.querySelector("#scan-url"),
  scanButton: document.querySelector("#scan-button"),
  refreshButton: document.querySelector("#refresh-button"),
};

function showNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle("notice-error", isError);
  elements.notice.hidden = !message;
}

async function apiRequest(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  if (backendApiKey) headers.set("X-API-Key", backendApiKey);
  if (options.body) headers.set("Content-Type", "application/json");

  let response;
  try {
    response = await fetch(endpoint, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the backend. Make sure it is running at this address.");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      elements.authPanel.hidden = false;
      throw new Error("Backend authorization failed. Enter the configured API key above.");
    }
    throw new Error(result.error || `Backend request failed (HTTP ${response.status}).`);
  }
  return result;
}

function setHealth(isOnline, label) {
  elements.healthDot.classList.toggle("is-online", isOnline);
  elements.healthLabel.textContent = label;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function createCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  return cell;
}

function renderHistory(history) {
  elements.historyCount.textContent = String(history.length);
  elements.statScans.textContent = String(history.length);
  elements.statRisk.textContent = String(
    history.filter((entry) => entry.action === "BLOCK" || entry.status === "DANGEROUS").length,
  );
  elements.historyBody.replaceChildren();

  if (history.length === 0) {
    const row = document.createElement("tr");
    const cell = createCell("No scans yet. Analyze a URL to get started.", "empty-state");
    cell.colSpan = 4;
    row.append(cell);
    elements.historyBody.append(row);
    return;
  }

  for (const entry of history) {
    const row = document.createElement("tr");
    const urlCell = document.createElement("td");
    const address = document.createElement("span");
    address.className = "site-address";
    address.textContent = entry.url || entry.domain || "Unknown website";
    urlCell.append(address);

    const risk = Number.isFinite(Number(entry.risk_score))
      ? `${Math.round(Number(entry.risk_score))}/100`
      : "—";
    const result = entry.action || entry.status || "UNKNOWN";
    row.append(
      urlCell,
      createCell(risk),
      createCell(result, `result result-${String(result).toLowerCase()}`),
      createCell(formatDate(entry.created_at)),
    );
    elements.historyBody.append(row);
  }
}

function renderDomains(list, listElement, countElement, statElement) {
  const domains = list.map((item) => item.domain).filter(Boolean);
  countElement.textContent = String(domains.length);
  statElement.textContent = String(domains.length);
  listElement.replaceChildren();

  if (domains.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No domains added.";
    listElement.append(empty);
    return;
  }

  for (const domain of domains) {
    const item = document.createElement("li");
    item.textContent = domain;
    listElement.append(item);
  }
}

async function refreshDashboard() {
  elements.refreshButton.disabled = true;
  try {
    const [health, history, blacklist, whitelist] = await Promise.all([
      apiRequest("/health"),
      apiRequest("/history?limit=100"),
      apiRequest("/blacklist"),
      apiRequest("/whitelist"),
    ]);
    setHealth(true, health.ai_ready ? `Backend online · ${health.model}` : "Backend online · Gemini key missing");
    renderHistory(history);
    renderDomains(blacklist, elements.blacklistList, elements.blacklistCount, elements.statBlacklist);
    renderDomains(whitelist, elements.whitelistList, elements.whitelistCount, elements.statWhitelist);
    elements.updatedAt.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    showNotice("");
  } catch (error) {
    setHealth(false, "Backend unavailable");
    showNotice(error.message, true);
  } finally {
    elements.refreshButton.disabled = false;
  }
}

elements.refreshButton.addEventListener("click", refreshDashboard);

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  backendApiKey = elements.apiKey.value.trim();
  await refreshDashboard();
});

elements.scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.scanButton.disabled = true;
  showNotice("Analyzing URL with Gemini...");
  try {
    const result = await apiRequest("/analyze", {
      method: "POST",
      body: JSON.stringify({ url: elements.scanUrl.value.trim() }),
    });
    elements.scanUrl.value = "";
    showNotice(`Analysis complete: ${result.status} · ${result.risk_score}/100 · ${result.action}`);
    await refreshDashboard();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    elements.scanButton.disabled = false;
  }
});

for (const listName of ["blacklist", "whitelist"]) {
  const form = document.querySelector(`#${listName}-form`);
  const input = document.querySelector(`#${listName}-domain`);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await apiRequest(`/${listName}`, {
        method: "POST",
        body: JSON.stringify({ domain: input.value.trim() }),
      });
      input.value = "";
      showNotice("Domain list updated.");
      await refreshDashboard();
    } catch (error) {
      showNotice(error.message, true);
    }
  });
}

refreshDashboard();
