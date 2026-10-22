# Public camera coverage

The Recon toolkit's **Cameras** tab searches Windy Webcams API v3, defaults to GCC, and supports worldwide, MENA, North Africa, and optional ISO country filters. It opens selected cameras in the existing viewer on desktop and mobile. EarthCam and SkylineWebcams are publisher-directory links, not scraped or integrated feeds.

Set the server-only `WINDY_WEBCAMS_API_KEY` in your deployment environment and restart the app. Obtain a Webcams key from https://api.windy.com/webcams. Integration settings show configuration and support an authenticated connection test. No secret is returned to the browser. Existing transport cameras continue without this key.

`GET /api/cctv/indexes?region=gcc&country=AE&offset=0` returns up to 50 upstream records per country group, a record count, next offset, and explicit status. MENA is split into groups of at most ten countries to match the provider API. Its offset advances each group in parallel, so a MENA page can contain more than 50 records. Failures produce `unavailable` or `partial`; missing configuration produces `not_configured`. They are not reported as empty successful coverage. Successful queries cache for four minutes with bounded memory and shared in-flight requests. Upstream requests have a five-second deadline.

The all-camera map includes a bounded sample from seven continents, all six GCC countries individually (AE, SA, QA, KW, BH, OM), and broader MENA. At zoom 4 and above, moving the map requests nearby cameras, with a 250 km maximum search radius. The map retains up to 2,000 indexed cameras plus existing transport cameras. Use country search and pagination to browse beyond overview samples. Some countries have no published webcams; neither geographic search support nor an empty response establishes complete coverage.

Only active records with valid coordinates are accepted. Only provider-returned HTTPS Windy players are embedded, and only `player.live` is labelled live. Records without a live player open a publisher page for images or timelapse. Signed image URLs are not persisted. Windy attribution and add-camera links appear in the browser and viewer. Publisher terms, plan quotas, and playback restrictions apply.

Shodan remains in its existing authenticated tab for passive service intelligence; it is not used to discover or play private camera footage. Insecam and other exposed-private-camera aggregators are not ingested. There is no camera credential guessing, bypass, scanning, or arbitrary stream probing.

Provider reference: https://api.windy.com/webcams/docs and https://api.windy.com/webcams/version-transfer.
