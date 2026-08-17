/* ============================================================================
   Wingman Interactive Prototype — app.js  (vanilla JS, no dependencies)
   Implements: Canvas radar, screen flow, i18n (EN/FR), mood selection,
   diffuse Signal wave, server-authoritative timers with locally-derived
   warning, reduce-motion, offline simulation, haptics policy.
   ========================================================================== */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  lang: 'en',
  reduceMotion: false,
  offline: false,
  reconnecting: false,
  radarActive: false,
  mood: 'OPEN',
  signalsLeft: 2,
  ticketsActive: 1,
  plan: 'FREE',
  apiLive: false,
  meId: 'proto-alex',
  peerId: 'proto-peer',
  signalId: null,
  connectionId: null,
  connectionState: null,
  phase: 'idle',
  viewId: 'v-splash',
  busy: false,
  hasIncomingSignal: false,
  serverNow: () => Date.now(),
};

/** @type {ReturnType<typeof WingmanApi.createApiClient> | null} */
let api = null;
/** @type {ReturnType<typeof WingmanRealtime.createRealtime> | null} */
let realtime = null;
const payments = (typeof WingmanPayments !== 'undefined' && WingmanPayments.paymentClient)
  ? WingmanPayments.paymentClient
  : { provider: { id: 'disabled', enabled: false }, showPaywallCtas: false };

/** Lab-only dual-user sim (localhost / ?devauth=1). Never on public product path. */
function allowPeerSim() {
  return Boolean(api && api.preferDevHeader && !api.productPath);
}

/** @type {MediaStream | null} */
let selfieStream = null;
/** @type {string | null} */
let peerPreviewUrl = null;

function stopSelfieCamera() {
  if (selfieStream) {
    selfieStream.getTracks().forEach((t) => t.stop());
    selfieStream = null;
  }
  const video = $('#selfie-video');
  if (video) {
    video.srcObject = null;
    video.classList.remove('is-live');
  }
}

function setSelfieCamError(msg) {
  const el = $('#selfie-cam-error');
  if (!el) return;
  if (!msg) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function startSelfieCamera() {
  setSelfieCamError('');
  const video = $('#selfie-video');
  const preview = $('#selfie-preview');
  if (preview) {
    preview.classList.add('hidden');
    preview.removeAttribute('src');
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setSelfieCamError(state.lang === 'fr'
      ? 'Caméra indisponible sur cet appareil.'
      : 'Camera unavailable on this device.');
    return false;
  }
  try {
    stopSelfieCamera();
    selfieStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 960 } },
    });
    if (video) {
      video.srcObject = selfieStream;
      video.classList.add('is-live');
      await video.play().catch(() => {});
    }
    return true;
  } catch (e) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError');
    setSelfieCamError(denied
      ? (state.lang === 'fr'
        ? 'Permission caméra refusée. Autorisez la caméra pour envoyer un selfie — pas de galerie.'
        : 'Camera permission denied. Allow the camera to send a selfie — gallery is blocked.')
      : (state.lang === 'fr'
        ? 'Impossible d’ouvrir la caméra.'
        : 'Could not open the camera.'));
    return false;
  }
}

function captureSelfieBlob() {
  const video = $('#selfie-video');
  const canvas = $('#selfie-canvas');
  if (!video || !canvas || !selfieStream) {
    throw Object.assign(new Error('Camera not ready'), { code: 'CAMERA_NOT_READY' });
  }
  const w = video.videoWidth || 480;
  const h = video.videoHeight || 640;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Object.assign(new Error('Canvas unavailable'), { code: 'CAMERA_NOT_READY' });
  ctx.drawImage(video, 0, 0, w, h);
  const stamp = $('#selfie-stamp');
  if (stamp) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(8, h - 28, Math.min(w - 16, 220), 20);
    ctx.fillStyle = '#e8eefc';
    ctx.font = '12px monospace';
    ctx.fillText(stamp.textContent || new Date().toISOString(), 12, h - 14);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(Object.assign(new Error('Capture failed'), { code: 'CAPTURE_FAILED' }));
      else resolve(blob);
    }, 'image/jpeg', 0.85);
  });
}

async function showPeerSelfieIfAny(conn) {
  if (!liveApi() || !conn || !api) return;
  const peerMediaId = state.meId === conn.initiatorId
    ? conn.recipientSelfieMediaId
    : conn.initiatorSelfieMediaId;
  if (!peerMediaId) return;
  try {
    const blob = await api.fetchMediaBlob(state.connectionId, peerMediaId);
    if (peerPreviewUrl) URL.revokeObjectURL(peerPreviewUrl);
    peerPreviewUrl = URL.createObjectURL(blob);
    const img = $('#selfie-preview');
    const video = $('#selfie-video');
    if (img) {
      img.src = peerPreviewUrl;
      img.classList.remove('hidden');
    }
    if (video) video.classList.add('hidden');
    stopSelfieCamera();
  } catch (_) {
    /* stay blocking — do not invent peer media */
  }
}

const SESSION_KEY = 'wingman_proto_session_v1';
const LOADING_MAX_MS = 12000;

function setApiBanner(kind, msg) {
  const el = $('#api-banner');
  if (!el) return;
  if (!msg) { el.className = 'api-banner hidden'; el.textContent = ''; return; }
  el.className = 'api-banner ' + (kind || 'info');
  el.textContent = msg;
}

let loadingTimer = null;
function setLoading(on, label) {
  state.busy = Boolean(on);
  const ov = $('#loading-overlay');
  const tx = $('#loading-text');
  if (tx && label) tx.textContent = label;
  if (ov) {
    ov.classList.toggle('hidden', !on);
    ov.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  clearTimeout(loadingTimer);
  if (on) {
    loadingTimer = setTimeout(() => {
      if (!state.busy) return;
      setLoading(false);
      feedback('error', t('t_timeout'));
      setApiBanner('error', t('t_timeout'));
    }, LOADING_MAX_MS);
  }
}

async function withLoading(label, fn) {
  if (state.offline) {
    feedback('offline', t('t_offline_blocked'));
    return null;
  }
  setLoading(true, label);
  try {
    return await fn();
  } catch (e) {
    const msg = (e && e.message) || String(e);
    setApiBanner('error', msg);
    feedback('error', msg);
    haptic('error');
    throw e;
  } finally {
    setLoading(false);
  }
}

function liveApi() {
  return api && !api.useMock && !state.offline && !state.reconnecting;
}

function persistSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      viewId: state.viewId,
      signalId: state.signalId,
      connectionId: state.connectionId,
      connectionState: state.connectionState,
      phase: state.phase,
      radarActive: state.radarActive,
      signalsLeft: state.signalsLeft,
      hasIncomingSignal: state.hasIncomingSignal,
      meId: state.meId,
      peerId: state.peerId,
    }));
  } catch (_) { /* ignore */ }
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearProtoSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
}

function isAuthedSession() {
  return Boolean(api && api.hasSession && api.userId);
}

/** Public product: protocol screens need OTP session — never resume a ghost Radar. */
function requireAuthOrPhone(reasonFeedback) {
  if (isAuthedSession()) return true;
  if (api && api.productPath) {
    if (reasonFeedback !== false) feedback('busy', t('t_auth_required'));
    show('v-phone');
    return false;
  }
  return true;
}

function setPhase(phase, label) {
  state.phase = phase;
  const strip = $('#phase-strip');
  const lab = $('#phase-label');
  if (!strip) return;
  const hide = !phase || phase === 'idle';
  strip.classList.toggle('hidden', hide);
  if (hide) return;
  const changed = strip.dataset.phase !== phase;
  strip.dataset.phase = phase;
  if (lab) lab.textContent = label || phaseLabel(phase);
  if (changed && !state.reduceMotion) {
    strip.classList.remove('phase-flash');
    void strip.offsetWidth;
    strip.classList.add('phase-flash');
    clearTimeout(setPhase._flash);
    setPhase._flash = setTimeout(() => strip.classList.remove('phase-flash'), 360);
  }
  persistSession();
}

function motionMs(full, reduced) {
  return state.reduceMotion ? (reduced ?? 0) : full;
}

function markSignalArrive() {
  const row = $('#sig-active-row');
  if (!row || state.reduceMotion) return;
  row.classList.remove('is-arriving');
  void row.offsetWidth;
  row.classList.add('is-arriving');
  clearTimeout(markSignalArrive._t);
  markSignalArrive._t = setTimeout(() => row.classList.remove('is-arriving'), 400);
}

function phaseLabel(phase) {
  const map = {
    available: 't_phase_available',
    busy: 't_phase_busy',
    unavailable: 't_phase_unavailable',
    signal: 't_phase_signal',
    validation: 't_phase_validation',
    match: 't_phase_match',
    mission: 't_phase_mission',
    cooldown: 't_phase_cooldown',
    offline: 't_phase_offline',
  };
  return t(map[phase] || 't_phase_idle');
}

function syncRadarEmpty() {
  const shell = $('.radar-shell');
  if (!shell) return;
  const empty = WingmanRadarDots.isRadarVisuallyEmpty(state.radarActive, dots);
  shell.classList.toggle('is-empty', empty);
  const dist = $('#radar-distance');
  if (dist) dist.classList.toggle('hidden', empty);
  const emptyEl = $('#radar-empty');
  if (emptyEl) {
    emptyEl.textContent = state.radarActive ? t('empty_radar_alone') : t('empty_radar');
  }
  syncRadarA11yList();
}

function setNearbyCount(n) {
  const el = $('#stat-nearby');
  if (el) el.textContent = String(Math.max(0, n | 0));
}

/** Replace canvas dots from API candidates only — never invent density. */
function applyRadarCandidates(cands) {
  const list = (cands && cands.candidates) || [];
  dots.length = 0;
  const mapped = WingmanRadarDots.candidatesToDots(list, state.meId);
  for (let i = 0; i < mapped.length; i++) dots.push(mapped[i]);
  setNearbyCount(WingmanRadarDots.nearbyCountFromDots(dots));
  syncRadarEmpty();
  startRadar();
}

function clearRadarDots() {
  dots.length = 0;
  setNearbyCount(0);
  syncRadarEmpty();
  startRadar();
}

function syncRadarA11yList() {
  const list = $('#radar-a11y-list');
  if (!list) return;
  if (!state.radarActive) {
    list.innerHTML = '';
    list.removeAttribute('aria-label');
    return;
  }
  list.setAttribute('aria-label', state.lang === 'fr' ? 'Personnes à proximité' : 'Nearby people');
  list.innerHTML = dots.map((d, i) => {
    const mood = d.mood === 'SUPER_READY' ? t('mood_ready') : d.mood === 'OPEN' ? t('mood_open') : t('mood_explore');
    const band = d.band === 'NEAR'
      ? (state.lang === 'fr' ? 'Très proche' : 'Very close')
      : (state.lang === 'fr' ? 'À proximité' : 'Nearby');
    return `<li><button type="button" class="sr-only-btn" data-dot="${i}">${band} · ${mood}</button></li>`;
  }).join('');
  $$('[data-dot]', list).forEach(btn => {
    btn.addEventListener('click', () => openSheet(dots[Number(btn.dataset.dot)]));
  });
}

function syncSignalEmpty() {
  const empty = $('#signal-empty');
  const list = $('#signal-list');
  const showEmpty = !state.hasIncomingSignal && !state.signalId;
  if (empty) empty.classList.toggle('hidden', !showEmpty);
  if (list) list.classList.toggle('hidden', showEmpty);
}

function setOfflineUi(offline, reconnecting) {
  state.offline = Boolean(offline);
  state.reconnecting = Boolean(reconnecting);
  const ban = $('#offline-banner');
  const txt = $('#offline-banner-text');
  const btn = $('#reconnect-btn');
  if (!ban) return;
  if (!state.offline && !state.reconnecting) {
    ban.classList.add('hidden');
    ban.classList.remove('reconnecting');
    if (btn) btn.classList.add('hidden');
    return;
  }
  ban.classList.remove('hidden');
  ban.classList.toggle('reconnecting', state.reconnecting);
  if (txt) {
    txt.textContent = state.reconnecting
      ? t('t_reconnecting')
      : t('t_offline_banner');
  }
  if (btn) btn.classList.toggle('hidden', state.reconnecting || !state.offline);
  if (state.offline) setPhase('offline', t('t_phase_offline'));
}

async function tryReconnect() {
  if (state.reconnecting) return;
  setOfflineUi(true, true);
  feedback('busy', t('t_reconnecting'));
  try {
    if (!api) api = await WingmanApi.bootstrapApi({ userId: state.meId });
    else {
      const ok = await Promise.race([
        api.live(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
      ]);
      api.setUseMock(!ok);
    }
    if (api.useMock) throw new Error('offline');
    state.apiLive = true;
    state.offline = false;
    setOfflineUi(false, false);
    $('#offline-toggle').setAttribute('aria-pressed', 'false');
    setApiBanner('live', t('t_api_live'));
    feedback('success', t('t_reconnected'));
    setPhase(state.radarActive ? 'available' : 'idle');
  } catch (_) {
    state.apiLive = false;
    setOfflineUi(true, false);
    setApiBanner('offline', t('t_api_mock'));
    feedback('error', t('t_reconnect_fail'));
  }
}

/* ---------------------------------------------------------------- i18n ---- */
const I18N = {
  en: {
    brandtag: 'Make the first acquaintance easy', splash_tag: 'Wingman facilitates the first real-world interaction between people already near each other.', splash_love: 'Love is in the air.', splash_cta: 'Begin',
    next: 'Next', ob_eyebrow: 'The problem',
    ob1_title: 'You cross paths. Nothing happens.', ob1_body: "Every day you pass someone you'd like to meet — and say nothing. Wingman is built for that exact moment.",
    ob2_eyebrow: 'The solution', ob2_title: 'A quiet protocol, not a swipe feed.', ob2_body: 'No public profiles. No endless chat. A short, private path from "someone\'s near" to "let\'s meet."',
    ob3_eyebrow: 'The promise', ob3_title: 'Make the first acquaintance easy.', ob3_body: 'No explicit rejection. Approximate location only. You stay in control of who can find you.', ob3_cta: 'Create my account',
    phone_sub: 'Verify your number', phone_title: 'Enter your phone', phone_body: 'We send a 6-digit code. Your number is never shown to anyone.', phone_label: 'Phone number', phone_cta: 'Send code', phone_note: 'Verification only — used to keep Wingman free of fake profiles.',
    phone_body_ft: 'Enter your real number. In this field-test build, no SMS is sent — you will use a coordinator code.',
    otp_sub: 'Enter the code', otp_title: '6-digit code', otp_body: 'Sent to your phone', otp_cta: 'Verify', otp_resend: 'Resend code',
    otp_body_ft: 'Field test for', otp_field_note: 'Field test verification — no SMS is sent. Use the code from your test coordinator.',
    t_auth_required: 'Sign in with your phone to continue', t_auth_ok: 'Signed in', t_otp_sent: 'Code sent', t_otp_ready_ft: 'Enter the field-test code', t_otp_bad: 'Invalid code', t_otp_expired: 'Code expired', t_otp_rate: 'Too many attempts — wait and retry', t_otp_not_allowed: 'This number is not on the field-test allow-list',
    profile_sub: 'Your profile', pf_name: 'First name', pf_birth: 'Date of birth', pf_birth_day: 'Day', pf_birth_month: 'Month', pf_birth_year: 'Year', pf_birth_hint: 'Tap each column — native picker on iPhone.',
    pf_gender: 'Gender', g_male: 'Male', g_female: 'Female', g_nb: 'Non-binary',
    pf_interest: 'Interested in', t_men: 'Men', t_women: 'Women', t_nb: 'Non-binary', pf_intention: 'Your intention', intention_available: 'Available now', intention_exploring: 'Just exploring', pf_height: 'Height (cm)', pf_interests: 'Interests (max 5)', pf_bio: 'Daily bio (150 max)',
    consent_sub: 'Your choices', consent_title: 'What you agree to', consent_body: 'Each purpose is separate. You can change these anytime in Settings.',
    c_core: 'Run the service', c_core_d: 'Required to match you and operate the protocol.', c_loc: 'Approximate location', c_loc_d: 'Coarse radius only — never your exact position.',
    c_destiny: 'Destiny Connection', c_destiny_d: 'Off by default. Coarse co-presence to spot repeated paths.', c_push: 'Push notifications', c_push_d: 'Signals, selfies, confirmations.',
    c_analytics: 'Product analytics', c_analytics_d: 'Optional. Helps improve Wingman.', consent_cta: 'Agree & activate Radar',
    radar_sub: 'Real-time discovery', radar_invisible: '—  Invisible', radar_active: '●  Active', radar_dist: 'Someone very close · Nearby', radar_activate: 'Go active', radar_deactivate: 'Go invisible',
    mood_ready: 'Super ready', mood_open: 'Open', mood_explore: 'Unsure', mood_ready_d: 'Meet now', mood_open_d: "If it's right", mood_explore_d: 'Just exploring', mood_title: 'Your mood',
    stat_signals: 'Signals left', stat_nearby: 'Nearby', stat_tickets: 'Active ticket',
    destiny_eyebrow: '✦ Destiny Connection', destiny_card_t: 'You keep crossing paths', destiny_card_d: 'Someone compatible keeps crossing your path — even off your radar.',
    send_signal: 'Send a Signal', close: 'Close',
    signal_sub: 'Signals received', signal_title: 'Someone wants to discover you', signal_body: 'Respond before it silently expires. No one is ever told they were declined.', open: 'Open', sig_expired: 'Expired — 2 min ago',
    signal_silent: 'No "decline" button exists. Silent expiration is the only failure signal.',
    s_live: 'Live capture', s_stamp: 'Timestamped', s_gallery: 'Gallery blocked', s_send: 'Take & send selfie', s_letexpire: 'Let it expire', s_approve: 'Approve',
    s_note: 'The app blocks saving and sharing through its own interface; it cannot prevent every external capture.',
    confirmed: 'Connection confirmed',
    ticket_sub: 'Connection Ticket', ticket_badge: '🎟 Ticket active', ticket_title: "Can't meet right now?", ticket_body: 'Hold this opportunity — up to 2 hours on Free. No chat until you both open Mission Meet.', ticket_open: "I'm available now", ticket_later: 'Later',
    mm_sub: 'Mission Meet', mm_obj: 'Decide where to meet', mm_ph: 'Terrace side sounds good…', mm_note: '📵 Phone numbers and social handles are blocked automatically.', mm_meet: "Let's meet", mm_not: 'Not this time',
    mode_eyebrow: 'MISSION MODE', mode_title: 'Focus on this connection', mode_body: '"Great meetings deserve your full attention."', mode_invisible: "● You're invisible on the Radar", mode_cta: 'We met — continue',
    outcome_title: 'Did you meet?', outcome_body: 'Your answer stays private. The other person never sees it.', outcome_yes: 'Yes, we met', outcome_no: 'Not this time',
    cd_eyebrow: 'COOLDOWN', cd_min: 'minutes', cd_title: 'Take your time.', cd_body: '"Great conversations don\'t need another match immediately."', cd_ok: 'Back to Radar',
    destiny_title: 'Fate keeps nudging.', destiny_body: "You've crossed paths with someone compatible several times, in public places, on different days. No location, date, or address is shown.", destiny_try: 'Send a Destiny Signal', destiny_ignore: 'Ignore', destiny_off: 'Destiny is off by default and can be paused anytime in Settings.',
    pulse_sub: 'Compatible activity zones', pulse_anon: 'Aggregated · Anonymized', pz1: 'Strong compatible activity · 200 m', pz2: 'Exceptional event · 1.2 km', pz3: 'Moderate activity · 800 m', pulse_note: 'Zones are aggregated and anonymized.',
    settings_sub: 'Settings & privacy', set_plan: 'Your plan', set_plan_name: 'Plan', set_plan_signals: 'Signals / day', set_plan_tickets: 'Active tickets', set_plan_note: 'Payments are not available in this build.',
    set_privacy: 'Privacy', set_photo: 'Public photo', set_none: '✗ None', set_loc: 'Precise location', set_never: '✗ Never shared', set_consent: 'Data consent', set_accepted: '✓ Managed', set_gdpr: 'GDPR compliance', set_designed: '✓ Designed for',
    set_controls: 'Controls', set_destiny: 'Destiny Connection', set_rm: 'Reduce motion', set_haptics: 'Haptics', set_rights: 'Your data (GDPR)', set_export: 'Export my data (JSON)', set_delete: 'Delete my account', set_admin: 'Admin moderation preview →',
    report_sub: 'Report & block', report_title: 'What happened?', report_body: 'Blocking is instant and silent. The other person is never notified.',
    rc_harass: 'Harassment', rc_threat: 'Threat', rc_imp: 'Impersonation', rc_sexual: 'Sexual content', rc_minor: 'Minor safety', rc_contact: 'Off-platform contact',
    report_done_badge: '✓ Blocked & reported', report_done_t: "You won't see each other again.", report_done_b: 'Repeated independent reports trigger human review — not an automatic permanent ban.', report_done_cta: 'Back to Radar',
    plan_sub: 'Your plan', plan_active: 'Active', plan_payments_off: 'Payments are disabled. No checkout in this build.', plan_back: 'Back to Settings',
    pw_f1: '2 Signals / day', pw_f2: '1 Ticket — up to 2h', pw_f3: 'Destiny Connection included', pw_f4: 'Mission Meet 15 min',
    admin_sub: 'Moderation queue', admin_body: 'Evidence is only created when a user reports during a session, and is stored encrypted outside the main database. Every access is audit-logged.',
    admin_pending: 'PENDING', admin_review: 'UNDER REVIEW', admin_resolved: 'RESOLVED', admin_c1: '3 independent reports · category: Off-platform contact', admin_c2: '1 report · Harassment · evidence sealed', admin_c3: 'Dismissed — coordinated false reports detected', admin_back: '← Back to app',
    nav_radar: 'Radar', nav_signal: 'Signal', nav_pulse: 'Pulse', nav_settings: 'Settings',
    t_signal_sent: 'Signal sent · silent expiry in 10 min', t_mood: 'Mood updated', t_blocked: 'Blocked: contact details are not allowed', t_active: "You're visible on the Radar", t_invisible: "You're invisible",
    t_api_mock: 'Demo mode — not connected', t_api_live: 'Connected',
    t_api_unreachable: 'Can\'t reach Wingman — try again', t_api_unconfigured: 'App misconfigured — contact coordinator',
    t_field_build: 'Field test build',
    t_loading: 'Loading…', t_accepting: 'Opening connection…', t_selfie: 'Sending selfie…', t_approving: 'Confirming…',
    t_meet: 'Opening Mission Meet…', t_ticket: 'Holding ticket…', t_chat: 'Sending…', t_outcome: 'Saving outcome…',
    t_timeout: 'Taking too long — try again', t_offline_blocked: 'Offline — try again', t_offline_banner: 'Offline — timers keep running on the server',
    t_reconnecting: 'Reconnecting…', t_reconnected: 'Back online', t_reconnect_fail: 'Still offline', t_reconnect: 'Reconnect',
    empty_radar: 'Go active to see who’s nearby.', empty_radar_alone: 'Nobody nearby right now.', empty_signals: 'No Signals right now. When someone reaches out, it appears here.',
    mood_shape_ring: ' · ring', mood_shape_solid: ' · solid', mood_shape_quiet: ' · quiet',
    a11y_skip: 'Skip to app', t_smoke_ok: 'P4 smoke OK', t_smoke_fail: 'P4 smoke failed',
    t_phase_idle: 'Ready', t_phase_available: 'Available on Radar', t_phase_busy: 'Busy', t_phase_unavailable: 'Unavailable',
    t_phase_signal: 'Signal in progress', t_phase_validation: 'Validation pending', t_phase_match: 'Match created',
    t_phase_mission: 'Mission active', t_phase_cooldown: 'Cooldown', t_phase_offline: 'Offline',
    t_signal_received: 'Signal received', t_validation: 'Validation pending', t_match: 'Connection confirmed',
    t_mission_active: 'Mission Meet open', t_mission_done: 'Mission complete', t_cooldown_on: 'Cooldown started',
    t_session_restored: 'Session restored',
  },
  fr: {
    brandtag: 'Facilitez la première rencontre', splash_tag: "Facilitez la première rencontre.", splash_love: 'Un protocole discret pour le premier pas.', splash_cta: 'Commencer',
    next: 'Suivant', ob_eyebrow: 'Le problème',
    ob1_title: 'Vous vous croisez. Rien ne se passe.', ob1_body: "Chaque jour, vous croisez quelqu'un que vous aimeriez rencontrer — sans rien dire. Wingman est fait pour cet instant précis.",
    ob2_eyebrow: 'La solution', ob2_title: 'Un protocole discret, pas un fil de swipe.', ob2_body: "Pas de profils publics. Pas de chat infini. Un chemin court et privé de « quelqu'un est proche » à « on se voit ».",
    ob3_eyebrow: 'La promesse', ob3_title: 'Faites le premier pas, en sécurité.', ob3_body: "Aucun rejet explicite. Localisation approximative uniquement. Vous contrôlez qui peut vous trouver.", ob3_cta: 'Créer mon compte',
    phone_sub: 'Vérifiez votre numéro', phone_title: 'Votre téléphone', phone_body: 'Nous envoyons un code à 6 chiffres. Votre numéro n\'est jamais montré.', phone_label: 'Numéro de téléphone', phone_cta: 'Envoyer le code', phone_note: 'Vérification uniquement — pour garder Wingman sans faux profils.',
    phone_body_ft: 'Entrez votre vrai numéro. Dans ce build field-test, aucun SMS n\'est envoyé — utilisez le code du coordinateur.',
    otp_sub: 'Entrez le code', otp_title: 'Code à 6 chiffres', otp_body: 'Envoyé sur votre téléphone', otp_cta: 'Vérifier', otp_resend: 'Renvoyer le code',
    otp_body_ft: 'Field test pour', otp_field_note: 'Vérification field test — aucun SMS n\'est envoyé. Utilisez le code fourni par le coordinateur.',
    t_auth_required: 'Connectez-vous avec votre téléphone', t_auth_ok: 'Connecté', t_otp_sent: 'Code envoyé', t_otp_ready_ft: 'Entrez le code field-test', t_otp_bad: 'Code invalide', t_otp_expired: 'Code expiré', t_otp_rate: 'Trop de tentatives — réessayez plus tard', t_otp_not_allowed: 'Ce numéro n\'est pas sur la allow-list field-test',
    profile_sub: 'Votre profil', pf_name: 'Prénom', pf_birth: 'Date de naissance', pf_birth_day: 'Jour', pf_birth_month: 'Mois', pf_birth_year: 'Année', pf_birth_hint: 'Touchez chaque colonne — molette native sur iPhone.',
    pf_gender: 'Genre', g_male: 'Homme', g_female: 'Femme', g_nb: 'Non-binaire',
    pf_interest: 'Intéressé·e par', t_men: 'Hommes', t_women: 'Femmes', t_nb: 'Non-binaire', pf_intention: 'Votre intention', intention_available: 'Disponible maintenant', intention_exploring: 'Juste explorer', pf_height: 'Taille (cm)', pf_interests: "Centres d'intérêt (max 5)", pf_bio: 'Bio du jour (150 max)',
    consent_sub: 'Vos choix', consent_title: 'Ce que vous acceptez', consent_body: 'Chaque finalité est distincte. Modifiable à tout moment dans Réglages.',
    c_core: 'Faire fonctionner le service', c_core_d: 'Nécessaire pour vous mettre en relation et opérer le protocole.', c_loc: 'Localisation approximative', c_loc_d: 'Rayon grossier uniquement — jamais votre position exacte.',
    c_destiny: 'Destiny Connection', c_destiny_d: 'Désactivé par défaut. Co-présence grossière pour repérer les croisements.', c_push: 'Notifications push', c_push_d: 'Signaux, selfies, confirmations.',
    c_analytics: 'Analytique produit', c_analytics_d: 'Optionnel. Aide à améliorer Wingman.', consent_cta: 'Accepter & activer le Radar',
    radar_sub: 'Découverte en temps réel', radar_invisible: '—  Invisible', radar_active: '●  Actif', radar_dist: 'Quelqu\'un très proche · À proximité', radar_activate: 'Devenir actif', radar_deactivate: 'Devenir invisible',
    mood_ready: 'Prêt·e', mood_open: 'Ouvert·e', mood_explore: 'Incertain·e', mood_ready_d: 'Se voir maintenant', mood_open_d: 'Si c\'est le bon', mood_explore_d: 'Juste explorer', mood_title: 'Mon humeur',
    stat_signals: 'Signaux restants', stat_nearby: 'À proximité', stat_tickets: 'Ticket actif',
    destiny_eyebrow: '✦ Destiny Connection', destiny_card_t: 'Vous vous croisez souvent', destiny_card_d: 'Quelqu\'un de compatible croise votre route — même hors de votre radar.',
    send_signal: 'Envoyer un Signal', close: 'Fermer',
    signal_sub: 'Signaux reçus', signal_title: 'Quelqu\'un veut vous découvrir', signal_body: 'Répondez avant l\'expiration silencieuse. Personne n\'est jamais informé d\'un refus.', open: 'Ouvrir', sig_expired: 'Expiré — il y a 2 min',
    signal_silent: 'Aucun bouton « Refuser ». L\'expiration silencieuse est le seul signal d\'échec.',
    s_live: 'Capture live', s_stamp: 'Horodaté', s_gallery: 'Galerie bloquée', s_send: 'Prendre & envoyer', s_letexpire: 'Laisser expirer', s_approve: 'Approuver',
    s_note: 'L\'app empêche l\'enregistrement et le partage via ses propres interfaces ; elle ne peut empêcher toute capture externe.',
    confirmed: 'Connexion confirmée',
    ticket_sub: 'Connection Ticket', ticket_badge: '🎟 Ticket actif', ticket_title: 'Pas dispo maintenant ?', ticket_body: 'Gardez cette opportunité — jusqu\'à 2 h en Gratuit. Pas de chat avant d\'ouvrir Mission Meet à deux.', ticket_open: 'Je suis dispo', ticket_later: 'Plus tard',
    mm_sub: 'Mission Meet', mm_obj: 'Décidez d\'un lieu', mm_ph: 'Côté terrasse, ça marche…', mm_note: '📵 Numéros et réseaux sociaux bloqués automatiquement.', mm_meet: 'On se retrouve', mm_not: 'Pas cette fois',
    mode_eyebrow: 'MODE MISSION', mode_title: 'Concentrez-vous sur cette connexion', mode_body: '« Les vraies rencontres méritent toute votre attention. »', mode_invisible: '● Vous êtes invisible sur le Radar', mode_cta: 'On s\'est vus — continuer',
    outcome_title: 'Vous êtes-vous rencontrés ?', outcome_body: 'Votre réponse reste privée. L\'autre ne la voit jamais.', outcome_yes: 'Oui, on s\'est vus', outcome_no: 'Pas cette fois',
    cd_eyebrow: 'COOLDOWN', cd_min: 'minutes', cd_title: 'Prenez le temps.', cd_body: '« Les bonnes rencontres n\'ont pas besoin d\'un nouveau match immédiatement. »', cd_ok: 'Retour au Radar',
    destiny_title: 'Le destin insiste.', destiny_body: 'Vous avez croisé quelqu\'un de compatible plusieurs fois, dans des lieux publics, à des jours différents. Aucun lieu, date ou adresse n\'est montré.', destiny_try: 'Envoyer un Signal Destiny', destiny_ignore: 'Ignorer', destiny_off: 'Destiny est désactivé par défaut et peut être mis en pause dans Réglages.',
    pulse_sub: 'Zones d\'activité compatibles', pulse_anon: 'Agrégé · Anonymisé', pz1: 'Forte activité compatible · 200 m', pz2: 'Événement exceptionnel · 1,2 km', pz3: 'Activité modérée · 800 m', pulse_note: 'Zones agrégées et anonymisées.',
    settings_sub: 'Réglages & vie privée', set_plan: 'Votre offre', set_plan_name: 'Offre', set_plan_signals: 'Signaux / jour', set_plan_tickets: 'Tickets actifs', set_plan_note: 'Les paiements ne sont pas disponibles dans cette version.',
    set_privacy: 'Vie privée', set_photo: 'Photo publique', set_none: '✗ Aucune', set_loc: 'Localisation précise', set_never: '✗ Jamais partagée', set_consent: 'Consentement données', set_accepted: '✓ Géré', set_gdpr: 'Conformité RGPD', set_designed: '✓ Conçu pour',
    set_controls: 'Contrôles', set_destiny: 'Destiny Connection', set_rm: 'Réduire les animations', set_haptics: 'Retour haptique', set_rights: 'Vos données (RGPD)', set_export: 'Exporter mes données (JSON)', set_delete: 'Supprimer mon compte', set_admin: 'Aperçu modération admin →',
    report_sub: 'Signaler & bloquer', report_title: 'Que s\'est-il passé ?', report_body: 'Le blocage est instantané et silencieux. L\'autre personne n\'est jamais notifiée.',
    rc_harass: 'Harcèlement', rc_threat: 'Menace', rc_imp: 'Usurpation', rc_sexual: 'Contenu sexuel', rc_minor: 'Sécurité mineurs', rc_contact: 'Contact hors plateforme',
    report_done_badge: '✓ Bloqué & signalé', report_done_t: 'Vous ne vous reverrez plus.', report_done_b: 'Des signalements indépendants répétés déclenchent une revue humaine — pas un bannissement automatique définitif.', report_done_cta: 'Retour au Radar',
    plan_sub: 'Votre offre', plan_active: 'Active', plan_payments_off: 'Paiements désactivés. Aucun checkout dans cette version.', plan_back: 'Retour aux réglages',
    pw_f1: '2 Signaux / jour', pw_f2: '1 Ticket — jusqu\'à 2 h', pw_f3: 'Destiny Connection incluse', pw_f4: 'Mission Meet 15 min',
    admin_sub: 'File de modération', admin_body: 'La preuve n\'est créée que si un utilisateur signale pendant une session, et stockée chiffrée hors de la base principale. Chaque accès est journalisé.',
    admin_pending: 'EN ATTENTE', admin_review: 'EN REVUE', admin_resolved: 'RÉSOLU', admin_c1: '3 signalements indépendants · catégorie : Contact hors plateforme', admin_c2: '1 signalement · Harcèlement · preuve scellée', admin_c3: 'Rejeté — faux signalements coordonnés détectés', admin_back: '← Retour à l\'app',
    nav_radar: 'Radar', nav_signal: 'Signal', nav_pulse: 'Pulse', nav_settings: 'Réglages',
    t_signal_sent: 'Signal envoyé · expiration silencieuse dans 10 min', t_mood: 'Humeur mise à jour', t_blocked: 'Bloqué : les coordonnées ne sont pas autorisées', t_active: 'Vous êtes visible sur le Radar', t_invisible: 'Vous êtes invisible',
    t_api_mock: 'Mode démo — non connecté', t_api_live: 'Connecté',
    t_api_unreachable: 'Wingman injoignable — réessayez', t_api_unconfigured: 'App mal configurée — contactez le coordinateur',
    t_field_build: 'Build test terrain',
    t_loading: 'Chargement…', t_accepting: 'Ouverture de la connexion…', t_selfie: 'Envoi du selfie…', t_approving: 'Confirmation…',
    t_meet: 'Ouverture Mission Meet…', t_ticket: 'Ticket en cours…', t_chat: 'Envoi…', t_outcome: 'Enregistrement…',
    t_timeout: 'Trop long — réessayez', t_offline_blocked: 'Hors ligne — réessayez', t_offline_banner: 'Hors ligne — les timers continuent côté serveur',
    t_reconnecting: 'Reconnexion…', t_reconnected: 'De retour en ligne', t_reconnect_fail: 'Toujours hors ligne', t_reconnect: 'Reconnecter',
    empty_radar: 'Activez le Radar pour voir qui est à proximité.', empty_radar_alone: 'Personne à proximité pour l’instant.', empty_signals: 'Aucun Signal pour l’instant. Ils apparaîtront ici.',
    mood_shape_ring: ' · anneau', mood_shape_solid: ' · plein', mood_shape_quiet: ' · calme',
    a11y_skip: 'Aller à l’app', t_smoke_ok: 'Smoke P4 OK', t_smoke_fail: 'Smoke P4 échoué',
    t_phase_idle: 'Prêt', t_phase_available: 'Disponible sur le Radar', t_phase_busy: 'Occupé', t_phase_unavailable: 'Indisponible',
    t_phase_signal: 'Signal en cours', t_phase_validation: 'Validation en cours', t_phase_match: 'Match créé',
    t_phase_mission: 'Mission active', t_phase_cooldown: 'Cooldown', t_phase_offline: 'Hors ligne',
    t_signal_received: 'Signal reçu', t_validation: 'Validation en cours', t_match: 'Connexion confirmée',
    t_mission_active: 'Mission Meet ouverte', t_mission_done: 'Mission terminée', t_cooldown_on: 'Cooldown démarré',
    t_session_restored: 'Session restaurée',
  },
};

function applyLang() {
  const dict = I18N[state.lang];
  $$('[data-i18n]').forEach(el => { const k = el.dataset.i18n; if (dict[k] != null) el.textContent = dict[k]; });
  $$('[data-i18n-ph]').forEach(el => { const k = el.dataset.i18nPh; if (dict[k] != null) el.placeholder = dict[k]; });
  buildNav();
  // keep radar state label correct
  const rs = $('#radar-state');
  if (rs) rs.textContent = state.radarActive ? dict.radar_active : dict.radar_invisible;
  if (typeof applyFieldTestAuthCopy === 'function') applyFieldTestAuthCopy();
  if (typeof refreshBirthMonthLabels === 'function') refreshBirthMonthLabels();
}
const t = k => I18N[state.lang][k] || k;

/* ------------------------------------------------------------ toast/haptic */
let toastTimer;
function toast(msg, kind) {
  feedback(kind || 'info', msg);
}
function feedback(kind, msg) {
  const el = $('#toast');
  if (!el || !msg) return;
  el.textContent = msg;
  el.className = 'toast show kind-' + (kind || 'info');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 2600);
}
// Haptics policy — doubleSoft reserved for connectionConfirmed.
function haptic(kind) {
  if (!('vibrate' in navigator)) return;
  const map = { selection: 10, signalSent: 20, connectionConfirmed: [30, 40, 30], timeWarning: 25, error: [40] };
  navigator.vibrate(map[kind] || 0);
}

function announce(msg) {
  const el = $('#a11y-announce');
  if (!el || !msg) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = msg; });
}

function syncViewA11y(activeId) {
  $$('.view').forEach(v => {
    const on = v.id === activeId;
    v.classList.toggle('active', on);
    v.setAttribute('aria-hidden', on ? 'false' : 'true');
    if ('inert' in v) v.inert = !on;
  });
}

function focusActiveView(id) {
  const v = $('#' + id);
  if (!v) return;
  const target = v.querySelector('[data-autofocus], h1.big, h2.head, .btn-primary, .act-primary, [tabindex="0"]');
  if (target && typeof target.focus === 'function') {
    try { target.focus({ preventScroll: true }); } catch (_) { try { target.focus(); } catch (__) {} }
  }
}

/* ------------------------------------------------------------- navigation */
let confirmedAdvanceTimer = null;
function show(id) {
  if (confirmedAdvanceTimer) {
    clearTimeout(confirmedAdvanceTimer);
    confirmedAdvanceTimer = null;
  }
  const protocolViews = new Set([
    'v-radar', 'v-signal', 'v-selfie', 'v-ticket', 'v-mission-meet', 'v-mission-mode',
    'v-outcome', 'v-cooldown', 'v-confirmed', 'v-destiny', 'v-pulse', 'v-settings',
  ]);
  // Public product: block protocol UI without OTP — stop ghost Radar / dead Go active.
  if (protocolViews.has(id) && api && api.productPath && !isAuthedSession()) {
    feedback('busy', t('t_auth_required'));
    id = 'v-phone';
  }
  syncViewA11y(id);
  const v = $('#' + id); if (!v) return;
  state.viewId = id;
  const screen = $('#main-screen');
  if (screen) screen.scrollTop = 0;
  const body = $('.body', v); if (body) body.scrollTop = 0;
  onEnter(id);
  persistSession();
  const title = ($('.subtitle', v) || $('h1', v) || $('h2', v));
  if (title) announce(title.textContent.trim());
  requestAnimationFrame(() => focusActiveView(id));
}
const NAV = [
  ['v-radar', 'radar', 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0 M12 12m-6 0a6 6 0 1012 0 6 6 0 10-12 0'],
  ['v-signal', 'signal', 'M13 2L4 14h7l-1 8 9-12h-7z'],
  ['v-pulse', 'pulse', 'M3 12h4l2-7 4 14 2-7h6'],
  ['v-settings', 'settings', 'M12 15a3 3 0 100-6 3 3 0 000 6z M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1L14.5 3h-4l-.3 2.6a7 7 0 00-1.7 1l-2.4-1-2 3.4L4.1 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1L9.5 21h4l.3-2.6a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z'],
];
function buildNav() {
  $$('[data-navbar]').forEach(bar => {
    const current = bar.closest('.view').dataset.nav;
    bar.innerHTML = NAV.map(([vid, key, d]) =>
      `<button data-go="${vid}" ${key === current ? 'aria-current="page"' : ''}>
        <svg class="ico" viewBox="0 0 24 24"><path d="${d}"/></svg>
        <span>${t('nav_' + key)}</span></button>`).join('');
    $$('button', bar).forEach(b => b.addEventListener('click', () => show(b.dataset.go)));
  });
}

/* ------------------------------------------------------------- RADAR canvas */
const canvas = $('#radar-canvas');
const ctx = canvas.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 2);
function sizeCanvas() {
  const w = canvas.clientWidth || 400, h = 340;
  canvas.width = w * DPR; canvas.height = h * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
const MOOD_COLORS = { SUPER_READY: '#FF4D67', OPEN: '#FFC857', UNSURE: '#F4F5F7', EXPLORING: '#F4F5F7' };
const MOOD_GLOW = { SUPER_READY: 'rgba(255,77,103,.34)', OPEN: 'rgba(255,200,87,.30)', UNSURE: 'rgba(244,245,247,.20)', EXPLORING: 'rgba(244,245,247,.20)' };
// Live eligible candidates only — starts empty (alone = 0 Nearby).
const dots = [];
let signalWave = null; // {x,y,t} — one-shot Signal (blue)
let activateBurst = null; // {t} — one-shot Radar go-active
let rafId = null;

function buildingShapes(w, h) {
  // deterministic abstract urban masses (no real geography)
  return [
    [.10, .12, .16, .22], [.62, .10, .20, .16], [.80, .40, .14, .30],
    [.08, .60, .18, .26], [.44, .18, .12, .12], [.30, .78, .22, .14], [.58, .70, .18, .18],
  ].map(([x, y, bw, bh]) => ({ x: x * w, y: y * h, w: bw * w, h: bh * h }));
}
function drawRadar() {
  const w = canvas.clientWidth || 400, h = 340, cx = w / 2, cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#080D1A'; ctx.fillRect(0, 0, w, h);
  // abstract urban masses
  ctx.fillStyle = '#161E31';
  buildingShapes(w, h).forEach(b => { roundRect(b.x, b.y, b.w, b.h, 6); ctx.fill(); });
  // concentric rings
  ctx.strokeStyle = 'rgba(124,92,252,.10)'; ctx.lineWidth = 1;
  [50, 100, 150].forEach(r => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });
  // your position — static glow (no infinite pulse; Mission alone may breathe in CSS)
  const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
  grd.addColorStop(0, 'rgba(155,135,255,.45)'); grd.addColorStop(1, 'rgba(155,135,255,0)');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9B87FF'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  // go-active burst — explains Available transition once
  if (activateBurst && !state.reduceMotion) {
    const age = (performance.now() - activateBurst.t) / 700;
    if (age >= 1) activateBurst = null;
    else {
      const rad = 16 + age * 90, alpha = 0.28 * (1 - age);
      ctx.strokeStyle = `rgba(64,211,156,${alpha})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (activateBurst && state.reduceMotion) {
    activateBurst = null;
  }
  // other people's mood dots (only when radar active)
  if (state.radarActive) {
    dots.forEach(d => {
      const x = d.x * w, y = d.y * h, col = MOOD_COLORS[d.mood];
      const g = ctx.createRadialGradient(x, y, 1, x, y, 16);
      g.addColorStop(0, MOOD_GLOW[d.mood]); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
      // Super ready: static second ring (shape language — not infinite pulse)
      if (d.mood === 'SUPER_READY') {
        ctx.strokeStyle = 'rgba(255,77,103,0.4)';
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }
  // Signal wave — one-shot, blue (--proto-signal), not Match violet
  if (signalWave) {
    const dur = state.reduceMotion ? 1 : 900;
    const age = (performance.now() - signalWave.t) / dur;
    if (age >= 1) { signalWave = null; }
    else if (!state.reduceMotion) {
      const rad = 20 + age * 120, alpha = 0.4 * (1 - age);
      ctx.strokeStyle = `rgba(124,156,255,${alpha})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(signalWave.x, signalWave.y, rad, 0, Math.PI * 2); ctx.stroke();
    } else {
      signalWave = null;
    }
  }
  // RAF only while a one-shot protocol motion is running
  if ((signalWave || activateBurst) && !state.reduceMotion) {
    rafId = requestAnimationFrame(drawRadar);
  } else {
    rafId = null;
  }
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function startRadar() { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(drawRadar); }

// tap a dot -> open anonymous sheet
let currentDot = null;
canvas.addEventListener('click', e => {
  if (!state.radarActive) { toast(state.lang === 'fr' ? 'Activez le Radar pour découvrir' : 'Go active to discover'); return; }
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width, py = (e.clientY - rect.top) / rect.height;
  let best = null, bd = 1;
  dots.forEach(d => { const dist = Math.hypot(d.x - px, d.y - py); if (dist < 0.09 && dist < bd) { bd = dist; best = d; } });
  if (best) openSheet(best);
});
function openSheet(d) {
  if (!d || !d.userId) return;
  currentDot = d;
  $('#sheet-mood').textContent = '● ' + t('mood_' + (d.mood === 'SUPER_READY' ? 'ready' : d.mood === 'OPEN' ? 'open' : 'explore'));
  $('#sheet-mood').style.color = MOOD_COLORS[d.mood];
  const band = d.band === 'NEAR'
    ? (state.lang === 'fr' ? 'Très proche' : 'Very close')
    : (state.lang === 'fr' ? 'À proximité' : 'Nearby');
  $('#sheet-age').textContent = band;
  $('#sheet-bio').textContent = (state.lang === 'fr' ? d.bioFr : d.bio) || (state.lang === 'fr' ? 'Profil anonyme' : 'Anonymous profile');
  $('#sheet-tags').innerHTML = (d.tags || []).map(x => `<span>${x}</span>`).join('');
  const sheet = $('#dot-sheet');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  announce($('#sheet-age').textContent + ' · ' + $('#sheet-mood').textContent);
  requestAnimationFrame(() => { const b = $('#send-signal-btn'); if (b) b.focus(); });
}
$('#close-sheet').addEventListener('click', () => {
  const sheet = $('#dot-sheet');
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  const canvasEl = $('#radar-canvas'); if (canvasEl) canvasEl.focus();
});
canvas.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  if (!state.radarActive) {
    feedback('busy', state.lang === 'fr' ? 'Activez le Radar pour découvrir' : 'Go active to discover');
    return;
  }
  if (!dots.length) {
    feedback('busy', t('empty_radar_alone'));
    return;
  }
  openSheet(dots[0]);
});
$('#send-signal-btn').addEventListener('click', async () => {
  if (state.busy) return;
  if (!requireAuthOrPhone()) return;
  if (state.signalsLeft <= 0) { toast(state.lang === 'fr' ? 'Plus de signaux aujourd\'hui' : 'No signals left today'); return; }
  const targetId = currentDot && currentDot.userId;
  if (!targetId || targetId === state.meId) {
    feedback('busy', t('empty_radar_alone'));
    return;
  }
  const w = canvas.clientWidth || 400; signalWave = { x: w / 2, y: 170, t: performance.now() };
  startRadar(); haptic('signalSent');
  $('#dot-sheet').classList.remove('open');
  $('#dot-sheet').setAttribute('aria-hidden', 'true');

  if (liveApi()) {
    try {
      await withLoading(t('t_loading'), async () => {
        await api.radarActivate({ lat: 49.6116, lng: 6.1319, visibility: 'ACTIVE' });
        const res = await api.sendSignal(
          { receiverId: targetId, source: 'RADAR' },
          { idempotencyKey: 'proto-' + Date.now() },
        );
        state.signalId = res && res.signal && res.signal.id;
        state.peerId = targetId;
        state.signalsLeft = Math.max(0, state.signalsLeft - 1);
        $('#stat-signals').textContent = state.signalsLeft;
      });
      // Sender stays on Radar — recipient gets signal.received over realtime.
      setPhase('available', t('t_phase_available'));
      feedback('signal', t('t_signal_sent'));
      return;
    } catch (_) {
      feedback('error', t('t_api_unreachable'));
      return;
    }
  }
  // Offline / unreachable product path: do not invent a demo peer Signal.
  feedback('busy', t('t_api_unreachable'));
});

/* ------------------------------------------------------- radar toggle/mood */
$('#radar-toggle').addEventListener('click', async () => {
  if (state.busy) return;
  if (!requireAuthOrPhone()) return;
  const next = !state.radarActive;
  if (liveApi()) {
    try {
      if (next) {
        await withLoading(t('t_loading'), async () => {
          await api.radarActivate({ lat: 49.6116, lng: 6.1319, visibility: 'ACTIVE' });
          const cands = await api.radarCandidates();
          applyRadarCandidates(cands);
        });
      } else {
        await withLoading(t('t_loading'), async () => {
          await api.radarDeactivate();
          clearRadarDots();
        });
      }
    } catch (e) {
      if (e && e.code === 'UNAUTHORIZED') {
        clearProtoSession();
        try { api.clearSession(); } catch (_) { /* ignore */ }
        feedback('busy', t('t_auth_required'));
        show('v-phone');
      }
      return;
    }
  } else {
    // Offline / mock: never invent nearby density.
    clearRadarDots();
  }
  state.radarActive = next;
  const btn = $('#radar-toggle'), st = $('#radar-state');
  btn.classList.toggle('off', !state.radarActive);
  btn.setAttribute('aria-pressed', String(state.radarActive));
  btn.textContent = state.radarActive ? t('radar_deactivate') : t('radar_activate');
  st.textContent = state.radarActive ? t('radar_active') : t('radar_invisible');
  st.classList.toggle('invisible', !state.radarActive);
  if (state.radarActive && !state.reduceMotion) activateBurst = { t: performance.now() };
  haptic('selection'); startRadar();
  syncRadarEmpty();
  setPhase(state.radarActive ? 'available' : 'idle');
  feedback(state.radarActive ? 'success' : 'offline', state.radarActive ? t('t_active') : t('t_invisible'));
});
$('#mood-select').addEventListener('click', e => {
  const b = e.target.closest('.mood-btn'); if (!b) return;
  $$('#mood-select .mood-btn').forEach(x => x.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true'); state.mood = b.dataset.mood;
  haptic('selection'); toast(t('t_mood'));
});

/* ------------------------------------------------- server-authoritative timers
   A timer is defined by an absolute expiresAt from the (simulated) server.
   The client renders remaining = expiresAt - serverNow(). Going offline does
   NOT pause it. The 30s warning is derived locally from server time, so no
   exact server event is needed. */
function makeTimer({ durationSec, textEl, barEl, onWarn, onExpire }) {
  const expiresAt = state.serverNow() + durationSec * 1000;
  let warned = false, iv;
  const tick = () => {
    const remaining = Math.max(0, Math.round((expiresAt - state.serverNow()) / 1000));
    const mm = Math.floor(remaining / 60), ss = String(remaining % 60).padStart(2, '0');
    if (textEl) textEl.textContent = `${mm}:${ss}`;
    if (barEl) {
      const pct = (remaining / durationSec) * 100;
      barEl.style.width = pct + '%';
      barEl.style.background = remaining <= 30 ? '#FF4D67' : remaining <= 120 ? '#FFC857' : '#F4F5F7';
    }
    if (remaining <= 30 && !warned) { warned = true; haptic('timeWarning'); onWarn && onWarn(); }
    if (remaining <= 0) { clearInterval(iv); onExpire && onExpire(); }
  };
  tick(); iv = setInterval(tick, 1000);
  return () => clearInterval(iv);
}

/* -------------------------------------------------------------- per-screen */
let stopSelfie, stopMM, sigStop;
function onEnter(id) {
  if (id === 'v-radar') {
    sizeCanvas(); startRadar(); syncRadarEmpty();
    if (!state.offline) setPhase(state.radarActive ? 'available' : 'idle');
  }
  if (id === 'v-signal') {
    state.hasIncomingSignal = Boolean(state.signalId) || state.hasIncomingSignal;
    syncSignalEmpty();
    if (state.hasIncomingSignal || state.signalId) {
      setPhase('signal', t('t_phase_signal'));
      markSignalArrive();
    }
    if (sigStop) sigStop();
    let s = 420; const el = $('#sig-timer');
    const iv = setInterval(() => {
      s--;
      const m = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
      if (el) el.textContent = (state.lang === 'fr' ? 'Expire dans ' : 'Expires in ') + `${m}:${ss}`;
      if (s <= 0) {
        clearInterval(iv);
        state.hasIncomingSignal = false;
        syncSignalEmpty();
        feedback('busy', t('sig_expired'));
      }
    }, 1000);
    sigStop = () => clearInterval(iv);
  }
  if (id === 'v-selfie') {
    setPhase('validation', t('t_phase_validation'));
    $('#selfie-validate').classList.add('hidden'); $('#selfie-send').classList.remove('hidden');
    const stamp = $('#selfie-stamp');
    const now = new Date();
    stamp.textContent = `${now.toISOString().slice(0, 10)} · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    if (stopSelfie) stopSelfie();
    stopSelfie = makeTimer({ durationSec: 300, textEl: $('#selfie-timer'), barEl: $('#selfie-bar'),
      onExpire: () => { stopSelfieCamera(); feedback('busy', state.lang === 'fr' ? 'Expiré silencieusement' : 'Silently expired'); show('v-radar'); } });
    void startSelfieCamera();
  } else {
    stopSelfieCamera();
  }
  if (id === 'v-confirmed') {
    setPhase('match', t('t_phase_match'));
    const stage = $('#confirm-stage'); stage.classList.remove('fused'); void stage.offsetWidth; stage.classList.add('fused');
    haptic('connectionConfirmed');
    feedback('match', t('t_match'));
    confirmedAdvanceTimer = setTimeout(() => {
      confirmedAdvanceTimer = null;
      show('v-ticket');
    }, motionMs(900, 200));
  }
  if (id === 'v-ticket') {
    setPhase('match', t('t_phase_match'));
    if (realtime && state.connectionId) realtime.subscribeConnection(state.connectionId);
  }
  if (id === 'v-mission-meet') {
    setPhase('mission', t('t_phase_mission'));
    const modeView = $('#v-mission-mode');
    if (modeView) modeView.classList.remove('is-active');
    const modeInner = modeView && modeView.querySelector('.mission-mode');
    if (modeInner) modeInner.classList.remove('is-active');
    if (stopMM) stopMM();
    stopMM = makeTimer({ durationSec: 900, textEl: $('#mm-timer'), barEl: $('#mm-bar'),
      onExpire: () => { feedback('busy', state.lang === 'fr' ? 'Chat expiré' : 'Chat expired'); show('v-outcome'); } });
    feedback('mission', t('t_mission_active'));
    if (realtime && state.connectionId) realtime.subscribeConnection(state.connectionId);
    void restoreChatLog();
  }
  if (id === 'v-mission-mode') {
    setPhase('mission', t('t_phase_mission'));
    const modeView = $('#v-mission-mode');
    if (modeView) modeView.classList.add('is-active');
    const modeInner = modeView && modeView.querySelector('.mission-mode');
    if (modeInner) modeInner.classList.add('is-active');
  }
  if (id === 'v-outcome') setPhase('busy', t('t_phase_busy'));
  if (id === 'v-cooldown') {
    setPhase('cooldown', t('t_phase_cooldown'));
    feedback('busy', t('t_cooldown_on'));
  }
}

async function refreshConnectionUi() {
  if (!liveApi() || !state.connectionId) return null;
  const c = await api.connection(state.connectionId);
  const conn = c && c.connection;
  if (!conn) return null;
  state.connectionState = conn.state;
  if (realtime) realtime.subscribeConnection(state.connectionId);
  const st = conn.state;
  if (st === 'WAITING_FOR_INITIATOR_APPROVAL' || st === 'MUTUALLY_VALIDATED') {
    $('#selfie-send').classList.add('hidden');
    $('#selfie-validate').classList.remove('hidden');
    void showPeerSelfieIfAny(conn);
  }
  if (st === 'MUTUALLY_VALIDATED' && state.viewId === 'v-selfie') {
    show('v-confirmed');
  }
  return conn;
}

/* selfie send — camera capture → private upload → opaque mediaId (no peer impersonation on product path) */
$('#selfie-send').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_selfie'), async () => {
        const camOk = selfieStream || await startSelfieCamera();
        if (!camOk) {
          feedback('busy', state.lang === 'fr' ? 'Caméra requise' : 'Camera required');
          throw Object.assign(new Error('Camera required'), { code: 'CAMERA_DENIED' });
        }
        let blob;
        try {
          blob = await captureSelfieBlob();
        } catch (e) {
          feedback('busy', state.lang === 'fr' ? 'Capture impossible' : 'Capture failed');
          throw e;
        }
        let uploaded;
        try {
          uploaded = await api.uploadSelfieMedia(state.connectionId, blob);
        } catch (e) {
          const slow = e && (e.code === 'API_UNCONFIGURED' || e.status === 408 || e.status >= 500);
          feedback('busy', slow
            ? (state.lang === 'fr' ? 'Réseau lent — réessayez' : 'Slow network — try again')
            : (state.lang === 'fr' ? 'Envoi selfie échoué' : 'Selfie upload failed'));
          throw e;
        }
        if (!uploaded || !uploaded.mediaId) {
          feedback('busy', state.lang === 'fr' ? 'Media opaque manquant' : 'Opaque media missing');
          throw Object.assign(new Error('No mediaId'), { code: 'MEDIA_MISSING' });
        }
        await api.selfie(state.connectionId, { mediaId: uploaded.mediaId });
        if (allowPeerSim() && state.peerId) {
          // Lab-only: peer also must upload real bytes — tiny JPEG, never forged protocol mediaId alone.
          const peerBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
          const peerUp = await api.uploadSelfieMedia(state.connectionId, peerBlob, { userId: state.peerId });
          await api.selfie(state.connectionId, { mediaId: peerUp.mediaId }, { userId: state.peerId });
        }
        stopSelfieCamera();
        await refreshConnectionUi();
      });
    } catch (_) { return; }
  } else if (api && api.productPath) {
    feedback('busy', t('t_api_unreachable'));
    return;
  } else {
    // Offline / non-live: stay honest — do not invent a sent selfie on the product path.
    feedback('busy', state.lang === 'fr' ? 'API requise pour le selfie' : 'API required for selfie');
    return;
  }
});

$('#selfie-expire').addEventListener('click', () => show('v-radar'));
$('#selfie-approve').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_approving'), async () => {
        const res = await api.approve(state.connectionId);
        state.connectionState = res.connection && res.connection.state;
      });
    } catch (_) { return; }
  } else if (api && api.productPath) {
    feedback('busy', t('t_api_unreachable'));
    return;
  }
  show('v-confirmed');
});

$('#open-signal-btn').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.signalId) {
    try {
      await withLoading(t('t_accepting'), async () => {
        // Recipient acts as self — never impersonate peer on product path.
        await api.openSignal(state.signalId);
        const accept = await api.acceptSignal(state.signalId);
        state.connectionId = accept.connection && accept.connection.id;
        state.connectionState = accept.connection && accept.connection.state;
        if (realtime && state.connectionId) realtime.subscribeConnection(state.connectionId);
      });
    } catch (_) { return; }
  } else if (api && api.productPath) {
    feedback('busy', t('t_api_unreachable'));
    return;
  } else {
    state.connectionId = state.connectionId || 'demo-conn';
  }
  feedback('signal', t('t_signal_received'));
  setPhase('validation', t('t_phase_validation'));
  show('v-selfie');
});

$('#ticket-open-btn').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_meet'), async () => {
        const res = await api.meetNow(state.connectionId);
        state.connectionState = res.connection && res.connection.state;
      });
    } catch (_) { return; }
  }
  feedback('mission', t('t_mission_active'));
  show('v-mission-meet');
});

$('#ticket-later-btn').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_ticket'), async () => {
        const res = await api.ticket(state.connectionId);
        state.connectionState = res.connection && res.connection.state;
      });
    } catch (_) { /* still leave */ }
  }
  feedback('busy', t('t_ticket'));
  show('v-radar');
});

$('#mm-meet-btn').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_meet'), async () => {
        const res = await api.letsMeet(state.connectionId);
        state.connectionState = res.connection && res.connection.state;
      });
    } catch (_) { return; }
  }
  feedback('mission', t('t_mission_active'));
  show('v-mission-mode');
});

$('#mm-not-btn').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_loading'), async () => {
        const res = await api.notThisTime(state.connectionId);
        state.connectionState = res.connection && res.connection.state;
      });
    } catch (_) { return; }
  }
  show('v-outcome');
});

$('#mode-continue-btn').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_loading'), async () => {
        const cur = await api.connection(state.connectionId);
        const st = cur.connection && cur.connection.state;
        if (st === 'MISSION_CONFIRMED') {
          const res = await api.finishMeet(state.connectionId);
          state.connectionState = res.connection && res.connection.state;
        } else if (st === 'MISSION_MEET_ACTIVE') {
          const res = await api.notThisTime(state.connectionId);
          state.connectionState = res.connection && res.connection.state;
        } else {
          state.connectionState = st;
        }
      });
    } catch (_) { return; }
  }
  show('v-outcome');
});

/* mission meet chat + anti-contact filter */
const CONTACT_RE = /(\+?\d[\d\s().-]{6,}\d)|(@[A-Za-z0-9_.]{2,})|(\b\w+\.(com|net|io|fr|be|lu)\b)|(snap|insta|whatsapp|tiktok|telegram)/i;
const chatSeen = new Set();

function appendChatMessage(msg, mine) {
  const log = $('#chat-log');
  if (!log || !msg) return;
  const key = (msg.at || '') + '|' + (msg.senderId || '') + '|' + (msg.text || '');
  if (chatSeen.has(key)) return;
  chatSeen.add(key);
  const el = document.createElement('div');
  el.className = 'msg ' + (mine ? 'me' : 'them');
  el.textContent = msg.text || '';
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

async function restoreChatLog() {
  if (!liveApi() || !state.connectionId) return;
  try {
    const res = await api.listMessages(state.connectionId);
    const list = (res && res.messages) || [];
    chatSeen.clear();
    const log = $('#chat-log');
    if (log) log.innerHTML = '';
    list.forEach((m) => appendChatMessage(m, m.senderId === state.meId));
  } catch (_) { /* ignore */ }
}

async function sendChat() {
  if (state.busy) return;
  const f = $('#chat-field'), v = f.value.trim(); if (!v) return;
  const log = $('#chat-log');
  if (CONTACT_RE.test(v)) {
    const b = document.createElement('div'); b.className = 'msg blocked'; b.textContent = t('t_blocked');
    log.appendChild(b); haptic('error'); f.value = ''; log.scrollTop = log.scrollHeight; return;
  }
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_chat'), async () => {
        const res = await api.message(state.connectionId, { text: v });
        if (res && res.message && res.message.filtered) {
          const b = document.createElement('div'); b.className = 'msg blocked'; b.textContent = t('t_blocked');
          log.appendChild(b); haptic('error');
          return;
        }
        appendChatMessage({
          text: (res && res.message && res.message.text) || v,
          senderId: state.meId,
          at: (res && res.message && res.message.at) || new Date().toISOString(),
        }, true);
      });
      f.value = ''; log.scrollTop = log.scrollHeight;
      return;
    } catch (_) { return; }
  }
  if (api && api.productPath) {
    feedback('busy', t('t_api_unreachable'));
    return;
  }
  const m = document.createElement('div'); m.className = 'msg me'; m.textContent = v;
  log.appendChild(m); f.value = ''; log.scrollTop = log.scrollHeight;
}
$('#chat-send').addEventListener('click', sendChat);
$('#chat-field').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

/* outcome — own side only (peer answers on their device) */
async function submitOutcome(kind) {
  if (state.busy) return;
  $('#cd-num').textContent = kind === 'yes' ? '30' : '15';
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_outcome'), async () => {
        const o = kind === 'yes' ? 'YES' : 'NO';
        await api.outcome(state.connectionId, { outcome: o });
        if (allowPeerSim() && state.peerId) {
          await api.outcome(state.connectionId, { outcome: o }, { userId: state.peerId });
        }
        const c = await api.connection(state.connectionId);
        state.connectionState = c.connection && c.connection.state;
      });
    } catch (_) { return; }
  } else if (api && api.productPath) {
    feedback('busy', t('t_api_unreachable'));
    return;
  }
  feedback('success', t('t_mission_done'));
  show('v-cooldown');
}
$('#outcome-yes-btn').addEventListener('click', () => submitOutcome('yes'));
$('#outcome-no-btn').addEventListener('click', () => submitOutcome('no'));

/* generic data-go + destiny card keyboard */
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) { show(g.dataset.go); }
});
$$('[data-go][role="button"]').forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(el.dataset.go); } }));

/* switches (consent, settings) */
document.addEventListener('click', e => {
  const sw = e.target.closest('.switch[role="switch"]'); if (!sw || sw.getAttribute('aria-disabled') === 'true') return;
  const on = sw.getAttribute('aria-checked') === 'true'; sw.setAttribute('aria-checked', String(!on)); haptic('selection');
  if (sw.id === 'rm-switch') setReduceMotion(!on);
});
$$('.switch[role="switch"]').forEach(sw => sw.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sw.click(); } }));

/* report entry (from mission meet note / settings could link) */
/* Payments: no CTA — DisabledPaymentProvider only. */
void payments;

/* language */
$$('.chip.lang').forEach(b => b.addEventListener('click', () => {
  state.lang = b.dataset.lang;
  $$('.chip.lang').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  document.documentElement.lang = state.lang;
  applyLang();
}));

/* reduce motion */
function setReduceMotion(on) {
  state.reduceMotion = on;
  document.body.classList.toggle('reduce-motion', on);
  $('#rm-toggle').setAttribute('aria-pressed', String(on));
  const sw = $('#rm-switch'); if (sw) sw.setAttribute('aria-checked', String(on));
  signalWave = null;
  activateBurst = null;
  startRadar();
}
$('#rm-toggle').addEventListener('click', () => setReduceMotion(!state.reduceMotion));
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncRm = () => { if (mq.matches) setReduceMotion(true); };
  syncRm();
  if (mq.addEventListener) mq.addEventListener('change', syncRm);
  else if (mq.addListener) mq.addListener(syncRm);
}

/* Immediate tap feedback — never blocks actions */
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.btn, .act-primary, .act-secondary, .radar-toggle, .chip, .nav button');
  if (!el || state.reduceMotion) return;
  el.classList.add('is-tapped');
  clearTimeout(el._tapT);
  el._tapT = setTimeout(() => el.classList.remove('is-tapped'), 140);
}, { passive: true });

/* offline simulation — timers keep running server-side; API calls blocked */
$('#offline-toggle').addEventListener('click', () => {
  const next = !state.offline;
  $('#offline-toggle').setAttribute('aria-pressed', String(next));
  if (next) {
    setOfflineUi(true, false);
    setApiBanner('offline', t('t_phase_offline'));
    feedback('offline', t('t_offline_banner'));
  } else {
    tryReconnect();
  }
});
$('#reconnect-btn') && $('#reconnect-btn').addEventListener('click', () => tryReconnect());

window.addEventListener('online', () => {
  if (state.offline) tryReconnect();
});
window.addEventListener('offline', () => {
  setOfflineUi(true, false);
  setApiBanner('offline', t('t_phase_offline'));
  feedback('offline', t('t_offline_banner'));
});

function applyEntitlements(e) {
  if (!e) return;
  state.plan = e.plan || 'FREE';
  const caps = e.capabilities || {};
  if (typeof caps.dailySignals === 'number') state.signalsLeft = caps.dailySignals;
  if (typeof caps.activeConnectionTickets === 'number') state.ticketsActive = caps.activeConnectionTickets;
  const sig = $('#stat-signals'); if (sig) sig.textContent = String(state.signalsLeft);
  const tk = $('#stat-tickets'); if (tk) tk.textContent = String(state.ticketsActive);
  const pl = $('#plan-label'); if (pl) pl.textContent = state.plan === 'WINGMAN_PLUS' ? 'PLUS' : 'FREE';
  const pd = $('#plan-detail');
  if (pd) {
    pd.textContent = state.lang === 'fr'
      ? `${state.signalsLeft} Signaux · ${state.ticketsActive} ticket`
      : `${state.signalsLeft} Signals today · ${state.ticketsActive} ticket`;
  }
  const sp = $('#settings-plan'); if (sp) sp.textContent = state.plan === 'WINGMAN_PLUS' ? 'Wingman+' : 'FREE';
  const ss = $('#settings-signals'); if (ss) ss.textContent = String(caps.dailySignals ?? state.signalsLeft);
  const st = $('#settings-tickets'); if (st) st.textContent = String(caps.activeConnectionTickets ?? state.ticketsActive);
}

async function bootApi() {
  if (!globalThis.WingmanApi) {
    state.apiLive = false;
    setApiBanner('mock', t('t_api_mock'));
    return;
  }
  setLoading(true, t('t_loading'));
  try {
    api = await WingmanApi.bootstrapApi({ userId: state.meId });
    const product = Boolean(api.productPath);
    state.apiLive = !api.useMock && !api.unreachable && Boolean(api.baseUrl);

    if (!api.baseUrl && product) {
      setApiBanner('error', t('t_api_unconfigured'));
      feedback('error', t('t_api_unconfigured'));
      applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });
      return;
    }

    if (api.unreachable || !state.apiLive) {
      if (product) {
        setOfflineUi(true, false);
        setApiBanner('offline', t('t_api_unreachable'));
        feedback('offline', t('t_api_unreachable'));
      } else {
        setApiBanner('mock', t('t_api_mock'));
        feedback('busy', t('t_api_mock'));
      }
      applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });
      return;
    }

    // S27 session path — real identity from OTP tokens
    if (api.hasSession && api.userId) {
      state.meId = api.userId;
      try {
        const ents = await api.entitlements();
        applyEntitlements(ents);
        try {
          const ps = await api.paymentsStatus();
          if (ps && ps.paymentsEnabled) console.warn('[wingman] payments unexpectedly enabled');
        } catch (_) { /* ignore */ }
        setOfflineUi(false, false);
        setApiBanner('live', t('t_api_live'));
        feedback('success', t('t_auth_ok'));
        if (state.phase === 'offline' || !state.phase) setPhase('idle');
        await refreshAuthMode();
        ensureRealtime();
        return;
      } catch (_) {
        // Stale tokens: stay online, clear session, return to phone auth.
        try { api.clearSession(); } catch (__) { /* ignore */ }
        clearProtoSession();
        state.meId = 'proto-alex';
        state.radarActive = false;
        setOfflineUi(false, false);
        setApiBanner('busy', t('t_auth_required'));
        applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });
        await refreshAuthMode();
        return;
      }
    }

    // Local lab only: x-user-id + seed (never on public Vercel field surface)
    if (api.preferDevHeader) {
      await api.seed({
        id: state.meId,
        gender: 'MALE',
        interestedIn: ['WOMEN'],
      });
      await api.seed({
        id: state.peerId,
        gender: 'FEMALE',
        interestedIn: ['MEN'],
      });
      const ents = await api.entitlements();
      applyEntitlements(ents);
      setOfflineUi(false, false);
      setApiBanner('live', t('t_api_live'));
      feedback('success', t('t_api_live'));
      return;
    }

    // No OTP session on public product — drop any ghost protocol UI session.
    clearProtoSession();
    state.radarActive = false;
    setOfflineUi(false, false);
    setApiBanner('busy', t('t_auth_required'));
    feedback('busy', t('t_auth_required'));
    applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });
    await refreshAuthMode();
  } catch (_) {
    if (api && api.productPath) {
      api.setUseMock(false);
      api.setUnreachable(true);
      state.apiLive = false;
      setOfflineUi(true, false);
      setApiBanner('offline', t('t_api_unreachable'));
      feedback('offline', t('t_api_unreachable'));
    } else {
      if (api) api.setUseMock(true);
      state.apiLive = false;
      setApiBanner('mock', t('t_api_mock'));
      feedback('busy', t('t_api_mock'));
    }
    applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });
  } finally {
    setLoading(false);
  }
}

function restoreSessionIfAny() {
  const saved = readSession();
  if (!saved) return;

  const resumeViews = new Set([
    'v-radar', 'v-signal', 'v-selfie', 'v-ticket', 'v-mission-meet', 'v-mission-mode', 'v-outcome', 'v-cooldown',
  ]);
  const wantsProtocol = saved.viewId && resumeViews.has(saved.viewId);

  // Hosted product: never dump users onto Radar with dead CTAs when OTP tokens are gone.
  if (wantsProtocol && api && api.productPath && !isAuthedSession()) {
    clearProtoSession();
    state.radarActive = false;
    state.signalId = null;
    state.connectionId = null;
    state.connectionState = null;
    state.hasIncomingSignal = false;
    syncRadarEmpty();
    syncSignalEmpty();
    setPhase('idle');
    return;
  }

  if (saved.signalId) state.signalId = saved.signalId;
  if (saved.connectionId) state.connectionId = saved.connectionId;
  if (saved.connectionState) state.connectionState = saved.connectionState;
  if (typeof saved.signalsLeft === 'number') {
    state.signalsLeft = saved.signalsLeft;
    const sig = $('#stat-signals'); if (sig) sig.textContent = String(state.signalsLeft);
  }
  state.hasIncomingSignal = Boolean(saved.hasIncomingSignal || saved.signalId);
  if (saved.radarActive) {
    state.radarActive = true;
    const btn = $('#radar-toggle'), st = $('#radar-state');
    if (btn) {
      btn.classList.remove('off');
      btn.setAttribute('aria-pressed', 'true');
      btn.textContent = t('radar_deactivate');
    }
    if (st) {
      st.textContent = t('radar_active');
      st.classList.remove('invisible');
    }
    // Re-hydrate from API only — never restore fictional density from session.
    clearRadarDots();
    if (liveApi()) {
      api.radarCandidates().then(applyRadarCandidates).catch(() => clearRadarDots());
    }
  }
  syncRadarEmpty();
  syncSignalEmpty();
  if (wantsProtocol && saved.viewId !== 'v-splash') {
    show(saved.viewId);
    feedback('info', t('t_session_restored'));
  } else if (saved.phase && saved.phase !== 'offline') {
    setPhase(saved.phase);
  } else {
    setPhase('idle');
  }
}

/** After OTP session exists, don't trap the user on splash/phone again. */
function resumeAuthedFunnelIfNeeded() {
  if (!api || !api.hasSession || !api.userId) return;
  const funnel = new Set([
    'v-splash', 'v-onboard1', 'v-onboard2', 'v-onboard3', 'v-phone', 'v-otp',
  ]);
  const current = state.viewId || 'v-splash';
  if (!funnel.has(current)) return;
  const saved = readSession();
  const resumeViews = new Set([
    'v-radar', 'v-signal', 'v-selfie', 'v-ticket', 'v-mission-meet', 'v-mission-mode', 'v-outcome', 'v-cooldown',
    'v-profile', 'v-consent',
  ]);
  if (saved && saved.viewId && resumeViews.has(saved.viewId)) {
    show(saved.viewId);
    return;
  }
  show('v-profile');
}

/* boot */
function syncVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) {
    document.documentElement.style.setProperty('--vv-offset', '0px');
    document.body.classList.remove('keyboard-open');
    return;
  }
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--vv-offset', inset + 'px');
  document.body.classList.toggle('keyboard-open', inset > 80);
  sizeCanvas();
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncVisualViewport);
  window.visualViewport.addEventListener('scroll', syncVisualViewport);
}
window.addEventListener('orientationchange', () => setTimeout(syncVisualViewport, 200));
syncVisualViewport();

/* Keep focused form controls visible above the reserved form footer / keyboard. */
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el || !el.matches) return;
  if (!el.matches('input, textarea, select')) return;
  const scroller = el.closest('.form-scroll');
  if (!scroller) return;
  setTimeout(() => {
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: state.reduceMotion ? 'auto' : 'smooth' }); }
    catch (_) { try { el.scrollIntoView(true); } catch (__) { /* ignore */ } }
  }, 50);
});

window.addEventListener('resize', () => { sizeCanvas(); startRadar(); syncVisualViewport(); });
window.addEventListener('orientationchange', () => {
  setTimeout(() => { sizeCanvas(); startRadar(); syncVisualViewport(); }, 200);
});

/* P4 smoke — full client loop without engines/payments */
function checkTouchTargets(root) {
  const fails = [];
  const sels = 'button.btn, .act-primary, .act-secondary, .radar-toggle, .nav button, .mood-btn, #open-signal-btn';
  $$(sels, root || document).forEach(el => {
    if (!el.closest('.view.active')) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
      fails.push((el.id || el.className || el.tagName) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  });
  return fails;
}

async function runP4Smoke() {
  const path = [
    'v-splash', 'v-onboard1', 'v-onboard2', 'v-onboard3', 'v-phone', 'v-otp', 'v-profile', 'v-consent',
    'v-radar', 'v-signal', 'v-selfie', 'v-confirmed', 'v-ticket', 'v-mission-meet', 'v-mission-mode',
    'v-outcome', 'v-cooldown', 'v-radar',
  ];
  const errors = [];
  const prevReduce = state.reduceMotion;
  setReduceMotion(true);
  try {
    for (const id of path) {
      show(id);
      await new Promise(r => setTimeout(r, 30));
      const v = $('#' + id);
      if (!v || !v.classList.contains('active')) errors.push('view not active: ' + id);
      if (v && v.getAttribute('aria-hidden') !== 'false') errors.push('aria-hidden: ' + id);
      const allowNoCta = id === 'v-confirmed';
      const cta = v && v.querySelector('.btn-primary, .act-primary, .btn-love, [data-go], .radar-toggle, .nav button');
      if (!cta && !allowNoCta) errors.push('no action: ' + id);
      errors.push(...checkTouchTargets(v).map(x => id + ' touch ' + x));
    }
    // offline / reconnect feedback not mute
    setOfflineUi(true, false);
    if ($('#offline-banner') && $('#offline-banner').classList.contains('hidden')) errors.push('offline banner missing');
    setOfflineUi(false, false);
    // overflow probe at current width
    const stage = $('.stage');
    if (stage && stage.scrollWidth > stage.clientWidth + 2) errors.push('horizontal overflow stage');
  } finally {
    setReduceMotion(prevReduce);
  }
  const ok = errors.length === 0;
  console[ok ? 'info' : 'warn']('[wingman P4 smoke]', ok ? 'PASS' : errors);
  feedback(ok ? 'success' : 'error', ok ? t('t_smoke_ok') : t('t_smoke_fail'));
  announce(ok ? t('t_smoke_ok') : (t('t_smoke_fail') + ': ' + errors.slice(0, 3).join('; ')));
  return { ok, errors };
}

$('#smoke-p4-btn') && $('#smoke-p4-btn').addEventListener('click', () => { runP4Smoke(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const sheet = $('#dot-sheet');
  if (sheet && sheet.classList.contains('open')) {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
  }
});

/* ------------------------------------------------------------ birth picker (mobile) */
const BIRTH_MONTHS = {
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  fr: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
};

function daysInMonth(year, month1to12) {
  if (!year || !month1to12) return 31;
  return new Date(year, month1to12, 0).getDate();
}

function syncBirthHidden() {
  const hidden = $('#pf-birth');
  const d = $('#pf-birth-day');
  const m = $('#pf-birth-month');
  const y = $('#pf-birth-year');
  if (!hidden || !d || !m || !y) return;
  if (!d.value || !m.value || !y.value) {
    hidden.value = '';
    return;
  }
  const dd = String(d.value).padStart(2, '0');
  const mm = String(m.value).padStart(2, '0');
  hidden.value = y.value + '-' + mm + '-' + dd;
}

function fillBirthDays() {
  const d = $('#pf-birth-day');
  const m = $('#pf-birth-month');
  const y = $('#pf-birth-year');
  if (!d) return;
  const prev = d.value;
  const max = daysInMonth(Number(y && y.value), Number(m && m.value));
  d.innerHTML = '<option value="">—</option>';
  for (let i = 1; i <= max; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    d.appendChild(opt);
  }
  if (prev && Number(prev) <= max) d.value = prev;
  else if (prev) d.value = '';
  syncBirthHidden();
}

function refreshBirthMonthLabels() {
  const m = $('#pf-birth-month');
  if (!m || !m.options.length) return;
  const months = BIRTH_MONTHS[state.lang] || BIRTH_MONTHS.en;
  const prev = m.value;
  for (let i = 0; i < m.options.length; i++) {
    const opt = m.options[i];
    if (!opt.value) {
      opt.textContent = '—';
      continue;
    }
    const idx = Number(opt.value) - 1;
    if (months[idx]) opt.textContent = months[idx];
  }
  m.value = prev;
}

function initBirthPicker() {
  const d = $('#pf-birth-day');
  const m = $('#pf-birth-month');
  const y = $('#pf-birth-year');
  if (!d || !m || !y) return;

  const now = new Date();
  const maxYear = now.getFullYear() - 18;
  const minYear = now.getFullYear() - 80;

  y.innerHTML = '<option value="">—</option>';
  for (let yr = maxYear; yr >= minYear; yr--) {
    const opt = document.createElement('option');
    opt.value = String(yr);
    opt.textContent = String(yr);
    y.appendChild(opt);
  }

  m.innerHTML = '<option value="">—</option>';
  const months = BIRTH_MONTHS[state.lang] || BIRTH_MONTHS.en;
  months.forEach((label, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx + 1);
    opt.textContent = label;
    m.appendChild(opt);
  });

  fillBirthDays();
  [d, m, y].forEach((el) => {
    el.addEventListener('change', () => {
      if (el === m || el === y) fillBirthDays();
      else syncBirthHidden();
    });
  });
}

initBirthPicker();

/* -------------------------------------------------------------- profile pills */
document.addEventListener('click', (e) => {
  const pill = e.target.closest('#v-profile .pill');
  if (!pill) return;
  const set = pill.closest('.pillset');
  if (!set) return;
  const multi = set.classList.contains('pillset-wrap') || set.getAttribute('aria-labelledby') === 'pf-interest-label' || set.getAttribute('aria-labelledby') === 'pf-interests-label';
  if (multi && set.getAttribute('aria-labelledby') === 'pf-interest-label') {
    const on = pill.getAttribute('aria-pressed') === 'true';
    pill.setAttribute('aria-pressed', String(!on));
    return;
  }
  if (multi && set.getAttribute('aria-labelledby') === 'pf-interests-label') {
    const on = pill.getAttribute('aria-pressed') === 'true';
    if (!on) {
      const selected = $$('#v-profile [aria-labelledby="pf-interests-label"] .pill[aria-pressed="true"]');
      if (selected.length >= 5) return;
    }
    pill.setAttribute('aria-pressed', String(!on));
    return;
  }
  // gender: single-select
  $$('.pill', set).forEach((p) => p.setAttribute('aria-pressed', 'false'));
  pill.setAttribute('aria-pressed', 'true');
});

function readProfileForm() {
  const name = ($('#pf-name') && $('#pf-name').value || '').trim();
  const birth = ($('#pf-birth') && $('#pf-birth').value || '').trim();
  const heightRaw = $('#pf-height') && $('#pf-height').value;
  const bio = ($('#pf-bio') && $('#pf-bio').value || '').trim();
  const genderPill = $('#v-profile [aria-labelledby="pf-gender-label"] .pill[aria-pressed="true"]');
  const genderMap = { g_male: 'MALE', g_female: 'FEMALE', g_nb: 'NON_BINARY' };
  let gender = 'MALE';
  if (genderPill) {
    const key = genderPill.getAttribute('data-i18n');
    if (key && genderMap[key]) gender = genderMap[key];
  }
  const interestMap = { t_men: 'MEN', t_women: 'WOMEN', t_nb: 'NON_BINARY_PEOPLE' };
  const interestedIn = [];
  $$('#v-profile [aria-labelledby="pf-interest-label"] .pill[aria-pressed="true"]').forEach((p) => {
    const key = p.getAttribute('data-i18n');
    if (key && interestMap[key]) interestedIn.push(interestMap[key]);
  });
  const interests = $$('#v-profile [aria-labelledby="pf-interests-label"] .pill[aria-pressed="true"]')
    .map((p) => (p.getAttribute('aria-label') || p.textContent || '').trim())
    .filter(Boolean)
    .slice(0, 5);
  const intention = $('#v-profile [aria-labelledby="pf-intention-label"] .pill[aria-pressed="true"]')?.dataset.intention;
  const heightCm = heightRaw ? Number(heightRaw) : undefined;
  return {
    firstName: name || undefined,
    birthDate: birth || undefined,
    gender,
    interestedIn,
    heightCm: Number.isFinite(heightCm) ? heightCm : undefined,
    dailyBio: bio || undefined,
    interests: interests.length ? interests : undefined,
    mood: state.mood === 'EXPLORING' ? 'UNSURE' : state.mood,
    intention,
  };
}

$('#profile-next-btn') && $('#profile-next-btn').addEventListener('click', async () => {
  if (state.busy) return;
  const body = readProfileForm();
  if (!body.interestedIn.length) {
    feedback('error', state.lang === 'fr' ? 'Choisissez qui vous intéresse' : 'Select who you are interested in');
    return;
  }
  if (!body.birthDate) {
    feedback('error', state.lang === 'fr' ? 'Date de naissance requise' : 'Date of birth required');
    return;
  }
  if (liveApi()) {
    try {
      await withLoading(t('t_loading'), async () => {
        await api.saveProfile(body);
      });
    } catch (e) {
      const msg = (e && e.code === 'VALIDATION_REQUIRED')
        ? (state.lang === 'fr' ? 'Profil invalide (18+ requis)' : 'Invalid profile (18+ required)')
        : ((e && e.message) || t('t_api_unreachable'));
      feedback('error', msg);
      return;
    }
  } else if (api && api.productPath) {
    feedback('busy', t('t_api_unreachable'));
    return;
  }
  show('v-consent');
});

async function postConsents() {
  const policyVersion = 'v1';
  const grants = [];
  const core = $('#consent-core');
  const loc = $('#consent-loc');
  const push = $('#consent-push');
  const analytics = $('#consent-analytics');
  // Destiny stays product-off — record only if user toggled; server Destiny flag stays false.
  const destiny = $('#consent-destiny');
  if (core && core.getAttribute('aria-checked') === 'true') {
    grants.push({ purpose: 'CORE_MATCHING', policyVersion });
  }
  if (loc && loc.getAttribute('aria-checked') === 'true') {
    grants.push({ purpose: 'COARSE_LOCATION', policyVersion });
  }
  if (!push || push.getAttribute('aria-checked') === 'true') {
    grants.push({ purpose: 'PUSH_NOTIFICATIONS', policyVersion });
  }
  if (analytics && analytics.getAttribute('aria-checked') === 'true') {
    grants.push({ purpose: 'PRODUCT_ANALYTICS', policyVersion });
  }
  if (destiny && destiny.getAttribute('aria-checked') === 'true') {
    grants.push({ purpose: 'DESTINY_CONNECTION', policyVersion });
  }
  for (const g of grants) {
    await api.consent(g);
  }
}

$('#consent-cta-btn') && $('#consent-cta-btn').addEventListener('click', async () => {
  if (state.busy) return;
  const core = $('#consent-core');
  if (!core || core.getAttribute('aria-checked') !== 'true') {
    feedback('error', state.lang === 'fr' ? 'Votre accord est requis pour activer le service' : 'Your agreement is required to activate the service');
    return;
  }
  if (liveApi()) {
    try {
      await withLoading(t('t_loading'), async () => {
        await postConsents();
      });
    } catch (_) {
      feedback('error', t('t_api_unreachable'));
      return;
    }
  } else if (api && api.productPath) {
    feedback('busy', t('t_api_unreachable'));
    return;
  }
  show('v-radar');
});

function handleRealtimeEvent(env) {
  if (!env || !env.type) return;
  const p = env.payload || {};
  if (env.type === 'signal.received') {
    state.signalId = p.signalId || env.aggregateId;
    state.hasIncomingSignal = true;
    syncSignalEmpty();
    markSignalArrive();
    setPhase('signal', t('t_phase_signal'));
    feedback('signal', t('t_signal_received'));
    if (state.viewId === 'v-radar' || state.viewId === 'v-pulse') show('v-signal');
    return;
  }
  if (env.type === 'radar.changed' || env.type === 'presence.changed') {
    if (liveApi() && state.radarActive) {
      api.radarCandidates().then(applyRadarCandidates).catch(() => {});
    }
    return;
  }
  if (env.type === 'validation.updated' || env.type === 'mission.updated' || env.type === 'match.created') {
    if (p.connectionId) state.connectionId = p.connectionId;
    if (p.state) state.connectionState = p.state;
    if (realtime && state.connectionId) realtime.subscribeConnection(state.connectionId);
    void refreshConnectionUi();
    if (p.state === 'MISSION_MEET_ACTIVE' && state.viewId !== 'v-mission-meet') {
      feedback('mission', t('t_mission_active'));
    }
    if (p.state === 'COOLDOWN_ACTIVE' && state.viewId !== 'v-cooldown') {
      show('v-cooldown');
    }
    return;
  }
  if (env.type === 'mission.message') {
    if (p.connectionId && state.connectionId && p.connectionId !== state.connectionId) return;
    appendChatMessage({
      text: p.text,
      senderId: p.senderId,
      at: p.at,
    }, p.senderId === state.meId);
    return;
  }
  if (env.type === 'connection.closed' || env.type === 'mission.expired') {
    feedback('busy', env.type === 'mission.expired' ? (state.lang === 'fr' ? 'Chat expiré' : 'Chat expired') : t('t_mission_done'));
  }
}

function ensureRealtime() {
  if (!globalThis.WingmanRealtime || !api) return;
  if (realtime) {
    try { realtime.disconnect(); } catch (_) { /* ignore */ }
  }
  realtime = WingmanRealtime.createRealtime(api, {
    onEvent: handleRealtimeEvent,
    onReady: () => {
      if (state.connectionId) realtime.subscribeConnection(state.connectionId);
    },
  });
  realtime.connect();
}

/* ------------------------------------------------------------ S27 phone auth */
let pendingPhoneE164 = '';
let authFieldTest = false;

function normalizeE164(raw) {
  const s = String(raw || '').trim().replace(/[\s()-]/g, '');
  if (!s) return '';
  return s.startsWith('+') ? s : ('+' + s.replace(/^\+/, ''));
}

function applyFieldTestAuthCopy() {
  const phoneBody = document.querySelector('#v-phone [data-i18n="phone_body"]');
  if (phoneBody) phoneBody.textContent = authFieldTest ? t('phone_body_ft') : t('phone_body');
  const note = $('#otp-field-test-note');
  if (note) {
    note.hidden = !authFieldTest;
    note.textContent = t('otp_field_note');
  }
}

async function refreshAuthMode() {
  if (!api || api.useMock || !api.authMode) return;
  try {
    const mode = await api.authMode();
    authFieldTest = Boolean(mode && mode.fieldTest);
    applyFieldTestAuthCopy();
  } catch (_) {
    /* keep last known mode */
  }
}

function readOtpCode() {
  return $$('#otp-inputs input').map((i) => i.value).join('');
}

function clearOtpInputs() {
  $$('#otp-inputs input').forEach((i) => { i.value = ''; });
  const first = $('#otp-inputs input');
  if (first) first.focus();
}

$$('#otp-inputs input').forEach((inp, idx, arr) => {
  inp.addEventListener('input', () => {
    if (inp.value && arr[idx + 1]) arr[idx + 1].focus();
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !inp.value && arr[idx - 1]) arr[idx - 1].focus();
  });
});

async function requestOtpForPhone(phone) {
  const errEl = $('#phone-error') || $('#otp-error');
  if (errEl) errEl.textContent = '';
  if (!api || api.useMock || api.unreachable || !api.baseUrl) {
    const msg = (api && api.productPath) ? t('t_api_unreachable') : t('t_api_mock');
    feedback('busy', msg);
    if (errEl) errEl.textContent = msg;
    return false;
  }
  try {
    let res;
    await withLoading(t('t_loading'), async () => {
      res = await api.requestOtp(phone);
    });
    pendingPhoneE164 = phone;
    if (res && typeof res.fieldTest === 'boolean') {
      authFieldTest = res.fieldTest;
      applyFieldTestAuthCopy();
    }
    const sent = $('#otp-sent-to');
    if (sent) {
      sent.textContent = authFieldTest
        ? (t('otp_body_ft') + ' ' + phone)
        : ((state.lang === 'fr' ? 'Envoyé au ' : 'Sent to ') + phone);
    }
    feedback('success', authFieldTest ? t('t_otp_ready_ft') : t('t_otp_sent'));
    return true;
  } catch (e) {
    const code = e && e.code;
    const msg = code === 'OTP_RATE_LIMITED' ? t('t_otp_rate')
      : code === 'PHONE_NOT_ALLOWED' ? t('t_otp_not_allowed')
      : ((e && e.message) || t('t_otp_bad'));
    if (errEl) errEl.textContent = msg;
    feedback('error', msg);
    return false;
  }
}

$('#phone-send-btn') && $('#phone-send-btn').addEventListener('click', async () => {
  const phone = normalizeE164($('#phone-input') && $('#phone-input').value);
  if (phone.length < 8) {
    const errEl = $('#phone-error');
    if (errEl) errEl.textContent = state.lang === 'fr' ? 'Numéro invalide' : 'Invalid number';
    return;
  }
  if (await requestOtpForPhone(phone)) {
    clearOtpInputs();
    show('v-otp');
  }
});

$('#otp-resend-btn') && $('#otp-resend-btn').addEventListener('click', async () => {
  const phone = pendingPhoneE164 || normalizeE164($('#phone-input') && $('#phone-input').value);
  if (!phone) return;
  await requestOtpForPhone(phone);
});

$('#otp-verify-btn') && $('#otp-verify-btn').addEventListener('click', async () => {
  const errEl = $('#otp-error');
  if (errEl) errEl.textContent = '';
  const phone = pendingPhoneE164 || normalizeE164($('#phone-input') && $('#phone-input').value);
  const code = readOtpCode();
  if (!phone || code.length !== 6) {
    if (errEl) errEl.textContent = t('t_otp_bad');
    return;
  }
  if (!api || api.useMock || api.unreachable || !api.baseUrl) {
    const msg = (api && api.productPath) ? t('t_api_unreachable') : t('t_api_mock');
    feedback('busy', msg);
    if (errEl) errEl.textContent = msg;
    // Public product path: never skip auth into the demo profile.
    if (api && api.productPath) return;
    show('v-profile');
    return;
  }
  try {
    await withLoading(t('t_loading'), async () => {
      const sess = await api.verifyOtp(phone, code);
      state.meId = sess.userId;
      const ents = await api.entitlements();
      applyEntitlements(ents);
    });
    setApiBanner('live', t('t_api_live'));
    feedback('success', t('t_auth_ok'));
    ensureRealtime();
    show('v-profile');
  } catch (e) {
    const codeErr = e && e.code;
    const msg = codeErr === 'OTP_EXPIRED' ? t('t_otp_expired')
      : codeErr === 'OTP_RATE_LIMITED' ? t('t_otp_rate')
      : codeErr === 'PHONE_NOT_ALLOWED' ? t('t_otp_not_allowed')
      : t('t_otp_bad');
    if (errEl) errEl.textContent = msg;
    feedback('error', msg);
  }
});

applyLang();
sizeCanvas();
startRadar();
syncViewA11y(state.viewId || 'v-splash');
syncRadarEmpty();
syncSignalEmpty();
applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });

/* Product surface: hide lab chips unless ?qa=1 */
(function configureFieldTestSurface() {
  const q = new URLSearchParams(location.search);
  const qa = q.get('qa') === '1';
  const hosted = /vercel\.app$/i.test(location.hostname) || q.get('field') === '1';
  if (hosted && !qa) document.body.classList.add('field-test');
  if (qa) document.body.classList.remove('field-test');
})();

bootApi().then(() => {
  restoreSessionIfAny();
  return refreshAuthMode();
}).then(() => {
  resumeAuthedFunnelIfNeeded();
  if (/[?&]smoke=1\b/.test(location.search)) runP4Smoke();
});
window.__wingmanRunP4Smoke = runP4Smoke;
