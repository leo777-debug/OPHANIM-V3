# Demo Video Review

Reviewed on 15 October 2026 (Asia/Dubai). This reviews the video, not the entire
application's production or competition readiness.

## Output

- `STRESS_TEST/video/Ophanim-Demo-2026-10.mp4`
- Earlier copy recorded at `D:/OPHANIM/Documentation/Ophanim-Demo-2026-10.mp4`.
  D: is not mounted in the current session, so this copy cannot now be reverified.
- H.264, 1920x1080, 30 fps, 127.200 seconds, 2,584,303 bytes.
- No audio, voice-over or music. MP4 and raw capture are ignored by Git.
- Verified worktree SHA256:
  `becdaa0bbf5f7d7becb5ce23df865a0b0eaf4cf5ad2c755074fb3913662c7fce`.
- Re-record: `npm run demo:video`; re-encode existing capture with
  `node STRESS_TEST/demo-video.mjs --encode-only`.

## Inspected

Title, destination-port weather evidence and shared-result frames were viewed at
full resolution. A contact sheet samples the final encoded video every ten seconds:
`artifacts/video-final-contact-sheet.png`. Empty unused contact-sheet slots are
not frames from the video. The earlier draft's white opening was rejected; the
final recording prewarms pages and includes three-second title/closing cards.

All captured workflows use the labelled synthetic organization on loopback.
External provider traffic is blocked, no real customer records or provider keys
are supplied, and synthetic/replay labels remain visible. The demo-only presenter
address is a reserved `.test` fixture, not a real person's contact information.

## Genuine Workflow

1. Excel upload, column mapping/review and confirmed import.
2. DXB-291 shipment record, Jebel Ali to Nhava Sheva.
3. Synthetic weather advisory linked by the actual destination-port matcher.
4. Verify Dubai replay: PARTLY TRUE, evidence and public share.
5. Earthquake replay and signed-in history.

## Explicit Limits

The weather example proves a destination-port match, not a validated forecast
cone, ETA-window engine or Last Safe Move deadline. No invoice 50-vs-48 comparison,
GPS-interference detection, confirmation/reply or decision-log scene was fabricated.
The warm recording is not evidence of the requested cold-start speed budget.
Recorded fixtures are not live intelligence. Final application acceptance remains
tracked separately in `state.json` and `REPORT.md`.
