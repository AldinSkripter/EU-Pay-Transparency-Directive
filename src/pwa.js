let pendingPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pendingPrompt = event;
  notify();
});
window.addEventListener('appinstalled', () => { pendingPrompt = null; notify(); });
export const subscribeInstall = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const canInstall = () => !!pendingPrompt;
export async function promptInstall() {
  const prompt = pendingPrompt;
  if (!prompt) return false;
  pendingPrompt = null;
  notify();
  await prompt.prompt();
  await prompt.userChoice;
  return true;
}
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {scope:'/', updateViaCache:'none'}).catch(() => {});
  }, {once:true});
}
