# Equitensa desktop installation

One installable application covers Pay and Finance on the same origin. The manifest uses `/` as its stable identity, scope and launch URL, with shortcuts for both modules. PNG icons include 192px, 512px, a maskable version and an Apple touch icon.

The shared account dock offers **App installieren**. When Chromium supplies `beforeinstallprompt`, a user click opens its native prompt. Otherwise the button explains browser-menu installation and Safari's **Add to Dock** flow. Installation availability is controlled by the browser. Standalone windows hide the installation control.

Production must use HTTPS. Localhost works for development; an installation from localhost remains tied to the local server and does not become the production application automatically.

The service worker caches only the public bilingual offline notice. API calls, report downloads, authenticated pages and mutations are not cached by it. Offline navigation shows that notice; editing and synchronization offline are not implemented. Updates do not force an active page reload or discard unsaved forms.

Validation: production build and two PWA tests pass. Tests cover PNG dimensions, manifest shortcuts, network-only document navigation, API/mutation bypass and the offline fallback. Browser resource requests return 200 with correct MIME types. The editor's embedded browser did not complete service worker registration; external headless Edge validation was blocked by execution policy. Native desktop installation and real Safari/macOS validation therefore remain manual checks.

References: [MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Apple Safari web apps](https://support.apple.com/en-ie/104996).
