# SecureBrowse Gemini backend

This local Node.js service analyzes website URLs, redirect chains, page titles,
and a limited visible-text excerpt with Google Gemini. It keeps Gemini API
credentials on the backend and persists scan history and custom domain lists in
`backend/data/store.json`. Page text is sent to Gemini for analysis but is not
written to local history.

## Requirements

- Node.js 20.6 or newer
- A Google Gemini API key

## Start on Windows

Create a `backend/.env` file with your Gemini key and, optionally, a local
extension API key and port:

```dotenv
GEMINI_API_KEY=your-gemini-api-key
SECUREBROWSE_API_KEY=choose-a-local-extension-api-key
PORT=8000
```

Then start the service from the `backend` directory:

```powershell
npm start
```

Open `http://127.0.0.1:8000/` for the local dashboard. It uses the backend's
health, analysis, history, blacklist, and whitelist endpoints directly. If
`SECUREBROWSE_API_KEY` is configured, enter that same key in the dashboard to
authorize its API requests. The dashboard is served by the backend, so a
separate development server on port 5173 is not required.

The `.env` file is local configuration and should not be committed.
Set the same `SECUREBROWSE_API_KEY` in SecureBrowse's **Backend API Key**
setting. If `SECUREBROWSE_API_KEY` is unset, backend API-key authentication is
disabled. Keep the service bound to `127.0.0.1`; do not expose this service to
the public internet.

The extension sends the current URL, up to 10 recent redirect URLs, the page
title, and at most 8,000 characters of visible page text. It does not read or
send form field values. Page text is processed by Gemini and is not retained in
the backend's scan history.

The backend also implements the extension's `/history`, `/blacklist`,
`/whitelist`, and `/block-event` routes. History and custom domain lists are
stored locally in `backend/data/store.json`.

Run the backend tests with:

```powershell
npm test
```
