import React, { useState } from 'react';
import {
  X,
  Lock,
  Check,
  Copy,
  AlertCircle,
  Loader2,
  Smartphone,
  KeyRound,
} from 'lucide-react';
import { CapacitorCookies } from '@capacitor/core';
import {
  loginToMoodleDirect,
  isNativeAndroid,
  MOBILE_COOKIE_BOOKMARKLET,
} from '../lib/moodle-client';

interface WebViewLoginModalProps {
  isOpen: boolean;
  siteUrl: string;
  onClose: () => void;
  onSuccessCookie: (cookie: string, methodLabel: string) => void;
}

export const WebViewLoginModal: React.FC<WebViewLoginModalProps> = ({
  isOpen,
  siteUrl,
  onClose,
  onSuccessCookie,
}) => {
  const [activeTab, setActiveTab] = useState<'webview' | 'credentials' | 'bookmarklet'>('webview');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [manualPasteCookie, setManualPasteCookie] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const [ssoStep, setSsoStep] = useState<'ready' | 'authenticating' | 'captured'>('ready');

  if (!isOpen) return null;

  const cleanSite = siteUrl.trim().replace(/\/+$/, '') || 'https://moodle.ruppin.ac.il';
  const loginTargetUrl = `${cleanSite}/login/index.php`;

  const handleNativeCookieCapture = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    setSsoStep('authenticating');

    try {
      if (isNativeAndroid()) {
        const cookies = await CapacitorCookies.getCookies({ url: cleanSite });
        if (cookies && cookies.MoodleSession) {
          setSsoStep('captured');
          onSuccessCookie(cookies.MoodleSession, 'Android WebView CookieManager');
          onClose();
          return;
        }
      }

      const match = document.cookie.match(/MoodleSession=([^;]+)/);
      if (match && match[1]) {
        setSsoStep('captured');
        onSuccessCookie(match[1], 'WebView Session');
        onClose();
        return;
      }

      setErrorMsg(
        'No active MoodleSession cookie detected in WebView storage yet. Complete your login on the Moodle site, use Direct Credentials, or paste your cookie via the Mobile Bookmarklet tab.'
      );
      setSsoStep('ready');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to read WebView CookieManager');
      setSsoStep('ready');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Please enter both your Moodle username and password.');
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);
    try {
      const result = await loginToMoodleDirect(cleanSite, username.trim(), password);
      onSuccessCookie(result.cookie, `Authenticated (${username.trim()})`);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Login failed. Try the Mobile Bookmarklet tab if your institution uses SSO/2FA.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveManualCookie = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualPasteCookie.trim().replace(/^MoodleSession=/i, '').trim();
    if (!cleaned) {
      setErrorMsg('Please paste a valid MoodleSession cookie string.');
      return;
    }
    onSuccessCookie(cleaned, 'Manual MoodleSession Cookie');
    onClose();
  };

  const handleCopyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(MOBILE_COOKIE_BOOKMARKLET);
      setCopiedBookmarklet(true);
      setTimeout(() => setCopiedBookmarklet(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webview-modal-title"
    >
      <div className="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Mobile Sheet Grab Handle */}
        <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="webview-modal-title" className="text-lg font-bold text-slate-900">
              Moodle Session Authentication
            </h2>
            <p className="text-xs text-slate-500 font-mono truncate max-w-xs sm:max-w-md">
              {loginTargetUrl}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab('webview');
                setErrorMsg(null);
              }}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate ${
                activeTab === 'webview'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              WebView SSO / 2FA
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('credentials');
                setErrorMsg(null);
              }}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate ${
                activeTab === 'credentials'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Direct Credentials
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('bookmarklet');
                setErrorMsg(null);
              }}
              className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate ${
                activeTab === 'bookmarklet'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mobile Bookmarklet
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">{errorMsg}</p>
              </div>
            </div>
          )}

          {activeTab === 'webview' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Capacitor Android WebView Bridge
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    {isNativeAndroid() ? 'Native APK Active' : 'Web Proxy Mode'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Inside the Android Debug APK, the native WebView authenticates with your university login page (supporting Microsoft Office 365 SSO, SAML, and SMS/Authenticator 2FA) and reads <code className="font-mono text-slate-800">MoodleSession</code> via <code className="font-mono text-slate-800">CapacitorCookies</code>.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleNativeCookieCapture}
                    disabled={isLoading}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Smartphone className="w-4 h-4" />
                    )}
                    <span>
                      {ssoStep === 'authenticating'
                        ? 'Checking CookieManager...'
                        : 'Capture Session from WebView'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-500 space-y-1.5">
                <p className="font-medium text-slate-700">How SSO Cookie Interception Works in the APK:</p>
                <p>1. Sign in normally with your institutional email and 2FA code.</p>
                <p>2. Your password is never stored by the app—only the temporary <code className="font-mono">MoodleSession</code> token is captured.</p>
                <p>3. All course downloads run directly on your phone storage.</p>
              </div>
            </div>
          )}

          {activeTab === 'credentials' && (
            <form onSubmit={handleDirectLogin} className="space-y-4">
              <p className="text-xs text-slate-600">
                If your Moodle server uses standard username and password authentication (without external SAML/Microsoft 2FA redirects), sign in directly below to fetch your session cookie:
              </p>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Moodle Username / Student ID
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. 208123456 or student_user"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your Moodle password"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div className="pt-1 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  <span>Sign In & Extract Cookie</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'bookmarklet' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                On Android Chrome, Firefox, or desktop browsers, save this 1-line bookmarklet. While logged into your Moodle site, tap the bookmark from the address bar to copy your <code className="font-mono text-slate-800">MoodleSession</code> cookie:
              </p>

              <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">
                <code>{MOBILE_COOKIE_BOOKMARKLET}</code>
              </div>

              <button
                type="button"
                onClick={handleCopyBookmarklet}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {copiedBookmarklet ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied Bookmarklet to Clipboard</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Mobile Cookie Bookmarklet</span>
                  </>
                )}
              </button>

              <form onSubmit={handleSaveManualCookie} className="pt-3 border-t border-slate-200 space-y-3">
                <label className="block text-xs font-medium text-slate-700">
                  Paste Extracted MoodleSession Cookie
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualPasteCookie}
                    onChange={(e) => setManualPasteCookie(e.target.value)}
                    placeholder="Paste cookie value here..."
                    className="flex-1 min-h-[44px] px-3.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>Save Cookie</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
