# Running Moodle Downloader on Android: Debug APK & Termux Guide

This repository now includes a full **Capacitor + React Android Debug APK** architecture alongside an automated **GitHub Actions CI/CD pipeline** (`.github/workflows/build-debug-apk.yml`) that automatically bumps the semantic version, tags `vX.Y.Z`, compiles `assembleDebug`, and exports the installable APK to **GitHub Releases** and **Actions Artifacts**.

---

## 1. Automated Android Debug APK & GitHub Releases Pipeline

### How the Pipeline Works (`.github/workflows/build-debug-apk.yml`)
1. **Trigger**: Runs automatically on every `push` to `main`/`master` (or manually via `workflow_dispatch` with a selectable `patch`, `minor`, or `major` bump).
2. **Auto-Bump & Git Tagging (`scripts/bump-version.mjs`)**:
   - Increments the semantic version in `package.json` (e.g., `1.0.0` -> `1.0.1`, or `minor`/`major` if the commit message contains `#minor` or `#major`).
   - Calculates the integer Android `versionCode` (`major * 10000 + minor * 100 + patch`) and syncs `android/app/build.gradle`.
   - Commits the updated version with `[skip ci]` and pushes the new Git tag `vX.Y.Z`.
3. **Debug APK Compilation (`./gradlew assembleDebug`)**:
   - Builds the production React bundle (`npm run build`), syncs the Capacitor Android native project (`npx cap sync android`), and runs `./gradlew assembleDebug`.
   - Because Gradle signs Debug APKs automatically with an Android debug key, the resulting `moodle-downloader-vX.Y.Z-debug.apk` installs immediately on any Android phone without needing custom keystore secrets.
4. **Artifact & Release Export**:
   - Uploads `moodle-downloader-vX.Y.Z-debug.apk` to **GitHub Actions Artifacts**.
   - Automatically publishes a **GitHub Release** for tag `vX.Y.Z` with the `.apk` binary attached.

### Installing the APK on Your Phone
1. Open your GitHub repository's **Releases** page on your Android phone.
2. Download `moodle-downloader-vX.Y.Z-debug.apk` from the latest release.
3. Tap to install and open **Moodle Course Downloader**.
4. Authenticate using either **In-App WebView Login** (supports Microsoft 365 SSO and 2FA) or **Manual Cookie Input** (using the 1-tap bookmarklet below).

---

## 2. Mobile Browser 1-Tap Cookie Bookmarklet

If you want to grab your `MoodleSession` cookie from Chrome or Firefox on Android in 2 seconds:

1. Create a new bookmark named **`Get Moodle Cookie`**.
2. Paste this URL as the bookmark address:
   ```javascript
   javascript:(function(){var m=document.cookie.match(/MoodleSession=([^;]+)/);if(m){prompt('Copy your MoodleSession cookie:',m[1]);}else{alert('MoodleSession cookie not found. Please log in to Moodle first!');}})();
   ```
3. Log in to your university Moodle site, type `Get Moodle Cookie` in the address bar, tap the bookmark, and copy the token.

---

## 3. Alternative: Running the Python CLI in Termux

If you prefer running the Python CLI script (`moodle_downloader.py`) inside a Linux terminal on Android:

1. Install **Termux** from **[F-Droid](https://f-droid.org/packages/com.termux/)** or GitHub Releases.
2. Run the following commands in Termux:
   ```bash
   pkg update -y && pkg upgrade -y
   termux-setup-storage
   pkg install python git -y
   pip install requests beautifulsoup4 urllib3
   ```
3. Run the script and save directly to your phone's `Downloads` folder:
   ```bash
   python moodle_downloader.py \
     --url "https://moodle.ruppin.ac.il/course/view.php?id=1234" \
     --cookie "PASTE_YOUR_COOKIE_HERE" \
     --output "$HOME/storage/shared/Download/Moodle_Course_1234"
   ```

---

## 4. Architecture Comparison Summary

| Approach | Feasibility | SSO & 2FA Handling | Output Location |
|---|---|---|---|
| **1. Capacitor Android Debug APK** | ⭐⭐⭐⭐⭐ **Best Mobile UX** | In-App WebView + `CookieManager` or Manual Cookie | `/storage/emulated/0/Download/` |
| **2. Termux Terminal (Python CLI)** | ⭐⭐⭐⭐⭐ **Best CLI Option** | Mobile Browser Bookmarklet Cookie Paste | `~/storage/shared/Download/` |
| **3. Static Site on GitHub Pages** | ❌ **Blocked by CORS** | Cannot bypass CORS or read `HttpOnly` cookies | N/A |
