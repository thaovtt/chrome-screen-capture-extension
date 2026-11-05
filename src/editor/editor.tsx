import React from 'react';
import ReactDOM from 'react-dom/client';
import { EditorApp } from './EditorApp';
import '../popup/popup.css';

const root = document.getElementById('editor-root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <EditorApp />
    </React.StrictMode>
  );
}
