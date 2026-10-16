# Demo Video Review

Reviewed on 15 October 2026 (Asia/Dubai). This reviews the video, not the entire
application's production or competition readiness.

## Output

- `STRESS_TEST/video/Ophanim-Demo-2026-10.mp4`
- Re-recorded from the latest package on 15 October. Current video: H.264,
  1920x1080, 30 fps, 139.8 seconds, no uncaught exceptions on the recorded path.
  The refreshed copy is SHA256-verified at
  `D:/OPHANIM/Documentation/Ophanim-Demo-2026-10.mp4`. Previous local and D: copies
  are backed up before replacement. Current digest/size/copy proof are generated
  in `artifacts/video.json`; `video-copy.json` preserves the earlier 16:27 copy.
- No audio, voice-over or music. MP4 and raw capture are ignored by Git.
- Encoding reserves separate bands for captions and replay labels, keeping them
  clear of the actual application controls and native replay timestamp.
- Re-record: `npm run demo:video`; re-encode existing capture with
  `node STRESS_TEST/demo-video.mjs --encode-only`.

## Inspected

The refreshed title and persisted operator-note frames were viewed at full resolution.
The previous weather/share review is supplemented by a refreshed contact sheet
sampling the new final encoding every ten seconds:
`artifacts/video-final-contact-sheet.png`. Empty unused contact-sheet slots are
not frames from the video. The earlier draft's white opening was rejected; the
final recording prewarms pages and includes three-second title/closing cards.

The overview/Today scene is not included in this recording. It starts with the
genuine import/review workflow; no missing dashboard work queue is simulated.

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
