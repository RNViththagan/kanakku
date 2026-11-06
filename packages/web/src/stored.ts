import { useState } from 'react';

export function useStoredChoice<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const [choice, setChoice] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return choices.find((item) => item === saved) ?? fallback;
    } catch {
      return fallback;
    }
  });
  const choose = (next: T) => {
    setChoice(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      return;
    }
  };
  return [choice, choose];
}
