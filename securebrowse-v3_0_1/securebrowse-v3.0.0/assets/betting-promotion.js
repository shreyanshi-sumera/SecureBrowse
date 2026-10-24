(() => {
  const bettingTerms =
    /\b(?:sports?\s?betting|betting\s(?:site|website|odds)|online\sbetting|sportsbook|online\s?casino|casino\s(?:games?|bonus)|gambling|wager(?:ing)?|bookmaker)\b/i;
  const strongPromotion =
    /\b(?:bet\snow|place\s(?:your\s)?bets?|claim\s(?:your\s)?(?:welcome\s)?bonus|welcome\sbonus|free\s+bets?|risk[- ]free\s+bets?|join\s(?:now|today)|deposit\sbonus|sign\s?up\sbonus|first\sdeposit\sbonus)\b/i;
  const promotionalAction =
    /\b(?:bet\snow|place\s(?:your\s)?bets?|claim\s(?:your\s)?bonus|join\s(?:now|today)|sign\s?up|register\snow|get\sstarted|play\snow|deposit\s(?:now|today))\b/i;
  const incentive = /\b(?:bonus|free\s bets?|deposit|odds|promo\s?code)\b/i;
  const extensionContext = globalThis.chrome?.runtime?.id;
  let lastReportedUrl = "";
  let scanTimer;

  if (!extensionContext) return;

  function isVisible(element) {
    const style = getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  }

  function detectPromotion() {
    const body = document.body;
    if (!body) return;

    const pageText = (body.innerText || "").slice(0, 100_000);
    if (!bettingTerms.test(pageText)) return;

    const pageHasStrongPromotion = strongPromotion.test(pageText);
    const promotionalCallsToAction = Array.from(
      document.querySelectorAll("a, button, [role='button']"),
    )
      .filter(isVisible)
      .map((element) => element.innerText || element.getAttribute("aria-label") || "")
      .filter((text) => text.length <= 300 && promotionalAction.test(text));
    const hasBettingPromotion =
      pageHasStrongPromotion ||
      (incentive.test(pageText) && promotionalCallsToAction.length >= 1);

    if (!hasBettingPromotion || lastReportedUrl === location.href) return;
    lastReportedUrl = location.href;
    chrome.runtime.sendMessage({
      type: "BETTING_PROMOTION_DETECTED",
      url: location.href,
      reason: "This page actively promotes betting or online casino offers.",
    }).catch((error) =>
      console.error("Failed to report betting promotion:", error),
    );
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = undefined;
      detectPromotion();
    }, 750);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleScan, { once: true });
  } else {
    scheduleScan();
  }

  new MutationObserver(scheduleScan).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
