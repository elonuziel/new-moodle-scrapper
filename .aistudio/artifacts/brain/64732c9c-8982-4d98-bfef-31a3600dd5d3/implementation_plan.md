# Moodle Course Downloader — Android Debug APK & Automated Version Bump + Release Pipeline

A mobile-first and responsive web application packaged as a native Android Debug APK via Capacitor, featuring dual Moodle authentication (in-app WebView login with automatic cookie interception plus manual `MoodleSession` cookie entry), selective section/resource downloading, archive unpacking, and an automated GitHub Actions CI/CD pipeline that automatically bumps the version, syncs Android `versionCode`/`versionName`, compiles the Debug APK (`assembleDebug`), creates a new `v*` Git tag, and publishes the APK to GitHub Releases.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and workflow decisions have been updated to incorporate your feedback:

- **Confirmed Stack**: **Capacitor + React + TypeScript** — Provides a live, interactive web workspace here in preview (backed by an Express server proxy for CORS-free Moodle scraping) while compiling directly into a standalone native Android Debug APK.
- **Confirmed APK Build Type**: **Debug APK Only (`assembleDebug`)** — Builds `app-debug.apk` (renamed to `moodle-downloader-v{version}-debug.apk`), which Gradle automatically signs with a debug key so it installs directly on any Android phone without requiring custom release keystores or secrets.
- **Confirmed Authentication**: **Dual Mode (In-App WebView Login + Manual Cookie Input)** — Users on Android can log in directly through a native WebView (supporting Microsoft/Office 365 SSO, SAML, and 2FA prompts) to automatically capture the `MoodleSession` cookie, or paste a cookie manually with an integrated 1-tap mobile bookmarklet helper.
- **Confirmed CI/CD & Auto-Versioning Pipeline**: **Automated Version Bump + Git Tag + GitHub Release** — On every push to `main` (or manual dispatch), the GitHub Actions pipeline automatically calculates the next semantic version (e.g., `v1.0.1` -> `v1.0.2`, or minor/major via commit message conventions/dispatch input), bumps `package.json` and Android `versionCode`/`versionName`, builds the Debug APK, uploads it to Actions Artifacts, pushes the new `v*` Git tag, and creates a GitHub Release with the `.apk` attached.

---

## 1. Overview & Core Concept

- **What It Does**: Connects to any Moodle instance (defaulting to `moodle.ruppin.ac.il` with full support for custom university domains), authenticates the student session, parses all course sections and nested resources (`resource`, `folder`, `assign`, `page`), lets the user filter and select specific sections or files, and downloads them either directly to the Android device storage or as an organized, UTF-8 safe ZIP archive.
- **Target Audience / Persona**: University and college students who want fast, offline access to all course presentations, PDFs, homework assignments, and unpacked folder archives on their Android phone or desktop without clicking dozens of links manually.
- **Key Value**: Eliminates browser CORS blocks and tedious manual downloads while preserving full compatibility with university 2FA/SSO and delivering zero-touch automated versioned Debug APK releases on GitHub.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Authentication & Course Selection**: User enters a course ID (e.g., `1234`) or full Moodle URL, and chooses between **In-App WebView Login** (opens an interactive login sheet/bridge that detects `MoodleSession` upon completion) or **Manual Cookie Entry** (with a 1-click copyable mobile bookmarklet for Chrome/Firefox). Includes an instant **"Try Demo Course"** mode so users can test parsing and downloading immediately without credentials.
  2. **Course Inspection & Selective Filtering**: Once scanned, the app displays the course title, student name, total resource count, and an interactive section-by-section tree. Users can search resources by keyword, filter by activity type (`Files`, `Folders`, `Assignments`, `Pages`), or toggle individual sections/files.
  3. **Download & Packaging Execution**: Tapping the primary download CTA triggers parallel fetching with real-time progress metrics, tabular byte counters, automatic `.zip` folder extraction if enabled, and saves the organized course bundle to the device.
  4. **APK & CI/CD Pipeline Inspector**: A dedicated view provides the 1-click mobile cookie bookmarklet, Termux/Android setup helpers, and live visibility into the Capacitor configuration, auto-versioning script, and GitHub Actions Debug APK release workflow.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft academic utility combining mobile touch ergonomics with crisp SaaS dashboard data density.
  - *Color Palette & Mood* (60-30-10 allocation):
    - **60% Dominant Neutral Canvas**: Crisp cool alabaster (`#F8FAFC` / `bg-slate-50`) in light posture, paired with pure white structural surfaces (`#FFFFFF`).
    - **30% Structural Surfaces & Typography**: Deep slate ink (`#0F172A` / `text-slate-900`) for primary hierarchy, muted slate (`#475569` / `text-slate-600`) for metadata, and hairline borders (`#E2E8F0` / `border-slate-200`).
    - **10% Accent Budget**: Academic Indigo (`#4F46E5` / `bg-indigo-600`) for primary CTAs and active states, supported by semantic Emerald (`#16A34A`) for completed downloads, Amber (`#D97706`) for nested unpack warnings, and Crimson (`#DC2626`) for auth/network errors.
  - *Typography & Hierarchy*:
    - **Display / Headings**: `Plus Jakarta Sans` (SemiBold/Bold 600–700, tight tracking, `text-wrap: balance`).
    - **Body & Controls**: `DM Sans` (Regular 400 / Medium 500, single-line `whitespace-nowrap` on all buttons and tabs).
    - **Metrics, File Sizes & Logs**: `JetBrains Mono` with `tabular-nums` for vertical alignment of file counts, download percentages, and byte sizes.
  - *Component Styling & Ergonomics*:
    - **Desktop Viewport ($1440\text{px}$)**: Full-width `max-w-7xl` 2-column split workspace (Authentication & Download Configuration on the left; Course Explorer, Resource Tree, and Progress Console on the right).
    - **Mobile Viewport ($375\text{px}$–$430\text{px}$)**: Touch-first layout with $\ge 44\times 44\text{px}$ hitboxes, single-level card elevation (`rounded-2xl border border-slate-200`), sticky bottom primary download bar within the 15% mobile sticky cap, and clean unboxed metadata (`PDF · 2.4 MB · Section 3`).

- **Interactive Feedback & Motion**:
  - Fast $\le 150\text{ms}$ button press and tab transition feedback using compositor-only `transform` and `opacity`.
  - Skeleton loading rows during course HTML scraping, deterministic progress bars during multi-file downloads, and clear error banners with actionable troubleshooting tips when a session cookie expires.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual Execution Transport (Capacitor Native HTTP + Express Proxy)**
  - *Chosen Approach*: Abstract network requests through a unified Moodle client service. When running inside the compiled Android APK, use Capacitor's native HTTP/WebView bridge to bypass browser CORS directly on the phone. When running in the web preview, route requests through a lightweight Express proxy (`server.ts` on port 3000) that forwards the `MoodleSession` cookie and streams course resources.
  - *Why*: Guarantees the app works identically in both the live web preview and the standalone Android APK without CORS failures.

- **Decision 2: Debug APK Only (`assembleDebug`)**
  - *Chosen Approach*: Configure Gradle and the GitHub Actions workflow to build only the Debug APK (`./gradlew assembleDebug`), outputting a pre-signed, ready-to-install `moodle-downloader-v{version}-debug.apk`.
  - *Why*: Faster build times, zero keystore secret management overhead, allows HTTP/HTTPS inspection and WebView cookie access without strict release certificate pinning, and installs cleanly on Android devices right out of the box.

- **Decision 3: Automated Semantic Version Bump, Git Tagging & Release Export**
  - *Chosen Approach*: Include a version bump script and GitHub Actions step that reads the latest Git tag (or `package.json` version), increments the version (`patch` by default, or `minor`/`major` via commit tag or manual workflow input), updates `package.json` and `android/app/build.gradle` (`versionCode` + `versionName`), commits/tags `v{version}` (using `[skip ci]` on version commits to prevent infinite loops), uploads the Debug APK as a build artifact, and publishes a GitHub Release with release notes and the `.apk` binary attached.
  - *Why*: Eliminates manual version editing and manual tagging—every merge or push produces a cleanly numbered, traceable APK release automatically.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   Top Navigation Bar (3-Zone Contract)                     │
│  [MoodleDownloader]   [Workspace · Course Tree · Android APK · Guide] [CTA]│
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┴─────────────────────────────┐
        ▼                                                           ▼
┌───────────────────────────────────────┐   ┌────────────────────────────────┐
│     Auth & Config Panel (Left Col)    │   │  Course Explorer & Downloader  │
│ ┌───────────────────────────────────┐ │   │ ┌────────────────────────────┐ │
│ │ Auth Mode Switcher                │ │   │ │ Course Summary Bar         │ │
│ │ • In-App WebView SSO/2FA Login    │ │   │ │ • Title, Sections, Count   │ │
│ │ • Manual Cookie + Bookmarklet     │ │   │ │ • Search & ModType Filter  │ │
│ └─────────────────┬─────────────────┘ │   │ └──────────────┬─────────────┘ │
│                   ▼                   │   │                ▼               │
│ ┌───────────────────────────────────┐ │   │ ┌────────────────────────────┐ │
│ │ Course Input & Options            │ │   │ │ Interactive Section Tree   │ │
│ │ • Site URL & Course ID Resolver   │ │   │ │ • Toggle Sections / Items  │ │
│ │ • Include Nested (Assign/Pages)   │ │   │ │ • Unboxed File Metadata    │ │
│ │ • Auto-Unpack Folder ZIPs         │ │   │ └──────────────┬─────────────┘ │
│ └─────────────────┬─────────────────┘ │   │                ▼               │
└───────────────────┼───────────────────┘   │ ┌────────────────────────────┐ │
                    │                       │ │ Download & Progress Engine │ │
                    └──────────────────────►│ │ • Parallel Worker Queue    │ │
                                            │ │ • JSZip / Native File Save │ │
                                            │ └────────────────────────────┘ │
                                            └────────────────┬───────────────┘
                                                             │
                    ┌────────────────────────────────────────┴───────┐
                    ▼                                                ▼
┌───────────────────────────────────────┐   ┌────────────────────────────────┐
│   Capacitor Native Bridge (Android)   │   │  Express Proxy Server (Web)    │
│ • Android WebView CookieManager       │   │ • /api/moodle/parse            │
│ • CapacitorHttp & Filesystem Storage  │   │ • /api/moodle/download         │
│ • Native Android Gradle Project       │   │ • Streams & Unpacks Archives   │
└───────────────────┬───────────────────┘   └────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                GitHub Actions CI/CD (.github/workflows)                    │
│  [Push / Dispatch] ──► [Auto Bump Version & Sync Android versionCode]      │
│     ──► [Vite Build & Cap Sync] ──► [./gradlew assembleDebug]              │
│     ──► [Create Git Tag vX.Y.Z] ──► [Upload Artifact & GitHub Release APK] │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **`AuthSessionState`**: Stores `siteUrl` (default `https://moodle.ruppin.ac.il`), `courseInput` (ID or URL), `authMethod` (`'webview' | 'cookie'`), `moodleCookie`, `isAuthenticated`, and `userName`.
- **`CourseInfo` & `CourseSection[]`**: Represents the parsed Moodle course hierarchy, containing `ActivityItem` entries (`id`, `title`, `href`, `modType`, `sectionName`, `selected`, and optional `nestedFiles`).
- **`DownloadOptions`**: Controls `includeNested` (assignments & pages), `autoUnpack` (extracting Moodle folder `.zip` bundles into section subfolders), `concurrency` (1–10 parallel workers), and `outputName`.
- **`DownloadProgressState`**: Tracks `status` (`idle | parsing | downloading | packaging | completed | error`), `downloadedFiles`, `totalFiles`, `totalBytes`, active activity title, structured log entries, and the resulting downloadable ZIP blob or Android filesystem path.

### Interactive Component & State Mapping

1. **Auth & WebView Login Modal**:
   - Switching between *In-App WebView Login* and *Manual Cookie* updates `authMethod`.
   - Launching the WebView login opens an interactive login bridge (in Android APK, launches the native Moodle login view and polls `CookieManager` for `MoodleSession`; in web preview, provides an interactive credential/cookie handshake and a 1-click Demo Course loader).
2. **Course Scraper & Section Filter**:
   - Submitting the Course ID/URL invokes `resolveCourseUrl`, fetches the course HTML via the active transport, and runs `parseCourseActivitiesFromHtml` to populate `CourseInfo`.
   - Search input and activity type segmented buttons (`All`, `Files`, `Folders`, `Assignments`, `Pages`) filter visible items in real time without losing selection state.
   - Section checkboxes toggle all child `ActivityItem.selected` states and recalculate the selected download counter.
3. **Parallel Download & Archive Packaging**:
   - Clicking **Download Selected** iterates over selected items using a concurrent worker pool, resolves nested links inside `mod/assign` and `mod/page` if `includeNested` is enabled, unpacks `mod/folder` ZIP streams when `autoUnpack` is enabled, and constructs a clean UTF-8 organized archive (`{Section}/{Filename}`) saved directly to the user's device.
