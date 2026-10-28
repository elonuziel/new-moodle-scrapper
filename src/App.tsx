import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  FolderOpen,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Archive,
  Lock,
} from 'lucide-react';
import {
  ActivityType,
  CourseInfo,
  DownloadOptions,
  DownloadProgressState,
} from './types';
import { formatSize } from './lib/filename-utils';
import { resolveCourseUrl } from './lib/url-resolver';
import {
  fetchAndParseCourse,
  executeCourseDownload,
  isNativeAndroid,
} from './lib/moodle-client';
import { WebViewLoginModal } from './components/WebViewLoginModal';
import { ApkPipelineView } from './components/ApkPipelineView';
import { AndroidGuideView } from './components/AndroidGuideView';

type NavView = 'workspace' | 'explorer' | 'pipeline' | 'guide';

const STORAGE_KEYS = {
  SITE_URL: 'moodle_dl_site_url',
  COURSE_INPUT: 'moodle_dl_course_input',
  COOKIE: 'moodle_dl_session_cookie',
};

export function App() {
  const [activeView, setActiveView] = useState<NavView>('workspace');
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [appVersionCode, setAppVersionCode] = useState<number>(10000);

  // Authentication & Course Input State (persisted in localStorage)
  const [siteUrl, setSiteUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.SITE_URL) || 'https://moodle.ruppin.ac.il';
  });
  const [courseInput, setCourseInput] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.COURSE_INPUT) || '';
  });
  const [authMethod, setAuthMethod] = useState<'webview' | 'cookie'>('webview');
  const [moodleCookie, setMoodleCookie] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.COOKIE) || '';
  });
  const [authSourceLabel, setAuthSourceLabel] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEYS.COOKIE) ? 'Session Cookie Loaded' : 'Not Authenticated';
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);

  // Course Data & Filtering State
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [modFilter, setModFilter] = useState<'all' | ActivityType>('all');

  // Download Options State
  const [options, setOptions] = useState<DownloadOptions>({
    includeNested: true,
    autoUnpack: true,
    threads: 5,
    outputName: 'moodle_course',
  });

  // Download Execution & Progress State
  const [progress, setProgress] = useState<DownloadProgressState>({
    isDownloading: false,
    isPaused: false,
    progressPercent: 0,
    totalFiles: 0,
    downloadedFiles: 0,
    totalBytes: 0,
    status: 'idle',
    logs: [],
  });
  const [nativeSavedPath, setNativeSavedPath] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SITE_URL, siteUrl);
  }, [siteUrl]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COURSE_INPUT, courseInput);
  }, [courseInput]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COOKIE, moodleCookie);
  }, [moodleCookie]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (data?.version) setAppVersion(data.version);
        if (data?.versionCode) setAppVersionCode(data.versionCode);
      })
      .catch(() => {
        // Standalone Capacitor APK mode
      });
  }, []);

  const resolvedPreview = useMemo(
    () => resolveCourseUrl(courseInput || '{course_id}', siteUrl),
    [courseInput, siteUrl]
  );

  const handleScanCourse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setScanError(null);

    if (!courseInput.trim()) {
      setScanError('Please enter a numeric Moodle Course ID (e.g. 1234) or full course URL.');
      return;
    }

    if (!moodleCookie.trim()) {
      setScanError(
        'Moodle authentication is required. Click "Authenticate Session" to sign in via WebView SSO or paste your MoodleSession cookie.'
      );
      return;
    }

    setIsScanning(true);
    try {
      const parsedCourse = await fetchAndParseCourse(
        courseInput,
        siteUrl,
        moodleCookie,
        options.includeNested
      );
      setCourse(parsedCourse);
      setOptions((prev) => ({
        ...prev,
        outputName: `moodle_course_${parsedCourse.courseId || 'archive'}`,
      }));
    } catch (err: any) {
      setScanError(err?.message || 'Failed to scan Moodle course.');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSectionSelection = (sectionId: string) => {
    if (!course) return;
    setCourse({
      ...course,
      sections: course.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const nextSelected = !sec.selected;
        return {
          ...sec,
          selected: nextSelected,
          items: sec.items.map((item) => ({ ...item, selected: nextSelected })),
        };
      }),
    });
  };

  const toggleItemSelection = (sectionId: string, itemId: string) => {
    if (!course) return;
    setCourse({
      ...course,
      sections: course.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const updatedItems = sec.items.map((it) =>
          it.id === itemId ? { ...it, selected: !it.selected } : it
        );
        const allSelected = updatedItems.every((it) => it.selected);
        return {
          ...sec,
          selected: allSelected,
          items: updatedItems,
        };
      }),
    });
  };

  const setAllSelections = (selected: boolean) => {
    if (!course) return;
    setCourse({
      ...course,
      sections: course.sections.map((sec) => ({
        ...sec,
        selected,
        items: sec.items.map((it) => ({ ...it, selected })),
      })),
    });
  };

  const { filteredSections, selectedCount, totalSelectableCount } = useMemo(() => {
    if (!course) {
      return {
        filteredSections: [],
        selectedCount: 0,
        totalSelectableCount: 0,
      };
    }

    let selCount = 0;
    let totCount = 0;
    const q = searchQuery.trim().toLowerCase();

    const filtered = course.sections
      .map((sec) => {
        const visibleItems = sec.items.filter((item) => {
          if (!options.includeNested && (item.modType === 'assign' || item.modType === 'page')) {
            return false;
          }
          totCount++;
          if (item.selected) {
            selCount++;
          }

          const matchesFilter = modFilter === 'all' || item.modType === modFilter;
          const matchesQuery =
            !q ||
            item.title.toLowerCase().includes(q) ||
            sec.name.toLowerCase().includes(q) ||
            item.modType.toLowerCase().includes(q);

          return matchesFilter && matchesQuery;
        });

        return {
          ...sec,
          items: visibleItems,
        };
      })
      .filter((sec) => sec.items.length > 0);

    return {
      filteredSections: filtered,
      selectedCount: selCount,
      totalSelectableCount: totCount,
    };
  }, [course, searchQuery, modFilter, options.includeNested]);

  const handleStartDownload = async () => {
    if (!course || selectedCount === 0 || progress.isDownloading) return;

    if (progress.zipBlobUrl) {
      URL.revokeObjectURL(progress.zipBlobUrl);
    }
    setNativeSavedPath(null);

    setProgress({
      isDownloading: true,
      isPaused: false,
      progressPercent: 0,
      totalFiles: selectedCount,
      downloadedFiles: 0,
      totalBytes: 0,
      status: 'downloading',
      logs: [],
    });

    try {
      const result = await executeCourseDownload(course, moodleCookie, options, (update) => {
        const pct =
          update.totalFiles > 0
            ? Math.min(100, Math.round((update.downloadedFiles / update.totalFiles) * 100))
            : 0;

        setProgress((prev) => {
          const nextLogs = update.log
            ? [
                ...prev.logs,
                {
                  id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  timestamp: new Date().toLocaleTimeString(),
                  ...update.log,
                },
              ]
            : prev.logs;

          return {
            ...prev,
            downloadedFiles: update.downloadedFiles,
            totalFiles: update.totalFiles,
            totalBytes: update.totalBytes,
            progressPercent: pct,
            currentActivity: update.currentActivity,
            currentSection: update.currentSection,
            logs: nextLogs,
          };
        });
      });

      const blobUrl = URL.createObjectURL(result.zipBlob);
      if (result.savedNativePath) {
        setNativeSavedPath(result.savedNativePath);
      }

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = result.zipFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setProgress((prev) => ({
        ...prev,
        isDownloading: false,
        progressPercent: 100,
        status: 'completed',
        zipBlobUrl: blobUrl,
        zipFileName: result.zipFileName,
        logs: [
          ...prev.logs,
          {
            id: `log-done-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'header',
            text: `Packaged ${result.zipFileName} (${formatSize(result.zipBlob.size)}) ready.`,
          },
        ],
      }));
    } catch (err: any) {
      setProgress((prev) => ({
        ...prev,
        isDownloading: false,
        status: 'error',
        logs: [
          ...prev.logs,
          {
            id: `log-err-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'error',
            text: err?.message || 'Download failed.',
          },
        ],
      }));
    }
  };

  const modTypeLabel = (mod: ActivityType): string => {
    switch (mod) {
      case 'resource':
        return 'Resource';
      case 'folder':
        return 'Folder Archive';
      case 'assign':
        return 'Assignment';
      case 'page':
        return 'Page Document';
      case 'url':
        return 'External Link';
      default:
        return 'Activity';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-24 lg:pb-12">
      {/* Top Bar Contract: Strictly 3 Zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('workspace');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
        >
          MoodleDownloader
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('workspace');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeView === 'workspace'
                ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                : ''
            }`}
          >
            Workspace
          </a>
          <a
            href="#explorer"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('explorer');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeView === 'explorer'
                ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                : ''
            }`}
          >
            Course Explorer
          </a>
          <a
            href="#pipeline"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('pipeline');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeView === 'pipeline'
                ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                : ''
            }`}
          >
            APK & CI/CD
          </a>
          <a
            href="#guide"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('guide');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 ${
              activeView === 'guide'
                ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                : ''
            }`}
          >
            Android Guide
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsLoginModalOpen(true)}
            className="min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0"
          >
            {moodleCookie.trim() ? 'Update Session' : 'Authenticate Session'}
          </button>
        </div>
      </header>

      {/* Mobile Segmented View Switcher */}
      <div className="md:hidden px-4 pt-3">
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-200/70 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveView('workspace')}
            className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate ${
              activeView === 'workspace'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Workspace
          </button>
          <button
            type="button"
            onClick={() => setActiveView('explorer')}
            className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate ${
              activeView === 'explorer'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Course Tree
          </button>
          <button
            type="button"
            onClick={() => setActiveView('pipeline')}
            className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate ${
              activeView === 'pipeline'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Debug APK
          </button>
          <button
            type="button"
            onClick={() => setActiveView('guide')}
            className={`min-h-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap truncate ${
              activeView === 'guide'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600'
            }`}
          >
            Guide
          </button>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 pt-6">
        {activeView === 'pipeline' && (
          <ApkPipelineView
            version={appVersion}
            versionCode={appVersionCode}
            onVersionBumped={(newVer, newCode) => {
              setAppVersion(newVer);
              setAppVersionCode(newCode);
            }}
          />
        )}

        {activeView === 'guide' && <AndroidGuideView />}

        {(activeView === 'workspace' || activeView === 'explorer') && (
          <div className="space-y-6">
            {/* Context & Release Version Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Moodle Course Material Downloader
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                  <span>Capacitor Android APK & Web Workspace</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-700">
                    Release v{appVersion} (code {appVersionCode})
                  </span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setActiveView('pipeline')}
                    className="text-indigo-600 hover:underline font-medium whitespace-nowrap"
                  >
                    View GitHub Actions Debug APK Pipeline
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
                <span>{isNativeAndroid() ? 'Android Native Bridge' : authSourceLabel}</span>
              </div>
            </div>

            {/* 2-Column Split on Desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Auth & Course Configuration (5 cols on lg) */}
              <div
                className={`lg:col-span-5 space-y-6 ${
                  activeView === 'explorer' ? 'hidden lg:block' : 'block'
                }`}
              >
                {/* Authentication Card */}
                <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-900">
                      01. Moodle Authentication
                    </h2>
                    <span className="text-xs text-slate-500">
                      {moodleCookie.trim() ? 'Session Ready' : 'Credentials Required'}
                    </span>
                  </div>

                  {/* Segmented Auth Mode Switcher */}
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAuthMethod('webview')}
                      className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        authMethod === 'webview'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      In-App WebView Login
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMethod('cookie')}
                      className={`min-h-[40px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        authMethod === 'cookie'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Manual Cookie Input
                    </button>
                  </div>

                  {authMethod === 'webview' ? (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Sign in through the Moodle WebView bridge (supports Microsoft 365 SSO, SAML, and 2FA prompts) or direct credentials to capture your <code className="font-mono text-slate-800">MoodleSession</code> cookie.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsLoginModalOpen(true)}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <Smartphone className="w-4 h-4" />
                        <span>Open Moodle Login & SSO Bridge</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="cookie-input"
                          className="text-xs font-medium text-slate-700"
                        >
                          MoodleSession Cookie Value
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsLoginModalOpen(true)}
                          className="text-xs text-indigo-600 hover:underline font-medium"
                        >
                          Get Mobile Bookmarklet
                        </button>
                      </div>
                      <input
                        id="cookie-input"
                        type="text"
                        value={moodleCookie}
                        onChange={(e) => {
                          setMoodleCookie(e.target.value);
                          setAuthSourceLabel(
                            e.target.value.trim() ? 'Manual Cookie Active' : 'Not Authenticated'
                          );
                        }}
                        placeholder="Paste MoodleSession cookie (e.g. a8f9c2d1e4...)"
                        className="w-full min-h-[44px] px-3.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                  )}
                </section>

                {/* Course Target & Options Card */}
                <form
                  onSubmit={handleScanCourse}
                  className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
                >
                  <h2 className="text-base font-bold text-slate-900">
                    02. Course Target & Download Rules
                  </h2>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="site-url-input"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Moodle Institution Base URL
                    </label>
                    <input
                      id="site-url-input"
                      type="text"
                      value={siteUrl}
                      onChange={(e) => setSiteUrl(e.target.value)}
                      placeholder="https://moodle.ruppin.ac.il"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="course-id-input"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Course ID or Full Course URL
                    </label>
                    <input
                      id="course-id-input"
                      type="text"
                      value={courseInput}
                      onChange={(e) => setCourseInput(e.target.value)}
                      placeholder="e.g. 1234 or https://moodle.ruppin.ac.il/course/view.php?id=1234"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    <div className="text-xs text-slate-500 font-mono truncate">
                      Target: {resolvedPreview.cleanUrl}
                    </div>
                  </div>

                  {/* Checkboxes for Nested & Auto-Unpack */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-100">
                    <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.includeNested}
                        onChange={(e) =>
                          setOptions((prev) => ({
                            ...prev,
                            includeNested: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600"
                      />
                      <div className="text-xs">
                        <div className="font-semibold text-slate-800">
                          Download Nested Files (Assignments & Pages)
                        </div>
                        <div className="text-slate-500">
                          Extracts homework PDFs, starter code, and solution sheets
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={options.autoUnpack}
                        onChange={(e) =>
                          setOptions((prev) => ({
                            ...prev,
                            autoUnpack: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600"
                      />
                      <div className="text-xs">
                        <div className="font-semibold text-slate-800">
                          Auto-Unpack Moodle Folder Archives
                        </div>
                        <div className="text-slate-500">
                          Unzips downloaded Moodle folders into clean section subdirectories
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Parallel Workers & Archive Output Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Parallel Workers
                      </label>
                      <select
                        value={options.threads}
                        onChange={(e) =>
                          setOptions((prev) => ({
                            ...prev,
                            threads: Number(e.target.value),
                          }))
                        }
                        className="w-full min-h-[44px] px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      >
                        <option value={1}>1 Worker (Sequential)</option>
                        <option value={3}>3 Workers</option>
                        <option value={5}>5 Workers (Default)</option>
                        <option value={8}>8 Workers (Fast)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Output Folder / Archive
                      </label>
                      <input
                        type="text"
                        value={options.outputName}
                        onChange={(e) =>
                          setOptions((prev) => ({
                            ...prev,
                            outputName: e.target.value,
                          }))
                        }
                        className="w-full min-h-[44px] px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                  </div>

                  {scanError && (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{scanError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isScanning}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {isScanning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>{isScanning ? 'Scanning Moodle Course...' : 'Scan & Parse Course'}</span>
                  </button>
                </form>
              </div>

              {/* Right Column: Course Explorer, Section Tree & Download Engine (7 cols on lg) */}
              <div className="lg:col-span-7 space-y-6">
                {course ? (
                  <>
                    {/* Course Summary & Filter Bar */}
                    <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono">{course.domain}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Course ID {course.courseId}
                            </span>
                            {course.userName && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{course.userName}</span>
                              </>
                            )}
                          </div>
                          <h2 className="text-lg font-bold text-slate-900">{course.title}</h2>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setAllSelections(true)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllSelections(false)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Search & Activity Type Filter Bar */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter sections or files by name..."
                            className="w-full min-h-[42px] pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          />
                        </div>

                        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
                          {(
                            [
                              { key: 'all', label: 'All' },
                              { key: 'resource', label: 'Files' },
                              { key: 'folder', label: 'Folders' },
                              { key: 'assign', label: 'Assignments' },
                              { key: 'page', label: 'Pages' },
                            ] as const
                          ).map((tab) => (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setModFilter(tab.key)}
                              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                                modFilter === tab.key
                                  ? 'bg-white text-slate-900 shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Selection & Download CTA Bar (Desktop) */}
                      <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
                          <span>
                            Selected: <strong>{selectedCount}</strong> / {totalSelectableCount} items
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={selectedCount === 0 || progress.isDownloading}
                          onClick={handleStartDownload}
                          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          {progress.isDownloading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          <span>
                            {progress.isDownloading
                              ? `Downloading (${progress.progressPercent}%)`
                              : `Download ${selectedCount} Selected Materials (.ZIP)`}
                          </span>
                        </button>
                      </div>
                    </section>

                    {/* Active Download Progress & Package Output Panel */}
                    {progress.status !== 'idle' && (
                      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {progress.status === 'completed' ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            ) : progress.status === 'error' ? (
                              <AlertCircle className="w-5 h-5 text-red-600" />
                            ) : (
                              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                            )}
                            <h3 className="text-sm font-bold text-slate-900">
                              {progress.status === 'completed'
                                ? 'Course Archive Ready'
                                : progress.status === 'error'
                                ? 'Download Interrupted'
                                : `Downloading: ${progress.currentActivity || 'Materials'}`}
                            </h3>
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-600">
                            {progress.downloadedFiles} / {progress.totalFiles} items ·{' '}
                            {formatSize(progress.totalBytes)}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-150 ${
                              progress.status === 'error'
                                ? 'bg-red-600'
                                : progress.status === 'completed'
                                ? 'bg-emerald-600'
                                : 'bg-indigo-600'
                            }`}
                            style={{ width: `${progress.progressPercent}%` }}
                          />
                        </div>

                        {progress.zipBlobUrl && (
                          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="text-xs text-emerald-900 space-y-0.5">
                              <div className="font-bold font-mono">{progress.zipFileName}</div>
                              <div>
                                {nativeSavedPath
                                  ? `Saved to Android device storage: ${nativeSavedPath}`
                                  : 'Organized by section folders with UTF-8 filenames.'}
                              </div>
                            </div>
                            <a
                              href={progress.zipBlobUrl}
                              download={progress.zipFileName || 'moodle_course.zip'}
                              className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                            >
                              <Archive className="w-4 h-4" />
                              <span>Save Archive Again</span>
                            </a>
                          </div>
                        )}

                        {/* Compact Activity Log */}
                        {progress.logs.length > 0 && (
                          <div className="bg-slate-900 rounded-xl p-3.5 max-h-40 overflow-y-auto font-mono text-xs space-y-1">
                            {progress.logs.slice(-12).map((log) => (
                              <div
                                key={log.id}
                                className={`flex items-start gap-2 ${
                                  log.type === 'error'
                                    ? 'text-red-400'
                                    : log.type === 'warning'
                                    ? 'text-amber-300'
                                    : log.type === 'header'
                                    ? 'text-indigo-300 font-semibold'
                                    : 'text-slate-300'
                                }`}
                              >
                                <span className="text-slate-500 tabular-nums shrink-0">
                                  {log.timestamp}
                                </span>
                                <span className="break-all">{log.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    )}

                    {/* Interactive Course Sections & Activities Tree */}
                    <section className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-200">
                      {filteredSections.length === 0 ? (
                        <div className="p-12 text-center space-y-3">
                          <p className="text-sm font-medium text-slate-700">
                            No course resources match your current filter.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setModFilter('all');
                            }}
                            className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            Reset Filters
                          </button>
                        </div>
                      ) : (
                        filteredSections.map((section) => {
                          const secSelectedCount = section.items.filter((i) => i.selected).length;
                          return (
                            <div key={section.id} className="p-5 space-y-3">
                              {/* Section Header Row */}
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleSectionSelection(section.id)}
                                  className="min-h-[44px] flex items-center gap-3 text-left group"
                                >
                                  {secSelectedCount === section.items.length ? (
                                    <CheckSquare className="w-5 h-5 text-indigo-600 shrink-0" />
                                  ) : (
                                    <Square className="w-5 h-5 text-slate-400 group-hover:text-slate-600 shrink-0" />
                                  )}
                                  <div>
                                    <h3 className="text-sm font-bold text-slate-900">
                                      {section.name}
                                    </h3>
                                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                                      {secSelectedCount} of {section.items.length} items selected
                                    </div>
                                  </div>
                                </button>
                              </div>

                              {/* Section Items List */}
                              <div className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
                                {section.items.map((item) => {
                                  return (
                                    <div
                                      key={item.id}
                                      onClick={() => toggleItemSelection(section.id, item.id)}
                                      className="min-h-[56px] py-2.5 px-2 flex items-center justify-between gap-4 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={!!item.selected}
                                          onChange={() => {}}
                                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600 shrink-0 pointer-events-none"
                                        />
                                        <div className="min-w-0">
                                          <div className="text-sm font-medium text-slate-900 truncate">
                                            {item.title}
                                          </div>
                                          {/* Clean Unboxed Metadata with · separators */}
                                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                                            <span>{modTypeLabel(item.modType)}</span>
                                            <span aria-hidden="true">·</span>
                                            <span className="font-mono truncate max-w-xs">
                                              {item.sectionName}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </section>
                  </>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
                    <FolderOpen className="w-8 h-8 text-slate-400 mx-auto" />
                    <div className="space-y-1.5">
                      <h3 className="text-base font-bold text-slate-900">
                        Ready to Scan Your Moodle Course
                      </h3>
                      <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                        1. Authenticate your Moodle session via the In-App WebView SSO bridge or paste your <code className="font-mono text-slate-800">MoodleSession</code> cookie.
                        <br />
                        2. Enter your Course ID (e.g. <code className="font-mono text-slate-800">1234</code>) or full URL and click <strong>Scan & Parse Course</strong>.
                      </p>
                    </div>
                    <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsLoginModalOpen(true)}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                      >
                        <Lock className="w-4 h-4" />
                        <span>Authenticate Moodle Session</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveView('pipeline')}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
                      >
                        Inspect Debug APK CI/CD Pipeline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Sticky Bottom Primary Action Bar (strictly within 15% mobile sticky cap) */}
      {(activeView === 'workspace' || activeView === 'explorer') && course && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="text-xs font-mono tabular-nums text-slate-700 truncate">
            <strong>{selectedCount}</strong> of {totalSelectableCount} items selected
          </div>
          <button
            type="button"
            disabled={selectedCount === 0 || progress.isDownloading}
            onClick={handleStartDownload}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            {progress.isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>
              {progress.isDownloading
                ? `${progress.progressPercent}%`
                : `Download (${selectedCount})`}
            </span>
          </button>
        </div>
      )}

      {/* WebView Login & Bookmarklet Modal */}
      <WebViewLoginModal
        isOpen={isLoginModalOpen}
        siteUrl={siteUrl}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccessCookie={(cookie, methodLabel) => {
          setMoodleCookie(cookie);
          setAuthSourceLabel(methodLabel);
        }}
      />
    </div>
  );
}

export default App;
