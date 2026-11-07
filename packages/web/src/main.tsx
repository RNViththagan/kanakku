import { OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DEFAULT_THEME, THEMES } from './appearance';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <OxygenUIThemeProvider themes={THEMES} initialTheme={DEFAULT_THEME}>
        <App />
      </OxygenUIThemeProvider>
    </StrictMode>,
  );
}
