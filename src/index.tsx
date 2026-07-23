import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted Inter (400/600/700, Vietnamese subset included via
// unicode-range). The canvas measures text to position usernames after
// names; a machine-dependent local Inter (missing weights → faux bold,
// or an old cut missing Vietnamese glyphs) makes measure ≠ paint and the
// username overlaps the name's last characters. Bundling pins the exact
// font file on every machine — and needs no hall wifi.
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root element not found in index.html');
}
ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
