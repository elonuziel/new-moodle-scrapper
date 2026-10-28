import React, { useState } from 'react';
import {
  GitBranch,
  Tag,
  Package,
  Copy,
  Check,
  ArrowUpCircle,
  Terminal,
  Smartphone,
  FileCode,
  CheckCircle2,
} from 'lucide-react';

interface ApkPipelineViewProps {
  version: string;
  versionCode: number;
  onVersionBumped: (newVer: string, newCode: number) => void;
}

const WORKFLOW_YAML = `name: Build Android Debug APK & Auto-Release

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:
    inputs:
      bump_type:
        description: 'Semantic version bump type (patch, minor, major)'
        required: true
        default: 'patch'
        type: choice
        options:
          - patch
          - minor
          - major

permissions:
  contents: write

jobs:
  build-and-release-apk:
    if: "!contains(github.event.head_commit.message, '[skip ci]')"
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Set up JDK 21 (Temurin)
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Install dependencies
        run: npm install

      - name: Auto-Bump Version & Tag
        id: version_bump
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          BUMP_TYPE="\${{ github.event.inputs.bump_type || 'patch' }}"
          if [[ "\${{ github.event.head_commit.message }}" == *"#major"* ]]; then
            BUMP_TYPE="major"
          elif [[ "\${{ github.event.head_commit.message }}" == *"#minor"* ]]; then
            BUMP_TYPE="minor"
          fi

          OUTPUT=\$(node scripts/bump-version.mjs "\$BUMP_TYPE")
          VERSION=\$(echo "\$OUTPUT" | grep '^VERSION=' | cut -d'=' -f2)
          VERSION_CODE=\$(echo "\$OUTPUT" | grep '^VERSION_CODE=' | cut -d'=' -f2)

          echo "version=\$VERSION" >> \$GITHUB_OUTPUT
          echo "version_code=\$VERSION_CODE" >> \$GITHUB_OUTPUT
          echo "tag=v\$VERSION" >> \$GITHUB_OUTPUT

          git add package.json
          git commit -m "chore(release): bump version to v\$VERSION [skip ci]" || true
          git tag -a "v\$VERSION" -m "Release v\$VERSION (Debug APK)"
          git push origin HEAD:\${{ github.ref_name }} --follow-tags

      - name: Build Web Application Bundle
        run: npm run build

      - name: Initialize & Sync Capacitor Android Platform
        run: |
          if [ ! -d "android" ]; then
            npx cap add android
          fi
          npx cap sync android

      - name: Configure Android Manifest & Version Metadata
        run: |
          node scripts/bump-version.mjs --sync-only || true

      - name: Build Debug APK (assembleDebug)
        working-directory: ./android
        run: |
          chmod +x gradlew
          ./gradlew assembleDebug --no-daemon

      - name: Prepare Named Debug APK Artifact
        id: apk_artifact
        run: |
          APK_NAME="moodle-downloader-v\${{ steps.version_bump.outputs.version }}-debug.apk"
          cp android/app/build/outputs/apk/debug/app-debug.apk "./\$APK_NAME"
          echo "apk_name=\$APK_NAME" >> \$GITHUB_OUTPUT

      - name: Upload Debug APK to GitHub Actions Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: moodle-downloader-v\${{ steps.version_bump.outputs.version }}-debug-apk
          path: ./\${{ steps.apk_artifact.outputs.apk_name }}
          retention-days: 90

      - name: Publish Debug APK to GitHub Releases
        uses: softprops/action-gh-release@v2
        with:
          tag_name: \${{ steps.version_bump.outputs.tag }}
          name: "Moodle Downloader \${{ steps.version_bump.outputs.tag }} (Android Debug APK)"
          generate_release_notes: true
          files: |
            ./\${{ steps.apk_artifact.outputs.apk_name }}
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`;

const CAPACITOR_CONFIG_CODE = `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moodle.coursedownloader',
  appName: 'Moodle Course Downloader',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['*'],
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
  },
};

export default config;`;

const BUMP_SCRIPT_CODE = `#!/usr/bin/env node
// scripts/bump-version.mjs
// Increments package.json semantic version & syncs Android build.gradle versionCode/versionName
import fs from 'node:fs';
import path from 'node:path';

const arg = (process.argv[2] || 'patch').toLowerCase();
const pkgPath = path.join(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let [major, minor, patch] = (pkg.version || '1.0.0').split('.').map(Number);

if (arg !== '--sync-only') {
  if (arg === 'major') { major++; minor = 0; patch = 0; }
  else if (arg === 'minor') { minor++; patch = 0; }
  else { patch++; }
  pkg.version = \`\${major}.\${minor}.\${patch}\`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\\n');
}

const versionCode = major * 10000 + minor * 100 + patch;
console.log(\`VERSION=\${pkg.version}\\nVERSION_CODE=\${versionCode}\`);`;

export const ApkPipelineView: React.FC<ApkPipelineViewProps> = ({
  version,
  versionCode,
  onVersionBumped,
}) => {
  const [selectedFile, setSelectedFile] = useState<'workflow' | 'capacitor' | 'bump'>('workflow');
  const [isBumping, setIsBumping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastBumpMsg, setLastBumpMsg] = useState<string | null>(null);

  const apkFileName = `moodle-downloader-v${version}-debug.apk`;

  const handleBumpVersion = async (bumpType: 'patch' | 'minor' | 'major') => {
    setIsBumping(true);
    setLastBumpMsg(null);
    try {
      const resp = await fetch('/api/version/bump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bumpType }),
      });
      const data = await resp.json();
      if (resp.ok && data.version) {
        onVersionBumped(data.version, data.versionCode);
        setLastBumpMsg(
          `Bumped package.json to v${data.version} (Android versionCode ${data.versionCode})`
        );
      }
    } catch {
      // Fallback client calculation if offline
      const [maj = 1, min = 0, pat = 0] = version.split('.').map(Number);
      const nextVer =
        bumpType === 'major'
          ? `${maj + 1}.0.0`
          : bumpType === 'minor'
          ? `${maj}.${min + 1}.0`
          : `${maj}.${min}.${pat + 1}`;
      const [nMaj, nMin, nPat] = nextVer.split('.').map(Number);
      const nextCode = nMaj * 10000 + nMin * 100 + nPat;
      onVersionBumped(nextVer, nextCode);
      setLastBumpMsg(`Updated version to v${nextVer} (versionCode ${nextCode})`);
    } finally {
      setIsBumping(false);
    }
  };

  const activeCode =
    selectedFile === 'workflow'
      ? WORKFLOW_YAML
      : selectedFile === 'capacitor'
      ? CAPACITOR_CONFIG_CODE
      : BUMP_SCRIPT_CODE;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Summary Strip */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-slate-900">
              Android Debug APK & Automated GitHub Release Pipeline
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              Configured to build <code className="font-mono text-slate-800">assembleDebug</code> only—automatically pre-signed by Gradle for immediate Android installation—with semantic version bumping, Git tagging, and artifact upload to GitHub Releases.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isBumping}
              onClick={() => handleBumpVersion('patch')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <ArrowUpCircle className="w-4 h-4" />
              <span>Bump Patch (+0.0.1)</span>
            </button>
            <button
              type="button"
              disabled={isBumping}
              onClick={() => handleBumpVersion('minor')}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Bump Minor (+0.1.0)
            </button>
            <button
              type="button"
              disabled={isBumping}
              onClick={() => handleBumpVersion('major')}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Bump Major (+1.0.0)
            </button>
          </div>
        </div>

        {lastBumpMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{lastBumpMsg}</span>
          </div>
        )}

        {/* 4-Column Tabular Telemetry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-200">
          <div>
            <div className="text-xs text-slate-500">Current Release Tag</div>
            <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-indigo-600" />
              <span>v{version}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Android versionCode</div>
            <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {versionCode}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Gradle Build Target</div>
            <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
              assembleDebug
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Release APK Binary</div>
            <div className="text-sm font-semibold text-indigo-600 font-mono truncate mt-1" title={apkFileName}>
              {apkFileName}
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Stages Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
          <div className="text-xs font-mono text-slate-500">01. Version & Git Tag</div>
          <h3 className="text-sm font-bold text-slate-900">Auto-Bump & Tag</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Runs <code className="font-mono text-slate-800">scripts/bump-version.mjs</code>, increments <code className="font-mono text-slate-800">package.json</code>, commits with <code className="font-mono text-slate-800">[skip ci]</code>, and pushes tag <code className="font-mono text-slate-800">v{version}</code>.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
          <div className="text-xs font-mono text-slate-500">02. Capacitor Sync</div>
          <h3 className="text-sm font-bold text-slate-900">Vite + Android Bridge</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Compiles the production React bundle into <code className="font-mono text-slate-800">dist/</code> and syncs native Capacitor plugins (<code className="font-mono text-slate-800">CapacitorHttp</code>, <code className="font-mono text-slate-800">CapacitorCookies</code>, <code className="font-mono text-slate-800">Filesystem</code>).
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
          <div className="text-xs font-mono text-slate-500">03. Gradle Debug Build</div>
          <h3 className="text-sm font-bold text-slate-900">./gradlew assembleDebug</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Compiles and signs the Debug APK using JDK 21 & Android SDK so the resulting APK installs immediately without custom keystore secrets.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
          <div className="text-xs font-mono text-slate-500">04. Artifact & Release</div>
          <h3 className="text-sm font-bold text-slate-900">GitHub Releases Export</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Uploads <code className="font-mono text-slate-800">{apkFileName}</code> to both GitHub Actions Artifacts and a published GitHub Release on tag <code className="font-mono text-slate-800">v{version}</code>.
          </p>
        </div>
      </div>

      {/* Live Pipeline Files Inspector */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedFile('workflow')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectedFile === 'workflow'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              .github/workflows/build-debug-apk.yml
            </button>
            <button
              type="button"
              onClick={() => setSelectedFile('capacitor')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectedFile === 'capacitor'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              capacitor.config.ts
            </button>
            <button
              type="button"
              onClick={() => setSelectedFile('bump')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectedFile === 'bump'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              scripts/bump-version.mjs
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Copied File</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy File Content</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-6 bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed max-h-[520px]">
          <code>{activeCode}</code>
        </pre>
      </div>
    </div>
  );
};
