import type { Session } from '@supabase/supabase-js';
import { FORMAT_LABELS, VIDEO_FORMATS, formatProblems, greetingUrl, mimeFor, sourceProblems, suggestedFormat, uploadProblems, type VideoFormat } from './format';
import {
  createGreeting,
  currentSession,
  deleteGreeting,
  describeError,
  JOB_DONE,
  latestJob,
  listMine,
  processApi,
  supabase,
  updateGreeting,
  uploadVideo,
  type GreetingRow,
  type JobStatus,
  type Theme,
} from './service';

/** Ordinary-recording upload with automatic background removal (G4); off until processing is switched on. */
const ORDINARY = import.meta.env.VITE_ORDINARY_UPLOAD === '1';

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

/**
 * Public link base. VITE_GREETING_BASE_URL pins links/QRs to one domain (set it to production once
 * G3 is merged); otherwise links use the deployment serving this page, e.g. a preview while testing.
 */
function linkBase(): string {
  return import.meta.env.VITE_GREETING_BASE_URL || `${window.location.origin}${window.location.pathname}`;
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
    // loadeddata: the first frame decoded, not just the container header.
    v.onloadeddata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = () => done({ width: 0, height: 0, duration: 0 });
    v.src = url;
  });
}

const STEPS_ORDINARY = [
  'Upload a short video of yourself (3–30 seconds).',
  'We remove the background automatically. This takes about 2 minutes.',
  'Preview your private draft.',
  'Publish to get a link and QR code. Anyone with them can place your greeting in their room.',
];
const STEPS_PREPARED = [
  'Upload a processed cutout video.',
  'Preview your private draft.',
  'Publish to get a link and QR code. Anyone with them can place your greeting in their room.',
];

/** Creator route `?create`: sign in, upload a processed cutout, save a draft, publish/unpublish, QR. */
export async function showCreator(app: HTMLElement): Promise<void> {
  document.title = 'Create a greeting · JC Fractal WebAR';
  const page = el('main', 'page creator');
  page.append(el('p', 'eyebrow', 'JC Fractal'), el('h1', undefined, 'Your AR greetings'));
  const steps = el('ol', 'creator-steps');
  for (const s of ORDINARY ? STEPS_ORDINARY : STEPS_PREPARED) steps.append(el('li', undefined, s));
  page.append(steps);
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
  form.append(
    el('h2', 'gallery-section', 'Sign in to create greetings'),
    email,
    password,
    el('div', 'creator-actions'),
    status,
    el('p', 'muted small', 'New here? Enter your email and a password, tap Create account, then open the confirmation email and sign in.'),
  );
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

/** Refresh of the list currently on screen; background loops outlive re-renders and must update the live list. */
let activeRefresh: (() => Promise<void>) | null = null;
const refreshActive = () => activeRefresh?.() ?? Promise.resolve();

async function signedIn(session: Session, rerender: () => Promise<void>): Promise<HTMLElement> {
  const wrap = el('div');
  const who = el('p', 'muted', `Signed in as ${session.user.email ?? session.user.id}. `);
  const out = btn('Sign out', 'link-button');
  out.addEventListener('click', () => void supabase().auth.signOut().then(rerender));
  who.append(out);
  const list = el('ul', 'experience-list');
  const listStatus = el('p', 'muted', 'Loading your greetings…');
  let generation = 0;
  const refresh = async () => {
    if (activeRefresh !== refresh) return; // this list was replaced by a re-render (e.g. a repeated SIGNED_IN event)
    const mine = ++generation;
    try {
      const rows = await listMine();
      const cards = await Promise.all(rows.map((g) => card(g, refresh)));
      // Overlapping refreshes (upload, processing loops) must not let an older list overwrite a newer one.
      if (mine !== generation) return;
      listStatus.textContent = rows.length ? '' : `No greetings yet. Upload ${ORDINARY ? 'a video' : 'a processed cutout'} above to make your first one.`;
      list.replaceChildren(...cards);
    } catch (err) {
      listStatus.className = 'error-text';
      listStatus.textContent = describeError(err, 'Your greetings could not be loaded.');
    }
  };
  wrap.append(who, uploadForm(session, refresh), el('h2', 'gallery-section', 'My greetings'), listStatus, list);
  activeRefresh = refresh;
  void refresh();
  return wrap;
}

function uploadForm(session: Session, refresh: () => Promise<void>): HTMLElement {
  const form = el('form', 'creator-form');
  const title = el('input');
  title.required = true;
  title.maxLength = 80;
  title.placeholder = 'e.g. Happy birthday, Ana!';
  const titleLabel = el('label', 'creator-label', 'Title (shown on the greeting)');
  titleLabel.append(title);
  const file = el('input');
  file.type = 'file';
  file.required = true;
  file.accept = 'video/mp4,.mp4,video/webm,.webm';
  const format = el('select');
  for (const f of VIDEO_FORMATS) format.append(new Option(FORMAT_LABELS[f], f));
  const theme = themeSelect('plain');
  const themeLabel = el('label', 'creator-label', 'Style');
  themeLabel.append(theme);
  const kind = el('select');
  kind.append(new Option('Ordinary recording: remove the background automatically', 'ordinary'), new Option('Already processed cutout', 'prepared'));
  const kindLabel = el('label', 'creator-label', 'What are you uploading?');
  kindLabel.append(kind);
  kindLabel.hidden = !ORDINARY;
  if (!ORDINARY) kind.value = 'prepared';
  const fileLabel = el('label', 'creator-label', 'Processed video');
  fileLabel.append(file);
  const formatLabel = el('label', 'creator-label', 'Video format');
  formatLabel.append(format);
  const syncKind = () => {
    const ordinary = kind.value === 'ordinary';
    formatLabel.hidden = ordinary;
    fileLabel.firstChild!.textContent = ordinary ? 'Your video (3–30 seconds, up to 50 MB; 1080p recommended)' : 'Processed video';
  };
  kind.addEventListener('change', syncKind);
  syncKind();
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
  form.append(el('h2', 'gallery-section', 'New greeting'), titleLabel, themeLabel, kindLabel, fileLabel, formatLabel, progress, status, actions);

  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (f) format.value = suggestedFormat(f);
    status.className = 'muted';
    status.textContent = f ? `${f.name} · ${(f.size / 1048576).toFixed(1)} MB` : '';
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
    if (save.disabled || !form.reportValidity() || !f) return;
    save.disabled = true;
    const ordinary = kind.value === 'ordinary';
    const fmt = (ordinary ? 'packed' : format.value) as VideoFormat;
    status.className = 'muted';
    status.textContent = 'Checking the video…';
    const meta = await probe(f);
    const problems = ordinary ? sourceProblems(f, meta) : uploadProblems(f, fmt, meta);
    if (problems.length) {
      save.disabled = false;
      return fail(problems.join(' '));
    }
    const mime = mimeFor(f)!;
    const id = crypto.randomUUID();
    const ext = mime === 'video/webm' ? 'webm' : 'mp4';
    // Ordinary: the recording goes to `<id>-source.<ext>`; the server writes the packed cutout to `<id>.mp4`.
    const path = ordinary ? `${session.user.id}/${id}-source.${ext}` : `${session.user.id}/${id}.${ext}`;
    controller = new AbortController();
    save.disabled = true;
    cancel.hidden = false;
    progress.hidden = false;
    progress.value = 0;
    try {
      const fresh = (await currentSession()) ?? session;
      await uploadVideo(fresh, path, f, mime, (p) => {
        progress.value = p;
        status.textContent = `Uploading… ${Math.round(p * 100)}%. Keep this page open until the upload finishes.`;
      }, controller.signal);
      status.textContent = 'Upload finished. Saving your draft…';
      try {
        await createGreeting({
          id,
          title: title.value.trim(),
          theme: theme.value as Theme,
          video_path: ordinary ? `${session.user.id}/${id}.mp4` : path,
          video_format: fmt,
          video_mime: ordinary ? 'video/mp4' : mime,
          video_bytes: f.size,
          video_width: ordinary ? null : meta.width,
          video_height: ordinary ? null : meta.height,
          video_duration: Number.isFinite(meta.duration) ? meta.duration : null,
          ...(ordinary ? { source_kind: 'ordinary' as const, source_path: path } : {}),
        });
      } catch (err) {
        await supabase().storage.from('greeting-videos').remove([path]);
        throw err;
      }
      form.reset();
      syncKind();
      status.className = 'muted';
      if (ordinary) {
        status.textContent = 'Draft saved. Starting background removal…';
        try {
          await processApi({ action: 'start', greeting: id });
          status.textContent = 'Draft saved. Removing the background now (about 2 minutes). You can leave this page; it carries on and you can come back later.';
        } catch (err) {
          fail(`Your draft is saved, but background removal did not start: ${describeError(err, 'unknown problem')} Use Try again on the draft below.`);
        }
      } else {
        status.textContent = 'Checking the uploaded video on the server…';
        try {
          const v = await processApi<{ media_state: string; media_error: string | null }>({ action: 'verify', greeting: id });
          if (v.media_state === 'ready') status.textContent = 'Draft saved. Tap Preview draft to check it, then Publish to get the link and QR code.';
          else fail(`Your draft is saved, but the video check failed: ${v.media_error ?? 'unknown problem'}`);
        } catch (err) {
          fail(`Your draft is saved, but the video check did not run: ${describeError(err, 'unknown problem')}`);
        }
      }
      await refresh();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') fail('Upload cancelled. Nothing was saved.');
      else if (navigator.onLine === false) fail('The upload stopped because the phone went offline. Nothing was saved; reconnect and upload again.');
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
  const ready = g.media_state === 'ready';
  item.append(
    el('strong', undefined, g.title),
    el('p', published ? 'status-published' : 'muted', published ? 'Published: anyone with the link or QR code can view it.' : ready ? 'Private draft: only you can see it. Preview it, then publish.' : 'Private draft: only you can see it.'),
    el('p', 'muted', `${g.source_kind === 'ordinary' ? 'Automatic cutout' : (FORMAT_LABELS[g.video_format] ?? g.video_format)} · ${(g.video_bytes / 1048576).toFixed(1)} MiB${g.video_duration ? ` · ${g.video_duration.toFixed(1)} s` : ''}`),
  );
  const status = el('p', 'muted');
  status.setAttribute('role', 'status');
  const actions = el('div', 'creator-actions');
  const preview = el('a', 'button secondary', published ? 'Open' : 'Preview draft');
  preview.href = url;
  const toggle = btn(published ? 'Unpublish' : 'Publish');
  // Only a server-verified video can be published (the database enforces this too).
  toggle.disabled = !published && !ready;
  const del = btn('Delete', 'button secondary');
  if (ready || published) actions.append(preview);
  actions.append(toggle, del);
  if (!ready) item.append(mediaPanel(g, refresh));
  if (!published && !ready) item.append(el('p', 'muted small', 'You can publish once the video is ready.'));
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
    item.append(el('p', 'muted small', 'Share the link, or let people scan the QR code. They don’t need an account. On Android, Chrome places it in their room.'), qr, link, download, copy);
  }
  item.append(actions);
  if (g.source_kind !== 'ordinary') item.append(editor(g, refresh));
  item.append(status);
  return item;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Jobs/greetings this page is already driving (one loop each, even across list refreshes). */
const driving = new Set<string>();

/** Progress, errors and retry for a greeting whose video is not (yet) verified. */
function mediaPanel(g: GreetingRow, refresh: () => Promise<void>): HTMLElement {
  const box = el('div', 'media-panel');
  box.id = `media-${g.id}`;
  const line = el('p', 'muted');
  line.setAttribute('role', 'status');
  const actions = el('div', 'creator-actions');
  box.append(line, actions);
  const show = (text: string, error = false) => {
    const target = document.getElementById(`media-${g.id}`)?.querySelector('p') ?? line;
    target.className = error ? 'error-text' : 'muted';
    target.textContent = text;
  };
  const act = (label: string, run: () => Promise<unknown>, cls = 'button') => {
    const b = btn(label, cls);
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await run();
      } catch (err) {
        show(describeError(err, 'That did not work.'), true);
      }
      await refresh();
    });
    actions.append(b);
  };

  if (g.source_kind === 'prepared') {
    if (g.media_state === 'failed') {
      show(`Video check failed: ${g.media_error ?? 'unknown problem'}`, true);
      act('Check again', () => processApi({ action: 'verify', greeting: g.id }), 'button secondary');
    } else {
      show('Checking the video on the server…');
      if (!driving.has(g.id)) {
        driving.add(g.id);
        void processApi({ action: 'verify', greeting: g.id })
          .catch((err) => show(describeError(err, 'The video check did not run.'), true))
          .finally(() => {
            driving.delete(g.id);
            void refreshActive();
          });
      }
    }
    return box;
  }

  if (g.media_state === 'processing') {
    show('Preparing…');
    void latestJob(g.id).then((job) => {
      if (!job || JOB_DONE.includes(job.state)) return void refresh();
      act('Cancel processing', () => processApi({ action: 'cancel', job: job.id }), 'button secondary');
      if (!driving.has(job.id)) void drive(job, show);
    }, (err) => show(describeError(err, 'Processing status could not be loaded.'), true));
  } else {
    show(g.media_state === 'failed' ? (g.media_error ?? 'Processing failed.') : 'Background removal has not started yet.', g.media_state === 'failed');
    if (g.source_path) act(g.media_state === 'failed' ? 'Try again' : 'Start background removal', () => processApi({ action: 'retry', greeting: g.id }));
  }
  return box;
}

const STAGE_TEXT: Record<string, string> = {
  Preparing: 'Step 1 of 3: preparing your video… (about 1 minute)',
  'Removing background': 'Step 2 of 3: removing the background… (about 1 minute)',
  Finishing: 'Step 3 of 3: finishing your cutout… (under a minute)',
};

/** Advance a job from this page until it finishes; survives reloads because the server keeps the state. */
async function drive(job: JobStatus, show: (t: string, e?: boolean) => void): Promise<void> {
  driving.add(job.id);
  let failures = 0;
  try {
    while (document.getElementById(`media-${job.greeting_id}`)) {
      try {
        const next = (await processApi<{ job: JobStatus }>({ action: 'tick', job: job.id })).job;
        failures = 0;
        if (JOB_DONE.includes(next.state)) break;
        show(STAGE_TEXT[next.stage] ?? `${next.stage}…`);
        await sleep(next.stage === 'Removing background' ? 5000 : 1000);
      } catch (err) {
        failures += 1;
        show(`${describeError(err, 'Lost contact with the server.')} Your video is safe; retrying automatically…`, true);
        await sleep(Math.min(30_000, 5000 * failures));
      }
    }
  } finally {
    driving.delete(job.id);
  }
  await refreshActive();
}

/** Edit title and stored format in place; the link id and video stay the same. */
function editor(g: GreetingRow, refresh: () => Promise<void>): HTMLElement {
  const box = el('details', 'creator-edit');
  box.append(el('summary', undefined, 'Edit title, style or format'));
  const form = el('form', 'creator-form');
  const title = el('input');
  title.required = true;
  title.maxLength = 80;
  title.value = g.title;
  const theme = themeSelect(g.theme ?? 'plain');
  const format = el('select');
  for (const f of VIDEO_FORMATS) format.append(new Option(FORMAT_LABELS[f], f));
  format.value = g.video_format;
  const save = el('button', 'button', 'Save changes');
  save.type = 'submit';
  const status = el('p', 'muted');
  status.setAttribute('role', 'status');
  form.append(title, theme, format, save, status);
  box.append(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const fmt = format.value as VideoFormat;
    const problems = formatProblems(g.video_mime, fmt);
    if (fmt === 'packed' && g.video_width && g.video_height && g.video_width < g.video_height) {
      problems.push('This video is taller than wide, so it is not a packed cutout.');
    }
    if (problems.length) {
      status.className = 'error-text';
      status.textContent = problems.join(' ');
      return;
    }
    save.disabled = true;
    try {
      await updateGreeting(g.id, { title: title.value.trim(), theme: theme.value as Theme, video_format: fmt });
      await refresh();
    } catch (err) {
      save.disabled = false;
      status.className = 'error-text';
      status.textContent = describeError(err, 'The changes could not be saved.');
    }
  });
  return box;
}

function themeSelect(value: Theme): HTMLSelectElement {
  const s = el('select');
  s.append(new Option('Plain', 'plain'), new Option('Birthday', 'birthday'));
  s.value = value;
  return s;
}
