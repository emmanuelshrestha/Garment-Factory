import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import { ThemeProvider } from './utils/theme.tsx';
import './styles/app.css';
import './styles/print.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
