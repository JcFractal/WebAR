import { mountVideo } from '../video/mount';
import { isValidSlug, playerConfig } from './format';
import { GreetingUnavailable, describeError, loadForPlayback } from './service';

/** Recipient route `?g=<link id>`: no account needed; plays in the existing video player. */
export async function showGreeting(
  app: HTMLElement,
  slug: string,
  showError: (title: string, message: string) => void,
): Promise<void> {
  if (!isValidSlug(slug)) return showError('This link did not open', 'This greeting link is incomplete or mistyped.');
  let found;
  try {
    found = await loadForPlayback(slug);
  } catch (err) {
    return showError('Greeting unavailable', err instanceof GreetingUnavailable ? err.message : describeError(err, 'The greeting could not be loaded.'));
  }
  const url = found.videoUrl;
  const config = playerConfig(found.greeting, url);
  if (found.draft) config.settings.sourceNote = 'Draft preview: only you can see this until it is published.';
  document.title = `${config.title} · JC Fractal WebAR`;

  const root = document.createElement('div');
  root.className = 'player';
  const overlay = document.createElement('header');
  overlay.className = 'overlay';
  const h1 = document.createElement('h1');
  h1.className = 'player-title';
  h1.textContent = config.title;
  if (found.greeting.theme === 'birthday') {
    root.classList.add('theme-birthday');
    const tag = document.createElement('p');
    tag.className = 'theme-tag';
    tag.textContent = 'Happy birthday';
    overlay.append(tag);
  }
  overlay.append(h1, arHelp());
  root.append(overlay);
  app.replaceChildren(root);
  const dispose = mountVideo(root, config);
  window.addEventListener('pagehide', dispose, { once: true });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });
}

/** Short how-to for recipients; hidden once AR starts (the AR status line takes over). */
function arHelp(): HTMLElement {
  const help = document.createElement('p');
  help.className = 'ar-help';
  help.textContent = 'Tap Play to watch here, or Enter AR to place it in your room: allow the camera, point at the floor and tap to place.';
  void navigator.xr?.isSessionSupported('immersive-ar').then(
    (ok) => {
      if (!ok) help.textContent = 'Tap Play to watch. To place it in your room, open this link in Chrome on an Android phone with ARCore.';
    },
    () => undefined,
  );
  if (!navigator.xr) help.textContent = 'Tap Play to watch. To place it in your room, open this link in Chrome on an Android phone with ARCore.';
  return help;
}
