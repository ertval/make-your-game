const appRoot = document.getElementById('app');

if (!appRoot) {
  throw new Error('Missing #app root.');
}

const overlayRoot = document.getElementById('overlay-root');
if (overlayRoot) {
  overlayRoot.textContent = 'Engine bootstrap ready.';
}
