import { existsSync, type FSWatcher, watch } from 'node:fs';

export interface FolderWatch {
  close(): void;
}

function hidden(filename: string | null): boolean {
  return filename?.split(/[\\/]/).some((part) => part.startsWith('.')) ?? false;
}

export function watchFolders(folders: string[], onChange: () => void, delayMs = 500): FolderWatch {
  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  const schedule = () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!closed) onChange();
    }, delayMs);
  };
  const watchers: FSWatcher[] = [];
  for (const folder of new Set(folders)) {
    if (!existsSync(folder)) continue;
    let watcher: FSWatcher;
    try {
      watcher = watch(folder, { recursive: true }, (_event, filename) => {
        if (!hidden(filename)) schedule();
      });
    } catch {
      continue;
    }
    watcher.on('error', () => {
      watcher.close();
      schedule();
    });
    watchers.push(watcher);
  }
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
  };
}
