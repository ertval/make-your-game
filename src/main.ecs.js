/*
 * ECS app bootstrap entrypoint.
 *
 * This file wires the minimal DOM bootstrap state so the app can validate
 * that required mount points exist before gameplay systems start.
 */

const appRoot = document.getElementById('app');

if (!appRoot) {
  throw new Error('Missing #app root.');
}

const overlayRoot = document.getElementById('overlay-root');
if (overlayRoot) {
  overlayRoot.textContent = 'Engine bootstrap ready.';
}
