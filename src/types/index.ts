export type ActivityType = 'resource' | 'folder' | 'assign' | 'page' | 'url' | 'h5pactivity';

export interface ActivityItem {
  id: string;
  href: string;
  title: string;
  modType: ActivityType;
  sectionName: string;
  selected?: boolean;
  nestedFiles?: {
    name: string;
    url: string;
    size?: number;
  }[];
  fileCount?: number;
}

export interface CourseSection {
  id: string;
  name: string;
  safeName: string;
  items: ActivityItem[];
  selected?: boolean;
}

export interface CourseInfo {
  url: string;
  courseId: string;
  domain: string;
  title: string;
  userName?: string;
  sections: CourseSection[];
  totalItems: number;
}

export interface DownloadOptions {
  includeNested: boolean;
  autoUnpack: boolean;
  threads: number;
  outputName: string;
}

export interface DownloadProgressState {
  isDownloading: boolean;
  isPaused: boolean;
  progressPercent: number;
  totalFiles: number;
  downloadedFiles: number;
  totalBytes: number;
  currentActivity?: string;
  currentSection?: string;
  status: 'idle' | 'parsing' | 'downloading' | 'packaging' | 'completed' | 'error';
  logs: LogMessage[];
  zipBlobUrl?: string;
  zipFileName?: string;
}

export interface LogMessage {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'header' | 'dim';
}
