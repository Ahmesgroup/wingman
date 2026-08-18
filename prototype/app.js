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
  connectionExpiresAt: null,
  phase: 'idle',
  viewId: 'v-splash',
  busy: false,
  hasIncomingSignal: false,
  livingMap: false,
  viewerLoc: null,
  locState: 'unknown',
  lmOpportunities: [],
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

function setSelfieSendEnabled(on) {
  const btn = $('#selfie-send');
  if (!btn) return;
  btn.disabled = !on;
  btn.setAttribute('aria-disabled', on ? 'false' : 'true');
}

function noteServerTime(iso) {
  if (!iso) return;
  const serverMs = Date.parse(iso);
  if (!Number.isFinite(serverMs)) return;
  const offset = serverMs - Date.now();
  state.serverNow = () => Date.now() + offset;
}

function formatCaptureStamp(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const iso = d.toISOString();
  return iso.slice(0, 10) + ' · ' + iso.slice(11, 19) + ' UTC';
}

function setSelfieStamp(ms) {
  const stamp = $('#selfie-stamp');
  if (!stamp) return;
  stamp.textContent = formatCaptureStamp(ms);
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
    setSelfieCamError(t('t_cam_off'));
    setSelfieSendEnabled(false);
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
    setSelfieSendEnabled(true);
    return true;
  } catch (e) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError');
    setSelfieCamError(denied ? t('t_cam_denied') : t('t_cam_fail'));
    setSelfieSendEnabled(false);
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
    const mapped = humanApiCopy(e);
    setApiBanner('error', mapped);
    feedback('error', mapped);
    haptic('error');
    throw e;
  } finally {
    setLoading(false);
  }
}

function humanApiCopy(e) {
  const code = e && e.code;
  if (code === 'UNAUTHORIZED') return t('t_auth_required');
  if (code === 'OTP_EXPIRED') return t('t_otp_expired');
  if (code === 'OTP_RATE_LIMITED') return t('t_otp_rate');
  if (code === 'PHONE_NOT_ALLOWED') return t('t_otp_not_allowed');
  if (code === 'VALIDATION_REQUIRED' && e && e.details && e.details.partial) return t('t_outcome_saved');
  if (code === 'CAMERA_DENIED') return t('t_cam_required');
  const raw = String((e && e.message) || '');
  if (/\[filtered\]|anti.?contact|contact detail/i.test(raw)) return t('t_blocked');
  if (api && api.productPath) return t('t_api_unreachable');
  return raw || t('t_api_unreachable');
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
      connectionExpiresAt: state.connectionExpiresAt,
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
    if (!state.radarActive && (state.locState === 'denied' || state.locState === 'unavailable')) {
      emptyEl.textContent = t(state.locState === 'denied' ? 'lm_loc_denied' : 'lm_loc_off');
    } else {
      emptyEl.textContent = state.radarActive ? t('empty_radar_alone') : t('empty_radar');
    }
  }
  syncRadarA11yList();
}

function viewerCoords() {
  const Geo = typeof WingmanPresenceGeo !== 'undefined' ? WingmanPresenceGeo : null;
  if (Geo) return Geo.activateLocation(state.viewerLoc, state.locState);
  if (state.viewerLoc && Number.isFinite(state.viewerLoc.lat) && Number.isFinite(state.viewerLoc.lng) && state.locState === 'granted') {
    return state.viewerLoc;
  }
  return null;
}

function setNearbyCount(n) {
  const el = $('#stat-nearby');
  if (el) el.textContent = String(Math.max(0, n | 0));
}

function syncSignalsChrome() {
  const n = String(Math.max(0, state.signalsLeft | 0));
  const a = $('#stat-signals');
  const b = $('#lm-signals-n');
  if (a) a.textContent = n;
  if (b) b.textContent = n;
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
  if (state.livingMap) void refreshLivingMap();
  else {
    renderDiscoverFromDots();
    syncDestinyCard(list);
  }
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
  list.setAttribute('aria-label', t('t_nearby_people'));
  list.innerHTML = dots.map((d, i) => {
    const mood = d.mood === 'SUPER_READY' ? t('mood_ready') : d.mood === 'OPEN' ? t('mood_open') : t('mood_explore');
    const band = d.band === 'NEAR'
      ? t('lm_prox_close')
      : t('lm_prox_near');
    return `<li><button type="button" class="sr-only-btn" data-dot="${i}">${band} · ${mood}</button></li>`;
  }).join('');
  $$('[data-dot]', list).forEach(btn => {
    btn.addEventListener('click', () => openSheet(dots[Number(btn.dataset.dot)]));
  });
}

function syncInboxChrome() {
  const show = Boolean(state.hasIncomingSignal || state.signalId);
  ['#radar-inbox', '#lm-inbox'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.classList.toggle('hidden', !show);
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  });
  buildNav();
}

function syncSignalEmpty() {
  const empty = $('#signal-empty');
  const list = $('#signal-list');
  const showEmpty = !state.hasIncomingSignal && !state.signalId;
  if (empty) empty.classList.toggle('hidden', !showEmpty);
  if (list) list.classList.toggle('hidden', showEmpty);
  syncInboxChrome();
}

function syncDestinyCard(list) {
  const rows = Array.isArray(list) ? list : (state.lmOpportunities || []);
  const real = rows.some((o) => o && o.destiny === true);
  const card = $('#destiny-card');
  if (card) {
    card.classList.toggle('hidden', !real || state.livingMap);
    card.hidden = !real || state.livingMap;
  }
  const banner = $('#lm-destiny-banner');
  if (banner) {
    banner.classList.toggle('hidden', !real || !state.livingMap);
    banner.hidden = !real || !state.livingMap;
  }
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
    ensureRealtimeReconnect();
    await restoreForeground({ silent: true });
  } catch (_) {
    state.apiLive = false;
    setOfflineUi(true, false);
    setApiBanner('offline', t('t_api_mock'));
    feedback('error', t('t_reconnect_fail'));
  }
}

/* ---------------------------------------------------------------- i18n ---- */
const LANG_KEY = 'wingman_locale';
const I18N = {
  en: {
    brandtag: 'Make the first acquaintance easy', splash_tag: 'Wingman makes it easy to say hello to someone already near you.', splash_love: 'Love is in the air.', splash_cta: 'Begin',
    next: 'Next', ob_eyebrow: 'The problem',
    ob1_title: 'You cross paths. Nothing happens.', ob1_body: "Every day you pass someone you'd like to meet — and say nothing. Wingman is built for that exact moment.",
    ob2_eyebrow: 'The solution', ob2_title: 'A quiet first step, not a swipe feed.', ob2_body: 'No public profiles. No endless chat. A short, private path from "someone\'s near" to "let\'s meet."',
    ob3_eyebrow: 'The promise', ob3_title: 'Make the first acquaintance easy.', ob3_body: 'No one is told if you pass. Your exact location is never shown. You stay in control.', ob3_cta: 'Create my account',
    phone_sub: 'Verify your number', phone_title: 'Enter your phone', phone_body: 'We send a 6-digit code. Your number is never shown to anyone.', phone_label: 'Phone number', phone_cta: 'Send code', phone_note: 'Verification only — used to keep Wingman free of fake profiles.',
    phone_body_ft: 'Enter your real number. In this field-test build, no SMS is sent — you will use a coordinator code.',
    otp_sub: 'Enter the code', otp_title: '6-digit code', otp_body: 'Sent to your phone', otp_cta: 'Verify', otp_resend: 'Resend code',
    otp_body_ft: 'Field test for', otp_field_note: 'Field test verification — no SMS is sent. Use the code from your test coordinator.',
    t_auth_required: 'Sign in with your phone to continue', t_auth_ok: 'Signed in', t_otp_sent: 'Code sent', t_otp_ready_ft: 'Enter the field-test code', t_otp_bad: 'Invalid code', t_otp_expired: 'Code expired', t_otp_rate: 'Too many attempts — wait and retry', t_otp_not_allowed: 'This number isn’t on the field-test list',
    profile_sub: 'Your profile', pf_name: 'First name', pf_birth: 'Date of birth', pf_birth_day: 'Day', pf_birth_month: 'Month', pf_birth_year: 'Year', pf_birth_hint: 'Tap each column — native picker on iPhone.',
    pf_gender: 'Gender', g_male: 'Male', g_female: 'Female', g_nb: 'Non-binary',
    pf_sec_identity: 'Who you are', pf_sec_intention: 'Intention', pf_sec_interests: 'Interests',
    pf_interest: 'Interested in', t_men: 'Men', t_women: 'Women', t_nb: 'Non-binary', pf_intention: 'Your intention', intention_available: 'Available now', intention_exploring: 'Just exploring', pf_height: 'Height (cm)', pf_interests: 'Interests (max 5)', pf_bio: 'Daily bio (150 max)',
    consent_sub: 'Your choices', consent_title: 'What you agree to', consent_body: 'Each choice is separate. You can change these anytime in Me.',
    c_core: 'Use Wingman', c_core_d: 'Needed so Wingman can introduce you to people nearby.', c_loc: 'Approximate location', c_loc_d: 'Nearby only — your exact location is never shown.',
    c_destiny: 'Notice repeated crossings', c_destiny_d: 'Off by default. Wingman never shows where they happened.', c_push: 'Notifications', c_push_d: 'When someone nearby reaches out, or a meeting is confirmed.',
    c_analytics: 'Help improve Wingman', c_analytics_d: 'Optional. Anonymous product insights only.', consent_cta: 'Agree & go nearby',
    consent_back: 'Back', consent_save: 'Save',
    radar_sub: 'Around you', radar_invisible: 'Invisible', radar_active: 'Available', radar_dist: 'Someone very close · Nearby', radar_activate: 'Go active', radar_deactivate: 'Go invisible',
    mood_ready: 'Super ready', mood_open: 'Open', mood_explore: 'Unsure', mood_ready_d: 'Meet now', mood_open_d: "If it's right", mood_explore_d: 'Just exploring', mood_title: 'Your mood',
    stat_signals: 'Signals left', stat_nearby: 'Nearby', stat_tickets: 'Held connections',
    destiny_eyebrow: 'Your paths crossed again', destiny_card_t: 'You keep crossing paths', destiny_card_d: 'Wingman noticed repeated crossings — never where they happened.',
    send_signal: 'Say hello', close: 'Close',
    signal_sub: 'Someone reached out', signal_title: 'Someone nearby wants to meet you.', signal_body: 'It quietly expires if you don’t open it. No one is ever told you passed.', open: 'Open', sig_expired: 'Expired',
    signal_silent: 'No new Signals yet. When someone nearby reaches out, you’ll see it here.',
    inbox_title: 'Someone nearby wants to meet you.', inbox_hint: 'Open it before it quietly expires.',
    s_live: 'Live capture', s_stamp: 'Timestamped', s_gallery: 'Gallery blocked',
    s_title: 'Send a live selfie', s_body: 'Let them know it’s really you.',
    s_send: 'Send a live selfie', s_letexpire: 'Let it expire', s_approve: 'Approve',
    s_note: 'Visible only for this connection.',
    confirmed: 'You both said yes.',
    confirmed_d: 'Ready to say hello?',
    ticket_sub: 'Hold this moment', ticket_badge: 'Held for you', ticket_title: "Can't meet right now?", ticket_body: 'Hold this moment — up to 2 hours. You can chat only when you both decide to meet.', ticket_body_free: 'Hold this moment — up to 2 hours. You can chat only when you both decide to meet.', ticket_body_plus: 'Hold this moment — up to 24 hours. You can chat only when you both decide to meet.', ticket_open: "I'm available now", ticket_later: 'Later',
    mm_sub: 'Decide where to meet.', mm_obj: 'Decide where to meet.', mm_keep: 'Keep it simple — you have 15 minutes.', mm_ph: 'Terrace side sounds good…', mm_note: 'Phone numbers and social handles stay blocked.', mm_meet: "Let's meet", mm_not: 'Not this time',
    mode_eyebrow: 'This meeting', mode_title: 'Focus on this connection', mode_body: 'Great meetings deserve your full attention.', mode_invisible: 'You’re quietly invisible nearby', mode_cta: 'We met — continue',
    outcome_title: 'Did you meet?', outcome_body: 'Your answer stays private. The other person never sees it.', outcome_yes: 'Yes, we met', outcome_no: 'Not this time',
    t_outcome_saved: 'Your answer is saved. Waiting for the other person.',
    cd_eyebrow: 'A quiet pause', cd_min: 'minutes', cd_title: 'Take your time.', cd_body: 'When you’re ready, come back to Radar.', cd_ok: 'Back to Radar',
    destiny_title: 'You keep crossing paths.', destiny_body: 'Wingman noticed you keep crossing paths — without showing where, when, or the route.', destiny_try: 'Say hello', destiny_ignore: 'Not now', destiny_off: 'You can turn this off anytime in Me.',
    pulse_sub: 'What’s happening around you', pulse_title: 'What’s happening around you', pulse_anon: 'Places stay approximate — never exact.',
    pulse_few: 'Getting lively', pulse_some: 'Busy tonight', pulse_busy: 'Very active right now',
    pulse_privacy: 'How Pulse protects your privacy', pulse_privacy_d: 'Wingman never shows your exact location. What’s around you stays approximate, and no one sees who you are from Pulse.',
    pz1: 'Strong energy nearby', pz2: 'A lively moment nearby', pz3: 'A quieter pocket nearby', pulse_note: 'Places stay approximate — never exact.',
    settings_sub: 'Me', set_account: 'Account', set_plan: 'Your plan', set_plan_name: 'Plan', set_plan_signals: 'Signals each day', set_plan_tickets: 'Held connections', set_plan_note: 'Payments aren’t available yet.',
    set_privacy: 'Privacy', set_photo: 'Photos', set_photo_v: 'Only shared during a connection', set_none: 'None', set_loc: 'Location', set_loc_v: 'Your exact location is never shown', set_never: 'Never shown', set_consent: 'Data & consent', set_consent_manage: 'Manage what Wingman can use', set_accepted: 'Managed', set_gdpr: 'Your exact location is never shown', set_designed: 'Never shown',
    set_controls: 'Controls', set_destiny: 'Let Wingman notice repeated crossings without showing where they happened.', set_rm: 'Reduce motion', set_haptics: 'Haptics', set_rights: 'Your data', set_export: 'Export my data', set_delete: 'Delete my account', set_admin: 'Admin moderation preview →',
    set_safety: 'Safety', set_safety_d: 'If someone makes you uncomfortable, report them and block them. Blocking is instant and silent — they are never told. You will not see each other nearby, and they cannot say hello again.', set_notifications: 'Notifications', set_push: 'Let Wingman tell you when someone nearby reaches out', set_language: 'Language', set_a11y: 'Accessibility',
    t_push_off: 'Notifications stay off until you allow them.', t_push_on: 'Wingman can notify you about a Signal or a meeting message.', t_push_blocked: 'Push isn’t configured on this build (missing VAPID/FCM credentials).', t_push_denied: 'Notifications were blocked in the browser.',
    report_sub: 'Report & block', report_short: 'Report', report_title: 'What happened?', report_body: 'Blocking is instant and silent. The other person is never notified.',
    report_confirm: 'Choose a reason. We block them immediately. They are never told.',
    report_empty_t: 'No one to report yet.', report_empty: 'Open someone’s card nearby, or use Report & block during a meeting.', report_back: 'Back',
    rc_harass: 'Harassment', rc_threat: 'Threat', rc_imp: 'Impersonation', rc_sexual: 'Sexual content', rc_minor: 'Minor safety', rc_contact: 'Contact outside Wingman',
    report_done_badge: 'Blocked', report_done_t: "You won't see each other again.", report_done_b: 'They will not appear nearby, and they cannot say hello again. They are never told. Repeated reports are reviewed by a person — never an automatic permanent ban.', report_done_cta: 'Back nearby',
    plan_sub: 'Your plan', plan_active: 'Active', plan_payments_off: 'Payments aren’t available yet.', plan_back: 'Back to Me',
    pw_f1: '2 Signals / day', pw_f2: '1 held connection — up to 2h', pw_f3: 'Repeated crossings included', pw_f4: '15 min to decide where to meet',
    admin_sub: 'Moderation queue', admin_body: 'A report during a session is the only time evidence is kept. It is stored encrypted, and every access is logged.',
    admin_pending: 'PENDING', admin_review: 'UNDER REVIEW', admin_resolved: 'RESOLVED', admin_c1: '3 independent reports · contact outside Wingman', admin_c2: '1 report · Harassment · evidence sealed', admin_c3: 'Dismissed — coordinated false reports detected', admin_back: '← Back to app',
    nav_radar: 'Radar', nav_signal: 'Inbox', nav_pulse: 'Pulse', nav_settings: 'Me',
    t_signal_sent: 'Hello sent — it quietly expires in 10 min', t_mood: 'Mood updated', t_blocked: 'Phone numbers and social handles stay blocked', t_active: "You’re visible nearby", t_invisible: "You’re invisible",
    t_api_mock: 'Demo mode — not connected', t_api_live: 'Connected',
    t_api_unreachable: 'Can\'t reach Wingman — try again', t_api_unconfigured: 'App misconfigured — contact coordinator',
    t_field_build: 'Field test build',
    t_loading: 'Loading…', t_accepting: 'Opening connection…', t_selfie: 'Sending photo…', t_approving: 'Confirming…',
    t_meet: 'Opening the meeting…', t_ticket: 'Holding this moment…', t_chat: 'Sending…', t_outcome: 'Saving…',
    t_timeout: 'Taking too long — try again', t_offline_blocked: 'You’re offline — try again', t_offline_banner: 'You’re offline — we’ll catch up when you’re back',
    t_reconnecting: 'Reconnecting…', t_reconnected: 'Back online', t_reconnect_fail: 'Still offline', t_reconnect: 'Reconnect',
    empty_radar: 'Go active to see who’s nearby.', empty_radar_alone: 'Quiet around here', empty_signals: 'No new Signals yet.', empty_signals_d: 'When someone nearby reaches out, you’ll see it here.',
    lm_available: 'Available now', lm_exploring: 'Exploring', lm_filters: 'Filters', lm_filters_d: 'Show less of what’s already allowed for you. Filters never bypass privacy.',
    lm_recenter: 'Recenter', lm_quiet: 'Quiet around here', lm_quiet_d: 'We’ll show you when a real opportunity appears nearby.',
    lm_prox: 'How close', lm_prox_close: 'Very close', lm_prox_near: 'Nearby', lm_prox_around: 'Around me',
    lm_presence: 'Mood', lm_intention: 'Intention', lm_interests: 'Interests', lm_apply: 'Apply filters', lm_clear: 'Clear',
    lm_someone: 'Someone nearby', lm_new: 'Nearby now', lm_destiny: 'Your paths crossed again.',
    lm_count: 'nearby', lm_count_one: 'nearby', lm_count_zero: '0 nearby',
    lm_loc_denied: 'Location is off. Allow approximate location to see who’s nearby.',
    lm_loc_off: 'Location unavailable. Opportunities appear when we can place you.',
    lm_offline: 'You’re offline. The map stays up; nearby people refresh when you’re back.',
    lm_you: 'You',
    discover_sub: 'Around you now', discover_lead: 'People already near you — only what’s real right now.',
    nav_discover: 'Discover', nav_me: 'Me',
    reason_nearby: 'Nearby', reason_available: 'Available now',
    interest_music: 'Music', interest_travel: 'Travel', interest_food: 'Food', interest_fitness: 'Fitness', interest_art: 'Art',
    mood_shape_ring: ' · ring', mood_shape_solid: ' · solid', mood_shape_quiet: ' · quiet',
    a11y_skip: 'Skip to app', t_smoke_ok: 'P4 smoke OK', t_smoke_fail: 'P4 smoke failed',
    t_phase_idle: 'Ready', t_phase_available: 'You’re visible nearby', t_phase_busy: 'Busy', t_phase_unavailable: 'Unavailable',
    t_phase_signal: 'Someone reached out', t_phase_validation: 'Waiting for a photo', t_phase_match: 'You both said yes.',
    t_phase_mission: 'Decide where to meet.', t_phase_cooldown: 'A quiet pause', t_phase_offline: 'Offline',
    t_signal_received: 'Someone nearby wants to meet you.', t_validation: 'Waiting for a photo', t_match: 'You both said yes.',
    t_mission_active: 'Decide where to meet.', t_mission_done: 'This meeting ended', t_cooldown_on: 'A quiet pause',
    t_session_restored: 'Welcome back', t_no_signals: 'No Signals left today', t_export_ok: 'Your data file is ready', t_delete_ok: 'Account deletion requested',
    t_report_rate: 'Too many reports just now. They are still blocked — try again later.',
    t_cam_off: 'Camera unavailable on this device.', t_cam_denied: 'Camera access is off. Allow the camera to send a live selfie — gallery photos aren’t accepted.', t_cam_fail: 'Could not open the camera.',
    t_need_interest: 'Select who you are interested in', t_need_birth: 'Date of birth required', t_profile_invalid: 'Invalid profile (18+ required)', t_need_core: 'Your agreement is required to use Wingman',
    t_go_active: 'Go active to see who’s nearby', t_anon_profile: 'Anonymous profile', t_expires_in: 'Expires in', t_silently_expired: 'It quietly expired', t_chat_expired: 'Time to decide ran out',
    t_cam_required: 'Allow the camera to send a live selfie.', t_capture_fail: 'Couldn’t take the photo', t_slow_net: 'Slow network — try again', t_selfie_fail: 'Photo didn’t send', t_media_missing: 'Photo didn’t go through', t_api_selfie: 'Can’t send a photo right now',
    t_otp_sent_to: 'Sent to', t_bad_phone: 'Invalid number', t_nearby_people: 'Nearby people',
  },
  fr: {
    brandtag: 'Facilitez la première rencontre', splash_tag: 'Wingman facilite le premier « bonjour » avec quelqu’un déjà près de vous.', splash_love: 'L’amour est dans l’air.', splash_cta: 'Commencer',
    next: 'Suivant', ob_eyebrow: 'Le problème',
    ob1_title: 'Vous vous croisez. Rien ne se passe.', ob1_body: "Chaque jour, vous croisez quelqu'un que vous aimeriez rencontrer — sans rien dire. Wingman est fait pour cet instant précis.",
    ob2_eyebrow: 'La solution', ob2_title: 'Un premier pas discret, pas un fil de swipe.', ob2_body: "Pas de profils publics. Pas de chat infini. Un chemin court et privé de « quelqu'un est proche » à « on se voit ».",
    ob3_eyebrow: 'La promesse', ob3_title: 'Facilitez la première rencontre.', ob3_body: "Personne n’est prévenu si vous passez votre chemin. Votre position exacte n’est jamais montrée. Vous restez aux commandes.", ob3_cta: 'Créer mon compte',
    phone_sub: 'Vérifiez votre numéro', phone_title: 'Votre téléphone', phone_body: 'Nous envoyons un code à 6 chiffres. Votre numéro n\'est jamais montré.', phone_label: 'Numéro de téléphone', phone_cta: 'Envoyer le code', phone_note: 'Vérification uniquement — pour garder Wingman sans faux profils.',
    phone_body_ft: 'Entrez votre vrai numéro. Dans ce build field-test, aucun SMS n\'est envoyé — utilisez le code du coordinateur.',
    otp_sub: 'Entrez le code', otp_title: 'Code à 6 chiffres', otp_body: 'Envoyé sur votre téléphone', otp_cta: 'Vérifier', otp_resend: 'Renvoyer le code',
    otp_body_ft: 'Test terrain pour', otp_field_note: 'Vérification test terrain — aucun SMS n\'est envoyé. Utilisez le code fourni par le coordinateur.',
    t_auth_required: 'Connectez-vous avec votre téléphone', t_auth_ok: 'Connecté', t_otp_sent: 'Code envoyé', t_otp_ready_ft: 'Entrez le code du test terrain', t_otp_bad: 'Code invalide', t_otp_expired: 'Code expiré', t_otp_rate: 'Trop de tentatives — réessayez plus tard', t_otp_not_allowed: 'Ce numéro n’est pas sur la liste du test terrain',
    profile_sub: 'Votre profil', pf_name: 'Prénom', pf_birth: 'Date de naissance', pf_birth_day: 'Jour', pf_birth_month: 'Mois', pf_birth_year: 'Année', pf_birth_hint: 'Touchez chaque colonne — molette native sur iPhone.',
    pf_gender: 'Genre', g_male: 'Homme', g_female: 'Femme', g_nb: 'Non-binaire',
    pf_sec_identity: 'Qui vous êtes', pf_sec_intention: 'Intention', pf_sec_interests: 'Centres d’intérêt',
    pf_interest: 'Intéressé·e par', t_men: 'Hommes', t_women: 'Femmes', t_nb: 'Non-binaire', pf_intention: 'Votre intention', intention_available: 'Disponible maintenant', intention_exploring: 'Juste explorer', pf_height: 'Taille (cm)', pf_interests: "Centres d'intérêt (max 5)", pf_bio: 'Bio du jour (150 max)',
    consent_sub: 'Vos choix', consent_title: 'Ce que vous acceptez', consent_body: 'Chaque choix est distinct. Vous pouvez les changer à tout moment dans Moi.',
    c_core: 'Utiliser Wingman', c_core_d: 'Nécessaire pour vous présenter aux personnes déjà près de vous.', c_loc: 'Localisation approximative', c_loc_d: 'À proximité seulement — votre position exacte n’est jamais montrée.',
    c_destiny: 'Repérer les croisements répétés', c_destiny_d: 'Désactivé par défaut. Wingman ne montre jamais où cela s’est passé.', c_push: 'Notifications', c_push_d: 'Quand quelqu’un près de vous se manifeste, ou qu’une rencontre est confirmée.',
    c_analytics: 'Aider à améliorer Wingman', c_analytics_d: 'Optionnel. Aperçus anonymes uniquement.', consent_cta: 'Accepter et voir autour de moi',
    consent_back: 'Retour', consent_save: 'Enregistrer',
    radar_sub: 'Autour de vous', radar_invisible: 'Invisible', radar_active: 'Disponible', radar_dist: 'Quelqu\'un très proche · À proximité', radar_activate: 'Me rendre visible', radar_deactivate: 'Devenir invisible',
    mood_ready: 'Prêt·e', mood_open: 'Ouvert·e', mood_explore: 'Incertain·e', mood_ready_d: 'Se voir maintenant', mood_open_d: 'Si c\'est le bon', mood_explore_d: 'Juste explorer', mood_title: 'Votre humeur',
    stat_signals: 'Signaux restants', stat_nearby: 'À proximité', stat_tickets: 'Rencontres en attente',
    destiny_eyebrow: 'Vos chemins se sont recroisés', destiny_card_t: 'Vous continuez de vous croiser', destiny_card_d: 'Wingman a remarqué des croisements répétés — jamais l’endroit.',
    send_signal: 'Dire bonjour', close: 'Fermer',
    signal_sub: 'Quelqu’un s’est manifesté', signal_title: 'Quelqu’un près de vous aimerait faire connaissance.', signal_body: 'Cela expire en silence si vous n’ouvrez pas. Personne n’est prévenu si vous passez votre chemin.', open: 'Ouvrir', sig_expired: 'Expiré',
    signal_silent: 'Aucun nouveau Signal. Lorsqu’une personne près de vous vous contactera, vous le verrez ici.',
    inbox_title: 'Quelqu’un près de vous aimerait faire connaissance.', inbox_hint: 'Ouvrez-le avant qu’il n’expire en silence.',
    s_live: 'Selfie en direct', s_stamp: 'Horodatée', s_gallery: 'Galerie bloquée',
    s_title: 'Envoyez un selfie en direct', s_body: 'Montrez que c’est bien vous.',
    s_send: 'Envoyez un selfie en direct', s_letexpire: 'Laisser expirer', s_approve: 'Approuver',
    s_note: 'Visible uniquement pour cette connexion.',
    confirmed: 'Vous avez tous les deux dit oui.',
    confirmed_d: 'Prêts à faire connaissance ?',
    ticket_sub: 'Garder ce moment', ticket_badge: 'Gardé pour vous', ticket_title: 'Pas dispo maintenant ?', ticket_body: 'Gardez ce moment — jusqu’à 2 h. Le chat s’ouvre seulement quand vous décidez tous les deux de vous voir.', ticket_body_free: 'Gardez ce moment — jusqu’à 2 h. Le chat s’ouvre seulement quand vous décidez tous les deux de vous voir.', ticket_body_plus: 'Gardez ce moment — jusqu’à 24 h. Le chat s’ouvre seulement quand vous décidez tous les deux de vous voir.', ticket_open: 'Je suis dispo', ticket_later: 'Plus tard',
    mm_sub: 'Décidez où vous retrouver.', mm_obj: 'Décidez où vous retrouver.', mm_keep: 'Faites simple — vous avez 15 minutes.', mm_ph: 'Côté terrasse, ça marche…', mm_note: 'Numéros et réseaux sociaux restent bloqués.', mm_meet: 'On se retrouve', mm_not: 'Pas cette fois',
    mode_eyebrow: 'Cette rencontre', mode_title: 'Concentrez-vous sur cette connexion', mode_body: 'Les vraies rencontres méritent toute votre attention.', mode_invisible: 'Vous êtes discrètement invisible autour de vous', mode_cta: 'On s’est vus — continuer',
    outcome_title: 'Vous êtes-vous rencontrés ?', outcome_body: 'Votre réponse reste privée. L’autre ne la voit jamais.', outcome_yes: 'Oui, on s’est vus', outcome_no: 'Pas cette fois',
    t_outcome_saved: 'Votre réponse est enregistrée. En attente de l’autre personne.',
    cd_eyebrow: 'Une pause discrète', cd_min: 'minutes', cd_title: 'Prenez votre temps.', cd_body: 'Revenez sur le Radar lorsque vous êtes prêt.', cd_ok: 'Retour au Radar',
    destiny_title: 'Vous continuez de vous croiser.', destiny_body: 'Wingman a remarqué que vos chemins se recroisent — sans montrer où, quand, ni l’itinéraire.', destiny_try: 'Dire bonjour', destiny_ignore: 'Pas maintenant', destiny_off: 'Vous pouvez désactiver cela à tout moment dans Moi.',
    pulse_sub: 'Ce qui se passe autour de vous', pulse_title: 'Ce qui se passe autour de vous', pulse_anon: 'Les lieux restent approximatifs — jamais exacts.',
    pulse_few: 'Ça commence à bouger', pulse_some: 'Animé ce soir', pulse_busy: 'Très actif en ce moment',
    pulse_privacy: 'Comment Pulse protège votre vie privée', pulse_privacy_d: 'Votre position exacte n’est jamais montrée. Ce qui se passe autour de vous reste approximatif, et Pulse ne révèle pas qui vous êtes.',
    pz1: 'Une belle énergie tout près', pz2: 'Un moment vivant à proximité', pz3: 'Un coin plus calme tout près', pulse_note: 'Les lieux restent approximatifs — jamais exacts.',
    settings_sub: 'Moi', set_account: 'Compte', set_plan: 'Votre offre', set_plan_name: 'Offre', set_plan_signals: 'Signaux par jour', set_plan_tickets: 'Rencontres en attente', set_plan_note: 'Les paiements ne sont pas encore disponibles.',
    set_privacy: 'Vie privée', set_photo: 'Photos', set_photo_v: 'Partagées seulement pendant une connexion', set_none: 'Aucune', set_loc: 'Localisation', set_loc_v: 'Votre position exacte n’est jamais montrée', set_never: 'Jamais montrée', set_consent: 'Données et consentement', set_consent_manage: 'Gérer ce que Wingman peut utiliser', set_accepted: 'Géré', set_gdpr: 'Votre position exacte n’est jamais montrée', set_designed: 'Jamais montrée',
    set_controls: 'Contrôles', set_destiny: 'Laisser Wingman remarquer les croisements répétés, sans montrer où cela s’est passé.', set_rm: 'Réduire les animations', set_haptics: 'Retour haptique', set_rights: 'Vos données', set_export: 'Exporter mes données', set_delete: 'Supprimer mon compte', set_admin: 'Aperçu modération admin →',
    set_safety: 'Sécurité', set_safety_d: 'Si quelqu’un vous met mal à l’aise, signalez-le et bloquez-le. Le blocage est immédiat et silencieux — l’autre n’est jamais prévenu. Vous ne vous verrez plus à proximité, et iel ne pourra plus dire bonjour.', set_notifications: 'Notifications', set_push: 'Prévenez-moi quand quelqu’un près de moi se manifeste', set_language: 'Langue', set_a11y: 'Accessibilité',
    t_push_off: 'Les notifications restent désactivées tant que vous ne les autorisez pas.', t_push_on: 'Wingman peut vous prévenir d’un Signal ou d’un message de rencontre.', t_push_blocked: 'Les notifications push ne sont pas configurées (identifiants VAPID/FCM manquants).', t_push_denied: 'Les notifications ont été bloquées dans le navigateur.',
    report_sub: 'Signaler et bloquer', report_short: 'Signaler', report_title: 'Que s’est-il passé ?', report_body: 'Le blocage est immédiat et silencieux. L’autre personne n’est jamais prévenue.',
    report_confirm: 'Choisissez un motif. Nous les bloquons tout de suite. Ils ne sont jamais prévenus.',
    report_empty_t: 'Personne à signaler pour le moment.', report_empty: 'Ouvrez la carte de quelqu’un à proximité, ou utilisez Signaler et bloquer pendant une rencontre.', report_back: 'Retour',
    rc_harass: 'Harcèlement', rc_threat: 'Menace', rc_imp: 'Usurpation', rc_sexual: 'Contenu sexuel', rc_minor: 'Sécurité des mineurs', rc_contact: 'Contact en dehors de Wingman',
    report_done_badge: 'Bloqué', report_done_t: 'Vous ne vous reverrez plus.', report_done_b: 'Cette personne n’apparaîtra plus à proximité, et ne pourra plus dire bonjour. Elle n’est jamais prévenue. Des signalements répétés sont lus par une personne — jamais un bannissement automatique définitif.', report_done_cta: 'Retour autour de moi',
    plan_sub: 'Votre offre', plan_active: 'Active', plan_payments_off: 'Les paiements ne sont pas encore disponibles.', plan_back: 'Retour à Moi',
    pw_f1: '2 Signaux / jour', pw_f2: '1 rencontre en attente — jusqu’à 2 h', pw_f3: 'Croisements répétés inclus', pw_f4: '15 min pour décider d’un lieu',
    admin_sub: 'File de modération', admin_body: 'Une preuve n’est créée que si quelqu’un signale pendant une rencontre. Elle est chiffrée, et chaque accès est journalisé.',
    admin_pending: 'EN ATTENTE', admin_review: 'EN REVUE', admin_resolved: 'RÉSOLU', admin_c1: '3 signalements indépendants · contact hors Wingman', admin_c2: '1 signalement · Harcèlement · preuve scellée', admin_c3: 'Rejeté — faux signalements coordonnés détectés', admin_back: '← Retour à l’app',
    nav_radar: 'Radar', nav_signal: 'Reçus', nav_pulse: 'Pulse', nav_settings: 'Moi',
    t_signal_sent: 'Bonjour envoyé — cela expire en silence dans 10 min', t_mood: 'Humeur mise à jour', t_blocked: 'Numéros et réseaux sociaux restent bloqués', t_active: 'Vous êtes visible à proximité', t_invisible: 'Vous êtes invisible',
    t_api_mock: 'Mode démo — non connecté', t_api_live: 'Connecté',
    t_api_unreachable: 'Wingman injoignable — réessayez', t_api_unconfigured: 'App mal configurée — contactez le coordinateur',
    t_field_build: 'Build test terrain',
    t_loading: 'Chargement…', t_accepting: 'Ouverture de la connexion…', t_selfie: 'Envoi de la photo…', t_approving: 'Confirmation…',
    t_meet: 'Ouverture de la rencontre…', t_ticket: 'On garde ce moment…', t_chat: 'Envoi…', t_outcome: 'Enregistrement…',
    t_timeout: 'Trop long — réessayez', t_offline_blocked: 'Hors ligne — réessayez', t_offline_banner: 'Vous êtes hors ligne — on rattrapera à votre retour',
    t_reconnecting: 'Reconnexion…', t_reconnected: 'De retour en ligne', t_reconnect_fail: 'Toujours hors ligne', t_reconnect: 'Reconnecter',
    empty_radar: 'Rendez-vous visible pour voir qui est près de vous.', empty_radar_alone: 'C’est calme autour de vous', empty_signals: 'Aucun nouveau Signal.', empty_signals_d: 'Lorsqu’une personne près de vous vous contactera, vous le verrez ici.',
    lm_available: 'Disponible maintenant', lm_exploring: 'En exploration', lm_filters: 'Filtres', lm_filters_d: 'Affiche moins de ce qui vous est déjà proposé. Les filtres ne contournent jamais la vie privée.',
    lm_recenter: 'Recentrer', lm_quiet: 'C’est calme autour de vous', lm_quiet_d: 'Wingman vous montrera une opportunité réelle lorsqu’elle apparaîtra près de vous.',
    lm_prox: 'Distance', lm_prox_close: 'Très proche', lm_prox_near: 'À proximité', lm_prox_around: 'Autour de moi',
    lm_presence: 'Humeur', lm_intention: 'Intention', lm_interests: 'Intérêts', lm_apply: 'Appliquer', lm_clear: 'Effacer',
    lm_someone: 'Quelqu’un à proximité', lm_new: 'Tout près, maintenant', lm_destiny: 'Vos chemins se sont recroisés.',
    lm_count: 'à proximité', lm_count_one: 'à proximité', lm_count_zero: '0 à proximité',
    lm_loc_denied: 'La localisation est désactivée. Autorisez une position approximative pour voir qui est près de vous.',
    lm_loc_off: 'Localisation indisponible. Les opportunités apparaîtront quand nous pourrons vous situer.',
    lm_offline: 'Hors ligne. La carte reste affichée ; les personnes autour se mettront à jour à votre retour.',
    lm_you: 'Vous',
    discover_sub: 'Autour de vous maintenant', discover_lead: 'Des personnes déjà près de vous — seulement ce qui est réel, maintenant.',
    nav_discover: 'Découvrir', nav_me: 'Moi',
    reason_nearby: 'À proximité', reason_available: 'Disponible maintenant',
    interest_music: 'Musique', interest_travel: 'Voyage', interest_food: 'Cuisine', interest_fitness: 'Sport', interest_art: 'Art',
    mood_shape_ring: ' · anneau', mood_shape_solid: ' · plein', mood_shape_quiet: ' · calme',
    a11y_skip: 'Aller à l’app', t_smoke_ok: 'Smoke P4 OK', t_smoke_fail: 'Smoke P4 échoué',
    t_phase_idle: 'Prêt', t_phase_available: 'Vous êtes visible à proximité', t_phase_busy: 'Occupé', t_phase_unavailable: 'Indisponible',
    t_phase_signal: 'Quelqu’un s’est manifesté', t_phase_validation: 'En attente d’une photo', t_phase_match: 'Vous avez tous les deux dit oui.',
    t_phase_mission: 'Décidez où vous retrouver.', t_phase_cooldown: 'Une pause discrète', t_phase_offline: 'Hors ligne',
    t_signal_received: 'Quelqu’un près de vous aimerait faire connaissance.', t_validation: 'En attente d’une photo', t_match: 'Vous avez tous les deux dit oui.',
    t_mission_active: 'Décidez où vous retrouver.', t_mission_done: 'Cette rencontre est terminée', t_cooldown_on: 'Une pause discrète',
    t_session_restored: 'Bon retour', t_no_signals: 'Plus de Signaux aujourd’hui', t_export_ok: 'Votre fichier est prêt', t_delete_ok: 'Suppression du compte demandée',
    t_report_rate: 'Trop de signalements pour le moment. La personne reste bloquée — réessayez plus tard.',
    t_cam_off: 'Caméra indisponible sur cet appareil.', t_cam_denied: 'L’accès à la caméra est refusé. Autorisez-la pour envoyer une photo en direct — les photos de la galerie ne sont pas acceptées.', t_cam_fail: 'Impossible d’ouvrir la caméra.',
    t_need_interest: 'Choisissez qui vous intéresse', t_need_birth: 'Date de naissance requise', t_profile_invalid: 'Profil invalide (18 ans et plus requis)', t_need_core: 'Votre accord est requis pour utiliser Wingman',
    t_go_active: 'Rendez-vous visible pour voir qui est près de vous', t_anon_profile: 'Profil anonyme', t_expires_in: 'Expire dans', t_silently_expired: 'Cela a expiré en silence', t_chat_expired: 'Le temps pour décider est écoulé',
    t_cam_required: 'Autorisez la caméra pour envoyer une photo en direct.', t_capture_fail: 'Impossible de prendre la photo', t_slow_net: 'Réseau lent — réessayez', t_selfie_fail: 'La photo n’est pas partie', t_media_missing: 'La photo n’est pas passée', t_api_selfie: 'Impossible d’envoyer une photo pour le moment',
    t_otp_sent_to: 'Envoyé au', t_bad_phone: 'Numéro invalide', t_nearby_people: 'Personnes à proximité',
  },
};

function readStoredLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch (_) { /* ignore */ }
  const nav = (navigator.language || '').toLowerCase();
  return nav.startsWith('fr') ? 'fr' : 'en';
}

function persistLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch (_) { /* ignore */ }
}

function syncLangControls() {
  $$('.chip.lang, .lang-opt').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.lang === state.lang));
  });
}

function setLang(lang) {
  state.lang = lang === 'fr' ? 'fr' : 'en';
  document.documentElement.lang = state.lang;
  persistLang(state.lang);
  applyLang();
}

function applyLang() {
  const dict = I18N[state.lang] || I18N.en;
  $$('[data-i18n]').forEach(el => { const k = el.dataset.i18n; if (dict[k] != null) el.textContent = dict[k]; });
  $$('[data-i18n-ph]').forEach(el => { const k = el.dataset.i18nPh; if (dict[k] != null) el.placeholder = dict[k]; });
  buildNav();
  syncLangControls();
  const rs = $('#radar-state');
  if (rs) rs.textContent = state.radarActive ? dict.radar_active : dict.radar_invisible;
  const tog = $('#radar-toggle');
  if (tog) tog.textContent = state.radarActive ? dict.radar_deactivate : dict.radar_activate;
  if (typeof syncConsentChrome === 'function') syncConsentChrome();
  if (typeof applyFieldTestAuthCopy === 'function') applyFieldTestAuthCopy();
  if (typeof refreshBirthMonthLabels === 'function') refreshBirthMonthLabels();
  if (typeof syncLivingMapPresence === 'function') syncLivingMapPresence();
  if (typeof syncLivingMapMood === 'function') syncLivingMapMood();
  if (typeof syncSignalsChrome === 'function') syncSignalsChrome();
  const mapEl = $('#living-map-el');
  if (mapEl) mapEl.setAttribute('aria-label', dict.radar_sub);
  if (typeof syncInboxChrome === 'function') syncInboxChrome();
  if (typeof syncRadarEmpty === 'function') syncRadarEmpty();
  if (typeof syncTicketCopy === 'function') syncTicketCopy();
  if (state.livingMap && typeof refreshLivingMap === 'function') void refreshLivingMap();
  else if (typeof renderDiscoverFromDots === 'function') renderDiscoverFromDots();
  const pushSw = $('#set-push');
  const pushSt = $('#push-status');
  if (pushSt && pushSw) {
    pushSt.textContent = pushSw.getAttribute('aria-checked') === 'true' ? dict.t_push_on : dict.t_push_off;
  }
  if (typeof renderDiscoverList === 'function') {
    if (state.livingMap) renderDiscoverList(state.lmOpportunities);
    else renderDiscoverFromDots();
  }
}
const t = k => (I18N[state.lang] && I18N[state.lang][k]) || (I18N.en && I18N.en[k]) || k;

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
  const sw = $('[aria-labelledby="lbl-haptics"]');
  if (sw && sw.getAttribute('aria-checked') === 'false') return;
  const map = { selection: 10, signalSent: 20, connectionConfirmed: [30, 40, 30], mission: [18, 30, 18], timeWarning: 25, error: [40] };
  if (map[kind] == null) return;
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
    'v-radar', 'v-discover', 'v-signal', 'v-selfie', 'v-ticket', 'v-mission-meet', 'v-mission-mode',
    'v-outcome', 'v-cooldown', 'v-confirmed', 'v-destiny', 'v-pulse', 'v-settings',
    'v-report', 'v-report-done',
  ]);
  // Public product: block protocol UI without OTP — stop ghost Radar / dead Go active.
  if (protocolViews.has(id) && api && api.productPath && !isAuthedSession()) {
    feedback('busy', t('t_auth_required'));
    id = 'v-phone';
  }
  syncViewA11y(id);
  const v = $('#' + id); if (!v) return;
  state.viewId = id;
  setLivingMapWorld(id);
  if (id !== 'v-radar' && id !== 'v-discover' && id !== 'v-pulse') {
    closeOpportunitySheet();
    closeFilterSheet();
  }
  if (typeof closeLivingMapMood === 'function') closeLivingMapMood();
  const screen = $('#main-screen');
  if (screen) screen.scrollTop = 0;
  const body = $('.body', v); if (body) body.scrollTop = 0;
  onEnter(id);
  persistSession();
  const title = ($('.subtitle', v) || $('h1', v) || $('h2', v));
  if (title) announce(title.textContent.trim());
  requestAnimationFrame(() => focusActiveView(id));
}
function navItems() {
  // Public tabs: Radar / Discover / Pulse / Me. Signal is inbox overlay, not a tab.
  return [
    ['v-radar', 'radar', 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0 M12 12m-6 0a6 6 0 1012 0 6 6 0 10-12 0'],
    ['v-discover', 'discover', 'M4 6h16M4 12h10M4 18h7'],
    ['v-pulse', 'pulse', 'M3 12h4l2-7 4 14 2-7h6'],
    ['v-settings', 'me', 'M12 12a4 4 0 100-8 4 4 0 000 8z M4 21c1.5-4 6-6 8-6s6.5 2 8 6'],
  ];
}
function buildNav() {
  $$('[data-navbar]').forEach(bar => {
    const current = bar.closest('.view').dataset.nav;
    bar.innerHTML = navItems().map(([vid, key, d]) => {
      const on = key === current || (key === 'me' && current === 'settings') || (key === 'radar' && current === 'signal');
      const badge = (key === 'radar' && state.hasIncomingSignal)
        ? '<span class="nav-badge" aria-hidden="true"></span>'
        : '';
      return `<button data-go="${vid}" ${on ? 'aria-current="page"' : ''}>
        <span class="nav-ico-wrap">${badge}<svg class="ico" viewBox="0 0 24 24"><path d="${d}"/></svg></span>
        <span>${t('nav_' + key)}</span></button>`;
    }).join('');
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
  if (!state.radarActive) { toast(t('t_go_active')); return; }
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
  const band = d.band === 'NEAR' ? t('lm_prox_close') : t('lm_prox_near');
  $('#sheet-age').textContent = band;
  $('#sheet-bio').textContent = (state.lang === 'fr' ? d.bioFr : d.bio) || t('t_anon_profile');
  $('#sheet-tags').innerHTML = (d.tags || []).map(x => `<span>${x}</span>`).join('');
  const sheet = $('#dot-sheet');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  announce($('#sheet-age').textContent + ' · ' + $('#sheet-mood').textContent);
  requestAnimationFrame(() => { const b = $('#send-signal-btn'); if (b) b.focus(); });
}
function closeOpportunitySheet() {
  const sheet = $('#dot-sheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
}
function closeFilterSheet() {
  const sh = $('#lm-filter-sheet');
  if (!sh) return;
  sh.classList.remove('open');
  sh.setAttribute('aria-hidden', 'true');
}
$('#close-sheet').addEventListener('click', () => {
  closeOpportunitySheet();
  const canvasEl = $('#radar-canvas'); if (canvasEl) canvasEl.focus();
});
canvas.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  if (!state.radarActive) {
    feedback('busy', t('t_go_active'));
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
  if (state.signalsLeft <= 0) { toast(t('t_no_signals')); return; }
  const targetId = currentDot && currentDot.userId;
  if (!targetId || targetId === state.meId) {
    feedback('busy', t('empty_radar_alone'));
    return;
  }
  const w = canvas.clientWidth || 400; signalWave = { x: w / 2, y: 170, t: performance.now() };
  startRadar(); haptic('signalSent');
  closeOpportunitySheet();

  if (liveApi()) {
    try {
      await withLoading(t('t_loading'), async () => {
        const loc = await requestViewerLocation();
        if (!loc) {
          const err = new Error('LOCATION_REQUIRED');
          err.code = 'LOCATION_REQUIRED';
          throw err;
        }
        await api.radarActivate({ lat: loc.lat, lng: loc.lng, visibility: 'ACTIVE' });
        const res = await api.sendSignal(
          { receiverId: targetId, source: 'RADAR' },
          { idempotencyKey: 'proto-' + Date.now() },
        );
        state.signalId = res && res.signal && res.signal.id;
        state.peerId = targetId;
        state.signalsLeft = Math.max(0, state.signalsLeft - 1);
        syncSignalsChrome();
      });
      // Sender stays on Radar — recipient gets signal.received over realtime.
      setPhase('available', t('t_phase_available'));
      feedback('signal', t('t_signal_sent'));
      return;
    } catch (e) {
      if (e && e.code === 'LOCATION_REQUIRED') {
        feedback('busy', t((typeof WingmanPresenceGeo !== 'undefined' && WingmanPresenceGeo.locMessageKey(state.locState)) || 'lm_loc_off'));
        return;
      }
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
          const loc = await requestViewerLocation();
          if (!loc) {
            const err = new Error('LOCATION_REQUIRED');
            err.code = 'LOCATION_REQUIRED';
            throw err;
          }
          await api.radarActivate({ lat: loc.lat, lng: loc.lng, visibility: 'ACTIVE' });
          const cands = await api.radarCandidates();
          applyRadarCandidates(cands);
        });
      } else {
        await withLoading(t('t_loading'), async () => {
          stopPresenceHeartbeat();
          await api.radarDeactivate();
          clearRadarDots();
        });
      }
    } catch (e) {
      if (e && e.code === 'LOCATION_REQUIRED') {
        feedback('busy', t((typeof WingmanPresenceGeo !== 'undefined' && WingmanPresenceGeo.locMessageKey(state.locState)) || 'lm_loc_off'));
        syncRadarEmpty();
        return;
      }
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
  syncLivingMapPresence();
  if (state.livingMap) void refreshLivingMap();
  setPhase(state.radarActive ? 'available' : 'idle');
  feedback(state.radarActive ? 'success' : 'offline', state.radarActive ? t('t_active') : t('t_invisible'));
  if (state.radarActive) startPresenceHeartbeat();
  else stopPresenceHeartbeat();
});
$('#mood-select').addEventListener('click', e => {
  const b = e.target.closest('.mood-btn'); if (!b) return;
  $$('#mood-select .mood-btn').forEach(x => x.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true'); state.mood = b.dataset.mood;
  syncLivingMapMood();
  haptic('selection'); toast(t('t_mood'));
});

/* ------------------------------------------------------------- Living Map */
let livingMapCtl = null;
let livingMapRefreshTimer = null;
let radarRefreshTimer = null;
const RADAR_REFRESH_DEBOUNCE_MS = 280;
const lmFilterState = { proximity: [], presence: [], intention: [], interests: [] };

function livingMapOn() {
  return Boolean(state.livingMap);
}

function enableLivingMapUi() {
  state.livingMap = true;
  document.body.classList.add('living-map');
  const root = $('#living-map-root');
  if (root) {
    root.classList.remove('hidden');
    root.hidden = false;
  }
  const mapEl = $('#living-map-el');
  if (mapEl) mapEl.setAttribute('aria-label', t('radar_sub'));
  if (!livingMapCtl && typeof WingmanLivingMapUi !== 'undefined') {
    livingMapCtl = WingmanLivingMapUi.createMapController({
      el: mapEl,
      t: t,
      onSelect: function (m) { closeLivingMapMood(); openLivingMapSheet(m); },
      onMapIdle: function () { closeLivingMapMood(); },
    });
    livingMapCtl.init();
  }
  buildNav();
  syncLivingMapPresence();
  syncLivingMapMood();
  syncSignalsChrome();
  setLivingMapWorld(state.viewId || 'v-radar');
  if (livingMapCtl) livingMapCtl.invalidate();
}

function disableLivingMapUi() {
  state.livingMap = false;
  document.body.classList.remove('living-map');
  document.body.removeAttribute('data-lm-world');
  document.body.removeAttribute('data-lm-layer');
  const root = $('#living-map-root');
  if (root) {
    root.classList.add('hidden');
    root.hidden = true;
  }
  if (livingMapCtl) {
    livingMapCtl.destroy();
    livingMapCtl = null;
  }
  buildNav();
}

function setLivingMapWorld(viewId) {
  if (!state.livingMap) {
    document.body.removeAttribute('data-lm-world');
    document.body.removeAttribute('data-lm-layer');
    return;
  }
  const near = viewId === 'v-radar' || viewId === 'v-discover' || viewId === 'v-pulse';
  const layer = viewId === 'v-discover' ? 'discover' : viewId === 'v-pulse' ? 'pulse' : 'radar';
  document.body.dataset.lmWorld = near ? 'near' : 'away';
  document.body.dataset.lmLayer = near ? layer : 'radar';
  if (livingMapCtl && near) {
    livingMapCtl.setLayer(layer);
    livingMapCtl.invalidate();
  }
}

function setLivingMapMoodOpen(open) {
  const mood = $('#lm-mood-select');
  const btn = $('#lm-presence');
  if (!mood) return;
  const on = Boolean(open);
  mood.hidden = !on;
  mood.classList.toggle('hidden', !on);
  if (btn) btn.setAttribute('aria-expanded', String(on));
}

function closeLivingMapMood() {
  setLivingMapMoodOpen(false);
}

function syncLivingMapMood() {
  $$('#lm-mood-select .lm-mood-btn').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.mood === state.mood));
  });
  $$('#mood-select .mood-btn').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.mood === state.mood));
  });
}

function filterQuery() {
  const q = {};
  if (lmFilterState.proximity.length) q.proximity = lmFilterState.proximity.join(',');
  if (lmFilterState.presence.length) q.presence = lmFilterState.presence.join(',');
  if (lmFilterState.intention.length) q.intention = lmFilterState.intention.join(',');
  if (lmFilterState.interests.length) q.interests = lmFilterState.interests.join(',');
  return q;
}

function syncLivingMapPresence() {
  const el = $('#lm-presence');
  const lab = $('#lm-presence-label');
  if (!el) return;
  el.classList.toggle('is-off', !state.radarActive);
  el.classList.toggle('is-exploring', state.mood === 'UNSURE' || state.mood === 'EXPLORING');
  if (lab) {
    lab.textContent = !state.radarActive
      ? t('radar_invisible')
      : (state.mood === 'UNSURE' || state.mood === 'EXPLORING' ? t('lm_exploring') : t('lm_available'));
  }
  const tog = $('#lm-radar-toggle');
  if (tog) {
    tog.classList.toggle('off', !state.radarActive);
    tog.setAttribute('aria-pressed', String(state.radarActive));
    tog.textContent = state.radarActive ? t('radar_deactivate') : t('radar_activate');
  }
}

function syncLivingMapEmpty(count) {
  const empty = $('#lm-empty');
  const n = Math.max(0, count | 0);
  if (empty) empty.classList.toggle('hidden', !state.radarActive || n > 0);
  const countEl = $('#lm-count');
  if (countEl) {
    if (!state.radarActive) {
      countEl.textContent = t('empty_radar');
    } else if (n === 0) {
      countEl.textContent = t('lm_quiet');
    } else {
      countEl.textContent = n + ' ' + (n === 1 ? t('lm_count_one') : t('lm_count'));
    }
  }
  setNearbyCount(n);
}

function setLocBanner(msg) {
  const el = $('#lm-loc');
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.classList.remove('hidden');
  el.textContent = msg;
}

function requestViewerLocation() {
  return new Promise(function (resolve) {
    if (state.offline) {
      state.locState = 'offline';
      setLocBanner(t('lm_offline'));
      syncRadarEmpty();
      resolve(null);
      return;
    }
    if (!navigator.geolocation) {
      state.locState = 'unavailable';
      setLocBanner(t('lm_loc_off'));
      syncRadarEmpty();
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        state.locState = 'granted';
        const Geo = typeof WingmanPresenceGeo !== 'undefined' ? WingmanPresenceGeo : null;
        state.viewerLoc = Geo
          ? Geo.coarsen(pos.coords.latitude, pos.coords.longitude)
          : { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocBanner('');
        syncRadarEmpty();
        resolve(state.viewerLoc);
      },
      function (err) {
        state.locState = err && err.code === 1 ? 'denied' : 'unavailable';
        setLocBanner(state.locState === 'denied' ? t('lm_loc_denied') : t('lm_loc_off'));
        syncRadarEmpty();
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
    );
  });
}

let presenceHeartbeatTimer = null;
let presenceHeartbeatLast = 0;

function stopPresenceHeartbeat() {
  if (presenceHeartbeatTimer) {
    clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  if (!liveApi() || !state.radarActive) return;
  presenceHeartbeatLast = Date.now();
  const Hb = typeof WingmanPresenceHeartbeat !== 'undefined' ? WingmanPresenceHeartbeat : null;
  const interval = Hb ? Hb.HEARTBEAT_INTERVAL_MS : 40000;
  presenceHeartbeatTimer = setInterval(function () { void tickPresenceHeartbeat(false); }, interval);
}

async function tickPresenceHeartbeat(force) {
  const Hb = typeof WingmanPresenceHeartbeat !== 'undefined' ? WingmanPresenceHeartbeat : null;
  const visible = typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';
  const now = Date.now();
  const should = Hb
    ? Hb.shouldSendHeartbeat({
      radarActive: state.radarActive,
      visible: visible,
      lastSentAt: presenceHeartbeatLast,
      now: now,
      force: force,
    })
    : (state.radarActive && visible && (force || now - presenceHeartbeatLast >= 40000));
  if (!should || !liveApi()) return;
  const Geo = typeof WingmanPresenceGeo !== 'undefined' ? WingmanPresenceGeo : null;
  const loc = Geo ? Geo.heartbeatLocation(state.viewerLoc, state.locState) : viewerCoords();
  try {
    await api.radarHeartbeat(loc ? { lat: loc.lat, lng: loc.lng } : {});
    presenceHeartbeatLast = now;
  } catch (e) {
    if (e && (e.code === 'NOT_FOUND' || e.code === 'CONFLICT')) {
      stopPresenceHeartbeat();
      state.radarActive = false;
      const btn = $('#radar-toggle'), st = $('#radar-state');
      if (btn) {
        btn.classList.add('off');
        btn.setAttribute('aria-pressed', 'false');
        btn.textContent = t('radar_activate');
      }
      if (st) {
        st.textContent = t('radar_invisible');
        st.classList.add('invisible');
      }
      clearRadarDots();
      syncRadarEmpty();
      syncLivingMapPresence();
      setPhase('idle');
    }
  }
}

function onPresenceVisibility() {
  const Recon = typeof WingmanPresenceReconnect !== 'undefined' ? WingmanPresenceReconnect : null;
  const visible = document.visibilityState !== 'hidden';
  if (!visible) {
    if (!Recon || Recon.restorePlan({ visible: false }).clearNearbyOnHide) {
      clearRadarDots();
    }
    return;
  }
  void restoreForeground({ silent: true });
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', onPresenceVisibility);
}
window.addEventListener('pageshow', function (e) {
  if (e.persisted || document.visibilityState === 'visible') void restoreForeground({ silent: true });
});

let restoreForegroundInFlight = null;
let restoreForegroundAgain = false;
async function restoreForeground(opts) {
  opts = opts || {};
  if (restoreForegroundInFlight) {
    restoreForegroundAgain = true;
    return restoreForegroundInFlight;
  }
  restoreForegroundInFlight = (async function () {
    const Recon = typeof WingmanPresenceReconnect !== 'undefined' ? WingmanPresenceReconnect : null;
    const plan = Recon
      ? Recon.restorePlan({
        visible: typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
        hasSession: isAuthedSession(),
        radarActiveIntent: state.radarActive,
        connectionId: state.connectionId,
        socketConnected: Boolean(realtime && realtime.connected),
      })
      : {
        restoreSession: isAuthedSession(),
        reconnectSocket: isAuthedSession() && !(realtime && realtime.connected),
        restoreRadar: isAuthedSession() && state.radarActive,
        restoreMission: isAuthedSession() && Boolean(state.connectionId),
        restoreChat: isAuthedSession() && Boolean(state.connectionId),
      };
    if (!plan.restoreSession) return;
    if (!liveApi()) return;
    try {
      await api.me();
    } catch (e) {
      if (Recon ? Recon.isHardAuthFailure(e) : (e && (e.code === 'UNAUTHORIZED' || e.status === 401))) {
        try { api.clearSession(); } catch (_) { /* ignore */ }
        clearProtoSession();
        state.radarActive = false;
        stopPresenceHeartbeat();
        if (!opts.silent) feedback('busy', t('t_auth_required'));
        show('v-phone');
        return;
      }
      setOfflineUi(true, false);
      setApiBanner('offline', t('t_api_unreachable'));
      return;
    }
    setOfflineUi(false, false);
    if (state.apiLive) setApiBanner('live', t('t_api_live'));
    if (plan.reconnectSocket || plan.restoreSession) ensureRealtimeReconnect();
    if (plan.restoreRadar) {
      await tickPresenceHeartbeat(true);
      if (state.radarActive) {
        try {
          const cands = await api.radarCandidates();
          applyRadarCandidates(cands);
        } catch (_) {
          clearRadarDots();
        }
      } else {
        clearRadarDots();
      }
    } else if (!state.radarActive) {
      clearRadarDots();
    }
    if (plan.restoreMission) {
      try { await refreshConnectionUi({ route: true }); } catch (_) { /* keep last known */ }
    }
    if (plan.restoreChat) {
      try { await restoreChatLog(); } catch (_) { /* keep last known */ }
    }
  })().finally(function () {
    restoreForegroundInFlight = null;
    if (restoreForegroundAgain) {
      restoreForegroundAgain = false;
      void restoreForeground(opts);
    }
  });
  return restoreForegroundInFlight;
}

function openLivingMapSheet(m) {
  if (!m) return;
  currentDot = {
    userId: m.userId,
    mood: m.moodState,
    band: m.distanceBand === 'VERY_CLOSE' ? 'NEAR' : 'AROUND',
    bio: m.destiny ? t('lm_destiny') : t('lm_new'),
    bioFr: m.destiny ? t('lm_destiny') : t('lm_new'),
    tags: m.contextTags || [],
  };
  const moodLabel = m.moodState === 'SUPER_READY' ? t('mood_ready')
    : m.moodState === 'EXPLORING' ? t('mood_explore') : t('mood_open');
  const bandLabel = m.distanceBand === 'VERY_CLOSE' ? t('lm_prox_close')
    : m.distanceBand === 'AROUND_ME' ? t('lm_prox_around') : t('lm_prox_near');
  $('#sheet-mood').textContent = '● ' + moodLabel;
  $('#sheet-mood').style.color = MOOD_COLORS[m.moodState] || MOOD_COLORS.OPEN;
  $('#sheet-age').textContent = t('lm_someone') + ' · ' + bandLabel;
  $('#sheet-bio').textContent = m.destiny ? t('lm_destiny') : t('lm_new');
  const tags = (m.contextTags || []).slice();
  if (m.intention === 'AVAILABLE_NOW') tags.unshift(t('intention_available'));
  $('#sheet-tags').innerHTML = tags.map(function (x) { return '<span>' + x + '</span>'; }).join('');
  const sheet = $('#dot-sheet');
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  announce($('#sheet-age').textContent);
}

async function refreshLivingMap() {
  if (!state.livingMap) return;
  if (livingMapCtl && state.viewerLoc) livingMapCtl.setViewer(state.viewerLoc);
  else if (livingMapCtl) livingMapCtl.setViewer(viewerCoords());
  if (!liveApi() || !state.radarActive) {
    state.lmOpportunities = [];
    if (livingMapCtl) livingMapCtl.setOpportunities([], state.meId);
    syncLivingMapEmpty(0);
    renderDiscoverList([]);
    return;
  }
  try {
    const res = await api.radarOpportunities(filterQuery());
    const list = (res && res.opportunities) || [];
    if (typeof WingmanLivingMap !== 'undefined' && WingmanLivingMap.payloadLeaksCoordinates(res)) {
      state.lmOpportunities = [];
      if (livingMapCtl) livingMapCtl.setOpportunities([], state.meId);
      syncLivingMapEmpty(0);
      return;
    }
    state.lmOpportunities = list;
    const markers = livingMapCtl ? livingMapCtl.setOpportunities(list, state.meId) : [];
    syncLivingMapEmpty((markers && markers.length) || list.length);
    renderDiscoverList(list);
    syncDestinyCard(list);
  } catch (_) {
    syncLivingMapEmpty(0);
  }
}

function scheduleLivingMapRefresh() {
  scheduleRadarRefresh();
}

/** Debounced Radar refetch from realtime — canvas and Living Map share this so heartbeats do not spam GET. */
function scheduleRadarRefresh() {
  clearTimeout(radarRefreshTimer);
  clearTimeout(livingMapRefreshTimer);
  radarRefreshTimer = setTimeout(function () {
    if (!liveApi() || !state.radarActive) return;
    if (state.livingMap) void refreshLivingMap();
    else api.radarCandidates().then(applyRadarCandidates).catch(function () { /* keep last dots */ });
  }, RADAR_REFRESH_DEBOUNCE_MS);
}

function humanInterest(tag) {
  const key = 'interest_' + String(tag || '').toLowerCase();
  return t(key) !== key ? t(key) : tag;
}

function reasonBits(o) {
  const bits = [];
  const band = o.distanceBand || o.band;
  if (band === 'VERY_CLOSE' || band === 'NEARBY' || band === 'NEAR' || band === 'AROUND' || band === 'AROUND_ME') {
    bits.push(t('reason_nearby'));
  }
  if (o.intention === 'AVAILABLE_NOW') bits.push(t('reason_available'));
  const tags = o.contextTags || o.tags || [];
  tags.forEach((tag) => {
    if (tag === 'Music' || tag === 'Food' || tag === 'Travel' || tag === 'Fitness' || tag === 'Art') {
      bits.push(humanInterest(tag));
    }
  });
  return bits.slice(0, 3);
}

function bindDiscoverRows(wrap, rows) {
  if (!wrap) return;
  $$('.discover-open', wrap).forEach(function (btn) {
    btn.addEventListener('click', function () {
      const o = rows.find(function (x) { return x.userId === btn.dataset.uid; });
      if (o) openLivingMapSheet(o);
    });
  });
  $$('.discover-report', wrap).forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      openReportFor(btn.dataset.uid);
    });
  });
}

function renderDiscoverList(list) {
  const wrap = $('#discover-list');
  const tray = $('#lm-discover-tray');
  const empty = $('#discover-empty');
  const rows = Array.isArray(list) ? list : [];
  const showRows = rows.length > 0 && state.radarActive;
  if (empty) empty.classList.toggle('hidden', showRows);
  function rowHtml(o) {
    const mood = o.moodState || o.mood || 'OPEN';
    const sw = mood === 'SUPER_READY' ? 'sw-ready' : (mood === 'UNSURE' || mood === 'EXPLORING' ? 'sw-explore' : 'sw-open');
    const reasons = reasonBits(o).join(' · ');
    const title = o.destiny ? t('lm_destiny') : t('lm_someone');
    return '<div class="discover-row" data-uid="' + o.userId + '">' +
      '<button type="button" class="discover-open" data-uid="' + o.userId + '">' +
      '<span class="sw ' + sw + '" aria-hidden="true"></span>' +
      '<div><b>' + title + '</b><p>' + (reasons || t('reason_nearby')) + '</p></div></button>' +
      '<button type="button" class="discover-report" data-uid="' + o.userId + '">' + t('report_short') + '</button>' +
      '</div>';
  }
  const html = !showRows ? '' : rows.map(rowHtml).join('');
  const trayHtml = !showRows ? '' : rows.slice(0, 2).map(rowHtml).join('');
  if (wrap) {
    wrap.innerHTML = html;
    bindDiscoverRows(wrap, rows);
  }
  if (tray) {
    tray.innerHTML = trayHtml;
    bindDiscoverRows(tray, rows.slice(0, 2));
  }
}

function renderDiscoverFromDots() {
  const rows = dots.map(function (d) {
    return {
      userId: d.userId,
      moodState: d.mood,
      mood: d.mood,
      distanceBand: d.band,
      band: d.band,
      intention: d.bio === 'AVAILABLE_NOW' ? 'AVAILABLE_NOW' : '',
      contextTags: d.tags || [],
      destiny: false,
    };
  });
  renderDiscoverList(rows);
}

async function refreshPulseLive() {
  const targets = [
    { title: $('#pulse-title'), detail: $('#pulse-detail'), stats: $('#pulse-stats') },
    { title: $('#lm-pulse-title'), detail: $('#lm-pulse-detail'), stats: $('#lm-pulse-stats') },
  ];
  const live = $('#pulse-live');
  const legacy = $('#pulse-legacy');
  if (live) live.classList.remove('hidden');
  if (legacy) legacy.classList.add('hidden');
  function paint(quiet, titleText, detailText, statsHtml) {
    targets.forEach(function (el) {
      if (el.title) el.title.textContent = titleText;
      if (el.detail) el.detail.textContent = detailText;
      if (el.stats) el.stats.innerHTML = quiet ? '' : (statsHtml || '');
    });
  }
  if (!liveApi()) {
    paint(true, t('lm_quiet'), t('lm_quiet_d'), '');
    return;
  }
  try {
    const p = await api.radarPulse();
    if (!p || p.quiet) {
      paint(true, t('lm_quiet'), t('lm_quiet_d'), '');
      return;
    }
    const crowd = p.peopleActive === 'busy' ? t('pulse_busy')
      : p.peopleActive === 'some' ? t('pulse_some')
      : p.peopleActive === 'few' ? t('pulse_few')
      : t('pulse_title');
    const bits = [];
    if (p.opportunityCount != null && p.opportunityCount > 0) {
      bits.push('<div class="pulse-stat"><b>' + p.opportunityCount + '</b><p class="small muted">' + t('stat_nearby') + '</p></div>');
    }
    if (p.context && p.context.length) {
      const human = p.context.map(humanInterest).join(' · ');
      bits.push('<div class="pulse-stat"><b>' + human + '</b><p class="small muted">' + t('lm_interests') + '</p></div>');
    }
    paint(false, crowd, t('pulse_anon'), bits.join(''));
  } catch (_) {
    paint(true, t('lm_quiet'), t('lm_quiet_d'), '');
  }
}

function toggleFilterPill(btn, arr, value) {
  const on = btn.getAttribute('aria-pressed') === 'true';
  btn.setAttribute('aria-pressed', String(!on));
  const i = arr.indexOf(value);
  if (!on && i < 0) arr.push(value);
  if (on && i >= 0) arr.splice(i, 1);
}

$('#lm-filters-btn') && $('#lm-filters-btn').addEventListener('click', function () {
  const sh = $('#lm-filter-sheet');
  if (!sh) return;
  sh.classList.add('open');
  sh.setAttribute('aria-hidden', 'false');
});
$('#lm-filter-apply') && $('#lm-filter-apply').addEventListener('click', function () {
  closeFilterSheet();
  void refreshLivingMap();
});
$('#lm-filter-clear') && $('#lm-filter-clear').addEventListener('click', function () {
  lmFilterState.proximity = [];
  lmFilterState.presence = [];
  lmFilterState.intention = [];
  lmFilterState.interests = [];
  $$('#lm-filter-sheet .pill').forEach(function (p) { p.setAttribute('aria-pressed', 'false'); });
});
$('#lm-f-prox') && $('#lm-f-prox').addEventListener('click', function (e) {
  const b = e.target.closest('[data-prox]'); if (!b) return;
  toggleFilterPill(b, lmFilterState.proximity, b.dataset.prox);
});
$('#lm-f-mood') && $('#lm-f-mood').addEventListener('click', function (e) {
  const b = e.target.closest('[data-mood]'); if (!b) return;
  toggleFilterPill(b, lmFilterState.presence, b.dataset.mood);
});
$('#lm-f-intent') && $('#lm-f-intent').addEventListener('click', function (e) {
  const b = e.target.closest('[data-intent]'); if (!b) return;
  toggleFilterPill(b, lmFilterState.intention, b.dataset.intent);
});
$('#lm-f-interests') && $('#lm-f-interests').addEventListener('click', function (e) {
  const b = e.target.closest('[data-interest]'); if (!b) return;
  toggleFilterPill(b, lmFilterState.interests, b.dataset.interest);
});
$('#lm-recenter-btn') && $('#lm-recenter-btn').addEventListener('click', async function () {
  const loc = await requestViewerLocation();
  if (loc && livingMapCtl) {
    livingMapCtl.setViewer(loc);
    livingMapCtl.recenter();
  }
});
$('#lm-radar-toggle') && $('#lm-radar-toggle').addEventListener('click', function () {
  const main = $('#radar-toggle');
  if (main) main.click();
});
$('#lm-presence') && $('#lm-presence').addEventListener('click', function () {
  const mood = $('#lm-mood-select');
  if (!mood) return;
  setLivingMapMoodOpen(mood.hidden || mood.classList.contains('hidden'));
});
$('#lm-mood-select') && $('#lm-mood-select').addEventListener('click', function (e) {
  const b = e.target.closest('.lm-mood-btn'); if (!b) return;
  state.mood = b.dataset.mood;
  syncLivingMapMood();
  syncLivingMapPresence();
  closeLivingMapMood();
  haptic('selection'); toast(t('t_mood'));
});
$('#lm-destiny-banner') && $('#lm-destiny-banner').addEventListener('click', function () {
  const o = (state.lmOpportunities || []).find(function (x) { return x && x.destiny === true; });
  if (o) openLivingMapSheet(o);
});
$('#lm-destiny-banner') && $('#lm-destiny-banner').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    this.click();
  }
});

/* ------------------------------------------------- server-authoritative timers
   Remaining = expiresAt - serverNow() (from GET remainingMs / expiresAt).
   Going offline does NOT pause it. The 30s warning is derived locally. */
function formatRemain(remainingSec) {
  const s = Math.max(0, remainingSec | 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + ss;
  return m + ':' + ss;
}
function makeTimer({ durationSec, expiresAtMs, textEl, barEl, onWarn, onExpire, asMinutes }) {
  const end = Number.isFinite(expiresAtMs)
    ? expiresAtMs
    : (state.serverNow() + (Number(durationSec) || 0) * 1000);
  const total = Math.max(1, Number.isFinite(durationSec) && durationSec > 0
    ? durationSec
    : Math.round((end - state.serverNow()) / 1000));
  let warned = false, iv;
  const tick = () => {
    const remaining = Math.max(0, Math.round((end - state.serverNow()) / 1000));
    if (textEl) {
      if (asMinutes) textEl.textContent = String(Math.max(1, Math.ceil(remaining / 60)));
      else textEl.textContent = formatRemain(remaining);
    }
    if (barEl) {
      const pct = (remaining / total) * 100;
      barEl.style.width = pct + '%';
      barEl.style.background = remaining <= 30 ? '#FF4D67' : remaining <= 120 ? '#FFC857' : '#F4F5F7';
    }
    if (remaining <= 30 && !warned) { warned = true; haptic('timeWarning'); onWarn && onWarn(); }
    if (remaining <= 0) { clearInterval(iv); onExpire && onExpire(); }
  };
  tick(); iv = setInterval(tick, 1000);
  return () => clearInterval(iv);
}

function rememberExpires(conn, remainingMs) {
  if (typeof remainingMs === 'number' && Number.isFinite(remainingMs)) {
    state.connectionExpiresAt = state.serverNow() + remainingMs;
    return state.connectionExpiresAt;
  }
  if (conn && conn.expiresAt) {
    const ms = Date.parse(conn.expiresAt);
    if (Number.isFinite(ms)) {
      state.connectionExpiresAt = ms;
      return ms;
    }
  }
  return state.connectionExpiresAt;
}

function syncTicketCopy() {
  const el = $('#v-ticket [data-i18n="ticket_body"]');
  if (!el) return;
  el.textContent = t(state.plan === 'WINGMAN_PLUS' ? 'ticket_body_plus' : 'ticket_body_free');
}

/* -------------------------------------------------------------- per-screen */
let stopSelfie, stopMM, stopTicket, stopCd, sigStop;

function bindTicketTimer(expiresAtMs) {
  if (stopTicket) stopTicket();
  const end = Number.isFinite(expiresAtMs) ? expiresAtMs : state.connectionExpiresAt;
  if (!Number.isFinite(end)) return;
  stopTicket = makeTimer({
    expiresAtMs: end,
    textEl: $('#ticket-time'),
    onExpire: () => { feedback('busy', t('t_silently_expired')); show('v-radar'); },
  });
}

function bindCooldownTimer(expiresAtMs) {
  if (stopCd) stopCd();
  const end = Number.isFinite(expiresAtMs) ? expiresAtMs : state.connectionExpiresAt;
  if (!Number.isFinite(end)) return;
  stopCd = makeTimer({
    expiresAtMs: end,
    textEl: $('#cd-num'),
    asMinutes: true,
    onExpire: () => { show('v-radar'); },
  });
}

function ownOutcomeOf(conn) {
  if (!conn) return null;
  if (state.meId === conn.initiatorId) return conn.initiatorOutcome;
  if (state.meId === conn.recipientId) return conn.recipientOutcome;
  return null;
}

function syncOutcomeWaiting(conn) {
  const wait = $('#outcome-wait');
  const yes = $('#outcome-yes-btn');
  const no = $('#outcome-no-btn');
  const own = ownOutcomeOf(conn);
  const waiting = Boolean(conn && conn.state === 'OUTCOME_PENDING' && own && own !== 'PENDING');
  if (wait) {
    wait.classList.toggle('hidden', !waiting);
    if (waiting) wait.textContent = t('t_outcome_saved');
  }
  if (yes) yes.disabled = waiting;
  if (no) no.disabled = waiting;
}

function viewForConnectionState(st) {
  if (st === 'WAITING_FOR_INITIATOR_SELFIE' || st === 'WAITING_FOR_RECIPIENT_SELFIE' || st === 'WAITING_FOR_INITIATOR_APPROVAL') return 'v-selfie';
  if (st === 'MUTUALLY_VALIDATED' || st === 'TICKET_ACTIVE' || st === 'WAITING_FOR_TICKET_CONFIRMATION') return 'v-ticket';
  if (st === 'MISSION_MEET_ACTIVE') return 'v-mission-meet';
  if (st === 'MISSION_CONFIRMED') return 'v-mission-mode';
  if (st === 'OUTCOME_PENDING') return 'v-outcome';
  if (st === 'COOLDOWN_ACTIVE') return 'v-cooldown';
  if (st === 'COMPLETED' || st === 'EXPIRED' || st === 'CANCELLED' || st === 'BLOCKED' || st === 'FAILED') return 'v-radar';
  return null;
}
function onEnter(id) {
  if (id === 'v-radar') {
    sizeCanvas(); startRadar(); syncRadarEmpty();
    if (state.livingMap) {
      if (livingMapCtl) livingMapCtl.invalidate();
      void (async function () {
        const loc = await requestViewerLocation();
        if (loc && livingMapCtl) livingMapCtl.setViewer(loc);
        await refreshLivingMap();
      })();
    }
    if (!state.offline) setPhase(state.radarActive ? 'available' : 'idle');
  }
  if (id === 'v-discover') {
    if (state.livingMap) void refreshLivingMap();
    else renderDiscoverFromDots();
  }
  if (id === 'v-report') {
    syncReportView();
  }
  if (id === 'v-pulse') {
    void refreshPulseLive();
    if (state.livingMap) void refreshLivingMap();
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
      if (el) el.textContent = t('t_expires_in') + ' ' + `${m}:${ss}`;
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
    setSelfieStamp(state.serverNow());
    if (stopSelfie) stopSelfie();
    stopSelfie = makeTimer({ durationSec: 300, textEl: $('#selfie-timer'), barEl: $('#selfie-bar'),
      onExpire: () => { stopSelfieCamera(); feedback('busy', t('t_silently_expired')); show('v-radar'); } });
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
    syncTicketCopy();
    if (realtime && state.connectionId) realtime.subscribeConnection(state.connectionId);
    bindTicketTimer(state.connectionExpiresAt);
    void (async function () {
      const conn = await refreshConnectionUi();
      if (state.viewId !== 'v-ticket') return;
      bindTicketTimer(rememberExpires(conn));
    })();
  }
  if (id === 'v-mission-meet') {
    setPhase('mission', t('t_phase_mission'));
    const modeView = $('#v-mission-mode');
    if (modeView) modeView.classList.remove('is-active');
    const modeInner = modeView && modeView.querySelector('.mission-mode');
    if (modeInner) modeInner.classList.remove('is-active');
    if (stopMM) stopMM();
    stopMM = makeTimer({
      durationSec: 900,
      expiresAtMs: state.connectionExpiresAt,
      textEl: $('#mm-timer'),
      barEl: $('#mm-bar'),
      onExpire: () => { feedback('busy', t('t_chat_expired')); show('v-outcome'); },
    });
    feedback('mission', t('t_mission_active'));
    if (realtime && state.connectionId) realtime.subscribeConnection(state.connectionId);
    void restoreChatLog();
    void (async function () {
      const conn = await refreshConnectionUi();
      if (state.viewId !== 'v-mission-meet') return;
      const end = rememberExpires(conn);
      if (stopMM) stopMM();
      stopMM = makeTimer({
        expiresAtMs: end,
        textEl: $('#mm-timer'),
        barEl: $('#mm-bar'),
        onExpire: () => { feedback('busy', t('t_chat_expired')); show('v-outcome'); },
      });
    })();
  }
  if (id === 'v-mission-mode') {
    setPhase('mission', t('t_phase_mission'));
    const modeView = $('#v-mission-mode');
    if (modeView) modeView.classList.add('is-active');
    const modeInner = modeView && modeView.querySelector('.mission-mode');
    if (modeInner) modeInner.classList.add('is-active');
  }
  if (id === 'v-outcome') {
    setPhase('busy', t('t_phase_busy'));
    void (async function () {
      const conn = await refreshConnectionUi();
      if (state.viewId === 'v-outcome') syncOutcomeWaiting(conn);
    })();
  }
  if (id === 'v-cooldown') {
    setPhase('cooldown', t('t_phase_cooldown'));
    feedback('busy', t('t_cooldown_on'));
    bindCooldownTimer(state.connectionExpiresAt);
    void (async function () {
      const conn = await refreshConnectionUi();
      if (state.viewId !== 'v-cooldown') return;
      bindCooldownTimer(rememberExpires(conn));
    })();
  }
}

async function refreshConnectionUi(opts) {
  opts = opts || {};
  if (!liveApi() || !state.connectionId) return null;
  const c = await api.connection(state.connectionId);
  const conn = c && c.connection;
  if (!conn) return null;
  noteServerTime(c.serverTime);
  state.connectionState = conn.state;
  rememberExpires(conn, c.remainingMs);
  if (conn.initiatorId && conn.recipientId) {
    state.peerId = state.meId === conn.initiatorId ? conn.recipientId : conn.initiatorId;
  }
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
  if (state.viewId === 'v-ticket') bindTicketTimer(state.connectionExpiresAt);
  if (state.viewId === 'v-cooldown') bindCooldownTimer(state.connectionExpiresAt);
  if (state.viewId === 'v-outcome') syncOutcomeWaiting(conn);
  if (opts.route) {
    const target = viewForConnectionState(st);
    const protocol = ['v-selfie', 'v-confirmed', 'v-ticket', 'v-mission-meet', 'v-mission-mode', 'v-outcome', 'v-cooldown'];
    if (target && target !== state.viewId && protocol.indexOf(state.viewId) !== -1 && state.viewId !== 'v-confirmed') {
      show(target);
    }
  }
  persistSession();
  return conn;
}

function isSlowSelfieNet(e) {
  return Boolean(e && (
    e.name === 'AbortError' ||
    e.code === 'TIMEOUT' ||
    e.status === 408 ||
    e.status === 504 ||
    (typeof e.status === 'number' && e.status >= 500)
  ));
}

/* selfie send — camera capture → private upload → opaque mediaId (no peer impersonation on product path) */
$('#selfie-send').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_selfie'), async () => {
        const camOk = selfieStream || await startSelfieCamera();
        if (!camOk) {
          feedback('busy', t('t_cam_required'));
          throw Object.assign(new Error('Camera required'), { code: 'CAMERA_DENIED' });
        }
        let blob;
        try {
          blob = await captureSelfieBlob();
        } catch (e) {
          feedback('busy', t('t_capture_fail'));
          throw e;
        }
        const ac = new AbortController();
        const slowTimer = setTimeout(() => ac.abort(), LOADING_MAX_MS);
        let uploaded;
        try {
          uploaded = await api.uploadSelfieMedia(state.connectionId, blob, {
            signal: ac.signal,
            timeoutMs: LOADING_MAX_MS,
          });
        } catch (e) {
          feedback('busy', isSlowSelfieNet(e) || ac.signal.aborted ? t('t_slow_net') : t('t_selfie_fail'));
          throw e;
        } finally {
          clearTimeout(slowTimer);
        }
        if (ac.signal.aborted) {
          feedback('busy', t('t_slow_net'));
          throw Object.assign(new Error('Slow network'), { code: 'TIMEOUT' });
        }
        if (!uploaded || !uploaded.mediaId) {
          feedback('busy', t('t_media_missing'));
          throw Object.assign(new Error('No mediaId'), { code: 'MEDIA_MISSING' });
        }
        if (uploaded.capturedAt) {
          noteServerTime(uploaded.capturedAt);
          setSelfieStamp(Date.parse(uploaded.capturedAt));
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
    feedback('busy', t('t_api_selfie'));
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
        if (accept.connection) {
          const conn = accept.connection;
          state.peerId = state.meId === conn.initiatorId ? conn.recipientId : conn.initiatorId;
        }
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
        rememberExpires(res.connection);
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
        rememberExpires(res.connection);
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

function hasLivePeer() {
  return Boolean(state.peerId && state.peerId !== 'proto-peer' && state.peerId !== state.meId);
}

function syncReportView() {
  const has = hasLivePeer();
  const cats = $('#report-categories');
  const empty = $('#report-empty');
  const confirm = $('#report-confirm');
  if (cats) cats.classList.toggle('hidden', !has);
  if (confirm) confirm.classList.toggle('hidden', !has);
  if (empty) empty.classList.toggle('hidden', has);
}

function applyLocalBlock(userId) {
  if (!userId) return;
  for (let i = dots.length - 1; i >= 0; i--) {
    if (dots[i] && dots[i].userId === userId) dots.splice(i, 1);
  }
  state.lmOpportunities = (state.lmOpportunities || []).filter(function (o) { return o && o.userId !== userId; });
  setNearbyCount(typeof WingmanRadarDots !== 'undefined' ? WingmanRadarDots.nearbyCountFromDots(dots) : dots.length);
  syncRadarEmpty();
  renderDiscoverFromDots();
  if (liveApi()) scheduleRadarRefresh();
}

function openReportFor(userId) {
  if (userId && userId !== 'proto-peer' && userId !== state.meId) {
    state.peerId = userId;
  }
  state.reportReturnView = state.viewId === 'v-report' ? (state.reportReturnView || 'v-settings') : state.viewId;
  closeOpportunitySheet();
  show('v-report');
}

function bindReportEntry(id) {
  const el = $('#' + id);
  if (!el) return;
  el.addEventListener('click', () => {
    if (id === 'sheet-report-btn') {
      openReportFor(currentDot && currentDot.userId);
      return;
    }
    openReportFor(state.peerId);
  });
}

bindReportEntry('mm-report-btn');
bindReportEntry('sheet-report-btn');
bindReportEntry('sig-report-btn');
bindReportEntry('selfie-report-btn');
bindReportEntry('ticket-report-btn');
$('#set-safety-btn') && $('#set-safety-btn').addEventListener('click', () => {
  openReportFor(hasLivePeer() ? state.peerId : null);
});
$('#report-back-btn') && $('#report-back-btn').addEventListener('click', () => {
  const back = state.reportReturnView && state.reportReturnView !== 'v-report' ? state.reportReturnView : 'v-settings';
  show(back);
});

document.querySelectorAll('#v-report [data-report-category]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (state.busy) return;
    const category = btn.getAttribute('data-report-category');
    if (!category) return;
    if (!hasLivePeer()) {
      syncReportView();
      return;
    }
    if (!liveApi()) {
      if (api && api.productPath) {
        feedback('busy', t('t_api_unreachable'));
        return;
      }
      applyLocalBlock(state.peerId);
      show('v-report-done');
      return;
    }
    const targetId = state.peerId;
    try {
      await withLoading(t('t_loading'), async () => {
        const body = { userId: targetId, category };
        if (state.connectionId) body.connectionId = state.connectionId;
        try {
          await api.report(body);
        } catch (e) {
          if (!(e && e.code === 'RATE_LIMITED')) throw e;
          feedback('busy', t('t_report_rate'));
        }
        await api.block({ userId: targetId });
      });
      applyLocalBlock(targetId);
      state.signalId = null;
      state.connectionId = null;
      state.connectionState = null;
      state.hasIncomingSignal = false;
      syncSignalEmpty();
      show('v-report-done');
    } catch (_) {
      feedback('busy', t('t_api_unreachable'));
    }
  });
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

function isFilteredText(text) {
  return typeof text === 'string' && text.indexOf('[filtered]') !== -1;
}

function showBlockedChat() {
  const log = $('#chat-log');
  if (!log) return;
  const b = document.createElement('div');
  b.className = 'msg blocked';
  b.textContent = t('t_blocked');
  log.appendChild(b);
  haptic('error');
  log.scrollTop = log.scrollHeight;
}

function appendChatMessage(msg, mine) {
  const log = $('#chat-log');
  if (!log || !msg) return;
  if (msg.filtered || isFilteredText(msg.text)) {
    if (mine) showBlockedChat();
    return;
  }
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
    showBlockedChat();
    f.value = ''; return;
  }
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_chat'), async () => {
        const res = await api.message(state.connectionId, { text: v });
        if (res && res.message && (res.message.filtered || isFilteredText(res.message.text))) {
          showBlockedChat();
          return;
        }
        appendChatMessage({
          text: (res && res.message && res.message.text) || v,
          senderId: state.meId,
          at: (res && res.message && res.message.at) || new Date().toISOString(),
          filtered: false,
        }, true);
      });
      f.value = '';
      const logEl = $('#chat-log');
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
      return;
    } catch (e) {
      if (isFilteredText((e && e.message) || '')) showBlockedChat();
      return;
    }
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

/* outcome — own side only (peer answers on their device); cooldown is server-only after both */
async function submitOutcome(kind) {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_outcome'), async () => {
        const o = kind === 'yes' ? 'YES' : 'NO';
        const res = await api.outcome(state.connectionId, { outcome: o });
        if (allowPeerSim() && state.peerId) {
          await api.outcome(state.connectionId, { outcome: o }, { userId: state.peerId });
        }
        const c = await api.connection(state.connectionId);
        noteServerTime(c.serverTime);
        const conn = (c && c.connection) || (res && res.connection);
        state.connectionState = conn && conn.state;
        rememberExpires(conn, c.remainingMs);
        if (state.connectionState === 'COOLDOWN_ACTIVE') {
          feedback('success', t('t_mission_done'));
          show('v-cooldown');
          return;
        }
        syncOutcomeWaiting(conn);
        feedback('success', t('t_outcome_saved'));
      });
    } catch (_) { return; }
    return;
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
  if (sw.id === 'set-push') {
    const wantOn = sw.getAttribute('aria-checked') !== 'true';
    void onPushSwitch(wantOn);
    return;
  }
  const on = sw.getAttribute('aria-checked') === 'true'; sw.setAttribute('aria-checked', String(!on)); haptic('selection');
  if (sw.id === 'rm-switch') setReduceMotion(!on);
});
$$('.switch[role="switch"]').forEach(sw => sw.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sw.click(); } }));

/* report entry (from mission meet note / settings could link) */
/* Payments: no CTA — DisabledPaymentProvider only. */
void payments;

/* language */
function onLangPick(lang) {
  if (!lang || lang === state.lang) {
    syncLangControls();
    return;
  }
  setLang(lang);
}
$$('.chip.lang').forEach(b => b.addEventListener('click', () => onLangPick(b.dataset.lang)));
document.addEventListener('click', (e) => {
  const opt = e.target.closest('.lang-opt');
  if (opt) onLangPick(opt.dataset.lang);
});

$('#export-data-btn') && $('#export-data-btn').addEventListener('click', () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    locale: state.lang,
    plan: state.plan,
    radarActive: state.radarActive,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'wingman-data.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  feedback('success', t('t_export_ok'));
});
$('#delete-account-btn') && $('#delete-account-btn').addEventListener('click', () => {
  feedback('busy', t('t_delete_ok'));
});

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
  const plan = e.plan === 'WINGMAN_PLUS' ? 'WINGMAN_PLUS' : 'FREE';
  state.plan = plan;
  const caps = e.capabilities || {};
  if (typeof caps.dailySignals === 'number') state.signalsLeft = caps.dailySignals;
  if (typeof caps.activeConnectionTickets === 'number') state.ticketsActive = caps.activeConnectionTickets;
  syncSignalsChrome();
  const tk = $('#stat-tickets'); if (tk) tk.textContent = String(state.ticketsActive);
  const pl = $('#plan-label'); if (pl) pl.textContent = plan === 'WINGMAN_PLUS' ? 'PLUS' : 'FREE';
  const pd = $('#plan-detail');
  if (pd) {
    pd.textContent = state.signalsLeft + ' ' + t('stat_signals');
  }
  const sp = $('#settings-plan'); if (sp) sp.textContent = plan === 'WINGMAN_PLUS' ? 'Wingman+' : 'FREE';
  const ss = $('#settings-signals'); if (ss) ss.textContent = String(caps.dailySignals ?? state.signalsLeft);
  const st = $('#settings-tickets'); if (st) st.textContent = String(caps.activeConnectionTickets ?? state.ticketsActive);
  syncTicketCopy();
}

async function bootApi() {
  if (!globalThis.WingmanApi) {
    state.apiLive = false;
    setApiBanner('mock', t('t_api_mock'));
    return;
  }
  const bootOnSplash = !state.viewId || state.viewId === 'v-splash';
  if (!bootOnSplash) setLoading(true, t('t_loading'));
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
        } catch (e) {
          const Recon = typeof WingmanPresenceReconnect !== 'undefined' ? WingmanPresenceReconnect : null;
          const hard = Recon ? Recon.isHardAuthFailure(e) : (e && (e.code === 'UNAUTHORIZED' || e.status === 401));
          if (!hard) {
            setOfflineUi(true, false);
            setApiBanner('offline', t('t_api_unreachable'));
            feedback('offline', t('t_api_unreachable'));
            applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });
            ensureRealtimeReconnect();
            return;
          }
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
  if (typeof saved.connectionExpiresAt === 'number') state.connectionExpiresAt = saved.connectionExpiresAt;
  if (typeof saved.signalsLeft === 'number') {
    state.signalsLeft = saved.signalsLeft;
    syncSignalsChrome();
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
    if (liveApi()) startPresenceHeartbeat();
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
  void restoreForeground({ silent: true });
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
    'v-radar', 'v-discover', 'v-pulse', 'v-settings', 'v-signal', 'v-selfie', 'v-confirmed', 'v-ticket',
    'v-mission-meet', 'v-mission-mode', 'v-outcome', 'v-cooldown', 'v-radar',
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
    .map((p) => (p.getAttribute('data-interest') || p.getAttribute('aria-label') || '').trim())
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
    feedback('error', t('t_need_interest'));
    return;
  }
  if (!body.birthDate) {
    feedback('error', t('t_need_birth'));
    return;
  }
  if (liveApi()) {
    try {
      await withLoading(t('t_loading'), async () => {
        await api.saveProfile(body);
      });
    } catch (e) {
      const msg = (e && e.code === 'VALIDATION_REQUIRED')
        ? t('t_profile_invalid')
        : ((e && e.message) || t('t_api_unreachable'));
      feedback('error', msg);
      return;
    }
  } else if (api && api.productPath) {
    feedback('busy', t('t_api_unreachable'));
    return;
  }
  show('v-consent');
  openConsentFromSettings(false);
});

let consentFromSettings = false;

function openConsentFromSettings(fromSettings) {
  consentFromSettings = Boolean(fromSettings);
  syncConsentChrome();
}

function syncConsentChrome() {
  const back = $('#consent-back-btn');
  const cta = $('#consent-cta-btn');
  if (back) {
    back.classList.toggle('hidden', !consentFromSettings);
    back.textContent = t('consent_back');
  }
  if (cta) cta.textContent = t(consentFromSettings ? 'consent_save' : 'consent_cta');
}

$('#set-consent-btn') && $('#set-consent-btn').addEventListener('click', () => {
  openConsentFromSettings(true);
  show('v-consent');
});
$('#consent-back-btn') && $('#consent-back-btn').addEventListener('click', () => {
  show(consentFromSettings ? 'v-settings' : 'v-profile');
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
    feedback('error', t('t_need_core'));
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
  show(consentFromSettings ? 'v-settings' : 'v-radar');
});

function handleRealtimeEvent(env) {
  if (!env || !env.type) return;
  const p = env.payload || {};
  if (env.type === 'signal.received') {
    const id = p.signalId || env.aggregateId;
    if (id && state.signalId === id && state.hasIncomingSignal) return;
    state.signalId = id;
    if (p.senderId) state.peerId = p.senderId;
    state.hasIncomingSignal = true;
    syncSignalEmpty();
    markSignalArrive();
    setPhase('signal', t('t_phase_signal'));
    feedback('signal', t('t_signal_received'));
    announce(t('t_signal_received'));
    haptic('signalSent');
    syncInboxChrome();
    return;
  }
  if (env.type === 'radar.changed' || env.type === 'presence.changed') {
    if (liveApi() && state.radarActive) scheduleRadarRefresh();
    return;
  }
  if (env.type === 'validation.updated' || env.type === 'mission.updated' || env.type === 'match.created') {
    if (p.connectionId) state.connectionId = p.connectionId;
    if (p.state) state.connectionState = p.state;
    if (realtime && state.connectionId) realtime.subscribeConnection(state.connectionId);
    void refreshConnectionUi();
    if (p.state === 'MISSION_MEET_ACTIVE' && state.viewId !== 'v-mission-meet') {
      feedback('mission', t('t_mission_active'));
      haptic('mission');
    }
    if (p.state === 'COOLDOWN_ACTIVE' && state.viewId !== 'v-cooldown') {
      show('v-cooldown');
    }
    return;
  }
  if (env.type === 'mission.message') {
    if (p.connectionId && state.connectionId && p.connectionId !== state.connectionId) return;
    if (p.filtered || isFilteredText(p.text)) {
      if (p.senderId === state.meId) showBlockedChat();
      return;
    }
    appendChatMessage({
      text: p.text,
      senderId: p.senderId,
      at: p.at,
    }, p.senderId === state.meId);
    return;
  }
  if (env.type === 'connection.closed' || env.type === 'mission.expired') {
    const blocked = env.type === 'connection.closed' && p.reason === 'block';
    if (blocked && (state.viewId === 'v-report' || state.viewId === 'v-report-done')) {
      return;
    }
    feedback('busy', env.type === 'mission.expired' ? t('t_chat_expired') : t('t_mission_done'));
    if (blocked) {
      state.signalId = null;
      state.connectionId = null;
      state.connectionState = null;
      state.hasIncomingSignal = false;
      syncSignalEmpty();
      show('v-radar');
      scheduleRadarRefresh();
    }
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

function ensureRealtimeReconnect() {
  if (!globalThis.WingmanRealtime || !api) return;
  if (!realtime) {
    ensureRealtime();
    return;
  }
  if (typeof realtime.reconnect === 'function') realtime.reconnect();
  else if (!realtime.connected) realtime.connect();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function onPushSwitch(wantOn) {
  const sw = $('#set-push');
  const status = $('#push-status');
  const Push = typeof WingmanWebPush !== 'undefined' ? WingmanWebPush : null;
  if (!wantOn) {
    if (sw) sw.setAttribute('aria-checked', 'false');
    if (status) status.textContent = t('t_push_off');
    return;
  }
  if (!Push || !liveApi() || !isAuthedSession()) {
    if (sw) sw.setAttribute('aria-checked', 'false');
    if (status) status.textContent = t('t_push_blocked');
    feedback('busy', t('t_push_blocked'));
    return;
  }
  let live = { webPush: { enabled: false } };
  try {
    live = api.liveStatus ? await api.liveStatus() : live;
  } catch (_) { /* fail closed */ }
  const result = await Push.enable({
    live: live,
    requestPermission: function () {
      if (!('Notification' in window)) return Promise.resolve('denied');
      return Notification.requestPermission();
    },
    subscribe: async function (vapidKey) {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker) return null;
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!reg.pushManager) return null;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      return sub && sub.endpoint ? sub.endpoint : null;
    },
    registerToken: async function (token) {
      await api.registerPushToken({ platform: 'web', pushToken: token });
    },
  });
  if (result.ok) {
    if (sw) sw.setAttribute('aria-checked', 'true');
    if (status) status.textContent = t('t_push_on');
    return;
  }
  if (sw) sw.setAttribute('aria-checked', 'false');
  const msg = result.reason === 'permission_denied' ? t('t_push_denied') : t('t_push_blocked');
  if (status) status.textContent = msg;
  feedback('busy', msg);
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
        : (t('t_otp_sent_to') + ' ' + phone);
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
    if (errEl) errEl.textContent = t('t_bad_phone');
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

state.lang = readStoredLang();
document.documentElement.lang = state.lang;
applyLang();
sizeCanvas();
startRadar();
syncViewA11y(state.viewId || 'v-splash');
syncRadarEmpty();
syncSignalEmpty();
syncDestinyCard([]);
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
}).then(async () => {
  resumeAuthedFunnelIfNeeded();
  try {
    const cfg = window.__WINGMAN_CONFIG__ || {};
    let serverOn;
    if (api && !api.useMock) {
      try {
        const live = await fetch((api.baseUrl || '') + '/internal/live', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); });
        if (live && typeof live.livingMap === 'boolean') serverOn = live.livingMap;
      } catch (_) { /* keep config / query */ }
    }
    const on = typeof WingmanLivingMap !== 'undefined' && WingmanLivingMap.resolveEnabled({
      search: location.search,
      configEnabled: cfg.livingMap === true,
      serverEnabled: serverOn,
    });
    if (on) enableLivingMapUi();
    else disableLivingMapUi();
  } catch (_) { /* rollback canvas Radar */ }
  if (/[?&]smoke=1\b/.test(location.search)) runP4Smoke();
});
window.__wingmanRunP4Smoke = runP4Smoke;
