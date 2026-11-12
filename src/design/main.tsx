import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from '../ui/theme';
import { DesignSystem } from './DesignSystem';
import '../ui/styles/tokens.css';
import '../ui/styles/app.css';
import '@fontsource-variable/inter';
import './design.css';

document.documentElement.lang = 'en';
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesignSystem />
  </StrictMode>,
);
