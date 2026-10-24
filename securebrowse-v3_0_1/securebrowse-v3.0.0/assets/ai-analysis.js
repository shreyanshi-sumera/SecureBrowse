(() => {
  const redirectChains = new Map();
  const analyzedPages = new Map();
  const ANALYSIS_TIMEOUT_MS = 25_000;

  function isWebUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function normalizeDomain(value) {
    try {
      return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    } catch (error) {
      console.error("Could not parse URL during AI analysis:", error);
      return "";
    }
  }

  function addRedirect(tabId, url) {
    if (!Number.isInteger(tabId) || !isWebUrl(url)) return;
    const now = Date.now();
    const previous = redirectChains.get(tabId);
    const chain =
      previous && now - previous.lastAt < 15_000 ? previous.urls : [];
    if (chain.at(-1) !== url) chain.push(url);
    redirectChains.set(tabId, {
      urls: chain.slice(-10),
      lastAt: now,
    });
  }

  async function isExempt(tabId, url) {
    const domain = normalizeDomain(url);
    const [{ settings, whitelist = [] }, { sessionWhitelist = [] }] =
      await Promise.all([
        chrome.storage.local.get(["settings", "whitelist"]),
        chrome.storage.session.get("sessionWhitelist"),
      ]);
    if (settings?.protectionEnabled === false) return true;

    const isWhitelisted = (candidate) =>
      domain === candidate || domain.endsWith(`.${candidate}`);
    if (
      whitelist.some(isWhitelisted) ||
      sessionWhitelist.some(isWhitelisted)
    ) {
      return true;
    }
    return analyzedPages.get(tabId) === url;
  }

  async function logDiagnostic(message) {
    try {
      const { diagnosticsLog = [] } =
        await chrome.storage.local.get("diagnosticsLog");
      const nextLog = diagnosticsLog.slice(-19);
      nextLog.push({ msg: message, at: Date.now() });
      await chrome.storage.local.set({ diagnosticsLog: nextLog });
    } catch (error) {
      console.error("Could not save AI analysis diagnostic:", error);
    }
  }

  async function showRiskNotification(result, url, shouldBlock) {
    const risk = Math.max(0, Math.min(100, Math.round(Number(result.risk_score))));
    const action = shouldBlock
      ? "BLOCK"
      : result.action === "WARN" || result.betting_promotion === true
        ? "WARN"
        : "ALLOW";
    if (action === "ALLOW") return;

    const reason =
      Array.isArray(result.reasons) && result.reasons.length > 0
        ? String(result.reasons[0]).slice(0, 160)
        : "AI analysis found suspicious website activity.";
    const label = action === "BLOCK" ? "Website blocked" : "Website warning";
    const hostname = normalizeDomain(url) || url;
    const notificationId = `securebrowse-ai-${Date.now()}`;
    try {
      await chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
        title: `${label} · Risk ${risk}/100`,
        message: `${hostname}: ${reason}`,
        priority: 2,
      });
    } catch (error) {
      console.error("Could not display the AI risk notification:", error);
    }
  }

  async function handlePageContext(message, sender) {
    const tabId = sender.tab?.id;
    if (
      !Number.isInteger(tabId) ||
      typeof message.url !== "string" ||
      !isWebUrl(message.url) ||
      sender.tab.url !== message.url ||
      (message.title !== undefined && typeof message.title !== "string") ||
      (message.text_excerpt !== undefined &&
        typeof message.text_excerpt !== "string")
    ) {
      return;
    }

    if (await isExempt(tabId, message.url)) return;
    analyzedPages.set(tabId, message.url);
    const trackedChain = redirectChains.get(tabId)?.urls || [];
    const redirectChain =
      trackedChain.at(-1) === message.url ? trackedChain : [message.url];
    redirectChains.delete(tabId);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ANALYSIS_TIMEOUT_MS,
    );

    let result;
    try {
      const requestBody = JSON.stringify({
        url: message.url,
        redirect_chain: redirectChain,
        title: (message.title || "").slice(0, 300),
        text_excerpt: (message.text_excerpt || "").slice(0, 8_000),
      });
      let response;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await fetch("http://127.0.0.1:8000/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
            signal: controller.signal,
          });
          if (response.status < 500) break;
        } catch (error) {
          if (error.name === "AbortError" || attempt === 1) throw error;
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 2_000));
      }
      if (!response.ok) {
        throw new Error(`AI backend returned HTTP ${response.status}.`);
      }
      result = await response.json();
      if (
        !Number.isFinite(Number(result.risk_score)) ||
        Number(result.risk_score) < 0 ||
        Number(result.risk_score) > 100
      ) {
        throw new Error("AI backend returned an invalid risk score.");
      }
    } catch (error) {
      analyzedPages.delete(tabId);
      const messageText =
        error.name === "AbortError"
          ? "AI website analysis timed out."
          : `AI website analysis failed: ${error.message}`;
      console.error(messageText, error);
      await logDiagnostic(messageText);
      return;
    } finally {
      clearTimeout(timeout);
    }

    const settings = (await chrome.storage.local.get("settings")).settings || {};
    const bettingBlockerEnabled = settings.bettingBlockerEnabled !== false;
    const shouldBlock =
      (result.betting_promotion === true && bettingBlockerEnabled) ||
      result.security_threat === true ||
      (result.betting_promotion !== true &&
        (result.action === "BLOCK" ||
          (result.action === "WARN" && settings.protectionLevel === "high")));
    await showRiskNotification(result, message.url, shouldBlock);
    if (!shouldBlock) return;

    if (settings.protectionEnabled === false) return;

    const reasons = Array.isArray(result.reasons)
      ? result.reasons.filter((reason) => typeof reason === "string").slice(0, 5)
      : ["AI analysis detected a potential threat."];
    const warningUrl = new URL(
      chrome.runtime.getURL("src/warning/warning.html"),
    );
    warningUrl.searchParams.set("url", message.url);
    warningUrl.searchParams.set(
      "score",
      String(Math.round(Number(result.risk_score))),
    );
    warningUrl.searchParams.set("reasons", JSON.stringify(reasons));

    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url !== message.url) return;
      const { stats = {} } = await chrome.storage.local.get("stats");
      await chrome.storage.local.set({
        stats: {
          ...stats,
          redirectsBlocked: (stats.redirectsBlocked || 0) + 1,
        },
      });
      await chrome.tabs.update(tabId, { url: warningUrl.href });
    } catch (error) {
      console.error("Could not block the AI-identified website:", error);
      await logDiagnostic(`Could not block AI-identified page: ${error.message}`);
    }
  }

  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) addRedirect(details.tabId, details.url);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    redirectChains.delete(tabId);
    analyzedPages.delete(tabId);
  });
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === "PROCEED_ANYWAY" && typeof message.url === "string") {
      const tabId = sender.tab?.id;
      if (Number.isInteger(tabId)) analyzedPages.set(tabId, message.url);
      return;
    }
    if (message.type === "AI_PAGE_CONTEXT") {
      void handlePageContext(message, sender).catch((error) => {
        console.error("Unexpected error during AI page analysis:", error);
        void logDiagnostic(`Unexpected AI analysis error: ${error.message}`);
      });
    }
  });
})();
