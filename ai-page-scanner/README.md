# AI Page Scanner (MVP)

A minimal Chrome Extension (Manifest V3) that scans the current page and returns basic content stats in a popup. No highlighting, blocking, or AI yet.

## What it does

- Adds a toolbar icon with a popup containing a "Scan Page" button
- When clicked, it queries the active tab and asks the content script to compute stats
- Displays a JSON summary including:
  - `url`, `title`, `timestamp` (ISO)
  - `totals`: `elements`, `characters`, `words`, `uniqueWords`
  - `media`: `images`, `iframes`, `links`, `scripts`, `stylesheets`

## Install (Load Unpacked)

1. Build not required. The project is pure JS/HTML/CSS.
2. Open `chrome://extensions` in Chrome.
3. Toggle on **Developer mode** (top-right).
4. Click **Load unpacked** and select the `ai-page-scanner` folder.
5. You should see "AI Page Scanner (MVP)" appear in your extensions list.

## Usage / Demo

1. Navigate to any website.
2. Click the extension icon to open the popup.
3. Click **Scan Page**.
4. The popup will show a JSON block with the collected stats.

If you see an error stating the content script didn't respond, try reloading the tab and scanning again (the content script runs at `document_idle`).

## Permissions

- Uses `host_permissions: ["<all_urls>"]` so the content script can run on any page.
- Keeps permissions minimal (no extra APIs).

## Next steps

Later we will add feature extraction and wire a `/predict` call to an AI model—keeping this MVP focused on basic page stats for now.
