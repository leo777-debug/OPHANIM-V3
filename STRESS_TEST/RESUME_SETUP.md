# Manual Resume Setup

The helper is not scheduled or enabled automatically. No additional Codex sessions
have been launched to test it. An unattended run consumes your normal Codex allowance.

1. Use this dedicated checkout on `stress-test/competition`, not your main working
   folder. The helper refuses another branch/repository and never stashes changes.
2. Ensure the Codex CLI is installed and signed in. This script reuses the existing
   local login; it does not read, copy or print an API key or auth file.
3. In PowerShell, run `powershell -NoProfile -File .\STRESS_TEST\resume.ps1 -CheckOnly`.
   Inspect the local, Git-ignored log. This checks readiness without spending credits.
4. Open Windows Task Scheduler and choose **Create Task**. Name it
   `Ophanim Competition Resume`. Choose **Run only when user is logged on**.
   Do not select highest privileges.
5. Add a daily trigger repeated every **2 hours**, indefinitely. Enable the task
   only when you want automatic work. Under Settings, choose **Do not start a new
   instance** if the task is already running.
6. Set the action to `powershell.exe`. Arguments:
   `-NoProfile -File "ABSOLUTE_CHECKOUT_PATH\STRESS_TEST\resume.ps1"`.
   Set **Start in** to that absolute checkout path. Do not use a bypass/full-access flag.
7. Turn it off by right-clicking the named task and selecting **Disable**. To stop
   an active run, select **End** and inspect the current progress and Git diff.

Logs live in `STRESS_TEST/logs/<date-time>.log`; do not publish raw logs. Failures
are logged once and the helper exits. The next scheduled attempt re-reads state.
An exclusive file handle prevents overlapping helper invocations. The script does
not retry billing failures, change permissions, register tasks or deploy anything.

Only `workspace-write` is used, with user configuration excluded. If sandbox Git,
Docker, downloads or pushes are blocked, record the limitation for a manual session;
never switch to full access to make unattended work succeed.

Official CLI documentation:
https://learn.chatgpt.com/docs/non-interactive-mode
