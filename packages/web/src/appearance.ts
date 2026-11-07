import {
  AcrylicOrangeTheme,
  AcrylicPurpleTheme,
  ClassicTheme,
  HighContrastTheme,
  PaleGrayTheme,
  PaleIndigoTheme,
  type ThemeOption,
} from '@wso2/oxygen-ui';
import { useStoredChoice } from './stored';

export const THEMES: ThemeOption[] = [
  { key: 'acrylic-purple', label: 'Acrylic purple', theme: AcrylicPurpleTheme },
  { key: 'acrylic-orange', label: 'Acrylic orange', theme: AcrylicOrangeTheme },
  { key: 'pale-indigo', label: 'Pale indigo', theme: PaleIndigoTheme },
  { key: 'pale-gray', label: 'Pale grey', theme: PaleGrayTheme },
  { key: 'classic', label: 'Classic', theme: ClassicTheme },
  { key: 'high-contrast', label: 'High contrast', theme: HighContrastTheme },
];

export const DEFAULT_THEME = 'acrylic-purple';

const PATTERN = ['on', 'off'] as const;

export function usePattern() {
  return useStoredChoice('kanakku-pattern', PATTERN, 'on');
}
