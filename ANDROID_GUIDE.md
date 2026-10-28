# Running Moodle Downloader on Android: Feasibility, Research & Implementation Guide

This guide breaks down the best approaches to run the Moodle Course Material Downloader on an Android device, specifically addressing authentication, credential security, SSO/2FA, and file access.

---

## 1. Executive Summary & Comparison

| Approach | Feasibility | Setup Effort | Credential & 2FA Handling | Best For |
|---|---|---|---|---|
| **1. GitHub Pages (Static Site)** | ❌ **Impossible** | N/A | Cannot bypass CORS or access Moodle cookies | Do not attempt without a dedicated backend server |
| **2. Terminal on Android (Termux)** | ⭐⭐⭐⭐⭐ **Best & Fastest** | Low (5–10 min) | Log in via phone browser, paste cookie or run pure script | **Immediate use** without rewriting code |
| **3. Dedicated Android App (APK)** | ⭐⭐⭐⭐ **Best User Experience** | High (days to build) | Built-in `WebView` seamlessly handles SSO & 2FA | Polished standalone app for long-term use |
| **4. Self-Hosted Server / Telegram Bot** | ⭐⭐⭐⭐ **Very Convenient** | Medium (30 min) | Handled on home server / VPS | Downloading to cloud/phone on demand |

---

## 2. In-Depth Analysis of Your Three Ideas

### Option A: Static Site on GitHub Pages
> *"site on gh pages?"*

**Verdict: ❌ Technically impossible as a purely client-side static site.**

**Why GitHub Pages cannot do this directly:**
1. **CORS Restrictions (Cross-Origin Resource Sharing):**
   - GitHub Pages is strictly static file hosting (HTML/CSS/JS).
   - When JavaScript running on `https://yourusername.github.io` tries to fetch files or HTML from `https://moodle.your-university.ac.il`, the browser's security sandbox blocks the request unless Moodle explicitly sends the header `Access-Control-Allow-Origin: https://yourusername.github.io`.
   - University Moodle systems **never** enable wildcard CORS headers for security reasons.
2. **Cookie & Credential Isolation:**
   - Browsers prevent scripts on one domain (GitHub Pages) from reading or writing session cookies for another domain (Moodle).
   - Even if you are logged into Moodle in another tab, your GitHub Pages script cannot read your `MoodleSession` cookie due to the browser's `Same-Origin Policy` and `HttpOnly` flags.
3. **What if you add a backend proxy?**
   - If you deploy a backend server (e.g., on Render, Railway, or AWS) to proxy the requests, it is no longer just GitHub Pages.
   - More importantly, **you would be sending your personal university credentials or session cookies to a third-party server**, posing serious privacy and security risks.

---

### Option B: Terminal on Android (Termux)
> *"download and use in a terminal?"*

**Verdict: ⭐⭐⭐⭐⭐ The Best, Fastest & Most Direct Solution.**

Termux is a full-fledged Linux environment that runs directly on Android without requiring root. It supports Python 3, `pip`, `requests`, `beautifulsoup4`, and Android storage access.

#### Why it works so well:
- **Zero code rewrites:** Uses the exact Python codebase.
- **Direct storage integration:** With `termux-setup-storage`, files are saved directly into your phone’s regular `Downloads` folder, accessible via the Files app, Google Drive, or any file manager.
- **Privacy & Security:** Everything runs locally on your phone. No credentials leave your device.

#### How to handle Moodle Authentication on Termux:
- **The Playwright limitation:** Playwright uses desktop Chromium binaries compiled for standard Linux `glibc`. Standard Termux uses Android's `bionic` libc, so running headless Playwright directly in base Termux is tricky (requires `proot-distro` Ubuntu).
- **The 5-Second Solution (Cookie Bookmarklet):** 
  Log in to your Moodle site normally on your phone’s browser (Chrome, Firefox, Samsung Internet, or Kiwi Browser). Use a simple 1-click bookmarklet or developer tools to copy your `MoodleSession` cookie, then paste it into Termux.
  Because Moodle session cookies usually last for days or weeks, you only have to do this once per session!

---

### Option C: Build a Dedicated Android App (APK)
> *"create apk?"*

**Verdict: ⭐⭐⭐⭐ The Best Mobile Experience (if you want a full mobile app).**

If you want an app with a graphical user interface where you don't touch a terminal, an APK is the right path.

#### The Ideal Architecture for an APK:
1. **In-App WebView for Login:**
   - The app opens a native Android `WebView` pointing to your Moodle login page.
   - You log in just like in a browser. This naturally supports:
     - Microsoft / Office 365 SSO
     - 2FA / Authenticator apps / SMS codes
     - University single-sign-on (SAML)
2. **Cookie Interception:**
   - Once the WebView detects you reached the Moodle dashboard, the app extracts the session cookies using Android’s native `CookieManager.getInstance().getCookie(url)`.
3. **Background Download Engine:**
   - The app parses the course HTML using an HTTP library (e.g., `http` in Flutter, `OkHttp` in Kotlin, or `Axios` in React Native).
   - Files are downloaded into the device’s public `Download/` folder using Android's native `DownloadManager`.
4. **Recommended Frameworks:**
   - **Flutter (Dart):** Easiest cross-platform choice with great file handling and WebView support (`webview_flutter`, `dio`).
   - **Kotlin / Jetpack Compose:** Pure native Android performance.
   - *Note on Python-to-APK (Kivy / BeeWare / Chaquopy):* While possible, packaging Python on Android often leads to large APK sizes (40MB+) and complex permission issues compared to a lightweight Flutter or Kotlin app.

---

## 3. Practical Step-by-Step Guide: Running via Termux (Today)

Follow these steps to run the downloader on your Android device right now:

### Step 1: Install Termux
1. **Do NOT install Termux from Google Play** (the Play Store version is obsolete and has broken package mirrors).
2. Download and install Termux from **[F-Droid](https://f-droid.org/packages/com.termux/)** or the official **[Termux GitHub Releases](https://github.com/termux/termux-app/releases)**.

### Step 2: Set Up the Environment
Open Termux and run the following commands:

```bash
# 1. Update package lists
pkg update -y && pkg upgrade -y

# 2. Grant Termux access to your phone's storage
termux-setup-storage
# (Tap 'Allow' on the Android permission popup)

# 3. Install Python, Git, and build tools
pkg install python git clang -y

# 4. Clone or download your repository
git clone https://github.com/your-username/moodle-downloader.git
cd moodle-downloader

# 5. Install required Python packages (excluding Playwright)
pip install requests beautifulsoup4 urllib3
```

### Step 3: Getting Your Moodle Cookie on Android in 5 Seconds

Since mobile browsers don't have standard F12 DevTools, use this simple **JavaScript Bookmarklet**:

1. In Chrome / Firefox / Samsung Internet on your phone, create a new bookmark named **"Get Moodle Cookie"**.
2. Set its URL to:
   ```javascript
   javascript:(function(){var m=document.cookie.match(/MoodleSession=([^;]+)/);if(m){prompt('Copy your MoodleSession cookie:',m[1]);}else{alert('MoodleSession cookie not found. Make sure you are logged in!');}})();
   ```
3. Log in to your Moodle site in your phone browser.
4. Tap the address bar, type `Get Moodle Cookie`, and tap the bookmark.
5. A popup will appear containing your session cookie. Copy it to your clipboard.

### Step 4: Run the Downloader

Run the downloader pointing to your Android `Downloads` directory:

```bash
python moodle_downloader.py \
  --url "https://moodle.your-site.ac.il/course/view.php?id=1234" \
  --cookie "PASTE_YOUR_COOKIE_HERE" \
  --output "$HOME/storage/shared/Download/Moodle_Course_1234"
```

The files will download in parallel and be organized into sections directly inside your phone's **Downloads/Moodle_Course_1234** folder.

---

## 4. Alternative: 1-Tap Home Screen Shortcut (Termux:Widget)

If you use Termux, you can make this a 1-tap experience:
1. Install **Termux:Widget** from F-Droid.
2. Create a script at `~/.shortcuts/download_moodle.sh`:
   ```bash
   #!/data/data/com.termux/files/usr/bin/bash
   echo "Enter Moodle Course ID or URL:"
   read course
   echo "Enter MoodleSession Cookie:"
   read cookie
   cd ~/moodle-downloader
   python moodle_downloader.py --url "$course" --cookie "$cookie" --output "$HOME/storage/shared/Download/Moodle"
   ```
3. Add the Termux widget to your Android home screen. Tapping it will open a prompt, download the files, and close when done!

---

## 5. Architectural Blueprint: If You Choose to Build an APK

If you decide to build a dedicated Android APK in the future, follow this recommended architecture:

```
+-------------------------------------------------------------+
|                      Android APK                            |
|                                                             |
|  [ Step 1: Login ]                                          |
|  +-------------------------------------------------------+  |
|  | Native Android WebView                                |  |
|  | -> Loads https://moodle.site.ac.il/login              |  |
|  | -> User performs standard SSO / MFA / Authenticator   |  |
|  +-------------------------------------------------------+  |
|                           |                                 |
|  [ Step 2: Intercept ]    v                                 |
|  CookieManager.getInstance().getCookie(siteUrl)             |
|  Extract 'MoodleSession' cookie                             |
|                           |                                 |
|  [ Step 3: Scraping & Extraction ]                          |
|  Http client fetches course HTML                            |
|  HTML Parser extracts sections, resources & folder links    |
|                           |                                 |
|  [ Step 4: Downloader Engine ]                              |
|  Android DownloadManager or background worker               |
|  Saves files to: /storage/emulated/0/Download/Moodle/       |
+-------------------------------------------------------------+
```

### Why this architecture wins:
1. **Never stores your password:** The app doesn't need to know or store your password; it only holds the temporary session cookie.
2. **Handles any SSO/MFA:** Microsoft Authenticator, Google Authenticator, SMS, or CAPTCHA work out of the box because the authentication happens in an actual browser environment.
3. **Native file system integration:** Downloaded files are immediately indexed by Android's media store and visible in all file viewers.

---

## 6. Recommendations & Next Steps

1. **For Immediate Use:**
   - Use **Termux** + the **Cookie Bookmarklet**. You can be downloading your courses directly to your phone within 10 minutes without writing new code.
2. **For Sharing with Non-Technical Friends / Students:**
   - Consider building a lightweight **Flutter or Kotlin APK** using the WebView + CookieManager architecture described above.
3. **Avoid GitHub Pages for this task:**
   - Due to CORS, cookie isolation, and credential security, static hosting is not suitable for authenticated Moodle scrapers.
