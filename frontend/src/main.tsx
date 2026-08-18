import React from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import App from './App';

// TEMP probe: module script executed
const probe = () => {
  (window as any).go?.main?.App?.DebugProbe?.('module-start').catch(() => {});
};
probe();

const container = document.getElementById('root');

const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// TEMP probe: React mounted (post-render)
setTimeout(() => {
  (window as any).go?.main?.App?.DebugProbe?.('react-mounted').catch(() => {});
}, 2500);