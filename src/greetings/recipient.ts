import { mountVideo } from '../video/mount';
import { isValidSlug, playerConfig } from './format';
import { describeError, loadForPlayback, signedVideoUrl } from './service';

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
    return showError('Greeting unavailable', describeError(err, 'The greeting could not be loaded.'));
  }
  if (!found) {
    return showError('Greeting unavailable', 'This greeting is not published, or the link is wrong. Ask the sender for a new link.');
  }
  let url: string;
  try {
    url = await signedVideoUrl(found.greeting.video_path);
  } catch (err) {
    return showError('Greeting unavailable', describeError(err, 'The greeting video could not be opened.'));
  }
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
  overlay.append(h1);
  root.append(overlay);
  app.replaceChildren(root);
  const dispose = mountVideo(root, config);
  window.addEventListener('pagehide', dispose, { once: true });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });
}
