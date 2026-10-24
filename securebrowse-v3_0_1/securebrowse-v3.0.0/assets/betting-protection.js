(() => {
  const sessionAllowedDomains = new Set();

  function normalizeDomain(value) {
    try {
      return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    } catch (error) {
      console.error("Could not parse betting-promotion URL:", error);
      return "";
    }
  }

  async function isAllowed(domain) {
    if (sessionAllowedDomains.has(domain)) return true;

    const [{ settings, whitelist = [] }, { sessionWhitelist = [] }] =
      await Promise.all([
        chrome.storage.local.get(["settings", "whitelist"]),
        chrome.storage.session.get("sessionWhitelist"),
      ]);
    if (
      settings?.protectionEnabled === false ||
      settings?.bettingBlockerEnabled === false
    ) {
      return true;
    }

    const isWhitelisted = (candidate) =>
      domain === candidate || domain.endsWith(`.${candidate}`);
    return (
      whitelist.some(isWhitelisted) ||
      sessionWhitelist.some(isWhitelisted)
    );
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === "PROCEED_ANYWAY" && typeof message.url === "string") {
      const domain = normalizeDomain(message.url);
      if (domain) sessionAllowedDomains.add(domain);
      return;
    }

    if (
      message.type !== "BETTING_PROMOTION_DETECTED" ||
      typeof message.url !== "string" ||
      typeof sender.tab?.id !== "number"
    ) {
      return;
    }

    void (async () => {
      const domain = normalizeDomain(message.url);
      if (!domain || (await isAllowed(domain))) return;

      const warningUrl = new URL(
        chrome.runtime.getURL("src/warning/warning.html"),
      );
      warningUrl.searchParams.set("url", message.url);
      warningUrl.searchParams.set("score", "85");
      warningUrl.searchParams.set(
        "reasons",
        JSON.stringify([message.reason]),
      );
      await chrome.tabs.update(sender.tab.id, { url: warningUrl.href });
    })().catch((error) => {
      console.error("Failed to block betting-promotion page:", error);
    });
  });
})();
