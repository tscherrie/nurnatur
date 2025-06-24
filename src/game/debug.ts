// src/game/debug.ts

// Debug mode can be activated by adding ?debug=true to the URL
const urlParams = new URLSearchParams(window.location.search);
export const IS_DEBUG_MODE = urlParams.get('debug') === 'true';

if (IS_DEBUG_MODE) {
  console.log('%c-- DEBUG MODE ON --', 'color: red; font-weight: bold;');
} 