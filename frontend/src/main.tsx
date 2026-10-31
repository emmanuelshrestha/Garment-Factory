import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App } from './App.tsx';
import { ThemeProvider } from './utils/theme.tsx';
import { PinLogin } from './components/PinLogin.tsx';
import { FloorLayout } from './pages/FloorLayout.tsx';
import { BagsPage } from './pages/BagsPage.tsx';
import { CuttingPage } from './pages/CuttingPage.tsx';
import { StockPage } from './pages/StockPage.tsx';
import './styles/app.css';
import './styles/print.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/pin-login" element={<PinLogin />} />
          <Route path="/floor" element={<FloorLayout />}>
            <Route path="bags" element={<BagsPage />} />
            <Route path="cutting" element={<CuttingPage />} />
            <Route path="search" element={<StockPage />} />
            <Route index element={<Navigate to="bags" replace />} />
          </Route>
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
