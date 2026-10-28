#!/usr/bin/env node
/**
 * Automatic Semantic Version Bump & Android Gradle Version Sync Script
 * Usage:
 *   node scripts/bump-version.mjs [patch|minor|major|--sync-only]
 */

import fs from 'node:fs';
import path from 'node:path';

const arg = (process.argv[2] || 'patch').toLowerCase();
const rootDir = process.cwd();
const pkgPath = path.join(rootDir, 'package.json');

if (!fs.existsSync(pkgPath)) {
  console.error('Error: package.json not found');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version || '1.0.0';
const parts = currentVersion.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);

let [major, minor, patch] = [parts[0] || 1, parts[1] || 0, parts[2] || 0];

if (arg !== '--sync-only') {
  if (arg === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (arg === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
}

const newVersion = `${major}.${minor}.${patch}`;
const newVersionCode = major * 10000 + minor * 100 + patch;

if (arg !== '--sync-only') {
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

// Sync Android build.gradle if android platform directory exists
const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradleContent = fs.readFileSync(gradlePath, 'utf8');
  gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`);
  gradleContent = gradleContent.replace(/versionName\s+"[^"]*"/, `versionName "${newVersion}"`);
  fs.writeFileSync(gradlePath, gradleContent, 'utf8');
}

console.log(`VERSION=${newVersion}`);
console.log(`VERSION_CODE=${newVersionCode}`);
