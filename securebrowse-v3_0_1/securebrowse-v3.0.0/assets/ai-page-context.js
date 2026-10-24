(() => {
  if (!/^https?:$/.test(location.protocol)) return;

  let lastSentUrl = "";

  function sendPageContext() {
    if (lastSentUrl === location.href || !document.body) return;
    lastSentUrl = location.href;
    chrome.runtime
      .sendMessage({
        type: "AI_PAGE_CONTEXT",
        url: location.href,
        title: document.title.slice(0, 300),
        text_excerpt: (document.body.innerText || "").slice(0, 8_000),
      })
      .catch((error) =>
        console.error("Could not send page context for AI analysis:", error),
      );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sendPageContext, {
      once: true,
    });
  } else {
    sendPageContext();
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled || location.href === lastSentUrl) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      sendPageContext();
    }, 1_000);
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", sendPageContext);
  window.addEventListener("hashchange", sendPageContext);
})();
