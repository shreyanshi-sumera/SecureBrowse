(() => {
  const rulesetId = "ad_domains";

  async function syncAdRuleset() {
    const { settings } = await chrome.storage.local.get("settings");
    const shouldEnable = settings?.adBlockerEnabled !== false;
    const enabledRulesets =
      await chrome.declarativeNetRequest.getEnabledRulesets();
    const isEnabled = enabledRulesets.includes(rulesetId);

    if (shouldEnable && !isEnabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: [rulesetId],
      });
    } else if (!shouldEnable && isEnabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: [rulesetId],
      });
    }
  }

  function reportSyncFailure(error) {
    console.error("Failed to apply the ad-blocker setting:", error);
  }

  void syncAdRuleset().catch(reportSyncFailure);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings) {
      void syncAdRuleset().catch(reportSyncFailure);
    }
  });
})();
