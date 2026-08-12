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
const payments = (typeof WingmanPayments !== 'undefined' && WingmanPayments.paymentClient)
  ? WingmanPayments.paymentClient
  : { provider: { id: 'disabled', enabled: false }, showPaywallCtas: false };

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
  shell.classList.toggle('is-empty', !state.radarActive);
  const dist = $('#radar-distance');
  if (dist) dist.classList.toggle('hidden', !state.radarActive);
  syncRadarA11yList();
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
    const age = state.lang === 'fr' ? d.ageFr : d.age;
    return `<li><button type="button" class="sr-only-btn" data-dot="${i}">${age} · ${mood}</button></li>`;
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
    brandtag: 'Make the first acquaintance easy', splash_tag: 'Make the first acquaintance easy.', splash_love: 'Love is in the air.', splash_cta: 'Begin',
    next: 'Next', ob_eyebrow: 'The problem',
    ob1_title: 'You cross paths. Nothing happens.', ob1_body: "Every day you pass someone you'd like to meet — and say nothing. Wingman is built for that exact moment.",
    ob2_eyebrow: 'The solution', ob2_title: 'A quiet protocol, not a swipe feed.', ob2_body: 'No public profiles. No endless chat. A short, private path from "someone\'s near" to "let\'s meet."',
    ob3_eyebrow: 'The promise', ob3_title: 'Make the first move, safely.', ob3_body: 'No explicit rejection. Approximate location only. You stay in control of who can find you.', ob3_cta: 'Create my account',
    phone_sub: 'Verify your number', phone_title: 'Enter your phone', phone_body: 'We send a 6-digit code. Your number is never shown to anyone.', phone_label: 'Phone number', phone_cta: 'Send code', phone_note: 'Verification only — used to keep Wingman free of fake profiles.',
    otp_sub: 'Enter the code', otp_title: '6-digit code', otp_body: 'Sent to +352 621 000 000', otp_cta: 'Verify',
    profile_sub: 'Your profile', pf_name: 'First name', pf_birth: 'Date of birth', pf_gender: 'Gender', g_male: 'Male', g_female: 'Female', g_nb: 'Non-binary',
    pf_interest: 'Interested in', t_men: 'Men', t_women: 'Women', t_nb: 'Non-binary', pf_height: 'Height (cm)', pf_interests: 'Interests (max 5)', pf_bio: 'Daily bio (150 max)',
    consent_sub: 'Your choices', consent_title: 'What you agree to', consent_body: 'Each purpose is separate. You can change these anytime in Settings.',
    c_core: 'Run the service', c_core_d: 'Required to match you and operate the protocol.', c_loc: 'Approximate location', c_loc_d: 'Coarse radius only — never your exact position.',
    c_destiny: 'Destiny Connection', c_destiny_d: 'Off by default. Coarse co-presence to spot repeated paths.', c_push: 'Push notifications', c_push_d: 'Signals, selfies, confirmations.',
    c_analytics: 'Product analytics', c_analytics_d: 'Optional. Helps improve Wingman.', consent_cta: 'Agree & activate Radar',
    radar_sub: 'Real-time discovery', radar_invisible: '—  Invisible', radar_active: '●  Active', radar_dist: 'Someone very close · Nearby', radar_activate: 'Go active', radar_deactivate: 'Go invisible',
    mood_ready: 'Super ready', mood_open: 'Open', mood_explore: 'Exploring', mood_ready_d: 'Meet now', mood_open_d: "If it's right", mood_explore_d: 'Just looking', mood_title: 'Your mood',
    stat_signals: 'Signals left', stat_nearby: 'Nearby', stat_tickets: 'Active ticket',
    destiny_eyebrow: '✦ Destiny Connection', destiny_card_t: 'You keep crossing paths', destiny_card_d: 'Someone compatible keeps crossing your path — even off your radar.',
    send_signal: 'Send a Signal', close: 'Close',
    signal_sub: 'Signals received', signal_title: 'Someone wants to discover you', signal_body: 'Respond before it silently expires. No one is ever told they were declined.', open: 'Open', sig_expired: 'Expired — 2 min ago',
    signal_silent: 'No "decline" button exists. Silent expiration is the only failure signal.',
    s_live: 'Liveness verified', s_stamp: 'Timestamped', s_gallery: 'Gallery blocked', s_send: 'Take & send selfie', s_letexpire: 'Let it expire', s_approve: 'Approve',
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
    t_api_mock: 'API offline — demo mode', t_api_live: 'Connected to Wingman API',
    t_loading: 'Loading…', t_accepting: 'Opening connection…', t_selfie: 'Sending selfie…', t_approving: 'Confirming…',
    t_meet: 'Opening Mission Meet…', t_ticket: 'Holding ticket…', t_chat: 'Sending…', t_outcome: 'Saving outcome…',
    t_timeout: 'Taking too long — try again', t_offline_blocked: 'Offline — try again', t_offline_banner: 'Offline — timers keep running on the server',
    t_reconnecting: 'Reconnecting…', t_reconnected: 'Back online', t_reconnect_fail: 'Still offline', t_reconnect: 'Reconnect',
    empty_radar: 'Go active to see who’s nearby.', empty_signals: 'No Signals right now. When someone reaches out, it appears here.',
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
    brandtag: 'Facilitez la première rencontre', splash_tag: "Facilitez la première rencontre.", splash_love: "L'amour est dans l'air.", splash_cta: 'Commencer',
    next: 'Suivant', ob_eyebrow: 'Le problème',
    ob1_title: 'Vous vous croisez. Rien ne se passe.', ob1_body: "Chaque jour, vous croisez quelqu'un que vous aimeriez rencontrer — sans rien dire. Wingman est fait pour cet instant précis.",
    ob2_eyebrow: 'La solution', ob2_title: 'Un protocole discret, pas un fil de swipe.', ob2_body: "Pas de profils publics. Pas de chat infini. Un chemin court et privé de « quelqu'un est proche » à « on se voit ».",
    ob3_eyebrow: 'La promesse', ob3_title: 'Faites le premier pas, en sécurité.', ob3_body: "Aucun rejet explicite. Localisation approximative uniquement. Vous contrôlez qui peut vous trouver.", ob3_cta: 'Créer mon compte',
    phone_sub: 'Vérifiez votre numéro', phone_title: 'Votre téléphone', phone_body: 'Nous envoyons un code à 6 chiffres. Votre numéro n\'est jamais montré.', phone_label: 'Numéro de téléphone', phone_cta: 'Envoyer le code', phone_note: 'Vérification uniquement — pour garder Wingman sans faux profils.',
    otp_sub: 'Entrez le code', otp_title: 'Code à 6 chiffres', otp_body: 'Envoyé au +352 621 000 000', otp_cta: 'Vérifier',
    profile_sub: 'Votre profil', pf_name: 'Prénom', pf_birth: 'Date de naissance', pf_gender: 'Genre', g_male: 'Homme', g_female: 'Femme', g_nb: 'Non-binaire',
    pf_interest: 'Intéressé·e par', t_men: 'Hommes', t_women: 'Femmes', t_nb: 'Non-binaire', pf_height: 'Taille (cm)', pf_interests: "Centres d'intérêt (max 5)", pf_bio: 'Bio du jour (150 max)',
    consent_sub: 'Vos choix', consent_title: 'Ce que vous acceptez', consent_body: 'Chaque finalité est distincte. Modifiable à tout moment dans Réglages.',
    c_core: 'Faire fonctionner le service', c_core_d: 'Nécessaire pour vous mettre en relation et opérer le protocole.', c_loc: 'Localisation approximative', c_loc_d: 'Rayon grossier uniquement — jamais votre position exacte.',
    c_destiny: 'Destiny Connection', c_destiny_d: 'Désactivé par défaut. Co-présence grossière pour repérer les croisements.', c_push: 'Notifications push', c_push_d: 'Signaux, selfies, confirmations.',
    c_analytics: 'Analytique produit', c_analytics_d: 'Optionnel. Aide à améliorer Wingman.', consent_cta: 'Accepter & activer le Radar',
    radar_sub: 'Découverte en temps réel', radar_invisible: '—  Invisible', radar_active: '●  Actif', radar_dist: 'Quelqu\'un très proche · À proximité', radar_activate: 'Devenir actif', radar_deactivate: 'Devenir invisible',
    mood_ready: 'Prêt·e', mood_open: 'Ouvert·e', mood_explore: 'Explore', mood_ready_d: 'Se voir maintenant', mood_open_d: 'Si c\'est le bon', mood_explore_d: 'Juste explorer', mood_title: 'Mon humeur',
    stat_signals: 'Signaux restants', stat_nearby: 'À proximité', stat_tickets: 'Ticket actif',
    destiny_eyebrow: '✦ Destiny Connection', destiny_card_t: 'Vous vous croisez souvent', destiny_card_d: 'Quelqu\'un de compatible croise votre route — même hors de votre radar.',
    send_signal: 'Envoyer un Signal', close: 'Fermer',
    signal_sub: 'Signaux reçus', signal_title: 'Quelqu\'un veut vous découvrir', signal_body: 'Répondez avant l\'expiration silencieuse. Personne n\'est jamais informé d\'un refus.', open: 'Ouvrir', sig_expired: 'Expiré — il y a 2 min',
    signal_silent: 'Aucun bouton « Refuser ». L\'expiration silencieuse est le seul signal d\'échec.',
    s_live: 'Vivacité vérifiée', s_stamp: 'Horodaté', s_gallery: 'Galerie bloquée', s_send: 'Prendre & envoyer', s_letexpire: 'Laisser expirer', s_approve: 'Approuver',
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
    t_api_mock: 'API hors ligne — mode démo', t_api_live: 'Connecté à l\'API Wingman',
    t_loading: 'Chargement…', t_accepting: 'Ouverture de la connexion…', t_selfie: 'Envoi du selfie…', t_approving: 'Confirmation…',
    t_meet: 'Ouverture Mission Meet…', t_ticket: 'Ticket en cours…', t_chat: 'Envoi…', t_outcome: 'Enregistrement…',
    t_timeout: 'Trop long — réessayez', t_offline_blocked: 'Hors ligne — réessayez', t_offline_banner: 'Hors ligne — les timers continuent côté serveur',
    t_reconnecting: 'Reconnexion…', t_reconnected: 'De retour en ligne', t_reconnect_fail: 'Toujours hors ligne', t_reconnect: 'Reconnecter',
    empty_radar: 'Activez le Radar pour voir qui est à proximité.', empty_signals: 'Aucun Signal pour l’instant. Ils apparaîtront ici.',
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
const MOOD_COLORS = { SUPER_READY: '#FF4D67', OPEN: '#FFC857', EXPLORING: '#F4F5F7' };
const MOOD_GLOW = { SUPER_READY: 'rgba(255,77,103,.34)', OPEN: 'rgba(255,200,87,.30)', EXPLORING: 'rgba(244,245,247,.20)' };
// Fictional dots only.
const dots = [
  { x: .30, y: .30, mood: 'SUPER_READY', age: '26 · 168cm', ageFr: '26 · 168cm', bio: 'Fun night out ✨', bioFr: 'Sortie sympa ✨', tags: ['🎵', '🍷', '🌍'] },
  { x: .68, y: .26, mood: 'OPEN', age: '29 · 175cm', ageFr: '29 · 175cm', bio: 'Coffee or a walk?', bioFr: 'Café ou balade ?', tags: ['☕', '📚', '🏃'] },
  { x: .74, y: .62, mood: 'EXPLORING', age: '24 · 162cm', ageFr: '24 · 162cm', bio: 'Just exploring 🗺️', bioFr: 'Juste explorer 🗺️', tags: ['🎨', '🐶'] },
  { x: .40, y: .70, mood: 'SUPER_READY', age: '31 · 180cm', ageFr: '31 · 180cm', bio: 'Up for a real meet', bioFr: 'Envie de vraie rencontre', tags: ['🎸', '🍕'] },
  { x: .24, y: .55, mood: 'OPEN', age: '27 · 170cm', ageFr: '27 · 170cm', bio: 'New in town 🌆', bioFr: 'Nouvelle en ville 🌆', tags: ['📷', '🍜'] },
];
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
  currentDot = d;
  $('#sheet-mood').textContent = '● ' + t('mood_' + (d.mood === 'SUPER_READY' ? 'ready' : d.mood === 'OPEN' ? 'open' : 'explore'));
  $('#sheet-mood').style.color = MOOD_COLORS[d.mood];
  $('#sheet-age').textContent = state.lang === 'fr' ? d.ageFr : d.age;
  $('#sheet-bio').textContent = state.lang === 'fr' ? d.bioFr : d.bio;
  $('#sheet-tags').innerHTML = d.tags.map(x => `<span>${x}</span>`).join('');
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
  openSheet(dots[0]);
});
$('#send-signal-btn').addEventListener('click', async () => {
  if (state.busy) return;
  if (state.signalsLeft <= 0) { toast(state.lang === 'fr' ? 'Plus de signaux aujourd\'hui' : 'No signals left today'); return; }
  const w = canvas.clientWidth || 400; signalWave = { x: w / 2, y: 170, t: performance.now() };
  startRadar(); haptic('signalSent');
  $('#dot-sheet').classList.remove('open');
  $('#dot-sheet').setAttribute('aria-hidden', 'true');

  if (liveApi()) {
    try {
      await withLoading(t('t_loading'), async () => {
        // Ensure peer is on radar so signal is valid.
        await api.radarActivate(
          { lat: 49.6117, lng: 6.1320, visibility: 'ACTIVE' },
          { userId: state.peerId },
        );
        await api.radarActivate({ lat: 49.6116, lng: 6.1319, visibility: 'ACTIVE' });
        const res = await api.sendSignal(
          { receiverId: state.peerId, source: 'RADAR' },
          { idempotencyKey: 'proto-' + Date.now() },
        );
        state.signalId = res && res.signal && res.signal.id;
        state.signalsLeft = Math.max(0, state.signalsLeft - 1);
        $('#stat-signals').textContent = state.signalsLeft;
      });
      state.hasIncomingSignal = true;
      setPhase('signal', t('t_phase_signal'));
      feedback('signal', t('t_signal_sent'));
      setTimeout(() => show('v-signal'), motionMs(320, 0));
      return;
    } catch (_) {
      /* fall through to demo */
    }
  }
  state.signalId = state.signalId || ('demo-sig-' + Date.now());
  state.hasIncomingSignal = true;
  state.signalsLeft--; $('#stat-signals').textContent = state.signalsLeft;
  setPhase('signal', t('t_phase_signal'));
  feedback('signal', t('t_signal_sent'));
  setTimeout(() => { state.hasIncomingSignal = true; show('v-signal'); }, motionMs(320, 0));
});

/* ------------------------------------------------------- radar toggle/mood */
$('#radar-toggle').addEventListener('click', async () => {
  if (state.busy) return;
  const next = !state.radarActive;
  if (liveApi()) {
    try {
      if (next) {
        await withLoading(t('t_loading'), async () => {
          await api.radarActivate({ lat: 49.6116, lng: 6.1319, visibility: 'ACTIVE' });
          await api.radarActivate(
            { lat: 49.6117, lng: 6.1320, visibility: 'ACTIVE' },
            { userId: state.peerId },
          );
          const cands = await api.radarCandidates();
          const list = (cands && cands.candidates) || [];
          const el = $('#stat-nearby'); if (el) el.textContent = String(list.length || dots.length);
        });
      } else {
        await withLoading(t('t_loading'), async () => {
          await api.radarDeactivate();
        });
      }
    } catch (_) { return; }
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
    stamp.textContent = `2026-07-10 · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    if (stopSelfie) stopSelfie();
    stopSelfie = makeTimer({ durationSec: 300, textEl: $('#selfie-timer'), barEl: $('#selfie-bar'),
      onExpire: () => { feedback('busy', state.lang === 'fr' ? 'Expiré silencieusement' : 'Silently expired'); show('v-radar'); } });
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
  if (id === 'v-ticket') setPhase('match', t('t_phase_match'));
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

/* selfie send -> dual selfie on API (demo both sides) then reveal approve */
$('#selfie-send').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_selfie'), async () => {
        await api.selfie(state.connectionId, { mediaId: 'media-' + state.meId });
        await api.selfie(state.connectionId, { mediaId: 'media-' + state.peerId }, { userId: state.peerId });
        const c = await api.connection(state.connectionId);
        state.connectionState = c.connection && c.connection.state;
      });
    } catch (_) { return; }
  }
  $('#selfie-send').classList.add('hidden');
  $('#selfie-validate').classList.remove('hidden');
  setPhase('validation', t('t_phase_validation'));
  feedback('busy', t('t_validation'));
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
  }
  show('v-confirmed');
});

$('#open-signal-btn').addEventListener('click', async () => {
  if (state.busy) return;
  if (liveApi() && state.signalId) {
    try {
      await withLoading(t('t_accepting'), async () => {
        await api.openSignal(state.signalId, { userId: state.peerId });
        const accept = await api.acceptSignal(state.signalId, { userId: state.peerId });
        state.connectionId = accept.connection && accept.connection.id;
        state.connectionState = accept.connection && accept.connection.state;
      });
    } catch (_) { return; }
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
        const m = document.createElement('div'); m.className = 'msg me'; m.textContent = v;
        log.appendChild(m);
      });
      f.value = ''; log.scrollTop = log.scrollHeight;
      return;
    } catch (_) { return; }
  }
  const m = document.createElement('div'); m.className = 'msg me'; m.textContent = v;
  log.appendChild(m); f.value = ''; log.scrollTop = log.scrollHeight;
}
$('#chat-send').addEventListener('click', sendChat);
$('#chat-field').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

/* outcome → both sides on API → cooldown */
async function submitOutcome(kind) {
  if (state.busy) return;
  $('#cd-num').textContent = kind === 'yes' ? '30' : '15';
  if (liveApi() && state.connectionId) {
    try {
      await withLoading(t('t_outcome'), async () => {
        const o = kind === 'yes' ? 'YES' : 'NO';
        await api.outcome(state.connectionId, { outcome: o });
        await api.outcome(state.connectionId, { outcome: o }, { userId: state.peerId });
        const c = await api.connection(state.connectionId);
        state.connectionState = c.connection && c.connection.state;
      });
    } catch (_) { return; }
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
    state.apiLive = !api.useMock;
    if (!state.apiLive) {
      setApiBanner('mock', t('t_api_mock'));
      feedback('busy', t('t_api_mock'));
      applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });
      return;
    }
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
    try {
      const ps = await api.paymentsStatus();
      if (ps && ps.paymentsEnabled) console.warn('[wingman] payments unexpectedly enabled');
    } catch (_) { /* ignore */ }
    setApiBanner('live', t('t_api_live'));
    feedback('success', t('t_api_live'));
  } catch (_) {
    if (api) api.setUseMock(true);
    state.apiLive = false;
    setApiBanner('mock', t('t_api_mock'));
    feedback('busy', t('t_api_mock'));
    applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });
  } finally {
    setLoading(false);
  }
}

function restoreSessionIfAny() {
  const saved = readSession();
  if (!saved) return;
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
  }
  syncRadarEmpty();
  syncSignalEmpty();
  const resumeViews = new Set([
    'v-radar', 'v-signal', 'v-selfie', 'v-ticket', 'v-mission-meet', 'v-mission-mode', 'v-outcome', 'v-cooldown',
  ]);
  if (saved.viewId && resumeViews.has(saved.viewId) && saved.viewId !== 'v-splash') {
    show(saved.viewId);
    feedback('info', t('t_session_restored'));
  } else if (saved.phase) {
    setPhase(saved.phase);
  }
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

applyLang();
sizeCanvas();
startRadar();
syncViewA11y(state.viewId || 'v-splash');
syncRadarEmpty();
syncSignalEmpty();
applyEntitlements({ plan: 'FREE', capabilities: { dailySignals: 2, activeConnectionTickets: 1 } });
bootApi().then(() => {
  restoreSessionIfAny();
  if (/[?&]smoke=1\b/.test(location.search)) runP4Smoke();
});
window.__wingmanRunP4Smoke = runP4Smoke;
