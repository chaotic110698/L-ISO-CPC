// Point d'entrée : assemblé par tools/build.mjs dans dist/app.js.
import { startApp } from './app.js';
import { toast } from './ui/toast.js';

window.addEventListener('error', (event) => {
  console.error(event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason);
  toast(`Erreur inattendue : ${event.reason?.message ?? event.reason}`, { type: 'error' });
});

const root = document.getElementById('app');
startApp(root)
  .then((app) => {
    // Accès pour le débogage (console du navigateur) et les tests automatisés.
    window.isoApp = app;
    document.documentElement.dataset.ready = 'true';
  })
  .catch((error) => {
    console.error(error);
    root.innerHTML = '';
    const message = document.createElement('div');
    message.className = 'boot boot-error';
    message.innerHTML = '<h1>Impossible de démarrer l’application</h1><p></p>';
    message.querySelector('p').textContent = error?.message ?? String(error);
    root.append(message);
  });
