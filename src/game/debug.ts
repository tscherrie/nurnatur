// src/game/debug.ts

// Debug mode can be activated by adding ?debug=true to the URL
const urlParams =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams('');
export const IS_DEBUG_MODE = urlParams.get('debug') === 'true';

if (IS_DEBUG_MODE && typeof window !== 'undefined') {
  console.log('%c-- DEBUG MODE ON --', 'color: red; font-weight: bold;');
}
