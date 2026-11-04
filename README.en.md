# Paperleaf

A Chinese-language literature workspace with cloud accounts and a Windows desktop client that bundles Codex.

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

Codex authorization stays in the user's isolated local Codex profile. The browser holds only a random per-launch bridge pairing token in sessionStorage. The bridge checks exact Origin, Host and token, binds 127.0.0.1 only, exposes bounded reading tasks (not arbitrary RPC), disables tools and refuses approvals. Codex tokens are never uploaded to the Site. ChatGPT Site identity, Paperleaf records and Codex inference have separate authentication roles. Desktop Chrome/Edge may ask for local-network access. Mobile cannot use another device's loopback service.

The user explicitly enables automatic translation. Continuous mode appends selections without replacing prior results; requests are sequential, can pause after the active segment, and do not automatically retry failures. A task ID deduplicates submissions; cancellation also handles a cancelled-before-create race. Only an actual completed Codex turn becomes a saved result.

Q&A, translations, continuous translation sessions, note drafts, summaries and report originals sync to the authenticated account; bilingual notes can also be explicitly saved. A pending local draft survives network errors, and successful cloud copies are loaded when reopening. This is online cloud storage, not full offline PDF support or collaborative merging; concurrent draft/session edits use the last successful write. Model context is bounded to 160,000 characters without silent truncation, and page citations are checked for slide output. Text extraction is not OCR or image/figure understanding. Scanned pages require OCR elsewhere. Model access and available quota depend on the signed-in account. Generated content needs comparison with the source.

The previous MyMemory route is retired (HTTP 410), so translation cannot silently use another provider. Existing historical cached rows are preserved but unused.

## Cloud account storage

Each Paperleaf account is bound to its existing trusted Sites identity, preserving existing D1/R2 owner fields and prior documents without migration. New devices must use the same ChatGPT Site access identity and Paperleaf account. The Site is publicly viewable, with editing restricted to its owner. Personal data APIs still require the associated ChatGPT identity and Paperleaf session; public access does not expose documents or notes.

`PAPERLEAF_PASSWORD_PEPPER` is a secret production runtime variable configured in Sites. Do not rotate it independently of a deliberate account credential migration. Passwords use random salts, HMAC-SHA256 with the pepper, and PBKDF2-SHA256 (100,000 iterations within Workers' supported limit). Session and recovery tokens are random 256-bit values; only their SHA-256 digests are stored. Sessions use a Secure, HttpOnly, SameSite=Lax, __Host-prefixed cookie. Five failed attempts block account login/recovery for 15 minutes. Password/recovery changes rotate the recovery code and revoke previous sessions. Recovery codes are displayed only once; there is no email reset provider.

## Development and verification

Vinext, React, PDF.js, Cloudflare Workers, D1, R2; PptxGenJS for client-side export. Preserve Sites Vite integration and hosting manifest.

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-vm-modules scripts/check-api.mjs
node scripts/check-companion.mjs
node scripts/check-codex-protocol.mjs
node scripts/check-pptx.mjs
node scripts/check-updater.mjs
node scripts/check-markdown.mjs
node scripts/check-reading.mjs
node scripts/build-desktop.mjs
node scripts/build-installer.mjs
node scripts/check-desktop.mjs
node scripts/package-companion.mjs
```

Build via the Sites build-site.mjs helper and publish the exact pushed source and artifact. Repackage the companion after any companion edits. Applied SQL migrations must not be edited. Sites applies new migrations during deployment.

Verification covers cloud account registration, password hashing, secure cookie properties, recovery rotation, throttling, multi-device sessions, revocation, prior data preservation, draft/translation persistence and owner isolation. Desktop checks cover account gating, parallel initialization, bounded requests, OAuth URL validation, per-account processes and Windows x64 package structure. It also covers actual HTTP bridge security and lifecycle against explicit model fixtures, real installed Codex initialization with an empty isolated account profile (no inference), API routes against SQLite/in-memory R2, and editable PPTX structure with notes/citations. Browser preview covers logged-out connection setup, PDF selection actions, translation controls and report configuration. The opt-in live bridge test separately verifies real account quota and inference (see version 1.2.0 below). Interactive Windows sign-in, browser local-network permission and authenticated cloud operations are not covered by the offline fixtures.

PDF.js assets are self-hosted under public/pdfjs (Apache 2.0). `scripts/create-guide.py` generates the original three-page guide. Codex is an official pinned Apache-2.0 binary bundled in the desktop client (with its LICENSE, NOTICE and complete resources), or installed by the optional browser companion launcher. The Windows EXE is an unsigned, per-user NSIS installer produced on Linux, with desktop/start-menu shortcuts and an uninstaller that preserves account data. Codex protocol decoding and restricted permissions are verified against the pinned real binary; the offline test uses fixtures, while the opt-in live test makes real model requests. For current verification results see the version 1.2.0 section below. The download URL and SHA-256 are tracked in `desktop/release.json`; generated binaries remain outside the source repository.

## Version 1.2.0

Reading now defaults to continuous vertical scrolling, with a horizontal page mode and a device-local mode preference. Page placeholders keep layout stable while nearby canvases and text layers render on demand. Page progress still syncs to the cloud. Selection captures the source page independently of the scrolling page indicator; cross-page selections direct readers to a translation page range.

The desktop checks `/desktop-update.json` through its authenticated Site session. The UI exposes release notes, download progress, cancellation, hash verification and an explicit quit-and-install action. The feed only permits versioned, same-origin assets; no renderer-provided paths or executable arguments are accepted. `scripts/package-desktop-updates.mjs` runs after the Site build to generate 20 MiB static chunks from the verified installer. Binaries stay outside source Git. Existing 1.1.x clients need a one-time manual installation of 1.2.0.

Installer builds use solid LZMA compression and retain only English, Simplified Chinese and Traditional Chinese Chromium locales. All official Codex resources and licenses remain bundled. The build rejects installers above 245 MiB to leave room within the Site deployment limit. This reduces downloads; it is not a differential updater and updates still download the complete installer. The pinned electron-builder compiler is invoked directly so large payload compression is not killed by the builder's four-minute process timeout.

The Windows sandbox fix uses the portable read-only permissions profile, disables project AGENTS discovery (`project_doc_max_bytes=0`), keeps tools and tool network access disabled, and never falls back to unrestricted execution. Windows standard-user restricted tokens cannot enforce the former root-deny/workspace-read policy.

Validation on 2026-11-04: live signed-in Codex through the production HTTP bridge returned translations, cited answers, metadata, summaries and a six-slide report using gpt-6.1-sol. This consumed real account quota and used a synthetic paper. Reproduce explicitly with `node scripts/check-codex-live.mjs --profile <signed-in-profile>`; credentials are never copied or printed. Windows GitHub Actions separately starts a real Codex thread and verifies the updater. The [released EXE installation check](https://github.com/XCZchaos/paperleaf-reader/actions/runs/41791721574) passed on Windows: SHA-256 and size verification, installation/version registration, a real thread with the installed Codex, and desktop process startup. Interactive Windows OAuth and user-specific networking remain outside CI.

Design references: [Zotero reader](https://www.zotero.org/support/pdf_reader), [Lucide icons](https://lucide.dev/) (already bundled). No remote fonts or decorative network images are required.

## Version 1.3.0

GPT answers, translations and notes now render headings, bold text, lists, tables, code and math. Page citations remain clickable. Raw HTML and remote model-provided images are not executed or fetched. Side panels can be resized by pointer or keyboard and remember their widths. New local brand assets and a credited library photo refresh the interface.

Codex displays actual task stages, elapsed time, output length and public reasoning summaries when provided. Raw internal reasoning is neither retained nor displayed. Account usage supports cached reads, explicit refresh, reset times, stale-data warnings and logout isolation. Reasoning effort choices come from the selected model's supported capabilities and apply to all reading tasks.

Validation on 2026-11-04: production bridge requests completed real translation, Q&A, metadata, summary and six-slide report tasks using gpt-6.1-sol, plus a separate real high-effort Q&A. Offline protocol fixtures verify effort forwarding/rejection, public summary isolation, usage caching/refresh/error/logout and desktop IPC. Markdown rendering/safety checks and account/API tests pass. Browser fixtures verify formatting, quota refresh, effort selection and persistent panel resizing. The real usage endpoint rejected this build environment's token with HTTP 401, so actual remaining quota was not verified; live tasks returned no public reasoning summaries. Interactive Windows OAuth remains outside CI.

The website and GitHub source are public. Website editing remains owner-only; documents and records require login and retain account isolation. See the release notes for the unsigned Windows EXE and release-specific installation checks.

## Version 1.4.0

The interface now uses shadcn/ui components for buttons, form controls, cards, tabs, toggles, progress and accessible dialogs. The library, reader tools, vocabulary and account screens share a restrained forest-green design with light/dark themes. Dialog focus restoration and keyboard tab navigation are verified without interfering with PDF pagination or its selectable text layer.

Persistent conversations support follow-up questions, independent histories, reopening, source quotations, cloud-save retries without another model call, and a bounded recent context window. The progress view shows actual public commentary, plan changes and retry events received from Codex. Public reasoning summaries are displayed only when provided; private reasoning is never collected. Chinese punctuation next to Markdown emphasis now renders correctly. The PDF import modal keeps a fixed frame while filenames and progress change.

Full-paper translation extracts text by page, groups paragraphs from PDF layout, and saves each English/Chinese pair independently. It supports pause-after-current, resume, failed-paragraph retry, source-page navigation, bilingual notes and complete export. Cloud leases prevent two devices from translating the same queued paragraph concurrently. Scanned pages need OCR and complex columns may require checking the extracted order.

Model suggestions are filtered to models and reasoning levels actually advertised by the signed-in account. Translation favors available light models with lower supported effort; metadata, Q&A, summaries and slides have separate suggestions and device-local preferences. These are starting points, not latency guarantees.

When a selected English word is translated, GPT can return its meaning, part of speech, phonetics when known, contextual meaning, self-written examples and related words. Optional automatic collection saves the word with the full answer and source page to an owner-scoped cloud vocabulary book. The book supports search, learned/review states, source navigation and export. Repeated words merge while preserving mastery and recent sources. Word detection is decided by GPT, with validated structured output; full paragraphs are not collected.

Versioned external Paperleaf icons are explicitly assigned to Windows desktop/start-menu shortcuts and uninstall registration. Packaging checks compare all embedded EXE icon sizes and the external icon with the brand source.

Validation on 2026-11-04: real gpt-6.1-sol requests passed two-turn contextual Q&A, paragraph translation, metadata, summary and slide generation. Real gpt-6-luna with low effort identified a single word and rejected a multi-word phrase for vocabulary collection. These calls returned no public reasoning summary. Offline API tests cover tenant isolation, conversation parents, paragraph leases, retry idempotence and vocabulary deduplication; marked browser fixtures cover UI interactions. Interactive Windows OAuth and user-specific network conditions remain outside these checks. See the GitHub release for released-installer Windows CI.

## Version 1.4.1

Paperleaf now uses an archive-inspired paper/ink design across the shadcn library, reader and account screens. A dedicated ChatGPT-authenticated Responses provider uses HTTP/SSE without WebSocket setup, keeping Codex login and account usage intact. Retry events retain their real count and timing while distinguishing service, rate-limit, auth, stream, connection, timeout and request errors; unknown reasons stay unknown. Raw upstream diagnostics never enter progress history. The connection self-test reports first output, elapsed time and retries.

Eight real gpt-6.1-terra low-effort tasks completed with zero retries on short synthetic material (first output 1.50–2.47 seconds), including contextual follow-up, translation, metadata, summary and structured slides. The original issue was not reproduced on this network; these results are not a speed guarantee. The usage-refresh endpoint still rejected this test profile with HTTP 401 and the UI correctly retains its stale-data warning. See [release notes](docs/releases/v1.4.1.md) for validation boundaries.
