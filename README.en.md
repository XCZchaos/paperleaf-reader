# Paperleaf

A private Chinese-language literature workspace with cloud accounts and a Windows desktop client that bundles Codex.

## Features

- Batch PDF import with login-gated GPT title/author/year/venue/DOI/abstract/keyword extraction from the first three pages, generated filenames, retained original filenames, metadata correction/re-identification, duplicate detection, 40 MB per file, owner-scoped D1/R2 storage. Optional plain import uses the original filename without model inference.
- PDF.js reader with selectable text, outlines, search, zoom, reading progress, page-linked highlights and Markdown notes.
- GPT selected-passage translation, opt-in automatic translation, continuous cross-page selection queue, pause/resume, retry, editable bilingual results, note saving and Markdown export.
- Windows 10/11 x64 desktop installer, bundled Electron and official Codex, one-button system-browser OAuth through App Server, account status, models, usage and logout. The browser companion remains available as an advanced option. No API-key fallback.
- Paperleaf username/password accounts, recovery codes, 30-day remembered sessions, password changes and remote session revocation. PDF, metadata, notes, drafts, reading progress, translations, Q&A and reports persist in owner-scoped cloud storage.
- Paper Q&A with selected quotes and optional recent dialogue, full-paper or page-range summaries, clickable PDF citations, and owner-scoped cloud history.
- Structured 6/8/10/12-slide reports, editable preview and real PPTX export with editable text, speaker notes and source page numbers.
- Collections, tags, favorites, light/dark interface, list/grid layouts, private note exports and original PDF downloads.

## Architecture and boundaries

The Site hosts the library and UI. `desktop/` loads the same HTTPS Site in an isolated Electron window, exposes only bounded reading IPC to its exact origin, and runs a bundled native Codex binary. A private loopback bridge is created automatically; its token is never exposed to the renderer. Codex profiles are isolated by the Paperleaf account owner.  `companion/` is a separate Node.js process running on the user's computer: browser -> authenticated loopback HTTP -> Codex App Server over stdio JSON-RPC -> OpenAI. The published download includes source, pinned Codex version, platform launchers and a Chinese setup guide.

Codex authorization stays in the user's isolated local Codex profile. The browser holds only a random per-launch bridge pairing token in sessionStorage. The bridge checks exact Origin, Host and token, binds 127.0.0.1 only, exposes bounded reading tasks (not arbitrary RPC), disables tools and refuses approvals. Codex tokens are never uploaded to the Site. ChatGPT private Site access, Paperleaf records and Codex inference have separate authentication roles. Desktop Chrome/Edge may ask for local-network access. Mobile cannot use another device's loopback service.

The user explicitly enables automatic translation. Continuous mode appends selections without replacing prior results; requests are sequential, can pause after the active segment, and do not automatically retry failures. A task ID deduplicates submissions; cancellation also handles a cancelled-before-create race. Only an actual completed Codex turn becomes a saved result.

Q&A, translations, continuous translation sessions, note drafts, summaries and report originals sync to the private Site; bilingual notes can also be explicitly saved. A pending local draft survives network errors, and successful cloud copies are loaded when reopening. This is online cloud storage, not full offline PDF support or collaborative merging; concurrent draft/session edits use the last successful write. Model context is bounded to 160,000 characters without silent truncation, and page citations are checked for slide output. Text extraction is not OCR or image/figure understanding. Scanned pages require OCR elsewhere. Model access and available quota depend on the signed-in account. Generated content needs comparison with the source.

The previous MyMemory route is retired (HTTP 410), so translation cannot silently use another provider. Existing historical cached rows are preserved but unused.

## Cloud account storage

Each Paperleaf account is bound to its existing trusted Sites identity, preserving existing D1/R2 owner fields and prior documents without migration. New devices must use the same ChatGPT Site access identity and Paperleaf account. The Site remains owner-private; registering does not broaden its audience.

`PAPERLEAF_PASSWORD_PEPPER` is a secret production runtime variable configured in Sites. Do not rotate it independently of a deliberate account credential migration. Passwords use random salts, HMAC-SHA256 with the pepper, and PBKDF2-SHA256 (100,000 iterations within Workers' supported limit). Session and recovery tokens are random 256-bit values; only their SHA-256 digests are stored. Sessions use a Secure, HttpOnly, SameSite=Lax, __Host-prefixed cookie. Five failed attempts block account login/recovery for 15 minutes. Password/recovery changes rotate the recovery code and revoke previous sessions. Recovery codes are displayed only once; there is no email reset provider.

## Development and verification

Vinext, React, PDF.js, Cloudflare Workers, D1, R2; PptxGenJS for client-side export. Preserve Sites Vite integration and hosting manifest.

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-vm-modules scripts/check-api.mjs
node scripts/check-companion.mjs
node scripts/check-codex-protocol.mjs
node scripts/check-pptx.mjs
node scripts/build-desktop.mjs
node scripts/build-installer.mjs
node scripts/check-desktop.mjs
node scripts/package-companion.mjs
```

Build via the Sites build-site.mjs helper and publish the exact pushed source and artifact. Repackage the companion after any companion edits. Applied SQL migrations must not be edited. Sites applies new migrations during deployment.

Verification covers cloud account registration, password hashing, secure cookie properties, recovery rotation, throttling, multi-device sessions, revocation, prior data preservation, draft/translation persistence and owner isolation. Desktop checks cover account gating, parallel initialization, bounded requests, OAuth URL validation, per-account processes and Windows x64 package structure. It also covers actual HTTP bridge security and lifecycle against explicit model fixtures, real installed Codex initialization with an empty isolated account profile (no inference), API routes against SQLite/in-memory R2, and editable PPTX structure with notes/citations. Browser preview covers logged-out connection setup, PDF selection actions, translation controls and report configuration. Real user-account sign-in, quota consumption, OS/browser local-network permission, and authenticated production operations require the user's own computer and are not claimed as tested by these fixtures.

PDF.js assets are self-hosted under public/pdfjs (Apache 2.0). `scripts/create-guide.py` generates the original three-page guide. Codex is an official pinned Apache-2.0 binary bundled in the desktop client (with its LICENSE, NOTICE and complete resources), or installed by the optional browser companion launcher. The Windows EXE is an unsigned, per-user NSIS installer produced on Linux, with desktop/start-menu shortcuts and an uninstaller that preserves account data. Codex protocol decoding and restricted permissions are verified against the pinned real binary; inference responses use fixtures. The installer UI and live model calls still require Windows validation. The download URL and SHA-256 are tracked in `desktop/release.json`; generated binaries remain outside the source repository.
