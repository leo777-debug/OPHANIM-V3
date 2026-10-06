# Ophanim Context extension

Manifest V3 foundation for Chrome and Chromium-based Edge. It uses the existing Ophanim account and backend; it has no separate database or intelligence engine.

## What the MVP includes

- Generic local detection for shipment references, valid container numbers, IMO/MMSI numbers, ports, carriers, vessels and named companies.
- A Gmail adapter that inspects only the visible message context locally.
- An Ophanim-site adapter and deep links back to matching shipments.
- A compact native browser side panel.
- **Ask Ophanim** in the right-click menu for selected text.
- A fixed, authenticated request to `/api/extension/context`; arbitrary remote URLs cannot be requested by a content script.

Only the page URL, page title and up to 30 small structured entity records are sent. Raw page or email text is not transmitted.

## Load locally

1. Keep the Ophanim app running on `http://localhost:3000` and sign in there.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this `extension` folder.
5. Pin **Ophanim Context**, then open the side panel on a logistics page.

For production, change `DEFAULT_BACKEND_ORIGIN` in `config.js` to `https://ophanim.live`, keep only the production host permission, and add the published extension IDs to `OPHANIM_EXTENSION_IDS` on the backend.

## Adding a site adapter

Add a file under `content/adapters`, register it through `OphanimExtension.registerAdapter`, and list it before `content/bootstrap.js` in `manifest.json`. Adapters return the same structured entity shape as the generic detector; backend logic remains shared.
