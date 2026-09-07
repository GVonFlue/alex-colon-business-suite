/* Harness entry point. The only thing it adds over src/main.jsx is a `mount`
   export, so the test can decide when the app goes on screen. It imports the
   real App — nothing about the app under test is a test double. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';

export function mount(el) {
  const root = createRoot(el);
  root.render(<App />);
  return root;
}
