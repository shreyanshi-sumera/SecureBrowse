(() => {
  const messageEvent = chrome.runtime.onMessage;
  const addListener = messageEvent.addListener.bind(messageEvent);
  const guardedMessageTypes = new Set([
    "SCAM_CONTENT_DETECTED",
    "REDIRECT_BLOCKED",
  ]);

  const guardedAddListener = (listener) =>
    addListener((message, sender, sendResponse) => {
      if (!guardedMessageTypes.has(message?.type)) {
        return listener(message, sender, sendResponse);
      }

      void chrome.storage.local
        .get("settings")
        .then(({ settings }) => {
          const protectionEnabled = settings?.protectionEnabled !== false;
          const redirectProtectionEnabled =
            message.type !== "REDIRECT_BLOCKED" ||
            settings?.redirectBlockerEnabled !== false;

          if (protectionEnabled && redirectProtectionEnabled) {
            listener(message, sender, sendResponse);
            return;
          }

          sendResponse({ success: true, skipped: true });
        })
        .catch((error) => {
          console.error("Could not read protection settings for message:", error);
          sendResponse({
            success: false,
            error: "Protection settings could not be read.",
          });
        });
      return true;
    });

  try {
    messageEvent.addListener = guardedAddListener;
    if (messageEvent.addListener !== guardedAddListener) {
      throw new Error("The runtime message listener could not be wrapped.");
    }
  } catch (error) {
    console.error(
      "Could not apply master protection settings to legacy message handlers:",
      error,
    );
  }
})();
