# Paperleaf delivery policy

- Default product work and releases target the Windows desktop app.
- Do not develop or release a separate web reading experience unless the owner explicitly requests it. The public website is for the desktop installer, release notes, and installation guidance.
- The existing Electron app loads its reading UI from the same HTTPS origin as its authenticated cloud API. Keep this desktop runtime and cloud records working when maintaining the download website.
- When the owner requests an update, build and publish the Windows EXE, keep native version fields consistent, update the verified installer manifest, and report what was actually tested. A hosted UI deployment alone does not complete a desktop release.
- Preserve existing account data, Codex credentials, and update integrity checks. Never claim real-model or Windows GUI testing from mock or Linux-only tests.
