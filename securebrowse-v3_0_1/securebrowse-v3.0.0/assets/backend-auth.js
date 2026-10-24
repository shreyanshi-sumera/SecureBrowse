(() => {
  const backendOrigin = "http://127.0.0.1:8000";
  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init = {}) => {
    const requestUrl =
      typeof input === "string" || input instanceof URL ? input : input.url;
    const url = new URL(requestUrl, backendOrigin);

    if (url.origin !== backendOrigin) {
      return originalFetch(input, init);
    }

    const { backendApiKey = "" } =
      await chrome.storage.local.get("backendApiKey");
    if (!backendApiKey) {
      return originalFetch(input, init);
    }

    const requestHeaders =
      input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init.headers ?? requestHeaders);
    headers.set("X-API-Key", backendApiKey);

    return originalFetch(input, { ...init, headers });
  };
})();
