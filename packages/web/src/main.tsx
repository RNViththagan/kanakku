import { OxygenTheme, OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <OxygenUIThemeProvider theme={OxygenTheme}>
        <App />
      </OxygenUIThemeProvider>
    </StrictMode>,
  );
}
