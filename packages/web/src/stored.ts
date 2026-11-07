import { useEffect, useRef, useState } from 'react';

const CHANGED = 'kanakku-stored-choice';

interface Change {
  key: string;
  value: string;
}

export function useStoredChoice<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const known = useRef(choices);
  known.current = choices;
  const [choice, setChoice] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return choices.find((item) => item === saved) ?? fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    const follow = (event: Event) => {
      const { detail } = event as CustomEvent<Change>;
      const next = known.current.find((item) => item === detail.value);
      if (detail.key === key && next) setChoice(next);
    };
    window.addEventListener(CHANGED, follow);
    return () => window.removeEventListener(CHANGED, follow);
  }, [key]);
  const choose = (next: T) => {
    setChoice(next);
    window.dispatchEvent(new CustomEvent<Change>(CHANGED, { detail: { key, value: next } }));
    try {
      localStorage.setItem(key, next);
    } catch {
      return;
    }
  };
  return [choice, choose];
}
