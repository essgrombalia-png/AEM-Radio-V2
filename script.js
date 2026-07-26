/**
 * ============================================================================
 * AEM Radio Player — Application Logic
 * Vanilla JS, no build step. Organized into small modules via IIFE closures:
 *   Store        -> localStorage read/write helpers
 *   AudioEngine   -> <audio> playback + Web Audio API visualizer + reconnect
 *   State         -> in-memory app state + derived helpers
 *   UI            -> DOM rendering & view switching
 *   Events        -> wires everything together
 * ============================================================================
 */

(() => {
  'use strict';

  /* ==========================================================================
     STORE — localStorage persistence
     ========================================================================== */
  const STORAGE_KEYS = {
    favorites: 'aem_radio_favorites',
    history: 'aem_radio_history',
    accent: 'aem_radio_accent',
    theme: 'aem_radio_theme',
    volume: 'aem_radio_volume',
    reconnect: 'aem_radio_reconnect',
    lastStation: 'aem_radio_last_station',
    users: 'aem_radio_users',
    session: 'aem_radio_session',
    siteContent: 'aem_radio_site_content',
    customStations: 'aem_radio_custom_stations',
    pendingSync: 'aem_radio_pending_sync'
  };

  const Store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        console.warn('Store.get failed for', key, e);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        if (key !== STORAGE_KEYS.pendingSync && key !== STORAGE_KEYS.session) {
          if (typeof SyncManager !== 'undefined' && SyncManager.notifyChange) {
            SyncManager.notifyChange();
          }
        }
      } catch (e) {
        console.warn('Store.set failed for', key, e);
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
        if (key !== STORAGE_KEYS.pendingSync && key !== STORAGE_KEYS.session) {
          if (typeof SyncManager !== 'undefined' && SyncManager.notifyChange) {
            SyncManager.notifyChange();
          }
        }
      } catch (e) { /* noop */ }
    }
  };

  /* ==========================================================================
     SYNC MANAGER — offline pending sync & simulated cloud backup
     ========================================================================== */
  const SyncManager = (() => {
    let pendingCount = Store.get(STORAGE_KEYS.pendingSync, 0);
    let syncTimer = null;

    function getBadgeEl() { return document.getElementById('sync-badge'); }
    function getTextEl() { return document.getElementById('sync-badge-text'); }

    function updateUI(state, text) {
      const badge = getBadgeEl();
      const txt = getTextEl();
      if (!badge || !txt) return;
      badge.setAttribute('data-sync-state', state);
      txt.textContent = text;

      let title = 'Synkstatus för lokala ändringar.';
      if (state === 'pending') title = `${pendingCount} ändring(ar) sparade lokalt. Redo att synkas till servern. Klicka för att synka.`;
      if (state === 'syncing') title = 'Synkar ändringar till servern…';
      if (state === 'synced') title = 'All data är synkad med servern.';
      if (state === 'offline') title = `Offline (${pendingCount} sparade ändringar). Klicka för att försöka synka.`;
      badge.title = title;
    }

    function notifyChange() {
      pendingCount++;
      Store.set(STORAGE_KEYS.pendingSync, pendingCount);

      if (!navigator.onLine) {
        updateUI('offline', `Offline (${pendingCount})`);
        return;
      }

      updateUI('syncing', 'Synkar…');
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        pendingCount = 0;
        Store.set(STORAGE_KEYS.pendingSync, 0);
        updateUI('synced', 'Synkad');
      }, 900);
    }

    function syncNow(manual = false) {
      if (!navigator.onLine) {
        updateUI('offline', pendingCount > 0 ? `Offline (${pendingCount})` : 'Offline');
        if (manual) UI.showToast('Du är offline. Ändringar synkas när anslutningen återställs.', 'error');
        return;
      }

      updateUI('syncing', 'Synkar till servern…');
      if (syncTimer) clearTimeout(syncTimer);

      setTimeout(() => {
        const count = pendingCount;
        pendingCount = 0;
        Store.set(STORAGE_KEYS.pendingSync, 0);
        updateUI('synced', 'Synkad');

        if (manual) {
          if (count > 0) {
            UI.showToast(`Synkning klar! ${count} ändring(ar) säkerhetskopierade till servern.`, 'success');
          } else {
            UI.showToast('All lokal data är redan synkad med servern.', 'info');
          }
        }
      }, 1100);
    }

    function init() {
      if (!navigator.onLine) {
        updateUI('offline', pendingCount > 0 ? `Offline (${pendingCount})` : 'Offline');
      } else if (pendingCount > 0) {
        syncNow();
      } else {
        updateUI('synced', 'Synkad');
      }
    }

    return { init, notifyChange, syncNow, getPendingCount: () => pendingCount };
  })();

  /* ==========================================================================
     THEME MANAGER — OS preference detection & theme toggling
     ========================================================================== */
  const ThemeManager = (() => {
    function getSystemPreference() {
      return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }

    function apply(mode) {
      const activeMode = mode === 'system' ? getSystemPreference() : mode;
      document.documentElement.setAttribute('data-theme', activeMode);
      document.documentElement.setAttribute('data-theme-setting', mode);

      const radios = document.querySelectorAll('input[name="theme-mode"]');
      radios.forEach(radio => {
        radio.checked = (radio.value === mode);
      });
    }

    function init() {
      const savedMode = Store.get(STORAGE_KEYS.theme, 'system');
      apply(savedMode);

      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
          const currentMode = Store.get(STORAGE_KEYS.theme, 'system');
          if (currentMode === 'system') {
            apply('system');
          }
        });
      }
    }

    function setMode(mode) {
      Store.set(STORAGE_KEYS.theme, mode);
      apply(mode);
    }

    return { init, apply, setMode, getSystemPreference };
  })();

  /* ==========================================================================
     AUTH — local, client-side demo authentication
     ----------------------------------------------------------------------------
     IMPORTANT: this app is a static site with no backend/database. "Accounts"
     are stored only in this browser's localStorage — they are NOT shared
     across devices, and password hashes are visible to anyone with dev tools
     open on this device. This is fine for a personal/demo project, but this
     is not a substitute for real server-side authentication.
     ========================================================================== */
  const Auth = (() => {
    const DEFAULT_ADMIN_USERNAME = 'Admin';
    const DEFAULT_ADMIN_PASSWORD = 'Admin';

    async function hashPassword(password) {
      const enc = new TextEncoder().encode(password);
      const digest = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function getUsers() {
      return Store.get(STORAGE_KEYS.users, []);
    }
    function saveUsers(list) {
      Store.set(STORAGE_KEYS.users, list);
    }
    function findUser(username) {
      const users = getUsers();
      return users.find(u => u.username.toLowerCase() === String(username).toLowerCase()) || null;
    }

    async function init() {
      const users = getUsers();
      if (users.length === 0) {
        const passHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
        saveUsers([{ username: DEFAULT_ADMIN_USERNAME, passHash, role: 'admin', createdAt: Date.now() }]);
      }
    }

    async function signup(username, password) {
      username = (username || '').trim();
      if (!username || username.length < 2) return { ok: false, message: 'Ange ett användarnamn (minst 2 tecken).' };
      if (!password) return { ok: false, message: 'Ange ett lösenord.' };
      if (findUser(username)) return { ok: false, message: 'Det användarnamnet är redan taget.' };

      const passHash = await hashPassword(password);
      const users = getUsers();
      users.push({ username, passHash, role: 'user', createdAt: Date.now() });
      saveUsers(users);
      setSession({ username, role: 'user' });
      return { ok: true, user: { username, role: 'user' } };
    }

    async function login(username, password) {
      const user = findUser(username);
      if (!user) return { ok: false, message: 'Fel användarnamn eller lösenord.' };
      const passHash = await hashPassword(password);
      if (passHash !== user.passHash) return { ok: false, message: 'Fel användarnamn eller lösenord.' };
      setSession({ username: user.username, role: user.role });
      return { ok: true, user: { username: user.username, role: user.role } };
    }

    function logout() {
      Store.remove(STORAGE_KEYS.session);
    }

    function setSession(session) {
      Store.set(STORAGE_KEYS.session, session);
    }

    function getSession() {
      return Store.get(STORAGE_KEYS.session, null);
    }

    async function changePassword(oldPassword, newPassword) {
      const session = getSession();
      if (!session) return { ok: false, message: 'Du måste vara inloggad.' };
      const user = findUser(session.username);
      if (!user) return { ok: false, message: 'Kontot hittades inte.' };
      const oldHash = await hashPassword(oldPassword);
      if (oldHash !== user.passHash) return { ok: false, message: 'Nuvarande lösenord stämmer inte.' };
      if (!newPassword) return { ok: false, message: 'Ange ett nytt lösenord.' };

      user.passHash = await hashPassword(newPassword);
      const users = getUsers().map(u => (u.username.toLowerCase() === user.username.toLowerCase() ? user : u));
      saveUsers(users);
      return { ok: true };
    }

    function deleteUser(username) {
      const users = getUsers().filter(u => u.username.toLowerCase() !== String(username).toLowerCase());
      saveUsers(users);
    }

    return { init, signup, login, logout, getSession, getUsers, changePassword, deleteUser, findUser };
  })();

  /* ==========================================================================
     STATE
     ========================================================================== */
  const DEFAULT_SITE_CONTENT = {
    brandName: 'AEMRadio',
    heroTitle: 'Din radio. Överallt. Direkt i webbläsaren.',
    heroSub: 'AEM Radio Player samlar livesändningar från hela världen i ett snyggt, snabbt och helt gratis gränssnitt — inga konton, ingen backend.'
  };

  function getMergedStations() {
    const defaults = (window.STATIONS || []).slice();
    const stored = Store.get(STORAGE_KEYS.customStations, null);
    if (!stored || !Array.isArray(stored)) return defaults;
    const defaultIds = new Set(defaults.map(s => s.id));
    const extraCustom = stored.filter(s => !defaultIds.has(s.id));
    const mergedDefaults = defaults.map(d => {
      const match = stored.find(s => s.id === d.id);
      return match ? { ...d, ...match } : d;
    });
    return [...mergedDefaults, ...extraCustom];
  }

  const State = {
    stations: getMergedStations(),
    stationStatuses: {}, // map of stationId -> { ok: boolean, status: string, reason: string }
    streamMetadata: {}, // map of stationId -> { bitrate, codec, sampleRate, quality, qualityText }
    genres: window.GENRES || ['All'],
    siteContent: Store.get(STORAGE_KEYS.siteContent, null) || { ...DEFAULT_SITE_CONTENT },
    currentView: 'home',
    activeGenreHome: 'All',
    activeGenreStations: 'All',
    searchQuery: '',
    currentStationIndex: -1, // index into State.stations
    isPlaying: false,
    isLoading: false,
    isMuted: false,
    volume: Store.get(STORAGE_KEYS.volume, 80),
    favorites: Store.get(STORAGE_KEYS.favorites, []), // array of station ids
    history: Store.get(STORAGE_KEYS.history, []), // array of {id, playedAt}
    reconnectEnabled: Store.get(STORAGE_KEYS.reconnect, true),
    sleepTimerId: null,
    sleepTimerEndsAt: null,
    nowPlayingOpen: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5
  };

  function getCurrentStation() {
    return State.currentStationIndex >= 0 ? State.stations[State.currentStationIndex] : null;
  }

  function isFavorite(stationId) {
    return State.favorites.includes(stationId);
  }

  function toggleFavorite(stationId) {
    if (isFavorite(stationId)) {
      State.favorites = State.favorites.filter(id => id !== stationId);
    } else {
      State.favorites.push(stationId);
    }
    Store.set(STORAGE_KEYS.favorites, State.favorites);
  }

  function saveStations() {
    Store.set(STORAGE_KEYS.customStations, State.stations);
  }

  function resetStationsToDefault() {
    Store.remove(STORAGE_KEYS.customStations);
    State.stations = (window.STATIONS || []).slice();
  }

  function slugify(name) {
    const base = name.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'station';
    let slug = base;
    let n = 1;
    while (State.stations.some(s => s.id === slug)) {
      slug = `${base}-${n++}`;
    }
    return slug;
  }

  function applySiteContent() {
    const brandTextEl = document.querySelector('.brand-text');
    if (brandTextEl) brandTextEl.textContent = State.siteContent.brandName;
    const heroTitleEl = document.querySelector('.hero-copy h1');
    if (heroTitleEl) heroTitleEl.textContent = State.siteContent.heroTitle;
    const heroSubEl = document.querySelector('.hero-sub');
    if (heroSubEl) heroSubEl.textContent = State.siteContent.heroSub;
    document.title = `${State.siteContent.brandName} — Live internetradio`;
  }

  function saveSiteContent(content) {
    State.siteContent = content;
    Store.set(STORAGE_KEYS.siteContent, content);
    applySiteContent();
  }

  function resetSiteContent() {
    Store.remove(STORAGE_KEYS.siteContent);
    State.siteContent = { ...DEFAULT_SITE_CONTENT };
    applySiteContent();
  }

  function pushHistory(stationId) {
    const entry = { id: stationId, playedAt: Date.now() };
    // Remove previous entries for the same station to keep history de-duped & recency-ordered
    State.history = State.history.filter(h => h.id !== stationId);
    State.history.unshift(entry);
    State.history = State.history.slice(0, 30);
    Store.set(STORAGE_KEYS.history, State.history);
  }

  /* ==========================================================================
     AUDIO ENGINE — playback, Web Audio API visualizer & GainNode, auto-reconnect
     ========================================================================== */
  const AudioEngine = (() => {
    const audioEl = document.getElementById('audio-el');
    let audioCtx = null;
    let gainNode = null;
    let analyser = null;
    let sourceNode = null;
    let freqData = null;
    let visualizerRAF = null;
    let reconnectTimeoutId = null;

    try { audioEl.volume = State.volume / 100; } catch (e) {}
    audioEl.muted = State.isMuted;

    function ensureAudioGraph() {
      if (audioCtx) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
        sourceNode = audioCtx.createMediaElementSource(audioEl);
        gainNode = audioCtx.createGain();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        freqData = new Uint8Array(analyser.frequencyBinCount);

        sourceNode.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        const currentGain = State.isMuted ? 0 : (State.volume / 100);
        gainNode.gain.setValueAtTime(currentGain, audioCtx.currentTime);
      } catch (e) {
        console.warn('Web Audio API / GainNode unavailable, falling back to standard audio element controls.', e);
        audioCtx = null;
        gainNode = null;
      }
    }

    function play(station) {
      if (!station) return;
      clearTimeout(reconnectTimeoutId);
      State.isLoading = true;
      State.reconnectAttempts = 0;
      UI.updatePlayButtons();
      UI.setConnStatus('loading');

      audioEl.src = station.streamUrl;
      audioEl.crossOrigin = 'anonymous';

      ensureAudioGraph();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const playPromise = audioEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(err => {
          console.error('Playback failed:', err);
          handleStreamError('Kunde inte starta uppspelning. Kontrollera din anslutning eller klicka igen.');
        });
      }
    }

    function pause() {
      audioEl.pause();
      State.isPlaying = false;
      State.isLoading = false;
      UI.updatePlayButtons();
      UI.setConnStatus('idle');
      stopVisualizer();
    }

    function setVolume(vol) {
      State.volume = vol;
      const targetGain = State.isMuted ? 0 : (vol / 100);
      try { audioEl.volume = vol / 100; } catch (e) {}
      if (gainNode && audioCtx) {
        gainNode.gain.setValueAtTime(targetGain, audioCtx.currentTime);
      }
      Store.set(STORAGE_KEYS.volume, vol);
      UI.updateVolumeSliders();
      UI.updateMuteButtons();
    }

    function setMuted(muted) {
      State.isMuted = muted;
      audioEl.muted = muted;
      const targetGain = muted ? 0 : (State.volume / 100);
      if (gainNode && audioCtx) {
        gainNode.gain.setValueAtTime(targetGain, audioCtx.currentTime);
      }
      UI.updateMuteButtons();
      UI.updateVolumeSliders();
    }

    function handleStreamError(message) {
      State.isLoading = false;
      State.isPlaying = false;
      UI.updatePlayButtons();
      UI.setConnStatus('error');
      UI.showError(message);
      UI.showToast(message, 'error');
      stopVisualizer();

      if (State.reconnectEnabled && State.reconnectAttempts < State.maxReconnectAttempts) {
        State.reconnectAttempts += 1;
        const delay = Math.min(2000 * State.reconnectAttempts, 10000);
        UI.showToast(`Försöker återansluta (${State.reconnectAttempts}/${State.maxReconnectAttempts})…`, 'info');
        reconnectTimeoutId = setTimeout(() => {
          const station = getCurrentStation();
          if (station) play(station);
        }, delay);
      }
    }

    // --- Visualizer loop ---
    function startVisualizer() {
      if (!analyser) {
        // Fallback: CSS keyframe animation handles it via .is-paused toggling
        UI.setEqPlaying(true);
        return;
      }
      UI.setEqPlaying(true);
      const tick = () => {
        analyser.getByteFrequencyData(freqData);
        UI.renderVisualizerFrame(freqData);
        visualizerRAF = requestAnimationFrame(tick);
      };
      tick();
    }

    function stopVisualizer() {
      UI.setEqPlaying(false);
      if (visualizerRAF) {
        cancelAnimationFrame(visualizerRAF);
        visualizerRAF = null;
      }
    }

    // --- Native <audio> events ---
    audioEl.addEventListener('playing', () => {
      State.isPlaying = true;
      State.isLoading = false;
      State.reconnectAttempts = 0;
      UI.updatePlayButtons();
      UI.setConnStatus('live');
      UI.hideError();
      startVisualizer();
    });

    audioEl.addEventListener('waiting', () => {
      State.isLoading = true;
      UI.updatePlayButtons();
      UI.setConnStatus('loading');
    });

    audioEl.addEventListener('pause', () => {
      if (State.isPlaying) {
        State.isPlaying = false;
        UI.updatePlayButtons();
      }
    });

    audioEl.addEventListener('error', () => {
      handleStreamError('Streamen kunde inte laddas. URL:en kan vara nere eller blockerad av CORS.');
    });

    audioEl.addEventListener('stalled', () => {
      UI.setConnStatus('loading');
    });

    return {
      play,
      pause,
      setVolume,
      setMuted,
      get el() { return audioEl; }
    };
  })();

  /* ==========================================================================
     UI — DOM rendering
     ========================================================================== */
  const UI = (() => {
    const el = {
      genreChipsHome: document.getElementById('genre-chips-home'),
      genreChipsStations: document.getElementById('genre-chips-stations'),
      homeGrid: document.getElementById('home-station-grid'),
      stationsGrid: document.getElementById('stations-grid'),
      stationsEmpty: document.getElementById('stations-empty'),
      stationsCountLabel: document.getElementById('stations-count-label'),
      favoritesGrid: document.getElementById('favorites-grid'),
      favoritesEmpty: document.getElementById('favorites-empty'),
      historyList: document.getElementById('history-list'),
      historyEmpty: document.getElementById('history-empty'),

      connDot: document.getElementById('conn-dot'),
      connText: document.getElementById('conn-text'),

      miniPlayer: document.getElementById('mini-player'),
      miniArt: document.getElementById('mini-art'),
      miniStationName: document.getElementById('mini-station-name'),
      miniTrackTitle: document.getElementById('mini-track-title'),
      miniPlayBtn: document.getElementById('mini-play-btn'),
      miniEq: document.getElementById('mini-eq'),
      miniVolumeSlider: document.getElementById('mini-volume-slider'),
      miniMuteBtn: document.getElementById('mini-mute-btn'),
      miniVolPercent: document.getElementById('mini-vol-percent'),

      npOverlay: document.getElementById('now-playing-overlay'),
      npArt: document.getElementById('np-art'),
      npStationName: document.getElementById('np-station-name'),
      npTrackTitle: document.getElementById('np-track-title'),
      npTrackArtist: document.getElementById('np-track-artist'),
      npGenre: document.getElementById('np-genre'),
      npLiveBadge: document.getElementById('np-live-badge'),
      npBitrateVal: document.getElementById('np-bitrate-val'),
      npCodecVal: document.getElementById('np-codec-val'),
      npRateVal: document.getElementById('np-rate-val'),
      npQualityVal: document.getElementById('np-quality-val'),
      npQualityDot: document.getElementById('np-quality-dot'),
      npPlayBtn: document.getElementById('np-play-btn'),
      npFavoriteBtn: document.getElementById('np-favorite-btn'),
      npVolumeSlider: document.getElementById('np-volume-slider'),
      npMuteBtn: document.getElementById('np-mute-btn'),
      npVolPercent: document.getElementById('np-vol-percent'),
      npError: document.getElementById('np-error-msg'),
      npProgress: document.querySelector('.np-progress'),
      npEq: document.getElementById('np-eq'),

      toastStack: document.getElementById('toast-stack'),
      sleepModal: document.getElementById('sleep-modal-backdrop'),
      sleepLabel: document.getElementById('sleep-timer-label'),

      navAdminItem: document.getElementById('nav-admin-item'),
      accountGuest: document.getElementById('account-guest'),
      accountUser: document.getElementById('account-user'),
      accountAvatar: document.getElementById('account-avatar'),
      accountName: document.getElementById('account-name'),
      accountRoleBadge: document.getElementById('account-role-badge'),
      accountAdminLink: document.getElementById('account-admin-link'),
      settingsAccountGuest: document.getElementById('settings-account-guest'),
      settingsAccountUser: document.getElementById('settings-account-user'),
      settingsCurrentUsername: document.getElementById('settings-current-username'),
      settingsCurrentRole: document.getElementById('settings-current-role'),
      checkStreamsBtn: document.getElementById('check-streams-btn'),
      adminStationsTable: document.getElementById('admin-stations-table'),
      adminUsersTable: document.getElementById('admin-users-table')
    };

    /* ----- helpers ----- */
    function stationCardTemplate(station) {
      const fav = isFavorite(station.id) ? 'is-active' : '';
      const playing = getCurrentStation()?.id === station.id ? 'is-playing' : '';
      return `
        <article class="station-card ${playing}" data-station-id="${station.id}">
          <button class="card-fav-btn ${fav}" data-action="favorite" data-station-id="${station.id}"
            aria-label="Favoritmarkera ${escapeHtml(station.name)}" aria-pressed="${fav ? 'true' : 'false'}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S3.5 15.4 3.5 9.6C3.5 6.5 5.9 4 9 4c1.7 0 3.2.8 4 2.1C13.8 4.8 15.3 4 17 4c3.1 0 5.5 2.5 5.5 5.6 0 5.8-8.5 10.9-8.5 10.9Z"/></svg>
          </button>
          <div class="card-art-wrap">
            <img src="${station.logo}" alt="" loading="lazy" width="200" height="200">
            <div class="card-play-overlay">
              <button class="card-play-btn" data-action="play" data-station-id="${station.id}" aria-label="Spela ${escapeHtml(station.name)}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>
              </button>
            </div>
          </div>
          <div class="card-body">
            <h3>${escapeHtml(station.name)}</h3>
            <p class="card-meta"><span>${escapeHtml(station.genre)}</span><span class="dot"></span><span>${escapeHtml(station.country)}</span></p>
          </div>
        </article>`;
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function filterStations({ genre, query }) {
      let list = State.stations;
      if (genre && genre !== 'All') {
        list = list.filter(s => s.genre === genre);
      }
      if (query && query.trim()) {
        const q = query.trim().toLowerCase();
        list = list.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q) ||
          s.country.toLowerCase().includes(q)
        );
      }
      return list;
    }

    function renderGenreChips(container, activeGenre, onSelect) {
      container.innerHTML = State.genres.map(g =>
        `<button type="button" class="chip ${g === activeGenre ? 'is-active' : ''}" data-genre="${g}">${g}</button>`
      ).join('');
      container.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => onSelect(chip.dataset.genre));
      });
    }

    function renderHome() {
      renderGenreChips(el.genreChipsHome, State.activeGenreHome, (genre) => {
        State.activeGenreHome = genre;
        renderHome();
      });
      const list = filterStations({ genre: State.activeGenreHome, query: '' });
      el.homeGrid.innerHTML = list.map(stationCardTemplate).join('') || '';
      document.querySelector('.eyebrow').innerHTML =
        `Live nu &middot; ${State.stations.length} stationer`;
    }

    function renderStationsView() {
      renderGenreChips(el.genreChipsStations, State.activeGenreStations, (genre) => {
        State.activeGenreStations = genre;
        renderStationsView();
      });
      const list = filterStations({ genre: State.activeGenreStations, query: State.searchQuery });
      el.stationsGrid.innerHTML = list.map(stationCardTemplate).join('');
      el.stationsEmpty.classList.toggle('is-hidden', list.length > 0);
      el.stationsCountLabel.textContent = `${list.length} station${list.length === 1 ? '' : 'er'}`;
    }

    function renderFavorites() {
      const list = State.stations.filter(s => isFavorite(s.id));
      el.favoritesGrid.innerHTML = list.map(stationCardTemplate).join('');
      el.favoritesEmpty.classList.toggle('is-hidden', list.length > 0);
    }

    function renderHistory() {
      const rows = State.history
        .map(h => ({ entry: h, station: State.stations.find(s => s.id === h.id) }))
        .filter(x => x.station);

      el.historyList.innerHTML = rows.map(({ entry, station }) => `
        <div class="station-list-row" data-station-id="${station.id}">
          <img src="${station.logo}" alt="" loading="lazy" width="44" height="44">
          <div class="row-meta">
            <strong>${escapeHtml(station.name)}</strong>
            <small>${escapeHtml(station.genre)} · ${escapeHtml(station.country)}</small>
          </div>
          <span class="row-time">${formatRelativeTime(entry.playedAt)}</span>
          <button class="icon-btn icon-btn--sm" data-action="play" data-station-id="${station.id}" aria-label="Spela ${escapeHtml(station.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>
          </button>
        </div>
      `).join('');
      el.historyEmpty.classList.toggle('is-hidden', rows.length > 0);
    }

    function formatRelativeTime(ts) {
      const diffMs = Date.now() - ts;
      const min = Math.floor(diffMs / 60000);
      if (min < 1) return 'Nu';
      if (min < 60) return `${min} min sedan`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr} tim sedan`;
      const days = Math.floor(hr / 24);
      return `${days} dygn sedan`;
    }

    function renderAll() {
      renderHome();
      renderStationsView();
      renderFavorites();
      renderHistory();
    }

    /* ----- view switching ----- */
    function switchView(viewName) {
      State.currentView = viewName;
      document.querySelectorAll('.view').forEach(v => v.classList.add('is-hidden'));
      document.getElementById(`view-${viewName}`).classList.remove('is-hidden');

      document.querySelectorAll('.nav-item').forEach(btn => {
        const active = btn.dataset.view === viewName;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.bn-item').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.view === viewName);
      });

      if (viewName === 'favorites') renderFavorites();
      if (viewName === 'history') renderHistory();
      if (viewName === 'stations') renderStationsView();
      if (viewName === 'home') renderHome();

      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }

    /* ----- player UI sync ----- */
    function updatePlayButtons() {
      const playing = State.isPlaying;
      const loading = State.isLoading;
      [document.getElementById('np-play-btn'), document.getElementById('mini-play-btn')].forEach(btn => {
        if (!btn) return;
        const iconPlay = btn.querySelector('.icon-play');
        const iconPause = btn.querySelector('.icon-pause');
        const iconLoading = btn.querySelector('.icon-loading');
        iconPlay.classList.toggle('is-hidden', loading || playing);
        iconPause.classList.toggle('is-hidden', loading || !playing);
        iconLoading.classList.toggle('is-hidden', !loading);
        btn.setAttribute('aria-label', playing ? 'Pausa' : 'Spela');
      });

      // Update playing-state highlight on cards
      document.querySelectorAll('.station-card').forEach(card => {
        const current = getCurrentStation();
        card.classList.toggle('is-playing', !!current && card.dataset.stationId === current.id);
      });

      if (el.npProgress) el.npProgress.classList.toggle('is-paused', !playing);
    }

    function updateMuteButtons() {
      const isMuted = State.isMuted || State.volume === 0;
      document.querySelectorAll('.icon-vol-on').forEach(icon => {
        icon.classList.toggle('is-hidden', isMuted);
      });
      document.querySelectorAll('.icon-vol-off').forEach(icon => {
        icon.classList.toggle('is-hidden', !isMuted);
      });
      [el.npMuteBtn, el.miniMuteBtn].forEach(btn => {
        if (!btn) return;
        btn.setAttribute('aria-label', isMuted ? 'Slå på ljud' : 'Stäng av ljud');
        btn.classList.toggle('is-active', isMuted);
      });
    }

    function updateVolumeSliders() {
      const vol = State.volume;
      const displayVal = State.isMuted ? 'MUTE' : `${vol}%`;

      if (el.npVolumeSlider) el.npVolumeSlider.value = vol;
      if (el.miniVolumeSlider) el.miniVolumeSlider.value = vol;

      if (el.npVolPercent) el.npVolPercent.textContent = displayVal;
      if (el.miniVolPercent) el.miniVolPercent.textContent = displayVal;
    }

    function setConnStatus(status) {
      el.connDot.dataset.state = status;
      const labels = { idle: 'Redo', loading: 'Ansluter…', live: 'Live', error: 'Fel' };
      el.connText.textContent = labels[status] || 'Redo';
    }

    function setEqPlaying(isPlaying) {
      document.querySelectorAll('.eq-bars').forEach(bars => bars.classList.toggle('is-paused', !isPlaying));
    }

    function renderVisualizerFrame(freqData) {
      // Map a subset of frequency bins onto the Now Playing equalizer bars for a
      // reactive, audio-driven animation (progressive enhancement over CSS keyframes).
      if (!State.nowPlayingOpen) return;
      const bars = el.npEq.querySelectorAll('span');
      const step = Math.floor(freqData.length / bars.length) || 1;
      bars.forEach((bar, i) => {
        const value = freqData[i * step] || 0;
        const height = 6 + (value / 255) * 34;
        bar.style.height = `${height}px`;
        bar.style.animation = 'none';
      });
    }

    function showError(message) {
      el.npError.textContent = message;
      el.npError.classList.remove('is-hidden');
    }
    function hideError() {
      el.npError.classList.add('is-hidden');
    }

    function showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `toast ${type === 'error' ? 'is-error' : type === 'success' ? 'is-success' : ''}`;
      toast.textContent = message;
      el.toastStack.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 320);
      }, 3600);
    }

    /* ----- Now playing panel population ----- */
    function inspectUrlMetadata(station) {
      if (!station) return { bitrate: '128 kbps', codec: 'MP3', sampleRate: '44.1 kHz', quality: 'standard', qualityText: 'Standard' };

      const url = station.streamUrl || '';
      let codec = station.codec || '';
      let bitrate = station.bitrate || '';

      if (!codec) {
        if (/\.m3u8|hls/i.test(url)) codec = 'AAC (HLS)';
        else if (/\.aac|\/aac|aacp/i.test(url)) codec = 'AAC';
        else if (/\.m4a|\/m4a/i.test(url)) codec = 'AAC';
        else if (/\.ogg|\/ogg/i.test(url)) codec = 'Ogg';
        else if (/\.flac|\/flac/i.test(url)) codec = 'FLAC';
        else codec = 'MP3';
      }

      if (!bitrate) {
        const brMatch = url.match(/(?:_|\/|-)(\d{2,3})k(?:bps)?(?:\.|\/|$|\?)/i) || url.match(/(320|256|192|160|128|96|64|48)k/i);
        if (brMatch && brMatch[1]) {
          bitrate = `${brMatch[1]} kbps`;
        } else {
          bitrate = codec.includes('AAC') ? '128 kbps' : '128 kbps';
        }
      }

      const brNum = parseInt(bitrate, 10) || 128;
      let quality = 'standard';
      let qualityText = 'Standard';

      if (brNum >= 192 || (codec.includes('AAC') && brNum >= 128) || codec.includes('FLAC')) {
        quality = 'high';
        qualityText = 'Hög kvalitet';
      } else if (brNum >= 128) {
        quality = 'standard';
        qualityText = 'Standard';
      } else {
        quality = 'low';
        qualityText = 'Låg bitrate';
      }

      return {
        bitrate: bitrate.includes('kbps') ? bitrate : `${bitrate} kbps`,
        codec,
        sampleRate: '44.1 kHz',
        quality,
        qualityText
      };
    }

    function renderStreamMetadataUI(meta) {
      if (!meta) return;
      if (el.npBitrateVal) el.npBitrateVal.textContent = meta.bitrate || '128 kbps';
      if (el.npCodecVal) el.npCodecVal.textContent = meta.codec || 'MP3';
      if (el.npRateVal) el.npRateVal.textContent = meta.sampleRate || '44.1 kHz';
      if (el.npQualityVal) el.npQualityVal.textContent = meta.qualityText || 'Standard';

      if (el.npQualityDot) {
        el.npQualityDot.className = 'quality-dot';
        if (meta.quality === 'high') {
          // default green dot
        } else if (meta.quality === 'standard') {
          el.npQualityDot.classList.add('is-standard');
        } else if (meta.quality === 'low') {
          el.npQualityDot.classList.add('is-warning');
        } else if (meta.quality === 'error') {
          el.npQualityDot.classList.add('is-error');
        }
      }
    }

    async function probeStreamMetadata(station) {
      if (!station || !station.id) return;

      const cached = State.streamMetadata[station.id];
      if (cached && cached.isProbed) {
        renderStreamMetadataUI(cached);
        return;
      }

      const initialMeta = inspectUrlMetadata(station);
      renderStreamMetadataUI(initialMeta);

      const url = station.streamUrl;
      if (!url || !url.startsWith('http')) return;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Range': 'bytes=0-1024' },
          signal: controller.signal
        }).catch(() => null);

        clearTimeout(timeoutId);

        let updatedMeta = { ...initialMeta, isProbed: true };

        if (res && res.headers) {
          const contentType = res.headers.get('content-type') || '';
          const icyBr = res.headers.get('icy-br') || res.headers.get('x-audiocast-bitrate');

          let detectedCodec = initialMeta.codec;
          if (contentType.includes('audio/mpeg') || contentType.includes('audio/mp3')) detectedCodec = 'MP3';
          else if (contentType.includes('audio/aac') || contentType.includes('audio/aacp')) detectedCodec = 'AAC';
          else if (contentType.includes('audio/ogg')) detectedCodec = 'Ogg';
          else if (contentType.includes('audio/flac')) detectedCodec = 'FLAC';
          else if (contentType.includes('mpegurl') || contentType.includes('hls')) detectedCodec = 'AAC (HLS)';

          let detectedBitrate = initialMeta.bitrate;
          if (icyBr && !isNaN(parseInt(icyBr, 10))) {
            detectedBitrate = `${parseInt(icyBr, 10)} kbps`;
          }

          const brNum = parseInt(detectedBitrate, 10) || 128;
          let quality = 'standard';
          let qualityText = 'Standard';

          if (brNum >= 192 || (detectedCodec.includes('AAC') && brNum >= 128) || detectedCodec.includes('FLAC')) {
            quality = 'high';
            qualityText = 'Hög kvalitet';
          } else if (brNum >= 128) {
            quality = 'standard';
            qualityText = 'Standard';
          } else {
            quality = 'low';
            qualityText = 'Låg bitrate';
          }

          let sampleRate = initialMeta.sampleRate;
          if (window.AudioContext || window.webkitAudioContext) {
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)();
              if (ctx.sampleRate) {
                sampleRate = `${(ctx.sampleRate / 1000).toFixed(1)} kHz`;
              }
              ctx.close().catch(() => {});
            } catch (e) {}
          }

          updatedMeta = {
            bitrate: detectedBitrate,
            codec: detectedCodec,
            sampleRate,
            quality,
            qualityText,
            isProbed: true
          };
        }

        State.streamMetadata[station.id] = updatedMeta;
        renderStreamMetadataUI(updatedMeta);
      } catch (err) {
        State.streamMetadata[station.id] = { ...initialMeta, isProbed: true };
      }
    }

    function updateNowPlayingPanel(station) {
      if (!station) return;
      el.npArt.src = station.logo;
      el.npArt.alt = `${station.name} logotyp`;
      el.npStationName.textContent = station.name;
      el.npGenre.textContent = `${station.genre} · ${station.country}`;
      el.npTrackTitle.textContent = station.description || 'Live-sändning';
      el.npTrackArtist.textContent = station.name;

      el.miniArt.src = station.logo;
      el.miniArt.alt = '';
      el.miniStationName.textContent = station.name;
      el.miniTrackTitle.textContent = station.genre;

      const fav = isFavorite(station.id);
      el.npFavoriteBtn.classList.toggle('is-active', fav);
      el.npFavoriteBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');

      el.miniPlayer.classList.remove('is-hidden');
      hideError();
      updateMediaSession(station);
      probeStreamMetadata(station);
    }

    function updateMediaSession(station) {
      if (!('mediaSession' in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.description || 'Live-sändning',
        artist: station.name,
        album: 'AEM Radio Player',
        artwork: [
          { src: station.logo, sizes: '300x300', type: 'image/png' }
        ]
      });
      navigator.mediaSession.setActionHandler('play', () => Events.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => Events.togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => Events.playAdjacent(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => Events.playAdjacent(1));
    }

    function openNowPlaying() {
      State.nowPlayingOpen = true;
      el.npOverlay.classList.remove('is-hidden');
      document.body.style.overflow = 'hidden';
    }
    function closeNowPlaying() {
      State.nowPlayingOpen = false;
      el.npOverlay.classList.add('is-hidden');
      document.body.style.overflow = '';
    }

    function updateAccentSwatches(accent) {
      document.querySelectorAll('.swatch').forEach(sw => {
        sw.classList.toggle('is-active', sw.dataset.accent === accent);
      });
    }

    function updateSleepLabel(minutesLeft) {
      el.sleepLabel.textContent = minutesLeft ? `Sleep · ${minutesLeft}m` : 'Sleep Timer';
    }

    /* ----- Account / auth UI ----- */
    function syncAccountUI() {
      const session = Auth.getSession();
      const isAdmin = !!session && session.role === 'admin';

      el.navAdminItem.classList.toggle('is-hidden', !isAdmin);
      el.accountAdminLink.classList.toggle('is-hidden', !isAdmin);

      if (session) {
        el.accountGuest.classList.add('is-hidden');
        el.accountUser.classList.remove('is-hidden');
        el.accountAvatar.textContent = session.username.charAt(0).toUpperCase();
        el.accountName.textContent = session.username;
        el.accountRoleBadge.classList.toggle('is-hidden', !isAdmin);

        el.settingsAccountGuest.classList.add('is-hidden');
        el.settingsAccountUser.classList.remove('is-hidden');
        el.settingsCurrentUsername.textContent = session.username;
        el.settingsCurrentRole.textContent = session.role;
      } else {
        el.accountGuest.classList.remove('is-hidden');
        el.accountUser.classList.add('is-hidden');
        el.settingsAccountGuest.classList.remove('is-hidden');
        el.settingsAccountUser.classList.add('is-hidden');
      }

      // If a non-admin somehow lands on the admin view, bounce to home.
      if (State.currentView === 'admin' && !isAdmin) {
        switchView('home');
      }
      if (isAdmin) renderAdminPanel();
    }

    /* ----- Admin panel rendering ----- */
    function populateStationGenreSelect() {
      const select = document.getElementById('station-form-genre');
      if (!select) return;
      const genres = State.genres.filter(g => g !== 'All');
      select.innerHTML = genres.map(g => `<option value="${g}">${g}</option>`).join('');
    }

    function populateSiteContentForm() {
      const brand = document.getElementById('admin-brand-name');
      const title = document.getElementById('admin-hero-title');
      const sub = document.getElementById('admin-hero-sub');
      if (!brand) return;
      brand.value = State.siteContent.brandName;
      title.value = State.siteContent.heroTitle;
      sub.value = State.siteContent.heroSub;
    }

    /* ----- Station stream connectivity background check ----- */
    function renderStatusBadgeHtml(status) {
      if (!status || status.status === 'checking') {
        return `<span class="station-status-badge status-checking" title="Kontrollerar anslutning..."><span class="status-spinner"></span> <span>Testar...</span></span>`;
      }
      if (status.status === 'error' || !status.ok) {
        return `<span class="station-status-badge status-error" title="Anslutningsfel / 404: ${escapeHtml(status.reason)}">
          <svg class="warning-icon" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86l-8.6 14.8A1 1 0 002.55 20h18.9a1 1 0 00.86-1.34l-8.6-14.8a1 1 0 00-1.72 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>${escapeHtml(status.reason || 'Fel')}</span>
        </span>`;
      }
      return `<span class="station-status-badge status-ok" title="Stream online"><span>✓</span> <span>Online</span></span>`;
    }

    async function checkStationStream(station) {
      if (!station || !station.streamUrl) {
        return { ok: false, status: 'error', reason: 'Saknar URL' };
      }
      const url = station.streamUrl;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { ok: false, status: 'error', reason: 'Ogiltig URL' };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) {
          return { ok: false, status: 'error', reason: `HTTP ${res.status}` };
        }
        return { ok: true, status: 'ok', reason: 'Online' };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          return { ok: false, status: 'error', reason: 'Timeout' };
        }

        // Fallback to HTML5 audio probe for media streams or CORS restricted endpoints
        return new Promise((resolve) => {
          const testAudio = new Audio();
          let resolved = false;

          const cleanup = () => {
            testAudio.pause();
            testAudio.removeAttribute('src');
            testAudio.load();
          };

          const timer = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              cleanup();
              resolve({ ok: false, status: 'error', reason: 'Anslutningsfel' });
            }
          }, 5000);

          testAudio.oncanplay = testAudio.oncanplaythrough = testAudio.onloadedmetadata = () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              cleanup();
              resolve({ ok: true, status: 'ok', reason: 'Online' });
            }
          };

          testAudio.onerror = () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              cleanup();
              resolve({ ok: false, status: 'error', reason: 'Stream/404 fel' });
            }
          };

          testAudio.crossOrigin = 'anonymous';
          testAudio.src = url;
          testAudio.load();
        });
      }
    }

    let isCheckingStreams = false;
    async function checkAllStationStreams(forceRecheck = false) {
      if (isCheckingStreams) return;
      isCheckingStreams = true;

      const btn = el.checkStreamsBtn;
      if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.7';
      }

      const list = State.stations;
      list.forEach(s => {
        if (forceRecheck || !State.stationStatuses[s.id]) {
          State.stationStatuses[s.id] = { ok: null, status: 'checking', reason: 'Testar...' };
        }
      });

      renderAdminStationsTable();

      const toCheck = list.filter(s => forceRecheck || State.stationStatuses[s.id]?.status === 'checking');
      for (const station of toCheck) {
        const res = await checkStationStream(station);
        State.stationStatuses[station.id] = res;
        updateAdminStationRowStatus(station.id, res);
      }

      isCheckingStreams = false;
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }

    function updateAdminStationRowStatus(stationId, result) {
      if (!el.adminStationsTable) return;
      const row = el.adminStationsTable.querySelector(`.admin-row[data-station-id="${stationId}"]`);
      if (!row) return;

      if (result.status === 'error' || !result.ok) {
        row.classList.add('has-warning');
      } else {
        row.classList.remove('has-warning');
      }

      const badgeEl = row.querySelector('.station-status-badge');
      if (badgeEl) {
        badgeEl.outerHTML = renderStatusBadgeHtml(result);
      }
    }

    function renderAdminStationsTable() {
      if (!el.adminStationsTable) return;
      el.adminStationsTable.innerHTML = State.stations.map(s => {
        const status = State.stationStatuses[s.id] || { status: 'checking' };
        const warningClass = (status.status === 'error' || status.ok === false) ? ' has-warning' : '';
        const badgeHtml = renderStatusBadgeHtml(status);

        return `
          <div class="admin-row${warningClass}" data-station-id="${s.id}">
            <img src="${s.logo}" alt="" loading="lazy" width="36" height="36">
            <div class="row-meta">
              <strong>${escapeHtml(s.name)}</strong>
              <small>${escapeHtml(s.genre)} · ${escapeHtml(s.country)}</small>
            </div>
            ${badgeHtml}
            <div class="row-actions">
              <button type="button" data-action="edit-station" data-station-id="${s.id}">Redigera</button>
              <button type="button" class="danger" data-action="delete-station" data-station-id="${s.id}">Ta bort</button>
            </div>
          </div>
        `;
      }).join('') || '<p class="empty-state">Inga stationer ännu.</p>';
    }

    function renderAdminUsersTable() {
      if (!el.adminUsersTable) return;
      const users = Auth.getUsers();
      const session = Auth.getSession();
      el.adminUsersTable.innerHTML = users.map(u => `
        <div class="admin-row" data-username="${escapeHtml(u.username)}">
          <span class="account-avatar" style="flex-shrink:0;">${escapeHtml(u.username.charAt(0).toUpperCase())}</span>
          <div class="row-meta">
            <strong>${escapeHtml(u.username)}</strong>
            <small>Skapat ${new Date(u.createdAt || Date.now()).toLocaleDateString('sv-SE')}</small>
          </div>
          <span class="admin-badge">${u.role}</span>
          <div class="row-actions">
            <button type="button" class="danger" data-action="delete-user" data-username="${escapeHtml(u.username)}"
              ${u.role === 'admin' || u.username === session?.username ? 'disabled style="opacity:.35;cursor:not-allowed;"' : ''}>Ta bort</button>
          </div>
        </div>
      `).join('') || '<p class="empty-state">Inga användare ännu.</p>';
    }

    function renderAdminPanel() {
      populateStationGenreSelect();
      populateSiteContentForm();
      renderAdminStationsTable();
      renderAdminUsersTable();
      checkAllStationStreams(false);
    }

    return {
      el,
      stationCardTemplate,
      renderAll, renderHome, renderStationsView, renderFavorites, renderHistory,
      switchView,
      updatePlayButtons, updateMuteButtons, updateVolumeSliders, setConnStatus, setEqPlaying, renderVisualizerFrame,
      showError, hideError, showToast,
      updateNowPlayingPanel, openNowPlaying, closeNowPlaying,
      updateAccentSwatches, updateSleepLabel,
      syncAccountUI, renderAdminPanel, renderAdminStationsTable, renderAdminUsersTable, checkAllStationStreams
    };
  })();

  /* ==========================================================================
     EVENTS — wiring
     ========================================================================== */
  const Events = (() => {

    function selectStationById(stationId, autoplay = true) {
      const idx = State.stations.findIndex(s => s.id === stationId);
      if (idx === -1) return;
      State.currentStationIndex = idx;
      const station = State.stations[idx];
      UI.updateNowPlayingPanel(station);
      Store.set(STORAGE_KEYS.lastStation, stationId);
      pushHistory(stationId);
      UI.renderHistory();
      if (autoplay) {
        AudioEngine.play(station);
      }
      UI.updatePlayButtons();
    }

    function togglePlay() {
      const station = getCurrentStation();
      if (!station) {
        // Nothing selected yet — play first station in current filtered list
        const first = State.stations[0];
        if (first) selectStationById(first.id, true);
        return;
      }
      if (State.isPlaying) {
        AudioEngine.pause();
      } else {
        AudioEngine.play(station);
      }
    }

    function playAdjacent(direction) {
      if (State.stations.length === 0) return;
      let idx = State.currentStationIndex;
      idx = (idx + direction + State.stations.length) % State.stations.length;
      State.currentStationIndex = idx;
      selectStationById(State.stations[idx].id, true);
    }

    function playRandom() {
      if (State.stations.length === 0) return;
      const idx = Math.floor(Math.random() * State.stations.length);
      selectStationById(State.stations[idx].id, true);
      UI.openNowPlaying();
    }

    function handleFavoriteClick(stationId) {
      toggleFavorite(stationId);
      UI.renderAll();
      const current = getCurrentStation();
      if (current && current.id === stationId) {
        const fav = isFavorite(stationId);
        UI.el.npFavoriteBtn.classList.toggle('is-active', fav);
        UI.el.npFavoriteBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');
      }
    }

    function setVolume(vol) {
      if (vol > 0 && State.isMuted) {
        State.isMuted = false;
      }
      AudioEngine.setVolume(vol);
    }

    function toggleMute() {
      AudioEngine.setMuted(!State.isMuted);
    }

    /* ----- Sleep timer ----- */
    function startSleepTimer(minutes) {
      clearSleepTimer();
      if (!minutes || minutes <= 0) {
        UI.showToast('Sleep timer avbruten.', 'info');
        return;
      }
      State.sleepTimerEndsAt = Date.now() + minutes * 60000;
      UI.updateSleepLabel(minutes);
      State.sleepTimerId = setTimeout(() => {
        AudioEngine.pause();
        UI.showToast('Sleep timer: uppspelning pausad.', 'info');
        UI.updateSleepLabel(0);
        State.sleepTimerEndsAt = null;
      }, minutes * 60000);
      UI.showToast(`Sleep timer inställd på ${minutes} minuter.`, 'success');
    }

    function clearSleepTimer() {
      if (State.sleepTimerId) clearTimeout(State.sleepTimerId);
      State.sleepTimerId = null;
      State.sleepTimerEndsAt = null;
      UI.updateSleepLabel(0);
    }

    /* ----- delegated clicks for dynamically-rendered cards ----- */
    function handleDelegatedClick(e) {
      const favBtn = e.target.closest('[data-action="favorite"]');
      if (favBtn) {
        e.preventDefault();
        handleFavoriteClick(favBtn.dataset.stationId);
        return;
      }
      const playBtn = e.target.closest('[data-action="play"]');
      if (playBtn) {
        e.preventDefault();
        const id = playBtn.dataset.stationId;
        const current = getCurrentStation();
        if (current && current.id === id) {
          togglePlay();
        } else {
          selectStationById(id, true);
        }
        return;
      }
      const card = e.target.closest('.station-card');
      if (card) {
        selectStationById(card.dataset.stationId, true);
        UI.openNowPlaying();
        return;
      }
      const listRow = e.target.closest('.station-list-row');
      if (listRow && !e.target.closest('button')) {
        selectStationById(listRow.dataset.stationId, true);
        UI.openNowPlaying();
      }
    }

    function init() {
      // --- Sidebar / bottom nav view switching ---
      document.querySelectorAll('.nav-item, .bn-item').forEach(btn => {
        btn.addEventListener('click', () => UI.switchView(btn.dataset.view));
      });
      document.querySelectorAll('[data-goto]').forEach(btn => {
        btn.addEventListener('click', () => UI.switchView(btn.dataset.goto));
      });

      // --- Delegated station interactions ---
      document.body.addEventListener('click', handleDelegatedClick);

      // --- Search ---
      const searchInput = document.getElementById('search-input');
      let searchDebounce = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          State.searchQuery = searchInput.value;
          if (State.currentView !== 'stations') UI.switchView('stations');
          else UI.renderStationsView();
        }, 200);
      });

      // --- Hero actions ---
      document.getElementById('hero-play-btn').addEventListener('click', playRandom);

      // --- Now playing open/close ---
      document.getElementById('mini-open-btn').addEventListener('click', UI.openNowPlaying);
      document.getElementById('np-close-btn').addEventListener('click', UI.closeNowPlaying);
      UI.el.npOverlay.addEventListener('click', (e) => {
        if (e.target === UI.el.npOverlay) UI.closeNowPlaying();
      });

      // --- Transport controls (both mini + np share logic) ---
      document.getElementById('np-play-btn').addEventListener('click', togglePlay);
      document.getElementById('mini-play-btn').addEventListener('click', togglePlay);
      document.getElementById('np-prev-btn').addEventListener('click', () => playAdjacent(-1));
      document.getElementById('mini-prev-btn').addEventListener('click', () => playAdjacent(-1));
      document.getElementById('np-next-btn').addEventListener('click', () => playAdjacent(1));
      document.getElementById('mini-next-btn').addEventListener('click', () => playAdjacent(1));
      document.getElementById('np-favorite-btn').addEventListener('click', () => {
        const s = getCurrentStation();
        if (s) handleFavoriteClick(s.id);
      });
      document.getElementById('np-share-btn').addEventListener('click', shareCurrentStation);

      // --- Volume / Mute ---
      const handleVolInput = (e) => setVolume(Number(e.target.value));
      if (UI.el.npVolumeSlider) UI.el.npVolumeSlider.addEventListener('input', handleVolInput);
      if (UI.el.miniVolumeSlider) UI.el.miniVolumeSlider.addEventListener('input', handleVolInput);

      if (UI.el.npMuteBtn) UI.el.npMuteBtn.addEventListener('click', toggleMute);
      if (UI.el.miniMuteBtn) UI.el.miniMuteBtn.addEventListener('click', toggleMute);

      UI.updateVolumeSliders();
      UI.updateMuteButtons();

      // --- Sleep timer modal ---
      const sleepBtn = document.getElementById('sleep-timer-btn');
      const sleepModal = document.getElementById('sleep-modal-backdrop');
      sleepBtn.addEventListener('click', () => sleepModal.classList.remove('is-hidden'));
      document.getElementById('sleep-modal-close').addEventListener('click', () => sleepModal.classList.add('is-hidden'));
      sleepModal.addEventListener('click', (e) => { if (e.target === sleepModal) sleepModal.classList.add('is-hidden'); });
      document.getElementById('sleep-options').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-minutes]');
        if (!btn) return;
        startSleepTimer(Number(btn.dataset.minutes));
        sleepModal.classList.add('is-hidden');
      });

      // --- History ---
      document.getElementById('clear-history-btn').addEventListener('click', () => {
        State.history = [];
        Store.set(STORAGE_KEYS.history, []);
        UI.renderHistory();
        UI.showToast('Historik rensad.', 'success');
      });

      // --- Settings: theme mode ---
      const themeOptions = document.getElementById('theme-options');
      if (themeOptions) {
        themeOptions.addEventListener('change', (e) => {
          if (e.target.name === 'theme-mode') {
            ThemeManager.setMode(e.target.value);
            const label = e.target.value === 'system' ? 'System (automatisk)' : (e.target.value === 'light' ? 'Ljust läge' : 'Mörkt läge');
            UI.showToast(`Tema ändrat till ${label}.`, 'info');
          }
        });
      }

      // --- Settings: accent color ---
      document.getElementById('accent-swatches').addEventListener('click', (e) => {
        const swatch = e.target.closest('.swatch');
        if (!swatch) return;
        const accent = swatch.dataset.accent;
        document.documentElement.setAttribute('data-accent', accent);
        Store.set(STORAGE_KEYS.accent, accent);
        UI.updateAccentSwatches(accent);
      });

      // --- Settings: reconnect toggle ---
      const reconnectToggle = document.getElementById('reconnect-toggle');
      reconnectToggle.checked = State.reconnectEnabled;
      reconnectToggle.addEventListener('change', () => {
        State.reconnectEnabled = reconnectToggle.checked;
        Store.set(STORAGE_KEYS.reconnect, State.reconnectEnabled);
      });

      // --- Settings: reset data ---
      document.getElementById('reset-data-btn').addEventListener('click', () => {
        if (!confirm('Detta rensar alla favoriter, historik och inställningar. Fortsätta?')) return;
        Object.values(STORAGE_KEYS).forEach(k => Store.remove(k));
        UI.showToast('All lokal data har återställts. Laddar om…', 'success');
        setTimeout(() => location.reload(), 900);
      });

      // --- Keyboard shortcuts ---
      document.addEventListener('keydown', (e) => {
        // Ignore when typing in inputs
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
        switch (e.code) {
          case 'Space':
            e.preventDefault();
            togglePlay();
            break;
          case 'ArrowUp':
            e.preventDefault();
            setVolume(Math.min(100, State.volume + 5));
            break;
          case 'ArrowDown':
            e.preventDefault();
            setVolume(Math.max(0, State.volume - 5));
            break;
          case 'ArrowLeft':
            playAdjacent(-1);
            break;
          case 'ArrowRight':
            playAdjacent(1);
            break;
          case 'KeyM':
            toggleMute();
            break;
          case 'KeyF': {
            const s = getCurrentStation();
            if (s) handleFavoriteClick(s.id);
            break;
          }
        }
      });

      // --- Initialize theme (OS preference & saved setting) ---
      ThemeManager.init();

      // --- Restore accent theme ---
      const savedAccent = Store.get(STORAGE_KEYS.accent, 'cyan');
      document.documentElement.setAttribute('data-accent', savedAccent);
      UI.updateAccentSwatches(savedAccent);

      // --- Restore last station (without autoplay, browsers block autoplay anyway) ---
      const lastId = Store.get(STORAGE_KEYS.lastStation, null);
      if (lastId && State.stations.some(s => s.id === lastId)) {
        selectStationById(lastId, false);
      }

      // --- Initialize Sync Manager ---
      SyncManager.init();

      // --- Online/offline notices & sync handling ---
      window.addEventListener('offline', () => {
        UI.showToast('Du är offline. Ändringar sparas lokalt och synkas när du är online.', 'error');
        SyncManager.init();
      });

      window.addEventListener('online', () => {
        const pending = SyncManager.getPendingCount();
        if (pending > 0) {
          UI.showToast(`Anslutning återställd. Synkar ${pending} sparade ändringar…`, 'info');
        } else {
          UI.showToast('Anslutning återställd.', 'success');
        }
        SyncManager.syncNow();
      });

      const syncBadge = document.getElementById('sync-badge');
      if (syncBadge) {
        syncBadge.addEventListener('click', () => {
          SyncManager.syncNow(true);
        });
      }

      // --- Auth & Account Buttons ---
      const openLoginBtn = document.getElementById('open-login-btn');
      if (openLoginBtn) openLoginBtn.addEventListener('click', () => openAuthModal('login'));

      const openSignupBtn = document.getElementById('open-signup-btn');
      if (openSignupBtn) openSignupBtn.addEventListener('click', () => openAuthModal('signup'));

      const settingsLoginBtn = document.getElementById('settings-login-btn');
      if (settingsLoginBtn) settingsLoginBtn.addEventListener('click', () => openAuthModal('login'));

      const settingsSignupBtn = document.getElementById('settings-signup-btn');
      if (settingsSignupBtn) settingsSignupBtn.addEventListener('click', () => openAuthModal('signup'));

      const settingsLogoutBtn = document.getElementById('settings-logout-btn');
      if (settingsLogoutBtn) {
        settingsLogoutBtn.addEventListener('click', () => {
          Auth.logout();
          UI.syncAccountUI();
          UI.showToast('Du har loggats ut.', 'info');
        });
      }

      // --- Account Dropdown Menu in Top Bar ---
      const accountMenuBtn = document.getElementById('account-menu-btn');
      const accountMenu = document.getElementById('account-menu');
      if (accountMenuBtn && accountMenu) {
        accountMenuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = accountMenuBtn.getAttribute('aria-expanded') === 'true';
          accountMenuBtn.setAttribute('aria-expanded', !isExpanded);
          accountMenu.classList.toggle('is-hidden', isExpanded);
        });

        document.addEventListener('click', (e) => {
          if (!accountMenu.contains(e.target) && !accountMenuBtn.contains(e.target)) {
            accountMenu.classList.add('is-hidden');
            accountMenuBtn.setAttribute('aria-expanded', 'false');
          }
        });

        accountMenu.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', () => {
            accountMenu.classList.add('is-hidden');
            accountMenuBtn.setAttribute('aria-expanded', 'false');
          });
        });
      }

      const accountLogoutBtn = document.getElementById('account-logout-btn');
      if (accountLogoutBtn) {
        accountLogoutBtn.addEventListener('click', () => {
          Auth.logout();
          UI.syncAccountUI();
          UI.showToast('Du har loggats ut.', 'info');
        });
      }

      // --- Auth Modal Events ---
      const authModalClose = document.getElementById('auth-modal-close');
      if (authModalClose) authModalClose.addEventListener('click', closeAuthModal);

      const authBackdrop = document.getElementById('auth-modal-backdrop');
      if (authBackdrop) {
        authBackdrop.addEventListener('click', (e) => {
          if (e.target === authBackdrop) closeAuthModal();
        });
      }

      const authTabLogin = document.getElementById('auth-tab-login');
      if (authTabLogin) authTabLogin.addEventListener('click', () => openAuthModal('login'));

      const authTabSignup = document.getElementById('auth-tab-signup');
      if (authTabSignup) authTabSignup.addEventListener('click', () => openAuthModal('signup'));

      const authForm = document.getElementById('auth-form');
      if (authForm) authForm.addEventListener('submit', handleAuthSubmit);

      // --- Change Password Form ---
      const changePassForm = document.getElementById('change-password-form');
      if (changePassForm) changePassForm.addEventListener('submit', handleChangePasswordSubmit);

      // --- Admin Forms & Actions ---
      const siteContentForm = document.getElementById('site-content-form');
      if (siteContentForm) siteContentForm.addEventListener('submit', handleSiteContentSubmit);

      const siteContentResetBtn = document.getElementById('site-content-reset');
      if (siteContentResetBtn) siteContentResetBtn.addEventListener('click', handleSiteContentReset);

      const stationForm = document.getElementById('station-form');
      if (stationForm) stationForm.addEventListener('submit', handleStationFormSubmit);

      const stationFormCancelBtn = document.getElementById('station-form-cancel');
      if (stationFormCancelBtn) stationFormCancelBtn.addEventListener('click', resetStationForm);

      const adminStationsTable = document.getElementById('admin-stations-table');
      if (adminStationsTable) adminStationsTable.addEventListener('click', handleAdminTableClick);

      const adminUsersTable = document.getElementById('admin-users-table');
      if (adminUsersTable) adminUsersTable.addEventListener('click', handleAdminTableClick);

      const checkStreamsBtn = document.getElementById('check-streams-btn');
      if (checkStreamsBtn) checkStreamsBtn.addEventListener('click', () => UI.checkAllStationStreams(true));

      const stationsResetBtn = document.getElementById('stations-reset-btn');
      if (stationsResetBtn) stationsResetBtn.addEventListener('click', handleStationsReset);
    }

    /* ----- Auth modal ----- */
    let authMode = 'login'; // 'login' | 'signup'

    function openAuthModal(mode) {
      authMode = mode;
      const backdrop = document.getElementById('auth-modal-backdrop');
      const tabLogin = document.getElementById('auth-tab-login');
      const tabSignup = document.getElementById('auth-tab-signup');
      const confirmWrap = document.getElementById('auth-confirm-wrap');
      const submitBtn = document.getElementById('auth-submit-btn');
      const msg = document.getElementById('auth-msg');
      const form = document.getElementById('auth-form');

      form.reset();
      msg.textContent = '';
      msg.className = 'form-msg';

      tabLogin.classList.toggle('is-active', mode === 'login');
      tabLogin.setAttribute('aria-selected', mode === 'login' ? 'true' : 'false');
      tabSignup.classList.toggle('is-active', mode === 'signup');
      tabSignup.setAttribute('aria-selected', mode === 'signup' ? 'true' : 'false');
      confirmWrap.classList.toggle('is-hidden', mode === 'login');
      submitBtn.textContent = mode === 'login' ? 'Logga in' : 'Skapa konto';

      backdrop.classList.remove('is-hidden');
      document.getElementById('auth-username').focus();
    }

    function closeAuthModal() {
      document.getElementById('auth-modal-backdrop').classList.add('is-hidden');
    }

    async function handleAuthSubmit(e) {
      e.preventDefault();
      const username = document.getElementById('auth-username').value.trim();
      const password = document.getElementById('auth-password').value;
      const confirm = document.getElementById('auth-confirm').value;
      const msg = document.getElementById('auth-msg');
      const submitBtn = document.getElementById('auth-submit-btn');

      msg.textContent = '';
      msg.className = 'form-msg';

      if (authMode === 'signup' && password !== confirm) {
        msg.textContent = 'Lösenorden matchar inte.';
        msg.classList.add('is-error');
        return;
      }

      submitBtn.disabled = true;
      const result = authMode === 'login'
        ? await Auth.login(username, password)
        : await Auth.signup(username, password);
      submitBtn.disabled = false;

      if (!result.ok) {
        msg.textContent = result.message;
        msg.classList.add('is-error');
        return;
      }

      closeAuthModal();
      UI.syncAccountUI();
      UI.showToast(
        authMode === 'login' ? `Inloggad som ${result.user.username}.` : `Konto skapat. Välkommen, ${result.user.username}!`,
        'success'
      );
    }

    /* ----- Change password (Settings) ----- */
    async function handleChangePasswordSubmit(e) {
      e.preventDefault();
      const oldPassword = document.getElementById('cp-old-password').value;
      const newPassword = document.getElementById('cp-new-password').value;
      const confirmPassword = document.getElementById('cp-confirm-password').value;
      const msg = document.getElementById('cp-msg');
      msg.textContent = '';
      msg.className = 'form-msg';

      if (newPassword !== confirmPassword) {
        msg.textContent = 'De nya lösenorden matchar inte.';
        msg.classList.add('is-error');
        return;
      }

      const result = await Auth.changePassword(oldPassword, newPassword);
      if (!result.ok) {
        msg.textContent = result.message;
        msg.classList.add('is-error');
        return;
      }
      msg.textContent = 'Lösenordet har uppdaterats.';
      msg.classList.add('is-success');
      document.getElementById('change-password-form').reset();
      UI.showToast('Lösenord uppdaterat.', 'success');
    }

    /* ----- Admin: site content ----- */
    function handleSiteContentSubmit(e) {
      e.preventDefault();
      const brandName = document.getElementById('admin-brand-name').value.trim() || DEFAULT_SITE_CONTENT.brandName;
      const heroTitle = document.getElementById('admin-hero-title').value.trim() || DEFAULT_SITE_CONTENT.heroTitle;
      const heroSub = document.getElementById('admin-hero-sub').value.trim() || DEFAULT_SITE_CONTENT.heroSub;
      saveSiteContent({ brandName, heroTitle, heroSub });
      const msg = document.getElementById('site-content-msg');
      msg.textContent = 'Innehållet har sparats.';
      msg.className = 'form-msg is-success';
      UI.showToast('Webbplatsinnehåll uppdaterat.', 'success');
    }

    function handleSiteContentReset() {
      resetSiteContent();
      UI.renderAdminPanel();
      UI.showToast('Innehåll återställt till standard.', 'info');
    }

    /* ----- Admin: station management ----- */
    let editingStationId = null;

    function resetStationForm() {
      editingStationId = null;
      document.getElementById('station-form').reset();
      document.getElementById('station-form-id').value = '';
      document.getElementById('station-form-submit').textContent = 'Lägg till station';
      document.getElementById('station-form-cancel').classList.add('is-hidden');
    }

    function loadStationIntoForm(stationId) {
      const station = State.stations.find(s => s.id === stationId);
      if (!station) return;
      editingStationId = stationId;
      document.getElementById('station-form-id').value = stationId;
      document.getElementById('station-form-name').value = station.name;
      document.getElementById('station-form-url').value = station.streamUrl;
      document.getElementById('station-form-logo').value = station.logo;
      document.getElementById('station-form-genre').value = station.genre;
      document.getElementById('station-form-country').value = station.country;
      document.getElementById('station-form-desc').value = station.description || '';
      document.getElementById('station-form-submit').textContent = 'Spara ändringar';
      document.getElementById('station-form-cancel').classList.remove('is-hidden');
      document.getElementById('station-form-name').focus();
    }

    function handleStationFormSubmit(e) {
      e.preventDefault();
      const name = document.getElementById('station-form-name').value.trim();
      const streamUrl = document.getElementById('station-form-url').value.trim();
      const logo = document.getElementById('station-form-logo').value.trim() || `https://picsum.photos/seed/${encodeURIComponent(name)}/300/300`;
      const genre = document.getElementById('station-form-genre').value;
      const country = document.getElementById('station-form-country').value.trim() || 'Okänt';
      const description = document.getElementById('station-form-desc').value.trim();
      const msg = document.getElementById('station-form-msg');
      msg.textContent = '';
      msg.className = 'form-msg';

      if (!name || !streamUrl) {
        msg.textContent = 'Namn och stream-URL krävs.';
        msg.classList.add('is-error');
        return;
      }
      if (!/^https:\/\//i.test(streamUrl)) {
        msg.textContent = 'Stream-URL måste börja med https://';
        msg.classList.add('is-error');
        return;
      }

      if (editingStationId) {
        const idx = State.stations.findIndex(s => s.id === editingStationId);
        if (idx !== -1) {
          State.stations[idx] = { ...State.stations[idx], name, streamUrl, logo, genre, country, description };
        }
        UI.showToast('Station uppdaterad.', 'success');
      } else {
        const id = slugify(name);
        State.stations.push({ id, name, streamUrl, logo, genre, country, description });
        UI.showToast('Station tillagd.', 'success');
      }

      saveStations();
      resetStationForm();
      UI.renderAdminStationsTable();
      UI.renderAll();
    }

    function handleAdminTableClick(e) {
      const editBtn = e.target.closest('[data-action="edit-station"]');
      if (editBtn) {
        loadStationIntoForm(editBtn.dataset.stationId);
        editBtn.closest('.settings-card').querySelector('#station-form-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const deleteBtn = e.target.closest('[data-action="delete-station"]');
      if (deleteBtn) {
        if (!confirm('Ta bort den här stationen permanent?')) return;
        State.stations = State.stations.filter(s => s.id !== deleteBtn.dataset.stationId);
        saveStations();
        if (getCurrentStation() === null) { /* noop */ }
        UI.renderAdminStationsTable();
        UI.renderAll();
        UI.showToast('Station borttagen.', 'success');
        return;
      }
      const deleteUserBtn = e.target.closest('[data-action="delete-user"]');
      if (deleteUserBtn && !deleteUserBtn.disabled) {
        if (!confirm(`Ta bort användaren "${deleteUserBtn.dataset.username}"?`)) return;
        Auth.deleteUser(deleteUserBtn.dataset.username);
        UI.renderAdminUsersTable();
        UI.showToast('Användare borttagen.', 'success');
      }
    }

    function handleStationsReset() {
      if (!confirm('Återställ alla stationer till standardlistan? Egna tillägg och ändringar tas bort.')) return;
      resetStationsToDefault();
      resetStationForm();
      UI.renderAdminStationsTable();
      UI.renderAll();
      UI.showToast('Stationer återställda.', 'info');
    }

    function shareCurrentStation() {
      const station = getCurrentStation();
      if (!station) return;
      const shareData = {
        title: `AEM Radio Player — ${station.name}`,
        text: `Lyssna på ${station.name} (${station.genre}) med AEM Radio Player.`,
        url: location.href
      };
      if (navigator.share) {
        navigator.share(shareData).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(location.href).then(() => {
          UI.showToast('Länk kopierad till urklipp.', 'success');
        });
      }
    }

    return { init, selectStationById, togglePlay, playAdjacent, playRandom };
  })();

  /* ==========================================================================
     BOOTSTRAP
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', async () => {
    await Auth.init();
    UI.renderAll();
    if (Store.get(STORAGE_KEYS.siteContent, null)) applySiteContent();
    UI.syncAccountUI();
    Events.init();
    UI.setConnStatus('idle');

    // Register service worker for PWA/offline shell support with explicit root path & scope
    if ('serviceWorker' in navigator) {
      const registerSW = () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
          console.log('ServiceWorker registered with scope:', reg.scope);
        }).catch(err => {
          console.warn('Service worker registration failed:', err);
        });
      };
      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
      }
    }
  });

})();
