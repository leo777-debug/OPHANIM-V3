# Presentation checklist

## One hour before

- Charge the laptop; connect power and test the projector at 1920x1080.
- Open STRESS_TEST/video/Ophanim-Demo-2026-10.mp4 and play it through once.
  A previous copy was saved in D:/OPHANIM/Documentation; verify that drive is
  mounted before relying on it. The current worktree copy is verified.
- Keep a second local copy; test playback without internet.
- Use synthetic records only. Close mail, messaging, environment files and dashboards.
- Disable notifications and sleep for the presentation; restore these afterwards.
- Check browser zoom and projector contrast. Captions must be readable from the back.
- If doing a live run, verify the labelled demo and real import completion first.
- If explaining local AI, load the model beforehand. The recorded deterministic path
  does not need an AI service. Never show a model-provider key or environment file.
- Review REPORT.md for open gates; do not promise missing capabilities.

## Five minutes before

- Start the video at the beginning; ensure the synthetic/replay label is visible.
- Check power, display mirroring, sound muted and notifications off.
- Close all tabs containing personal/company information or credentials.
- Have DEMO_SCRIPT.md available on a separate presenter screen or printed.

## Plan B

- Internet fails: play the local MP4. It uses recorded synthetic fixtures, not live data.
- AI fails: use the deterministic import, port matching and Verify scenes. Say AI is unavailable.
- Live app fails: switch to the video; never substitute a fabricated live result.
- Projector fails: play the video on the laptop, or explain the screenshots with the replay label.
- Time is cut: show the import review, DXB-291 port match and one Verify verdict.

## After presenting

Restore notifications/sleep, close the demo services and remove synthetic sessions
from the browser. Do not deploy or merge the stress branch as a presentation action.
