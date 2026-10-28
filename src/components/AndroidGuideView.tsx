import React, { useState } from 'react';
import { Copy, Check, Terminal, Smartphone, ShieldAlert } from 'lucide-react';
import { MOBILE_COOKIE_BOOKMARKLET } from '../lib/moodle-client';

export const AndroidGuideView: React.FC = () => {
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const [copiedTermux, setCopiedTermux] = useState(false);

  const termuxScript = `pkg update -y && pkg install python git -y
termux-setup-storage
pip install requests beautifulsoup4 urllib3
python moodle_downloader.py --url "https://moodle.ruppin.ac.il/course/view.php?id=1234" --cookie "PASTE_COOKIE" --output "$HOME/storage/shared/Download/Moodle_Course"`;

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(MOBILE_COOKIE_BOOKMARKLET);
      setCopiedBookmarklet(true);
      setTimeout(() => setCopiedBookmarklet(false), 2000);
    } catch {
      // ignore
    }
  };

  const copyTermux = async () => {
    try {
      await navigator.clipboard.writeText(termuxScript);
      setCopiedTermux(true);
      setTimeout(() => setCopiedTermux(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-xl font-bold text-slate-900">
          Android Deployment & Authentication Architecture Guide
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
          This reference summarizes the architectural trade-offs between the standalone Capacitor Debug APK, running the Python CLI directly inside Termux on Android, and why static hosting on GitHub Pages cannot authenticate with university Moodle servers.
        </p>

        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-4">Approach</th>
                <th className="py-3 px-4">Feasibility</th>
                <th className="py-3 px-4">SSO & 2FA Handling</th>
                <th className="py-3 pl-4">Storage Output</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-slate-900">
                  1. Capacitor Android Debug APK
                </td>
                <td className="py-3.5 px-4 text-emerald-700 font-medium">
                  Recommended Mobile App
                </td>
                <td className="py-3.5 px-4 text-slate-600">
                  In-App WebView + CookieManager or Manual Cookie
                </td>
                <td className="py-3.5 pl-4 font-mono text-slate-700">
                  /storage/emulated/0/Download/
                </td>
              </tr>
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-slate-900">
                  2. Termux Terminal (Python CLI)
                </td>
                <td className="py-3.5 px-4 text-emerald-700 font-medium">
                  Best for CLI Users
                </td>
                <td className="py-3.5 px-4 text-slate-600">
                  1-Tap Mobile Browser Bookmarklet Cookie Paste
                </td>
                <td className="py-3.5 pl-4 font-mono text-slate-700">
                  ~/storage/shared/Download/
                </td>
              </tr>
              <tr>
                <td className="py-3.5 pr-4 font-semibold text-slate-900">
                  3. Static Site on GitHub Pages
                </td>
                <td className="py-3.5 px-4 text-red-600 font-medium">
                  Blocked by Browser CORS
                </td>
                <td className="py-3.5 px-4 text-slate-600">
                  Cannot read HttpOnly cookies across domains
                </td>
                <td className="py-3.5 pl-4 text-slate-500">N/A</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Installing Debug APK from Releases */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">
              Option A: Installing the Debug APK from GitHub Releases
            </h3>
          </div>
          <ol className="space-y-2.5 text-xs text-slate-600 list-decimal list-inside leading-relaxed">
            <li>
              Push any commit to <code className="font-mono text-slate-800">main</code> (or trigger the workflow in the <strong>Actions</strong> tab on GitHub).
            </li>
            <li>
              GitHub Actions automatically bumps the semantic version, tags <code className="font-mono text-slate-800">vX.Y.Z</code>, builds <code className="font-mono text-slate-800">assembleDebug</code>, and publishes a new GitHub Release.
            </li>
            <li>
              On your Android phone, open your repository’s <strong>Releases</strong> page and download <code className="font-mono text-slate-800">moodle-downloader-vX.Y.Z-debug.apk</code>.
            </li>
            <li>
              Tap the downloaded APK to install. Because Gradle signs Debug APKs automatically, Android installs it cleanly without needing a custom release keystore.
            </li>
          </ol>

          <div className="pt-2 space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              1-Tap Mobile Browser Cookie Bookmarklet
            </div>
            <p className="text-xs text-slate-500">
              Save this bookmark in Chrome or Firefox on Android to copy your <code className="font-mono">MoodleSession</code> cookie anytime:
            </p>
            <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">
              <code>{MOBILE_COOKIE_BOOKMARKLET}</code>
            </div>
            <button
              type="button"
              onClick={copyBookmarklet}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {copiedBookmarklet ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Copied Bookmarklet</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Mobile Bookmarklet</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Card 2: Termux CLI Alternative */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">
              Option B: Running the Python Script in Termux
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            If you also want to run <code className="font-mono text-slate-800">moodle_downloader.py</code> directly inside an Android terminal using Termux (installed from F-Droid), run these setup commands:
          </p>
          <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed">
            <code>{termuxScript}</code>
          </pre>
          <button
            type="button"
            onClick={copyTermux}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {copiedTermux ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Copied Termux Commands</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Termux Setup Commands</span>
              </>
            )}
          </button>

          <div className="pt-2 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              <strong>Why not GitHub Pages?</strong> Static sites on <code className="font-mono">*.github.io</code> are blocked by browser CORS policies when requesting university Moodle pages and cannot read <code className="font-mono">HttpOnly</code> session cookies. Both the Capacitor APK and Termux bypass browser CORS completely.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
