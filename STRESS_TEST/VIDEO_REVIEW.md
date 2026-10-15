# Demo Video Review

Reviewed on 15 October 2026 (Asia/Dubai). This reviews the video, not the entire
application's production or competition readiness.

## Output

- `STRESS_TEST/video/Ophanim-Demo-2026-10.mp4`
- Current 143-second version copied and SHA256-verified at
  `D:/OPHANIM/Documentation/Ophanim-Demo-2026-10.mp4` on 15 October at 16:27 Dubai time.
  The drive became available after the earlier checkpoint. Its old 127-second copy
  was preserved as `Ophanim-Demo-before-20261015-1627.mp4`. See artifacts/video-copy.json.
- Current video: H.264, 1920x1080, 30 fps, 143.166667 seconds, 2,960,851 bytes.
- No audio, voice-over or music. MP4 and raw capture are ignored by Git.
- Verified worktree SHA256:
  `ff15b73b72880adcae5b5559f0c5a57f887f787597c69683db659b61c151fffc`.
- Re-record: `npm run demo:video`; re-encode existing capture with
  `node STRESS_TEST/demo-video.mjs --encode-only`.

## Inspected

The updated title and persisted operator-note frames were viewed at full resolution.
The previous weather/share review is supplemented by a refreshed contact sheet
sampling the new final encoding every ten seconds:
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
4. A rescue-case operator note entered in the real UI, then independently checked
   through the case-detail API. This is not an automated rerouting or booking action.
5. Verify Dubai replay: PARTLY TRUE, evidence and public share.
6. Earthquake replay and signed-in history.

## Explicit Limits

The weather example proves a destination-port match, not a validated forecast
cone, ETA-window engine or Last Safe Move deadline. No invoice 50-vs-48 comparison,
GPS-interference detection or confirmation/reply scene was fabricated. The decision
note is genuinely persisted, not a confirmation reply or carrier instruction.
The warm recording is not evidence of the requested cold-start speed budget.
Recorded fixtures are not live intelligence. Final application acceptance remains
tracked separately in `state.json` and `REPORT.md`.
