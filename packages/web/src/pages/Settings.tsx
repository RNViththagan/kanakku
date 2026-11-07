import {
  Box,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  type Theme,
  type ThemeOption,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useColorScheme,
  useThemeSwitcher,
} from '@wso2/oxygen-ui';
import { Monitor, Moon, Sun } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { usePattern } from '../appearance';
import { Section, Title, useDark } from '../ui';

type Mode = 'light' | 'dark' | 'system';

const MODES: Array<{ id: Mode; label: string; icon: ReactNode }> = [
  { id: 'light', label: 'Light', icon: <Sun size={16} /> },
  { id: 'dark', label: 'Dark', icon: <Moon size={16} /> },
  { id: 'system', label: 'Same as this computer', icon: <Monitor size={16} /> },
];

type Schemes = { colorSchemes?: Partial<Record<'light' | 'dark', { palette: Theme['palette'] }>> };

function paletteOf(option: ThemeOption, dark: boolean): Theme['palette'] | undefined {
  if (typeof option.theme === 'string') return undefined;
  const schemes = (option.theme as Theme & Schemes).colorSchemes;
  return schemes?.[dark ? 'dark' : 'light']?.palette ?? option.theme.palette;
}

function Swatch({ option, dark }: { option: ThemeOption; dark: boolean }) {
  const palette = paletteOf(option, dark);
  return (
    <Box
      aria-hidden
      sx={{
        height: 52,
        borderRadius: 1.5,
        border: 1,
        borderColor: 'divider',
        bgcolor: palette?.background.default,
        p: 1,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <Box
        sx={{
          flex: 1,
          height: 26,
          borderRadius: 1,
          bgcolor: palette?.background.paper,
          display: 'flex',
          alignItems: 'center',
          px: 1,
        }}
      >
        <Box sx={{ width: '55%', height: 6, borderRadius: 3, bgcolor: palette?.primary.main }} />
      </Box>
    </Box>
  );
}

export function Settings() {
  const { currentTheme, themes, setTheme } = useThemeSwitcher();
  const { mode, setMode } = useColorScheme();
  const [pattern, setPattern] = usePattern();
  const dark = useDark();

  return (
    <>
      <Title title="Settings" subtitle="How Kanakku looks in this browser" />
      <Section title="Appearance">
        <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
          Theme
        </Typography>
        <RadioGroup
          name="theme"
          value={currentTheme}
          onChange={(_event, key) => setTheme(key)}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
            gap: 1.5,
          }}
        >
          {themes.map((option) => (
            <FormControlLabel
              key={option.key}
              value={option.key}
              control={<Radio size="small" />}
              label={
                <Stack spacing={1} sx={{ pt: 0.75 }}>
                  <Swatch option={option} dark={dark} />
                  <Typography variant="body2">{option.label}</Typography>
                </Stack>
              }
              sx={{
                m: 0,
                p: 1,
                pr: 1.5,
                alignItems: 'flex-start',
                border: 1,
                borderRadius: 2,
                borderColor: option.key === currentTheme ? 'primary.main' : 'divider',
                '& .MuiFormControlLabel-label': { flex: 1 },
              }}
            />
          ))}
        </RadioGroup>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Charts keep their colours in every theme: blue for money in, orange for money out and
          green for what you keep.
        </Typography>

        <Typography variant="subtitle2" component="h3" sx={{ mt: 3, mb: 1 }}>
          Light or dark
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode ?? 'system'}
          onChange={(_event, next: Mode | null) => {
            if (next) setMode(next);
          }}
          aria-label="Light or dark"
          sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { gap: 0.75, textTransform: 'none' } }}
        >
          {MODES.map((item) => (
            <ToggleButton key={item.id} value={item.id}>
              {item.icon}
              {item.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Typography variant="subtitle2" component="h3" sx={{ mt: 3, mb: 0.5 }}>
          Background
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={pattern === 'on'}
              onChange={(event) => setPattern(event.target.checked ? 'on' : 'off')}
            />
          }
          label="Engraved pattern behind the pages, like on a banknote"
        />
      </Section>
    </>
  );
}
