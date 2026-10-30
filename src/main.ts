import './style.css';
import { ExperienceLoadError, loadExperience, loadManifest } from './config';
import { publicExperienceUrl } from './site';
import { loadTemplate } from './templates';

const app = document.querySelector<HTMLDivElement>('#app')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function galleryUrl(): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function galleryLink(label = 'Back to gallery'): HTMLAnchorElement {
  const a = el('a', 'button', label);
  a.href = galleryUrl();
  return a;
}

async function showEntry(): Promise<void> {
  document.title = 'JC Fractal WebAR';
  const page = el('main', 'page');
  page.append(el('p', 'eyebrow', 'JC Fractal'), el('h1', undefined, 'WebAR Voice Sculptures'));
  app.replaceChildren(page);

  try {
    const all = await loadManifest();
    const QRCode = (await import('qrcode')).default;
    const renderList = async (experiences: typeof all): Promise<HTMLUListElement> => {
      const list = el('ul', 'experience-list');
      for (const exp of experiences) {
        // Link and QR share one payload from the documented public base URL.
        const url = publicExperienceUrl(exp.id);
        const item = el('li', 'experience-card');
        const link = el('a', 'card', exp.title);
        link.href = url;
        const qr = el('div', 'qr');
        qr.dataset.payload = url;
        qr.setAttribute('role', 'img');
        qr.setAttribute('aria-label', `QR code for ${exp.title}`);
        qr.innerHTML = await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
        const urlText = el('a', 'qr-url', url);
        urlText.href = url;
        const download = el('a', 'qr-download', 'Download QR (PNG)');
        download.href = await QRCode.toDataURL(url, { width: 768, margin: 2, errorCorrectionLevel: 'M' });
        download.download = `${exp.id}-qr.png`;
        item.append(link, qr, urlText, download);
        list.append(item);
      }
      return list;
    };
    const demos = all.filter((e) => !e.test);
    const tests = all.filter((e) => e.test);
    if (demos.length === 0) page.append(el('p', 'muted', 'No experiences are published yet.'));
    page.append(await renderList(demos));
    if (tests.length > 0) {
      page.append(el('h2', 'gallery-section', 'Test fixtures (not demo content)'), await renderList(tests));
    }
  } catch (err) {
    page.append(el('p', 'error-text', err instanceof Error ? err.message : 'The experience list could not be loaded.'));
  }
}

function showError(message: string): void {
  document.title = 'Experience unavailable · JC Fractal WebAR';
  const page = el('main', 'page');
  page.setAttribute('role', 'alert');
  page.append(el('p', 'eyebrow', 'Experience unavailable'), el('h1', undefined, 'This link did not open'), el('p', 'error-text', message), galleryLink());
  app.replaceChildren(page);
}

async function showExperience(id: string): Promise<void> {
  const loading = el('main', 'page');
  loading.append(el('p', 'muted', 'Loading…'));
  app.replaceChildren(loading);

  try {
    const config = await loadExperience(id);
    document.title = `${config.title} · JC Fractal WebAR`;

    const root = el('div', 'player');
    const overlay = el('header', 'overlay');
    const back = el('a', 'back-link', '← Gallery');
    back.href = galleryUrl();
    overlay.append(el('h1', 'player-title', config.title), back);
    if (config.brand?.name) overlay.append(el('p', 'brand', config.brand.name));
    root.append(overlay);
    // `&probe`: temporary AR geometry isolation test (see src/xr/probe.ts); the config only names the page.
    const mount = new URLSearchParams(window.location.search).has('probe')
      ? (await import('./xr/probe')).mountXrProbe
      : await loadTemplate(config);
    app.replaceChildren(root);

    const dispose = mount(root);
    window.addEventListener('pagehide', dispose, { once: true });
    // Restored from the back/forward cache after dispose: start fresh rather than show a dead canvas.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) window.location.reload();
    });
  } catch (err) {
    if (err instanceof ExperienceLoadError) {
      console.warn(`[player] ${err.kind}: ${err.message}`);
      showError(err.message);
    } else {
      console.error(err);
      showError('Something went wrong while starting this experience.');
    }
  }
}

const params = new URLSearchParams(window.location.search);
const exp = params.get('exp');
if (exp === null) {
  void showEntry();
} else {
  void showExperience(exp.trim());
}
