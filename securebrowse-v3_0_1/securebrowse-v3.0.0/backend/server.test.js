"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createServer, normalizeAnalysis, parseGeminiResponse } = require("./server");

test("normalizeAnalysis separates betting promotion from other threats", () => {
  const result = normalizeAnalysis({
    risk_score: 20,
    betting_promotion: true,
    security_threat: false,
    reasons: ["Sportsbook signup offer detected."],
  });

  assert.equal(result.risk_score, 85);
  assert.equal(result.action, "ALLOW");
  assert.equal(result.status, "DANGEROUS");
  assert.equal(result.betting_promotion, true);
});

test("normalizeAnalysis blocks an independent security threat", () => {
  const result = normalizeAnalysis({
    risk_score: 92,
    betting_promotion: true,
    security_threat: true,
    reasons: ["Phishing credentials detected."],
  });
  assert.equal(result.action, "BLOCK");
  assert.equal(result.security_threat, true);
});

test("parseGeminiResponse reads the generated JSON", () => {
  const result = parseGeminiResponse({
    candidates: [
      {
        content: {
          parts: [
            {
              text: '{"risk_score":12,"betting_promotion":false,"reasons":["No promotion."],"summary":"Low risk."}',
            },
          ],
        },
      },
    ],
  });
  assert.equal(result.risk_score, 12);
  assert.equal(result.betting_promotion, false);
});

test("analyze endpoint sends bounded context and stores only result metadata", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "securebrowse-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dataFile = path.join(directory, "store.json");
  let geminiRequest;
  const server = createServer({
    geminiApiKey: "test-gemini-key",
    backendApiKey: "test-extension-key",
    dataFile,
    fetchImpl: async (url, init) => {
      geminiRequest = { url, init };
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      risk_score: 88,
                      betting_promotion: true,
                      security_threat: false,
                      reasons: ["Sports betting offer found."],
                      summary: "Betting promotion.",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const dashboard = await fetch(origin);
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.headers.get("content-type"), /text\/html/);
  assert.match(await dashboard.text(), /SecureBrowse Dashboard/);
  const dashboardScript = await fetch(`${origin}/dashboard/app.js`);
  assert.equal(dashboardScript.status, 200);
  assert.match(dashboardScript.headers.get("content-type"), /javascript/);

  const unauthorized = await fetch(`${origin}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://bet.example" }),
  });
  assert.equal(unauthorized.status, 401);

  const response = await fetch(`${origin}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "test-extension-key",
    },
    body: JSON.stringify({
      url: "https://bet.example",
      redirect_chain: ["https://redirect.example"],
      title: "Welcome bonus",
      text_excerpt: "Sportsbook signup offer".repeat(500),
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.action, "ALLOW");
  assert.equal(result.risk_score, 88);
  assert.match(geminiRequest.init.body, /visible_text_excerpt/);
  const prompt = JSON.parse(geminiRequest.init.body).contents[0].parts[0].text;
  assert.ok(prompt.length < 11_000);
  assert.match(prompt, new RegExp("Sportsbook signup offer".repeat(300).slice(0, 100)));

  const stored = JSON.parse(await fs.readFile(dataFile, "utf8"));
  assert.equal(stored.history.length, 1);
  assert.equal(stored.history[0].url, "https://bet.example");
  assert.equal(JSON.stringify(stored).includes("Sportsbook signup offer"), false);
});

test("URL-only lookup reuses a cached page-context analysis", async () => {
  let calls = 0;
  const server = createServer({
    geminiApiKey: "test-key",
    backendApiKey: "",
    dataFile: path.join(os.tmpdir(), `sb-cache-${process.pid}-${Date.now()}.json`),
    fetchImpl: async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ risk_score: 5, reasons: ["ok"] }) }] } }] }),
        { status: 200 },
      );
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) =>
    fetch(`${base}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    await post({ url: "https://example.com/a#x", text_excerpt: "hello" });
    await post({ url: "https://example.com/a" });
    assert.equal(calls, 1);
  } finally {
    server.close();
  }
});
