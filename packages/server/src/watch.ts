import { existsSync, watch as watchFs } from 'node:fs';

export interface FolderWatch {
  close(): void;
}

export interface Watcher {
  close(): void;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export type WatchFolder = (folder: string, listener: (filename: string | null) => void) => Watcher;

export interface WatchOptions {
  delayMs?: number;
  retryMs?: number;
  watch?: WatchFolder;
}

const recursive: WatchFolder = (folder, listener) =>
  watchFs(folder, { recursive: true }, (_event, filename) => listener(filename));

function hidden(filename: string | null): boolean {
  return filename?.split(/[\\/]/).some((part) => part.startsWith('.')) ?? false;
}

export function watchFolders(
  folders: string[],
  onChange: () => void,
  options: WatchOptions = {},
): FolderWatch {
  const { delayMs = 500, retryMs = 2000, watch = recursive } = options;
  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  const schedule = () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!closed) onChange();
    }, delayMs);
  };
  const watchers = new Map<string, Watcher>();
  const start = (folder: string): boolean => {
    if (!existsSync(folder)) return false;
    let watcher: Watcher;
    try {
      watcher = watch(folder, (filename) => {
        if (!hidden(filename)) schedule();
      });
    } catch {
      return false;
    }
    watcher.on('error', () => {
      watcher.close();
      if (watchers.get(folder) === watcher) watchers.delete(folder);
      schedule();
    });
    watchers.set(folder, watcher);
    return true;
  };
  const wanted = [...new Set(folders)];
  for (const folder of wanted) start(folder);
  const retry = setInterval(() => {
    for (const folder of wanted) {
      if (!watchers.has(folder) && start(folder)) schedule();
    }
  }, retryMs);
  retry.unref();
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      clearInterval(retry);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
