// ==UserScript==
// @name         YouTube Shorts Info
// @namespace    https://github.com/polo2005x
// @version      1.1.0
// @description  Shows upload date and uploader on Shorts grid cards, and the upload date inside the Shorts player.
// @author       polo2005x
// @homepageURL  https://github.com/polo2005x/youtube-shorts-info
// @downloadURL  https://raw.githubusercontent.com/polo2005x/youtube-shorts-info/main/youtube-shorts-info.user.js
// @updateURL    https://raw.githubusercontent.com/polo2005x/youtube-shorts-info/main/youtube-shorts-info.user.js
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const CARD_SEL = 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2';
  const MAX_CONCURRENT = 4;

  // Date color coding: first tier whose maxAge (hours) the upload is younger than wins.
  // `dark` is used on YouTube's dark theme and in the player, `light` on the light theme.
  const AGE_TIERS = [
    { maxAge: 24,      dark: '#3ddc84', light: '#0f8a3c' }, // < 24 hours: green
    { maxAge: 24 * 3,  dark: '#26c6da', light: '#00838f' }, // < 3 days: teal
    { maxAge: 24 * 7,  dark: '#64b5f6', light: '#1565c0' }, // < 7 days: blue
    { maxAge: 24 * 28, dark: '#ffca28', light: '#b26a00' }, // < 28 days: amber
    // older: default text color
  ];

  // ---------- data ----------

  const cache = new Map(); // videoId -> Promise<{date, handle, author, url}>
  const queue = [];
  let active = 0;

  function getInfo(videoId, urgent = false) {
    if (!cache.has(videoId)) {
      cache.set(videoId, new Promise((resolve, reject) => {
        queue[urgent ? 'unshift' : 'push']({ videoId, resolve, reject });
        pump();
      }).catch((err) => {
        cache.delete(videoId); // allow retry later
        throw err;
      }));
    }
    return cache.get(videoId);
  }

  function pump() {
    while (active < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      active++;
      fetchInfo(job.videoId).then(job.resolve, job.reject).finally(() => {
        active--;
        pump();
      });
    }
  }

  async function fetchInfo(videoId) {
    const cfg = window.ytcfg;
    const res = await fetch('/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: cfg.get('INNERTUBE_CONTEXT'), videoId }),
    });
    if (!res.ok) throw new Error('player ' + res.status);
    const json = await res.json();
    const mf = json.microformat?.playerMicroformatRenderer || {};
    const vd = json.videoDetails || {};
    const iso = mf.publishDate || mf.uploadDate;
    const profile = mf.ownerProfileUrl || '';
    const handle = (profile.match(/\/(@[^/?#]+)/) || [])[1] || null;
    return {
      date: iso ? new Date(iso) : null,
      author: vd.author || mf.ownerChannelName || null,
      handle: handle ? decodeURIComponent(handle) : null,
      url: handle ? '/' + handle : (vd.channelId ? '/channel/' + vd.channelId : null),
    };
  }

  // ---------- formatting ----------

  const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' });
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  function relative(date) {
    const sec = (date.getTime() - Date.now()) / 1000;
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [unit, s] of units) {
      if (Math.abs(sec) >= s) return rtf.format(Math.round(sec / s), unit);
    }
    return rtf.format(Math.round(sec), 'second');
  }

  function ageTier(date) {
    const hours = (Date.now() - date.getTime()) / 3600000;
    return AGE_TIERS.findIndex((t) => hours < t.maxAge);
  }

  function applyAge(el, date) {
    const tier = ageTier(date);
    if (tier >= 0) el.classList.add('ysi-age', 'ysi-age-' + tier);
  }

  // ---------- styles ----------

  const style = document.createElement('style');
  style.textContent = `
    .ysi-card {
      display: flex; flex-wrap: wrap; gap: 0 4px;
      margin-top: 2px;
      font-size: 1.2rem; line-height: 1.8rem;
      color: var(--yt-spec-text-secondary, #aaa);
    }
    .ysi-card a { color: inherit; text-decoration: none; }
    .ysi-card a:hover { color: var(--yt-spec-text-primary, #fff); }
    .ysi-card .ysi-sep::before { content: "·"; }
    .ysi-player {
      display: inline-flex; align-items: center; gap: 6px;
      margin: 4px 0;
      padding: 2px 8px;
      border-radius: 8px;
      background: rgba(0, 0, 0, .45);
      color: #fff;
      font-family: Roboto, Arial, sans-serif;
      font-size: 1.3rem; line-height: 2rem;
      width: fit-content;
      pointer-events: auto;
    }
    .ysi-player .ysi-rel { opacity: .75; }
    .ysi-card .ysi-age { font-weight: 500; }
    .ysi-player.ysi-age { border-left: 3px solid var(--ysi-age-dark); }
    .ysi-player.ysi-age .ysi-abs { color: var(--ysi-age-dark); font-weight: 500; }
    ${AGE_TIERS.map((t, i) => `
    .ysi-age-${i} { --ysi-age-dark: ${t.dark}; }
    .ysi-card .ysi-age-${i} { color: ${t.light}; }
    html[dark] .ysi-card .ysi-age-${i} { color: ${t.dark}; }`).join('')}
  `;
  document.head.appendChild(style);

  // ---------- grid cards ----------

  function videoIdFromCard(card) {
    const a = card.querySelector('a[href*="/shorts/"]');
    const m = a && a.getAttribute('href').match(/\/shorts\/([\w-]{11})/);
    return m ? m[1] : null;
  }

  async function decorateCard(card) {
    const id = videoIdFromCard(card);
    if (!id) return;
    const existing = card.querySelector('.ysi-card');
    if (existing && existing.dataset.vid === id) return; // already done (cards get recycled)
    existing?.remove();

    const subhead = card.querySelector('[class*="MetadataSubhead"]');
    const anchor = subhead || card.querySelector('h3');
    if (!anchor) return;

    const box = document.createElement('div');
    box.className = 'ysi-card';
    box.dataset.vid = id;
    box.textContent = '…';
    anchor.after(box);

    try {
      const info = await getInfo(id);
      if (box.dataset.vid !== videoIdFromCard(card)) return; // card was recycled meanwhile
      box.textContent = '';
      if (info.handle || info.author) {
        const who = document.createElement(info.url ? 'a' : 'span');
        who.textContent = info.handle || info.author;
        if (info.url) {
          who.href = info.url;
          who.title = info.author || '';
          who.addEventListener('click', (e) => e.stopPropagation());
        }
        box.appendChild(who);
      }
      if (info.date) {
        if (box.childNodes.length) box.appendChild(Object.assign(document.createElement('span'), { className: 'ysi-sep' }));
        const d = document.createElement('span');
        d.textContent = dateFmt.format(info.date);
        d.title = fullFmt.format(info.date) + ' (' + relative(info.date) + ')';
        applyAge(d, info.date);
        box.appendChild(d);
      }
    } catch (err) {
      box.remove();
      console.debug('[ShortsInfo]', id, err);
    }
  }

  // only fetch cards when they scroll near the viewport
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) decorateCard(e.target);
  }, { rootMargin: '400px' });

  const observed = new WeakSet();
  function scanCards() {
    for (const card of document.querySelectorAll(CARD_SEL)) {
      if (!observed.has(card)) {
        observed.add(card);
        io.observe(card);
      } else if (card.querySelector('.ysi-card')?.dataset.vid !== videoIdFromCard(card)) {
        // recycled card already on screen
        const r = card.getBoundingClientRect();
        if (r.bottom > -400 && r.top < innerHeight + 400) decorateCard(card);
      }
    }
  }

  // ---------- shorts player ----------

  function currentShortId() {
    const m = location.pathname.match(/^\/shorts\/([\w-]{11})/);
    return m ? m[1] : null;
  }

  function activeReel() {
    // the reel whose center is closest to the viewport center
    let best = null, bestDist = Infinity;
    const mid = innerHeight / 2;
    for (const r of document.querySelectorAll('ytd-reel-video-renderer')) {
      const rect = r.getBoundingClientRect();
      if (!rect.height) continue;
      const dist = Math.abs(rect.top + rect.height / 2 - mid);
      if (dist < bestDist) { best = r; bestDist = dist; }
    }
    return best;
  }

  let playerBusy = null;
  async function decoratePlayer() {
    const id = currentShortId();
    if (!id) return;
    const reel = activeReel();
    const panel = reel?.querySelector('yt-reel-metapanel-view-model');
    if (!panel) return;

    const existing = panel.querySelector('.ysi-player');
    if (existing && existing.dataset.vid === id) return;
    if (playerBusy === id) return;
    playerBusy = id;

    try {
      const info = await getInfo(id, true);
      if (currentShortId() !== id) return;
      // remove stale badges from any reel (renderers are recycled)
      document.querySelectorAll('.ysi-player').forEach((el) => el.remove());
      if (!info.date) return;
      const badge = document.createElement('div');
      badge.className = 'ysi-player';
      badge.dataset.vid = id;
      badge.title = fullFmt.format(info.date);
      applyAge(badge, info.date);
      const abs = document.createElement('span');
      abs.className = 'ysi-abs';
      abs.textContent = '📅 ' + dateFmt.format(info.date);
      const rel = document.createElement('span');
      rel.className = 'ysi-rel';
      rel.textContent = '· ' + relative(info.date);
      badge.append(abs, rel);
      // between the channel row and the title
      const titleItem = panel.querySelector('yt-shorts-video-title-view-model')?.closest('yt-reel-metapanel-view-model > *');
      if (titleItem) titleItem.before(badge); else panel.append(badge);
    } catch (err) {
      console.debug('[ShortsInfo] player', id, err);
    } finally {
      if (playerBusy === id) playerBusy = null;
    }
  }

  // ---------- wiring ----------

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scanCards();
      decoratePlayer();
    });
  }

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['href'],
  });
  window.addEventListener('yt-navigate-finish', schedule);
  // shorts swipes change the URL without much DOM churn; check periodically too
  setInterval(decoratePlayer, 1000);
  schedule();
})();
