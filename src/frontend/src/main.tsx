import React from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import App from './App';
import {ToastProvider} from './components/Toast';

const container = document.getElementById('root');

const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
