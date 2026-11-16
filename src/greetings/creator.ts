import type { Session } from '@supabase/supabase-js';
import { FORMAT_LABELS, VIDEO_FORMATS, greetingUrl, mimeFor, suggestedFormat, uploadProblems, type VideoFormat } from './format';
import {
  createGreeting,
  currentSession,
  deleteGreeting,
  describeError,
  listMine,
  supabase,
  updateGreeting,
  uploadVideo,
  type GreetingRow,
} from './service';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function btn(label: string, className = 'button'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

/** Links point at the deployment serving this page, so a production QR stays on the production domain. */
function linkBase(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function probe(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (r: { width: number; height: number; duration: number }) => {
      URL.revokeObjectURL(url);
      v.removeAttribute('src');
      resolve(r);
    };
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = () => done({ width: 0, height: 0, duration: 0 });
    v.src = url;
  });
}

/** Creator route `?create`: sign in, upload a processed cutout, save a draft, publish/unpublish, QR. */
export async function showCreator(app: HTMLElement): Promise<void> {
  document.title = 'Create a greeting · JC Fractal WebAR';
  const page = el('main', 'page creator');
  page.append(el('p', 'eyebrow', 'JC Fractal'), el('h1', undefined, 'Your AR greetings'));
  const body = el('div');
  page.append(body);
  app.replaceChildren(page);

  let db;
  try {
    db = supabase();
  } catch (err) {
    body.append(el('p', 'error-text', err instanceof Error ? err.message : String(err)));
    return;
  }
  const render = async () => {
    const session = await currentSession();
    body.replaceChildren(session ? await signedIn(session, render) : signIn(render));
  };
  db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void render();
  });
  await render();
}

function signIn(rerender: () => Promise<void>): HTMLElement {
  const form = el('form', 'creator-form');
  const email = el('input');
  email.type = 'email';
  email.autocomplete = 'email';
  email.required = true;
  email.placeholder = 'Email';
  const password = el('input');
  password.type = 'password';
  password.autocomplete = 'current-password';
  password.required = true;
  password.minLength = 8;
  password.placeholder = 'Password (8+ characters)';
  const submit = el('button', 'button', 'Sign in');
  submit.type = 'submit';
  const create = btn('Create account', 'button secondary');
  const status = el('p', 'muted');
  status.setAttribute('role', 'status');
  form.append(el('h2', 'gallery-section', 'Sign in to create greetings'), email, password, el('div', 'creator-actions'), status);
  form.querySelector('.creator-actions')!.append(submit, create);

  const run = async (mode: 'in' | 'up') => {
    if (!form.reportValidity()) return;
    submit.disabled = create.disabled = true;
    status.className = 'muted';
    status.textContent = mode === 'in' ? 'Signing in…' : 'Creating account…';
    const auth = supabase().auth;
    const { data, error } =
      mode === 'in'
        ? await auth.signInWithPassword({ email: email.value.trim(), password: password.value })
        : await auth.signUp({ email: email.value.trim(), password: password.value, options: { emailRedirectTo: `${linkBase()}?create` } });
    submit.disabled = create.disabled = false;
    if (error) {
      status.className = 'error-text';
      status.textContent = describeError(error, mode === 'in' ? 'Sign-in failed.' : 'The account could not be created.');
    } else if (!data.session) {
      status.textContent = 'Account created. Open the confirmation email, then sign in here.';
    } else {
      await rerender();
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void run('in');
  });
  create.addEventListener('click', () => void run('up'));
  return form;
}

async function signedIn(session: Session, rerender: () => Promise<void>): Promise<HTMLElement> {
  const wrap = el('div');
  const who = el('p', 'muted', `Signed in as ${session.user.email ?? session.user.id}. `);
  const out = btn('Sign out', 'link-button');
  out.addEventListener('click', () => void supabase().auth.signOut().then(rerender));
  who.append(out);
  const list = el('ul', 'experience-list');
  const listStatus = el('p', 'muted', 'Loading your greetings…');
  const refresh = async () => {
    try {
      const rows = await listMine();
      listStatus.textContent = rows.length ? '' : 'No greetings yet. Upload a processed cutout above.';
      list.replaceChildren(...(await Promise.all(rows.map((g) => card(g, refresh)))));
    } catch (err) {
      listStatus.className = 'error-text';
      listStatus.textContent = describeError(err, 'Your greetings could not be loaded.');
    }
  };
  wrap.append(who, uploadForm(session, refresh), el('h2', 'gallery-section', 'My greetings'), listStatus, list);
  void refresh();
  return wrap;
}

function uploadForm(session: Session, refresh: () => Promise<void>): HTMLElement {
  const form = el('form', 'creator-form');
  const title = el('input');
  title.required = true;
  title.maxLength = 80;
  title.placeholder = 'Greeting title, e.g. Happy birthday, Ana!';
  const file = el('input');
  file.type = 'file';
  file.required = true;
  file.accept = 'video/mp4,.mp4,video/webm,.webm';
  const format = el('select');
  for (const f of VIDEO_FORMATS) format.append(new Option(FORMAT_LABELS[f], f));
  const fileLabel = el('label', 'creator-label', 'Processed video');
  fileLabel.append(file);
  const formatLabel = el('label', 'creator-label', 'Video format');
  formatLabel.append(format);
  const progress = el('progress');
  progress.max = 1;
  progress.value = 0;
  progress.hidden = true;
  const status = el('p', 'muted');
  status.setAttribute('role', 'status');
  const save = el('button', 'button', 'Upload and save draft');
  save.type = 'submit';
  const cancel = btn('Cancel upload', 'button secondary');
  cancel.hidden = true;
  const actions = el('div', 'creator-actions');
  actions.append(save, cancel);
  form.append(el('h2', 'gallery-section', 'New greeting'), title, fileLabel, formatLabel, progress, status, actions);

  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (f) format.value = suggestedFormat(f);
    status.className = 'muted';
    status.textContent = f ? `${f.name} · ${(f.size / 1048576).toFixed(1)} MiB` : '';
  });

  let controller: AbortController | null = null;
  cancel.addEventListener('click', () => controller?.abort());
  const fail = (text: string) => {
    status.className = 'error-text';
    status.textContent = text;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = file.files?.[0];
    if (!form.reportValidity() || !f) return;
    const fmt = format.value as VideoFormat;
    status.className = 'muted';
    status.textContent = 'Checking the video…';
    const meta = await probe(f);
    const problems = uploadProblems(f, fmt, meta);
    if (problems.length) return fail(problems.join(' '));
    const mime = mimeFor(f)!;
    const id = crypto.randomUUID();
    const path = `${session.user.id}/${id}.${mime === 'video/webm' ? 'webm' : 'mp4'}`;
    controller = new AbortController();
    save.disabled = true;
    cancel.hidden = false;
    progress.hidden = false;
    progress.value = 0;
    try {
      const fresh = (await currentSession()) ?? session;
      await uploadVideo(fresh, path, f, mime, (p) => {
        progress.value = p;
        status.textContent = `Uploading… ${Math.round(p * 100)}%`;
      }, controller.signal);
      status.textContent = 'Saving draft…';
      try {
        await createGreeting({
          id,
          title: title.value.trim(),
          video_path: path,
          video_format: fmt,
          video_mime: mime,
          video_bytes: f.size,
          video_width: meta.width,
          video_height: meta.height,
          video_duration: Number.isFinite(meta.duration) ? meta.duration : null,
        });
      } catch (err) {
        await supabase().storage.from('greeting-videos').remove([path]);
        throw err;
      }
      form.reset();
      status.className = 'muted';
      status.textContent = 'Saved as a private draft. Publish it below to get the link and QR.';
      await refresh();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') fail('Upload cancelled. Nothing was saved.');
      else fail(describeError(err, 'The greeting could not be saved.'));
    } finally {
      controller = null;
      save.disabled = false;
      cancel.hidden = true;
      progress.hidden = true;
    }
  });
  return form;
}

async function card(g: GreetingRow, refresh: () => Promise<void>): Promise<HTMLLIElement> {
  const item = el('li', 'experience-card');
  const url = greetingUrl(linkBase(), g.slug);
  const published = g.status === 'published';
  item.append(
    el('strong', undefined, g.title),
    el('p', published ? 'status-published' : 'muted', published ? 'Published: anyone with the link can view it' : 'Private draft: only you can see it'),
    el('p', 'muted', `${FORMAT_LABELS[g.video_format] ?? g.video_format} · ${(g.video_bytes / 1048576).toFixed(1)} MiB${g.video_duration ? ` · ${g.video_duration.toFixed(1)} s` : ''}`),
  );
  const status = el('p', 'muted');
  status.setAttribute('role', 'status');
  const actions = el('div', 'creator-actions');
  const preview = el('a', 'button secondary', published ? 'Open' : 'Preview draft');
  preview.href = url;
  const toggle = btn(published ? 'Unpublish' : 'Publish');
  const del = btn('Delete', 'button secondary');
  actions.append(preview, toggle, del);
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    status.className = 'muted';
    status.textContent = published ? 'Unpublishing…' : 'Publishing…';
    try {
      await updateGreeting(g.id, { status: published ? 'draft' : 'published' });
      await refresh();
    } catch (err) {
      toggle.disabled = false;
      status.className = 'error-text';
      status.textContent = describeError(err, 'The change could not be saved.');
    }
  });
  del.addEventListener('click', async () => {
    if (!window.confirm(`Delete “${g.title}”? Its link and QR will stop working.`)) return;
    del.disabled = true;
    try {
      await deleteGreeting(g);
      await refresh();
    } catch (err) {
      del.disabled = false;
      status.className = 'error-text';
      status.textContent = describeError(err, 'The greeting could not be deleted.');
    }
  });
  if (published) {
    const QRCode = (await import('qrcode')).default;
    const qr = el('div', 'qr');
    qr.dataset.payload = url;
    qr.setAttribute('role', 'img');
    qr.setAttribute('aria-label', `QR code for ${g.title}`);
    qr.innerHTML = await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
    const link = el('a', 'qr-url', url);
    link.href = url;
    const download = el('a', 'qr-download', 'Download QR (PNG)');
    download.href = await QRCode.toDataURL(url, { width: 768, margin: 2, errorCorrectionLevel: 'M' });
    download.download = `greeting-${g.slug}-qr.png`;
    const copy = btn('Copy link', 'link-button');
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(url).then(() => (status.textContent = 'Link copied.'), () => (status.textContent = url));
    });
    item.append(qr, link, download, copy);
  }
  item.append(actions, status);
  return item;
}
