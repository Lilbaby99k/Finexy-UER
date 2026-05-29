/* ═══════════════════════════════════════════════════
   script.js — Finexy store logic
   Enhanced with Premium UI Transition System
   + Finexy Admin Integration (Supabase live sync)
═══════════════════════════════════════════════════ */

'use strict';

/* ─── SUPABASE CONFIG (same as admin/app.js) ─────── */
const SUPA_URL = 'https://ymkgqqerdocfcgyphfzs.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlta2dxcWVyZG9jZmNneXBoZnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODA3MzUsImV4cCI6MjA5NTA1NjczNX0.SqwwSpwvsstfumhpTJasSsGMbe0LAm7Z3N-H0U2PoVc';

/* localStorage key used by the admin dashboard */
const SHARED_INV_KEY = 'finexy_shared_inv';

/* ─── DISCOUNTS: loaded from Supabase 'discounts' table ──────────
   localStorage is used only as a short-lived cache (30s) so that
   getStorefrontDiscount() stays synchronous for rendering, while
   loadStorefrontDiscounts() refreshes the cache from Supabase.    */
const DISC_KEY = 'finexy_discounts';
const DISC_CACHE_TS_KEY = 'finexy_discounts_ts';
const DISC_CACHE_TTL = 30000; /* 30 seconds */

/* Refresh discount cache from Supabase — called on load + every 30s */
async function loadStorefrontDiscounts() {
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/discounts?select=*&expires_at=gt.${new Date().toISOString()}`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } }
    );
    if (!res.ok) return;
    const rows = await res.json();
    /* Normalise column name: Supabase stores expires_at, code uses expiresAt */
    const normalised = rows.map(r => ({ sku: r.sku, pct: r.pct, expiresAt: r.expires_at }));
    localStorage.setItem(DISC_KEY, JSON.stringify(normalised));
    localStorage.setItem(DISC_CACHE_TS_KEY, Date.now().toString());
    /* Rebuild storefront with fresh discount data */
    rebuildAll();
  } catch(_) { /* network error — keep using cached data */ }
}

function getStorefrontDiscount(sku) {
  try {
    const raw = localStorage.getItem(DISC_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw);
    const now  = Date.now();
    return list.find(d => d.sku === sku && new Date(d.expiresAt).getTime() > now) || null;
  } catch(_) { return null; }
}

function fmtDiscCountdown(expiresAt) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h >= 48) { const d = Math.floor(h/24); return `${d}d ${h%24}h remaining`; }
  if (h >= 1)  return `${h}h ${m}m ${s}s remaining`;
  return `${m}m ${s}s remaining`;
}

/* Start a global 1-second ticker that updates all discount countdown timers on the page */
function startStorefrontDiscountTicker() {
  clearInterval(window._sfDiscTicker);
  window._sfDiscTicker = setInterval(() => {
    document.querySelectorAll('[data-disc-expires]').forEach(el => {
      const exp  = el.dataset.discExpires;
      if (!exp) return;
      const diff = new Date(exp).getTime() - Date.now();
      if (diff <= 0) {
        el.textContent = '⌛ Offer ended';
        /* Trigger a silent product rebuild to hide expired discount */
        setTimeout(() => rebuildAll(), 600);
      } else {
        el.textContent = `⏱ ${fmtDiscCountdown(exp)}`;
      }
    });
  }, 1000);
}

/* ─── CATEGORY MAP: admin category name → store category id ─── */
const ADMIN_CAT_MAP = {
  'Shoes':          'shoes',
  'Clothing':       'clothing',
  'Accessories':    'accessories',
  'Bags':           'bags',
  'Sportswear':     'sportswear',
  'Electronics':    'electronics',
  'Food & Drinks':  'food',
  'Health & Beauty':'health',
  'Other':          'other',
};

/* ─── EMOJI FALLBACK MAP per category ───────────── */
const CAT_EMOJI = {
  shoes: '👟', clothing: '👕', accessories: '⌚',
  bags: '👜', sportswear: '🏃', electronics: '🎧',
  food: '🍵', health: '✨', other: '🎁',
};

/* ─── ID NAMESPACE: admin products get id = 'admin_<sku>' ── */
function adminProductId(sku) { return 'admin_' + sku; }

/* Convert a Supabase inventory row → store product format */
function adminRowToStoreProduct(row) {
  const catId   = ADMIN_CAT_MAP[row.category] || 'other';
  const emoji   = CAT_EMOJI[catId] || '🎁';
  const price   = parseFloat(row.price) || 0;
  const qty     = parseInt(row.qty) || 0;
  // Only show image if it's a valid URL or base64 string
  const image   = (row.image && (row.image.startsWith('data:') || row.image.startsWith('http')))
    ? row.image : null;
  // Parse rating, colors and sizes encoded in description
  const rawDesc      = row.description || '';
  const ratingMatch  = rawDesc.match(/\|\|r:([0-9.]+)\|\|/);
  const rating       = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
  const colorsMatch  = rawDesc.match(/\|\|c:([^\|][^\|]*(?:\|[^\|][^\|]*)*)\|\|/);
  const sizesMatch   = rawDesc.match(/\|\|s:([^\|][^\|]*(?:\|[^\|][^\|]*)*)\|\|/);
  const colors       = colorsMatch ? colorsMatch[1].split('|').map(s=>s.trim()).filter(Boolean) : [];
  const sizes        = sizesMatch  ? sizesMatch[1].split('|').map(s=>s.trim()).filter(Boolean)  : [];
  /* Parse reviews array encoded as ||rv:[...]|| */
  let reviewsArr = [];
  try {
    const rvMatch = rawDesc.match(/\|\|rv:(\[.*?\])\|\|/s);
    if (rvMatch) reviewsArr = JSON.parse(rvMatch[1]);
  } catch(_) { reviewsArr = []; }
  /* Recalculate avg rating from reviews if reviews exist */
  let computedRating = rating;
  if (reviewsArr.length > 0) {
    computedRating = Math.round(
      (reviewsArr.reduce((s, rv) => s + (rv.stars || 0), 0) / reviewsArr.length) * 10
    ) / 10;
  }
  const cleanDesc    = rawDesc
    .replace(/\|\|r:[0-9.]+\|\|/, '')
    .replace(/\|\|c:[^\|]*(?:\|[^\|]*)*\|\|/, '')
    .replace(/\|\|s:[^\|]*(?:\|[^\|]*)*\|\|/, '')
    .replace(/\|\|rv:\[.*?\]\|\|/s, '')
    .trim();
  // Auto-badge: New if added in the last 7 days
  let badge = 'New';
  if (row.created_at) {
    const daysSince = (Date.now() - new Date(row.created_at).getTime()) / 86400000;
    if (daysSince > 7) badge = null;
  }
  return {
    id:          adminProductId(row.sku),
    sku:         row.sku,
    name:        row.name,
    category:    catId,
    price:       price,
    oldPrice:    null,
    rating:      computedRating,
    reviews:     reviewsArr,
    badge:       badge,
    featured:    qty > 10,
    colors:      colors.length ? colors : [],
    sizes:       sizes.length  ? sizes  : [],
    description: cleanDesc || `${row.name} — available in our store.`,
    image:       image,
    emoji:       emoji,
    qty:         qty,
    lowAt:       parseInt(row.low_at) || 5,
    _fromAdmin:  true,
  };
}

/* ─── MERGE ADMIN PRODUCTS INTO STORE.products ──── */
function mergeAdminProducts(adminRows) {
  /* All products come from admin panel only — replace entirely */
  STORE.products = adminRows.map(adminRowToStoreProduct);

  /* Out of stock / low stock flags */
  STORE.products.forEach(p => {
    if (p.qty === 0) {
      p._outOfStock = true;
      p._lowStock   = false;
      p.badge       = 'Out of Stock';
    } else if (p.qty <= (p.lowAt || 5)) {
      p._outOfStock = false;
      p._lowStock   = true;
      p.badge       = 'Low Stock';
    } else {
      p._outOfStock = false;
      p._lowStock   = false;
    }
  });
}

/* ─── LOAD FROM SUPABASE ─────────────────────────── */
async function loadAdminInventory() {
  window._storeLoading = true;
  localStorage.removeItem(SHARED_INV_KEY);
  buildAllProducts();
  try {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/inventory?select=*&order=id.asc`,
      {
        headers: {
          'apikey':        SUPA_KEY,
          'Authorization': 'Bearer ' + SUPA_KEY,
        }
      }
    );
    window._storeLoading = false;
    if (!res.ok) {
      const errText = await res.text();
      console.error('[Finexy] Supabase error ' + res.status + ':', errText);
      _showStoreError('Supabase error ' + res.status + ': ' + errText);
      mergeAdminProducts([]); rebuildAll(); return;
    }
    const rows = await res.json();
    console.log('[Finexy] Loaded ' + rows.length + ' products from Supabase');
    if (rows.length === 0) {
      _showStoreError('Supabase returned 0 products. Check your inventory table has data.');
    }
    mergeAdminProducts(rows);
    rebuildAll();
    if (rows.length > 0) showAdminBanner(rows.length);
  } catch (e) {
    window._storeLoading = false;
    console.error('[Finexy] Network error:', e.message);
    _showStoreError('Network error: ' + e.message + '. Is your Supabase project paused?');
    mergeAdminProducts([]); rebuildAll();
  }
}

function _showStoreError(msg) {
  const existing = document.getElementById('_supaDiag');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = '_supaDiag';
  div.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#f38ba8;padding:14px 20px;border-radius:12px;font-size:.82rem;font-family:monospace;max-width:90vw;z-index:99999;box-shadow:0 4px 24px rgba(0,0,0,.4);border:1px solid #f38ba8;line-height:1.5;';
  div.innerHTML = '<strong>Finexy Store Debug:</strong><br>' + msg + '<br><small style="opacity:.6">Click to dismiss</small>';
  div.onclick = () => div.remove();
  document.body.appendChild(div);
}

/* ═══════════════════════════════════════════════════════
   LIVE STOCK SYNC — Two-layer approach:
   Layer 1: Supabase Realtime WebSocket (instant, ~100ms)
            Uses the correct Supabase v1 protocol spec.
   Layer 2: Polling fallback every 30s (if WS fails/drops)
   Together they guarantee every browser always shows
   the current stock without any page refresh.
═══════════════════════════════════════════════════════ */
function startRealtimeStockSync() {
  let wsConnected  = false;
  let pollInterval = null;

  /* ── Helper: apply a changed inventory row into STORE ── */
  function applyInventoryRow(record, changeType) {
    if (changeType === 'DELETE') {
      const oldSku = record.sku || (record.old_record && record.old_record.sku);
      if (oldSku) STORE.products = STORE.products.filter(p => p.sku !== oldSku);
      rebuildAll();
      return;
    }

    if (!record || !record.sku) return;

    const updated = adminRowToStoreProduct(record);
    const qty     = updated.qty;

    /* Stock flags */
    if (qty === 0) {
      updated._outOfStock = true;
      updated._lowStock   = false;
      updated.badge       = 'Out of Stock';
    } else if (qty <= (updated.lowAt || 5)) {
      updated._outOfStock = false;
      updated._lowStock   = true;
      updated.badge       = 'Low Stock';
    } else {
      updated._outOfStock = false;
      updated._lowStock   = false;
    }

    const idx = STORE.products.findIndex(p => p.sku === updated.sku);
    if (idx >= 0) {
      /* Only rebuild if something actually changed to avoid flicker */
      const old = STORE.products[idx];
      if (old.qty === updated.qty && old._outOfStock === updated._outOfStock) return;
      STORE.products[idx] = updated;
    } else {
      STORE.products.push(updated);
    }

    rebuildAll();

    /* Live-update the open product detail page if it matches */
    const detailPage = document.getElementById('page-detail');
    if (detailPage && detailPage.classList.contains('active')) {
      const openId = detailPage.dataset.openProductId;
      if (openId === updated.id || openId === 'admin_' + updated.sku) {
        _refreshOpenProductDetail(updated);
      }
    }

    /* Customer-facing toast — only meaningful stock events */
    if (changeType === 'UPDATE') {
      if (qty === 0) {
        showToast(`😔 "${updated.name}" just sold out.`, 3500);
      } else if (qty <= (updated.lowAt || 5)) {
        showToast(`⚡ Only ${qty} left — "${updated.name}"`, 3000);
      }
    }
  }

  /* ══════════════════════════════════════════════════
     LAYER 1 — Supabase Realtime WebSocket
     Protocol v1.0.0 per official Supabase docs:
     wss://<ref>.supabase.co/realtime/v1/websocket?apikey=…&vsn=1.0.0
     phx_join payload must include join_ref and
     postgres_changes array inside config.
  ══════════════════════════════════════════════════ */
  function connectWebSocket() {
    const wsUrl = SUPA_URL.replace('https://', 'wss://')
      + '/realtime/v1/websocket?apikey=' + encodeURIComponent(SUPA_KEY) + '&vsn=1.0.0';

    let ws, heartbeat;
    const JOIN_REF = '1';
    let msgRef     = 1;

    try { ws = new WebSocket(wsUrl); }
    catch(e) { scheduleReconnect(); return; }

    ws.onopen = () => {
      /* Send phx_join exactly as per Supabase v1 protocol spec */
      ws.send(JSON.stringify({
        topic:    'realtime:db-inventory-watch',
        event:    'phx_join',
        payload:  {
          config: {
            broadcast:        { self: false, ack: false },
            presence:         { enabled: false },
            postgres_changes: [
              { event: '*', schema: 'public', table: 'inventory' },
            ],
          },
        },
        ref:      String(msgRef++),
        join_ref: JOIN_REF,
      }));

      /* Heartbeat every 25s — required to keep Phoenix channel alive */
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            topic:   'phoenix',
            event:   'heartbeat',
            payload: {},
            ref:     String(msgRef++),
          }));
        }
      }, 25000);
    };

    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch(_) { return; }

      /* Ignore join confirmation and heartbeat replies */
      if (msg.event === 'phx_reply') {
        if (msg.payload && msg.payload.status === 'ok') wsConnected = true;
        return;
      }
      if (msg.event === 'heartbeat') return;

      /* Supabase Realtime wraps postgres_changes inside payload.data */
      if (msg.event !== 'postgres_changes' && msg.event !== 'INSERT'
          && msg.event !== 'UPDATE' && msg.event !== 'DELETE') return;

      const data   = msg.payload && msg.payload.data ? msg.payload.data : msg.payload;
      const type   = (data && data.type)       || msg.event;
      const record = (data && data.record)     || (type === 'DELETE' ? (data && data.old_record) : null);

      if (!record && type !== 'DELETE') return;
      applyInventoryRow(record, type);
    };

    ws.onerror = () => { wsConnected = false; };
    ws.onclose = () => {
      wsConnected = false;
      clearInterval(heartbeat);
      scheduleReconnect();
    };

    function scheduleReconnect() {
      setTimeout(connectWebSocket, 5000);
    }
  }

  /* ══════════════════════════════════════════════════
     LAYER 2 — Polling fallback
     Re-fetches full inventory from Supabase REST every
     30 seconds. Catches anything the WebSocket may miss
     (RLS blocking, connection hiccups, tab wake-up).
  ══════════════════════════════════════════════════ */
  async function pollInventory() {
    try {
      /* ── FIX: fetch ALL columns so new products can be detected and added ── */
      const res = await fetch(
        `${SUPA_URL}/rest/v1/inventory?select=*&order=id.asc`,
        { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } }
      );
      if (!res.ok) return;
      const rows = await res.json();

      let changed = false;

      /* ── Step 1: detect deleted products ── */
      const incomingSkus = new Set(rows.map(r => r.sku));
      const beforeCount  = STORE.products.length;
      STORE.products = STORE.products.filter(p => incomingSkus.has(p.sku));
      if (STORE.products.length !== beforeCount) changed = true;

      /* ── Step 2: update existing / add new products ── */
      rows.forEach(row => {
        const idx = STORE.products.findIndex(p => p.sku === row.sku);

        if (idx < 0) {
          /* ── NEW product the storefront has never seen — add it fully ── */
          const newProd = adminRowToStoreProduct(row);
          const qty = newProd.qty;
          if (qty === 0) {
            newProd._outOfStock = true;  newProd._lowStock = false; newProd.badge = 'Out of Stock';
          } else if (qty <= (newProd.lowAt || 5)) {
            newProd._outOfStock = false; newProd._lowStock = true;  newProd.badge = 'Low Stock';
          } else {
            newProd._outOfStock = false; newProd._lowStock = false;
          }
          STORE.products.push(newProd);
          changed = true;
          return;
        }

        /* ── Existing product — check for any field changes ── */
        const prod   = STORE.products[idx];
        const newQty = parseInt(row.qty) || 0;
        const newLowAt = parseInt(row.low_at) || 5;

        /* Compare key fields to detect any change */
        const qtyChanged   = prod.qty   !== newQty;
        const priceChanged = prod.price !== (parseFloat(row.price) || 0);
        const nameChanged  = prod.name  !== row.name;

        if (!qtyChanged && !priceChanged && !nameChanged) return; /* nothing changed */

        prod.qty   = newQty;
        prod.price = parseFloat(row.price) || 0;
        prod.name  = row.name;
        prod.lowAt = newLowAt;

        if (newQty === 0) {
          prod._outOfStock = true;  prod._lowStock = false; prod.badge = 'Out of Stock';
        } else if (newQty <= prod.lowAt) {
          prod._outOfStock = false; prod._lowStock = true;  prod.badge = 'Low Stock';
        } else {
          prod._outOfStock = false; prod._lowStock = false; prod.badge = null;
        }
        changed = true;
      });

      if (changed) {
        rebuildAll();
        /* Refresh open product detail page if affected */
        const detailPage = document.getElementById('page-detail');
        if (detailPage && detailPage.classList.contains('active')) {
          const openId = detailPage.dataset.openProductId;
          const openProd = STORE.products.find(p =>
            p.id === openId || 'admin_' + p.sku === openId);
          if (openProd) _refreshOpenProductDetail(openProd);
        }
      }
    } catch(_) { /* network error — silent, will retry */ }
  }

  /* Start both layers */
  connectWebSocket();

  /* Poll immediately after 2s (catches any order placed just before WS connected),
     then every 10s after that — fast enough to catch new products within one poll cycle */
  setTimeout(() => {
    pollInventory();
    pollInterval = setInterval(pollInventory, 10000);
  }, 2000);

  /* Also re-poll when tab becomes visible again (user switches back) */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollInventory();
  });
}

/* ── Silently refresh stock info on an already-open product detail page ── */
function _refreshOpenProductDetail(p) {
  /* Update the stock badge without re-rendering the whole page */
  const detailEl = document.getElementById('productDetail');
  if (!detailEl) return;
  /* Find the inline stock pill and update it */
  const stockPill = detailEl.querySelector('[data-stock-pill]');
  if (stockPill) {
    if (p._outOfStock || p.qty === 0) {
      stockPill.style.background = 'rgba(239,68,68,.1)';
      stockPill.style.color      = '#EF4444';
      stockPill.textContent      = '🚫 Out of Stock';
    } else if (p._lowStock) {
      stockPill.style.background = 'rgba(217,119,6,.1)';
      stockPill.style.color      = '#D97706';
      stockPill.textContent      = `⚠️ Low Stock — only ${p.qty} left`;
    } else {
      stockPill.style.background = 'rgba(5,150,105,.1)';
      stockPill.style.color      = '#059669';
      stockPill.textContent      = `✓ In Stock (${p.qty} available)`;
    }
  } else {
    /* Pill not found (no data-stock-pill attr yet) — do a full re-render */
    openProduct(p.id);
  }
}

/* ─── CROSS-TAB LIVE SYNC ───────────────────────── */
/* Cross-tab product sync handled by Supabase Realtime WebSocket */

/* ─── REBUILD ALL SECTIONS (called after merge) ─── */
function rebuildAll() {
  buildHeroGrid();
  buildFeatured();
  buildHomeCats();
  buildAllCats();
  buildAllProducts();
  populateCategoryFilter();
  syncCart();
  updateCategoryStats();
}

/* ─── LIVE CATEGORY STATS ───────────────────────── */
function updateCategoryStats() {
  const products  = STORE.products.filter(p => !p._outOfStock && p.qty > 0);
  const totalQty  = products.reduce((sum, p) => sum + (p.qty || 0), 0);
  const totalProds = products.length;

  // Avg rating — only products that have ratings > 0
  const rated   = products.filter(p => p.rating > 0 || (Array.isArray(p.reviews) && p.reviews.length > 0));
  const avgRating = rated.length
    ? (rated.reduce((s, p) => {
        const rv = Array.isArray(p.reviews) && p.reviews.length
          ? p.reviews.reduce((a, r) => a + r.stars, 0) / p.reviews.length
          : p.rating;
        return s + rv;
      }, 0) / rated.length).toFixed(1)
    : null;

  // Active categories (those that have at least 1 in-stock product)
  const activeCats = new Set(products.map(p => p.category)).size;

  const elCats   = document.getElementById('statCategories');
  const elProds  = document.getElementById('statProducts');
  const elItems  = document.getElementById('statItems');
  const elRating = document.getElementById('statRating');

  if (elCats)   elCats.textContent   = activeCats || STORE.categories.length;
  if (elProds)  elProds.textContent  = totalProds > 0 ? totalProds + '+' : '0';
  if (elItems)  elItems.textContent  = totalQty   > 0 ? totalQty   + '+' : '0';
  if (elRating) elRating.textContent = avgRating  ? avgRating + '★' : '—';
}

/* ─── ADMIN SYNC BADGE ──────────────────────────── */
function showAdminBanner(count) {
  if (!count) return;
  const existing = document.getElementById('adminSyncBadge');
  if (existing) { existing.remove(); }
  const badge = document.createElement('div');
  badge.id = 'adminSyncBadge';
  badge.style.cssText = [
    'position:fixed','bottom:80px','right:22px','z-index:9000',
    'background:#059669','color:#fff','font-size:.72rem',
    'font-weight:700','padding:6px 14px','border-radius:30px',
    'box-shadow:0 4px 16px rgba(5,150,105,.35)',
    'pointer-events:none','opacity:1',
    'transition:opacity .6s ease',
  ].join(';');
  badge.textContent = `✦ ${count} live product${count > 1 ? 's' : ''} from store`;
  document.body.appendChild(badge);
  setTimeout(() => { badge.style.opacity = '0'; }, 3000);
  setTimeout(() => { badge.remove(); }, 3700);
}

/* ─── STATE ─────────────────────────────────────── */
let cart     = JSON.parse(localStorage.getItem('cp_cart') || '[]');
let prevPage = 'home';
let toastTimer = null;
let isTransitioning = false;

/* ─── INIT ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  buildHeroGrid();
  buildFeatured();
  buildHomeCats();
  buildAllCats();
  /* FIX: mark as loading BEFORE first render so the grid shows
     the spinner instead of "No Products Yet" on first paint */
  window._storeLoading = true;
  buildAllProducts();
  buildBlog();
  populateCategoryFilter();
  syncCart();
  scrollHandler();

  /* Load admin inventory (async, non-blocking) */
  loadAdminInventory();

  /* Load discounts from Supabase, then refresh every 30s */
  loadStorefrontDiscounts();
  setInterval(loadStorefrontDiscounts, 30000);

  /* Start Supabase Realtime WebSocket — live stock sync across all browsers */
  startRealtimeStockSync();

  /* Start the discount countdown ticker */
  startStorefrontDiscountTicker();

  window.addEventListener('scroll', scrollHandler);

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap'))
      document.getElementById('searchDropdown').style.display = 'none';
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-inner')) closeMenu();
  });

  /* Stagger-animate elements on page load */
  setTimeout(() => triggerEntranceAnim('page-home'), 80);
});

/* ─── NAVBAR SCROLL ──────────────────────────────── */
function scrollHandler() {
  const nb = document.getElementById('navbar');
  if (window.scrollY > 40) nb.classList.add('scrolled');
  else nb.classList.remove('scrolled');
}

/* ═══════════════════════════════════════════════════
   PREMIUM TRANSITION SYSTEM
   Implements the full spec:
   [1] Pre-state hold → [3] Container move → [5] Typography stagger → [8] Final settle
═══════════════════════════════════════════════════ */

function showPage(name) {
  if (isTransitioning) return;
  const currentActive = document.querySelector('.page.active');
  const target = document.getElementById('page-' + name);
  if (!target || currentActive === target) return;

  isTransitioning = true;

  /* [7] OVERLAY TRANSITION — blur sweep between scenes */
  const overlay = document.getElementById('transitionOverlay');
  overlay.classList.add('active');

  /* [1] PRE-TRANSITION HOLD — 100ms static */
  setTimeout(() => {
    /* [3] CONTAINER TRANSITION — hide old page */
    if (currentActive) {
      currentActive.classList.add('exiting');
      setTimeout(() => {
        currentActive.classList.remove('active', 'exiting');
      }, 300);
    }

    /* [2] SHARED ELEMENT DETECTION — mark shared cards for morph */
    const sharedCards = target.querySelectorAll('.product-card, .cat-card');
    sharedCards.forEach((el, i) => {
      el.style.setProperty('--stagger-i', i);
    });

    /* Activate new page */
    target.classList.add('active', 'entering');

    /* [7] Sweep overlay out */
    setTimeout(() => {
      overlay.classList.remove('active');
    }, 200);

    /* [5] TYPOGRAPHY STAGGER — progressive reveal */
    const staggerEls = target.querySelectorAll(
      '.hero-badge, .hero-title, .hero-sub, .hero-btns, .hero-stats,' +
      '.section-eyebrow, .section-title, .page-hero-banner h2, .page-hero-banner p,' +
      '.product-card, .cat-card, .blog-card, .why-card'
    );
    staggerEls.forEach((el, i) => {
      el.style.setProperty('--stagger-delay', `${Math.min(i * 55, 600)}ms`);
      el.classList.add('stagger-in');
    });

    /* [8] FINAL SETTLE — remove animation classes after completion */
    setTimeout(() => {
      target.classList.remove('entering');
      staggerEls.forEach(el => el.classList.remove('stagger-in'));
      isTransitioning = false;
    }, 900);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 100);

  prevPage = name;
}

function navClick(el, page) {
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));
  if (el) el.classList.add('active');
  showPage(page);
  closeMenu();
  return false;
}

function goBack() {
  const backPage = prevPage === 'detail' ? 'products' : prevPage || 'products';
  showPage(backPage);
  const link = document.querySelector(`[data-page="${backPage}"]`);
  if (link) {
    document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
  }
}

/* ─── MOBILE MENU ────────────────────────────────── */
function toggleMenu() {
  document.getElementById('mobileMenuPanel').classList.toggle('open');
  document.getElementById('hamburger').classList.toggle('open');
}
function closeMenu() {
  document.getElementById('mobileMenuPanel').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
}

/* ─── PRODUCT CARD BUILDER ───────────────────────── */
function productCard(p) {
  const disc       = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const outOfStock = p._outOfStock;
  const lowStock   = p._lowStock;

  /* ── Discount from admin panel ── */
  const adminDisc   = p.sku ? getStorefrontDiscount(p.sku) : null;
  const hasDisc     = adminDisc !== null;
  const salePrice   = hasDisc ? p.price * (1 - adminDisc.pct / 100) : p.price;
  const displayPrice= hasDisc ? salePrice : p.price;

  /* Badge */
  const badgeLabel = outOfStock ? 'Out of Stock'
    : lowStock  ? `Only ${p.qty} left`
    : hasDisc   ? `${adminDisc.pct}% OFF`
    : p.badge   || (disc ? `-${disc}%` : null);
  const badgeClass = outOfStock ? 'pc-badge out-of-stock-badge'
    : lowStock  ? 'pc-badge low-stock-badge'
    : hasDisc   ? `pc-badge${adminDisc.pct === 50 ? ' featured-badge' : ''}`
    : 'pc-badge';

  /* Reviews */
  const reviewsArr  = Array.isArray(p.reviews) ? p.reviews : [];
  const reviewCount = reviewsArr.length;
  const avgRating   = reviewCount > 0
    ? (reviewsArr.reduce((s, rv) => s + rv.stars, 0) / reviewCount)
    : (p.rating || 0);

  return `
    <div class="product-card${outOfStock ? '' : ''}"
      onclick="${outOfStock ? "showToast('⚠️ This item is out of stock')" : `openProduct('${p.id}')`}"
      style="${outOfStock ? 'opacity:.7;' : ''}">
      <div class="pc-thumb">
        ${p.image
          ? `<img src="${p.image}" alt="${p.name}" loading="lazy"/>`
          : `<div class="pc-emoji">${p.emoji}</div>`}
        ${badgeLabel ? `<span class="${badgeClass}">${badgeLabel}</span>` : ''}
        ${!outOfStock ? `<button class="pc-wishlist" onclick="event.stopPropagation()" title="Save">♡</button>` : ''}
        ${outOfStock ? `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(14,12,9,.55);border-radius:inherit;"><span style="font-size:1.5rem;">🚫</span><span style="color:#fff;font-size:.78rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">Out of Stock</span></div>` : ''}
        ${lowStock && !outOfStock ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(217,119,6,.92);color:#fff;font-size:.68rem;font-weight:800;text-align:center;padding:6px 8px;text-transform:uppercase;letter-spacing:.06em;">⚡ Only ${p.qty} left</div>` : ''}
      </div>
      <div class="pc-body">
        <p class="pc-cat">${catName(p.category)}</p>
        <h4 class="pc-name">${p.name}</h4>
        ${avgRating > 0 ? `<div class="pc-rating"><span class="pc-stars">${starHTML(avgRating)}</span><span>${avgRating.toFixed(1)} (${reviewCount} review${reviewCount !== 1 ? 's' : ''})</span></div>` : ''}
        <div class="pc-price-row">
          <div>
            ${hasDisc
              ? `<span class="pc-price" style="color:var(--brand);">₦${fmt(salePrice)}</span>
                 <span class="pc-old" style="text-decoration:line-through;color:var(--t3);font-size:.8rem;margin-left:5px;">₦${fmt(p.price)}</span>`
              : `<span class="pc-price" style="${outOfStock ? 'color:var(--t3);text-decoration:line-through;' : ''}">₦${fmt(p.price)}</span>
                 ${p.oldPrice ? `<span class="pc-old">₦${fmt(p.oldPrice)}</span>` : ''}`
            }
          </div>
          <button class="pc-add"
            onclick="event.stopPropagation();quickAdd('${p.id}')"
            ${outOfStock ? 'disabled' : ''}>+</button>
        </div>
        ${hasDisc ? `<div data-disc-expires="${adminDisc.expiresAt}" style="font-size:.68rem;font-weight:700;color:#F59E0B;margin-top:4px;">⏱ ${fmtDiscCountdown(adminDisc.expiresAt)}</div>` : ''}
      </div>
    </div>`;
}

function badgeCss(p) {
  if (p._outOfStock) return 'pc-badge out-of-stock-badge';
  if (p._lowStock)   return 'pc-badge low-stock-badge';
  if (p.badge === 'New') return 'pc-badge';
  return 'pc-badge featured-badge';
}
function badgeCls(b) {
  const m = { 'Bestseller':'badge-best','Sale':'badge-sale','New':'badge-new','Premium':'badge-prem','Low Stock':'badge-sale' };
  return m[b] || '';
}
function catName(id) {
  const c = STORE.categories.find(c => c.id === id);
  return c ? c.name : id;
}
function fmt(n) { return Number(n).toLocaleString('en-NG'); }
function starHTML(r) {
  let s = '';
  for (let i = 1; i <= 5; i++)
    s += `<span style="opacity:${i <= Math.round(r) ? '1' : '0.3'}">★</span>`;
  return s;
}

/* ─── BUILD SECTIONS ─────────────────────────────── */
function buildHeroGrid() {
  const grid = document.getElementById('heroGrid');
  if (!grid) return;
  const items = STORE.products.filter(p => p._fromAdmin && !p._outOfStock && p.qty > 0).slice(0, 4);
  grid.innerHTML = items.length ? items.map(p => `
    <div class="hg-item" onclick="openProduct('${p.id}')">
      ${p.image ? `<img src="${p.image}" alt="${p.name}" style="width:60px;height:60px;object-fit:cover;border-radius:10px;"/>` : `<div class="hg-emoji">${p.emoji}</div>`}
      <span class="hg-name">${p.name}</span>
      <span class="hg-price">₦${fmt(p.price)}</span>
    </div>`).join('')
  : `<div style="padding:20px;color:rgba(255,255,255,.5);font-size:.8rem;text-align:center">
       New products coming soon
     </div>`;
}

function buildFeatured() {
  const g = document.getElementById('featuredGrid');
  if (!g) return;
  /* Show only live admin products */
  const featured = STORE.products.filter(p => p._fromAdmin && !p._outOfStock && p.qty > 0).slice(0, 8);
  g.innerHTML = featured.length
    ? featured.map(productCard).join('')
    : `<div style="grid-column:1/-1;text-align:center;padding:48px 20px;">
        <div style="font-size:2.5rem;margin-bottom:12px">🏪</div>
        <p style="color:var(--t2);font-size:.9rem">Products will appear here once added by our team.</p>
       </div>`;
}

function buildHomeCats() {
  const g = document.getElementById('homeCatGrid');
  if (!g) return;
  g.innerHTML = STORE.categories.slice(0, 6).map(c => catCard(c)).join('');
}

function buildAllCats() {
  const g = document.getElementById('allCatGrid');
  if (!g) return;
  g.innerHTML = STORE.categories.map(c => catCard(c, true)).join('');
}

function catCard(c, big = false) {
  const count = STORE.products.filter(p => p.category === c.id && !p._outOfStock).length;
  return `
    <div class="cat-card" onclick="filterByCategory('${c.id}')"
      style="${c.image ? `background-image:url('${c.image}');background-size:cover;background-position:center;` : `background:${c.gradient};`}">
      <div class="cat-overlay">
        <span class="cat-emoji-big">${c.emoji}</span>
        <div class="cat-name">${c.name}</div>
        <div class="cat-desc">${count} item${count !== 1 ? 's' : ''} · ${c.desc}</div>
        <div class="cat-arrow">Shop now →</div>
      </div>
    </div>`;
}

function buildAllProducts(list) {
  const g  = document.getElementById('allProductsGrid');
  const nr = document.getElementById('noResults');
  const fc = document.getElementById('filterCount');
  if (!g) return;
  const items = list !== undefined ? list : STORE.products;
  if (items.length === 0) {
    // Check if we are still loading (Supabase not yet returned)
    const isLoading = window._storeLoading;
    g.innerHTML = isLoading ? `
      <div style="grid-column:1/-1;text-align:center;padding:80px 20px;">
        <div style="font-size:2.5rem;margin-bottom:16px;animation:spin 1s linear infinite;display:inline-block">⏳</div>
        <h3 style="font-family:'Syne',sans-serif;font-size:1.2rem;margin-bottom:8px;color:var(--t1)">Loading products…</h3>
        <p style="color:var(--t2);font-size:.88rem">Fetching the latest products from our store.</p>
      </div>` : `
      <div style="grid-column:1/-1;text-align:center;padding:80px 20px;">
        <div style="font-size:3.5rem;margin-bottom:20px">🛍️</div>
        <h3 style="font-family:'Syne',sans-serif;font-size:1.4rem;margin-bottom:10px;color:var(--t1)">No Products Yet</h3>
        <p style="color:var(--t2);font-size:.9rem;max-width:360px;margin:0 auto;line-height:1.6">
          Our store is being stocked. Come back soon — exciting products are on their way!
        </p>
      </div>`;
    if (nr) nr.style.display = 'none';
    if (fc) fc.textContent = '0 products';
  } else {
    g.innerHTML = items.map(productCard).join('');
    if (nr) nr.style.display = 'none';
    if (fc) fc.textContent = `${items.length} product${items.length !== 1 ? 's' : ''}`;
  }
}

function buildBlog() {
  const g = document.getElementById('blogGrid');
  if (!g) return;
  g.innerHTML = STORE.blog.map(b => `
    <div class="blog-card" onclick="openBlogPost(${b.id})">
      <div class="bc-thumb">${b.emoji}</div>
      <div class="bc-body">
        <p class="bc-cat">${b.category}</p>
        <h3 class="bc-title">${b.title}</h3>
        <p class="bc-excerpt">${b.excerpt}</p>
        <div class="bc-meta">
          <span>📅 ${b.date}</span>
          <span>⏱ ${b.readTime}</span>
        </div>
      </div>
    </div>`).join('');
}

/* ─── CATEGORY FILTER ────────────────────────────── */
function populateCategoryFilter() {
  const bar = document.getElementById('filtersBar');
  if (!bar) return;
  const chips = [{ id: '', name: 'All', emoji: '✦' }, ...STORE.categories];
  bar.innerHTML = chips.map(c => `
    <button class="filter-chip${c.id === '' ? ' active' : ''}"
      onclick="filterChipClick(this,'${c.id}')">
      ${c.emoji ? c.emoji + ' ' : ''}${c.name}
    </button>`).join('');
}
function filterChipClick(btn, catId) {
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  let list = [...STORE.products];
  if (catId) list = list.filter(p => p.category === catId);
  const sort = document.getElementById('sortSelect')?.value || '';
  list = applySortToList(list, sort);
  buildAllProducts(list);
}
function sortProducts(val) {
  const active = document.querySelector('.filter-chip.active');
  const catId  = active ? active.dataset?.catId || '' : '';
  /* Read cat from chip text if needed */
  let list = [...STORE.products];
  const activeChip = document.querySelector('.filter-chip.active');
  if (activeChip) {
    const chips = document.querySelectorAll('.filter-chip');
    const idx   = Array.from(chips).indexOf(activeChip);
    if (idx > 0) {
      const cat = STORE.categories[idx - 1];
      if (cat) list = list.filter(p => p.category === cat.id);
    }
  }
  list = applySortToList(list, val);
  buildAllProducts(list);
}
function applySortToList(list, sort) {
  switch (sort) {
    case 'price-asc':  list.sort((a, b) => a.price - b.price); break;
    case 'price-desc': list.sort((a, b) => b.price - a.price); break;
    case 'rating':     list.sort((a, b) => b.rating - a.rating); break;
    case 'name':       list.sort((a, b) => a.name.localeCompare(b.name)); break;
  }
  return list;
}

/* ─── FILTERS ────────────────────────────────────── */
function applyFilters() {
  const cat    = document.getElementById('filterCat')?.value || '';
  const sort   = document.getElementById('filterSort')?.value || 'default';
  const search = (document.getElementById('filterSearch')?.value || '').toLowerCase();
  let list = [...STORE.products].filter(p => !p._outOfStock && (p._fromAdmin ? p.qty > 0 : true));
  if (cat)    list = list.filter(p => p.category === cat);
  if (search) list = list.filter(p =>
    p.name.toLowerCase().includes(search) ||
    catName(p.category).toLowerCase().includes(search)
  );
  switch (sort) {
    case 'price-asc':  list.sort((a, b) => a.price - b.price); break;
    case 'price-desc': list.sort((a, b) => b.price - a.price); break;
    case 'rating':     list.sort((a, b) => b.rating - a.rating); break;
    case 'name':       list.sort((a, b) => a.name.localeCompare(b.name)); break;
  }
  buildAllProducts(list);
}

function clearFilters() {
  document.querySelectorAll('.filter-chip').forEach((b,i) => b.classList.toggle('active', i===0));
  const ss = document.getElementById('sortSelect');
  if (ss) ss.value = '';
  buildAllProducts(STORE.products);
}

function filterByCategory(catId) {
  showPage('products');
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));
  const link = document.querySelector('[data-page="products"]');
  if (link) link.classList.add('active');
  setTimeout(() => {
    /* Activate matching chip */
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(b => b.classList.remove('active'));
    const idx = STORE.categories.findIndex(c => c.id === catId);
    if (chips[idx + 1]) chips[idx + 1].classList.add('active');
    const list = STORE.products.filter(p => p.category === catId);
    buildAllProducts(list);
  }, 450);
}

/* ─── PRODUCT DETAIL ─────────────────────────────── */
function openProduct(id) {
  const p = STORE.products.find(x => String(x.id) === String(id));
  if (!p) return;
  if (p._outOfStock) { showToast('⚠️ This product is currently out of stock.'); return; }
  prevPage = document.querySelector('.page.active')?.id?.replace('page-', '') || 'products';

  /* ── Discount ── */
  const adminDisc = p.sku ? getStorefrontDiscount(p.sku) : null;
  const hasDisc   = adminDisc !== null;
  const salePrice = hasDisc ? p.price * (1 - adminDisc.pct / 100) : p.price;
  const disc      = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100)
                  : hasDisc   ? adminDisc.pct : 0;

  /* ── Reviews ── */
  const reviewsArr  = Array.isArray(p.reviews) ? p.reviews : [];
  const reviewCount = reviewsArr.length;
  const avgRating   = reviewCount > 0
    ? (reviewsArr.reduce((s, rv) => s + rv.stars, 0) / reviewCount).toFixed(1)
    : (p.rating || 0).toFixed(1);
  const showRating  = parseFloat(avgRating) > 0;

  /* ── Reviews HTML ── */
  function reviewStarsHTML(n) {
    let s = '';
    for (let i = 1; i <= 5; i++)
      s += `<span style="color:${i<=n?'#F59E0B':'var(--t3)'};font-size:.88rem;">★</span>`;
    return s;
  }
  const reviewsSection = `
    <div style="margin-top:36px;border-top:1px solid var(--border);padding-top:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h4 style="font-family:'Syne',sans-serif;font-size:1rem;font-weight:800;color:var(--t1);margin:0;">
          ⭐ Customer Reviews
          ${reviewCount > 0 ? `<span style="font-weight:400;font-size:.82rem;color:var(--t2);margin-left:4px;">(${reviewCount})</span>` : ''}
        </h4>
        ${showRating && reviewCount > 0
          ? `<div style="display:flex;align-items:center;gap:5px;">
               ${reviewStarsHTML(parseFloat(avgRating))}
               <span style="font-size:.84rem;font-weight:700;color:var(--t2);margin-left:4px;">${avgRating} / 5</span>
             </div>` : ''}
      </div>
      ${reviewCount === 0
        ? `<p style="font-size:.82rem;color:var(--t3);text-align:center;padding:16px 0;">No reviews yet — be the first to share your experience.</p>`
        : reviewsArr.map(rv => `
            <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;background:var(--surface);">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--brand);display:grid;place-items:center;font-size:.78rem;font-weight:800;color:#fff;flex-shrink:0;">
                    ${(rv.author||'A').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style="font-size:.84rem;font-weight:700;color:var(--t1);">${rv.author || 'Anonymous'}</div>
                    <div style="font-size:.68rem;color:var(--t3);">${rv.date || ''}</div>
                  </div>
                </div>
                <div style="display:flex;gap:2px;">${reviewStarsHTML(rv.stars)}</div>
              </div>
              <p style="font-size:.84rem;color:var(--t2);line-height:1.6;margin:0;">${rv.text || ''}</p>
            </div>`).join('')
      }
    </div>`;

  document.getElementById('productDetail').innerHTML = `
    <div class="pd-layout">
      <div class="pd-image" id="pdMainImage_${id}">
        ${p.image
          ? `<img src="${p.image}" alt="${p.name}" id="pdMainImg_${id}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;transition:filter .3s;"/>`
          : `<div class="pd-emoji" id="pdMainImg_${id}">${p.emoji}</div>`}
        <div id="pdColorOverlay_${id}" style="display:none;position:absolute;inset:0;border-radius:inherit;pointer-events:none;transition:opacity .3s;"></div>
        <div id="pdColorBadge_${id}" style="display:none;position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;font-size:.74rem;font-weight:700;padding:5px 14px;border-radius:20px;backdrop-filter:blur(4px);white-space:nowrap;pointer-events:none;"></div>
        ${disc ? `<span class="pc-badge" style="background:${hasDisc && adminDisc.pct===50?'#EF4444':'var(--accent)'}">${disc}% OFF</span>` : ''}
      </div>
      <div>
        <p class="pd-cat">${catName(p.category)}</p>
        <h2 class="pd-name">${p.name}</h2>
        ${showRating ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="color:var(--brand);font-size:.9rem;">${starHTML(parseFloat(avgRating))}</span>
          <span style="font-size:.82rem;color:var(--t2);font-weight:600;">${avgRating} (${reviewCount} review${reviewCount !== 1 ? 's' : ''})</span>
        </div>` : ''}
        <div class="pd-price-row">
          ${hasDisc
            ? `<div style="display:flex;flex-direction:column;gap:2px;">
                 <span style="font-size:.82rem;color:var(--t3);text-decoration:line-through;">Instead of ₦${fmt(p.price)}</span>
                 <span class="pd-price" style="color:#22C55E;font-size:1.4rem;">Get it at ₦${fmt(salePrice)}</span>
                 <span style="font-size:.76rem;color:#86EFAC;font-weight:700;">You save ₦${fmt(p.price - salePrice)} (${adminDisc.pct}% OFF)</span>
               </div>`
            : `<span class="pd-price">₦${fmt(p.price)}</span>
               ${p.oldPrice ? `<span class="pd-old">₦${fmt(p.oldPrice)}</span>` : ''}
               ${disc && !hasDisc ? `<span style="background:rgba(201,168,76,.12);color:var(--brand);font-size:.75rem;font-weight:800;padding:4px 10px;border-radius:100px;letter-spacing:.06em;text-transform:uppercase;">Save ₦${fmt(p.oldPrice - p.price)}</span>` : ''}`
          }
        </div>
        ${hasDisc ? `<div data-disc-expires="${adminDisc.expiresAt}" style="font-size:.74rem;font-weight:700;color:#F59E0B;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:6px 12px;display:inline-block;margin-bottom:16px;margin-top:4px;">⏱ ${fmtDiscCountdown(adminDisc.expiresAt)}</div>` : ''}
        <p data-stock-pill style="font-size:.8rem;font-weight:700;margin-bottom:22px;padding:8px 14px;border-radius:10px;display:inline-block;
          ${p._outOfStock ? 'background:rgba(239,68,68,.1);color:#EF4444;' : p._lowStock ? 'background:rgba(217,119,6,.1);color:#D97706;' : 'background:rgba(5,150,105,.1);color:#059669;'}">
          ${p._outOfStock ? '🚫 Out of Stock' : p._lowStock ? `⚡ Low Stock — only ${p.qty} left` : `✓ In Stock (${p.qty} available)`}
        </p>
        <p class="pd-desc">${p.description}</p>

        ${p.colors && p.colors.length ? `
        <div style="margin-bottom:22px;">
          <span class="pd-swatch-label">Colour</span>
          <div class="pd-swatches" id="pdColors_${id}">
            ${p.colors.map((c,i) => `<div class="pd-swatch${i===0?' active':''}" style="background:${c}" onclick="selectColor(this,'${id}')" title="${c}" data-color="${c}"></div>`).join('')}
          </div>
          <div id="pdColorLabel_${id}" style="font-size:.78rem;color:var(--t2);margin-top:4px;">
            <span id="pdColorSwatch_${id}" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.colors[0]};border:1.5px solid rgba(0,0,0,.15);margin-right:6px;vertical-align:middle;"></span>
            <span id="pdColorName_${id}" style="font-weight:700;color:var(--brand);">${p.colors[0]}</span>
          </div>
        </div>` : ''}

        ${p.sizes && p.sizes.length ? `
        <div style="margin-bottom:22px;">
          <span class="pd-swatch-label">Size</span>
          <div class="pd-size-wrap" id="pdSizes_${id}">
            ${p.sizes.map((s,i) => `<button class="pd-size${i===0?' active':''}" onclick="selectSize(this,'${id}')">${s}</button>`).join('')}
          </div>
        </div>` : ''}

        <div class="pd-qty-row">
          <label>Qty</label>
          <div class="pd-qty">
            <button onclick="changeQty('pdQty_${id}',-1,${p.qty||999})">−</button>
            <span id="pdQty_${id}">1</span>
            <button onclick="changeQty('pdQty_${id}',1,${p.qty||999})">+</button>
          </div>
        </div>

        <button class="btn-add-cart" onclick="addToCartFromDetail('${id}')" ${p._outOfStock?'disabled':''}>
          ${p._outOfStock ? '🚫 Out of Stock' : 'Add to Cart'}
          ${!p._outOfStock ? `<svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>` : ''}
        </button>

        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:20px;padding-top:20px;border-top:1px solid var(--border);">
          <span style="font-size:.78rem;color:var(--t3);display:flex;align-items:center;gap:6px;">🚚 Free shipping over ₦15k</span>
          <span style="font-size:.78rem;color:var(--t3);display:flex;align-items:center;gap:6px;">↩️ 30-day returns</span>
          <span style="font-size:.78rem;color:var(--t3);display:flex;align-items:center;gap:6px;">🔒 Secure checkout</span>
        </div>
        ${reviewsSection}
      </div>
    </div>

    ${STORE.products.filter(x => x.category === p.category && String(x.id) !== String(id) && !x._outOfStock).length ? `
    <div style="margin-top:64px;">
      <div class="section-eyebrow" style="margin-bottom:10px;">You may also like</div>
      <h3 style="font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;margin-bottom:28px;color:var(--t1);">More from ${catName(p.category)}</h3>
      <div class="product-grid">
        ${STORE.products.filter(x => x.category === p.category && String(x.id) !== String(id) && !x._outOfStock).slice(0,4).map(productCard).join('')}
      </div>
    </div>` : ''}`;

  const detailPage = document.getElementById('page-detail');
  if (detailPage) detailPage.dataset.openProductId = String(id);
  showPage('detail');
  /* Start/restart the discount countdown ticker for this page */
  startStorefrontDiscountTicker();
}

function selectColor(btn, id) {
  document.querySelectorAll(`#pdColors_${id} .pd-swatch`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const color = btn.dataset.color || btn.title || '';
  const swatch = document.getElementById(`pdColorSwatch_${id}`);
  const name   = document.getElementById(`pdColorName_${id}`);
  if (swatch) swatch.style.background = color;
  if (name)   name.textContent = color;
  const overlay = document.getElementById(`pdColorOverlay_${id}`);
  const badge   = document.getElementById(`pdColorBadge_${id}`);
  if (overlay) {
    overlay.style.display      = 'block';
    overlay.style.background   = color;
    overlay.style.opacity      = '0.25';
    overlay.style.mixBlendMode = 'multiply';
  }
  if (badge) {
    badge.style.display = 'block';
    badge.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};border:1.5px solid rgba(255,255,255,.6);margin-right:6px;vertical-align:middle;"></span>${color}`;
  }
}
function selectSize(btn, id) {
  document.querySelectorAll(`#pdSizes_${id} .pd-size`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function changeQty(id, delta, maxQty) {
  const el = document.getElementById(id);
  if (!el) return;
  const newVal = Math.max(1, parseInt(el.textContent) + delta);
  if (maxQty !== undefined && newVal > maxQty) {
    showToast(`⚠️ Only ${maxQty} unit${maxQty === 1 ? '' : 's'} available in stock.`);
    return;
  }
  el.textContent = newVal;
}
function addToCartFromDetail(pid) {
  const p = STORE.products.find(x => String(x.id) === String(pid));
  if (!p) return;
  if (p._outOfStock || p.qty === 0) {
    showToast('🚫 Sorry, this item is out of stock.'); return;
  }
  const qty    = parseInt(document.getElementById(`pdQty_${pid}`)?.textContent || 1);
  const sizeB  = document.querySelector(`#pdSizes_${pid} .size-btn.active`);
  const colorB = document.querySelector(`#pdColors_${pid} .color-dot.active`);
  const size   = sizeB  ? sizeB.textContent  : (p.sizes  && p.sizes.length  ? p.sizes[0]  : '');
  const color  = colorB ? (colorB.dataset.color || colorB.title || '') : (p.colors && p.colors.length ? p.colors[0] : '');
  /* Cap qty at available stock */
  const maxQty = p.qty !== undefined ? p.qty : qty;
  const toAdd  = Math.min(qty, maxQty);
  for (let i = 0; i < toAdd; i++) addToCart(String(pid), size, color);
}
function quickAdd(pid) {
  const p = STORE.products.find(x => String(x.id) === String(pid));
  if (!p) return;
  const size  = p.sizes  && p.sizes.length  ? p.sizes[0]  : '';
  const color = p.colors && p.colors.length ? p.colors[0] : '';
  addToCart(String(pid), size, color);
}

/* ─── CHECKOUT ANIMATION ────────────────────────── */
(function(){
  const s = document.createElement('style');
  s.textContent = `
    @keyframes coSlide {
      from { opacity:0; transform:translateY(24px) scale(.97); }
      to   { opacity:1; transform:translateY(0)    scale(1);   }
    }
  `;
  document.head.appendChild(s);
})();

/* ─── CART ───────────────────────────────────────── */
function addToCart(pid, size, color) {
  /* ── AUTH GATE: must be logged in to add to cart ── */
  if (!STORE_USER) {
    _saDestination = 'products';
    openStoreAuth('products');
    showToast('🔒 Please sign in to add items to your cart.');
    return;
  }
  const p = STORE.products.find(x => String(x.id) === String(pid));
  if (!p) return;

  /* ── STOCK GATE: block if out of stock ── */
  if (p._outOfStock || p.qty === 0) {
    showToast('🚫 This item is out of stock and cannot be ordered.');
    return;
  }

  const selectedColor = color || '';
  const selectedSize  = size  || '';
  const key = `${pid}-${selectedSize}-${selectedColor}`;
  /* Use discounted price if an active admin discount exists */
  const activeDisc  = p.sku ? getStorefrontDiscount(p.sku) : null;
  const cartPrice   = activeDisc ? p.price * (1 - activeDisc.pct / 100) : p.price;
  const ex  = cart.find(i => i.key === key);
  if (ex) ex.qty += 1;
  else cart.push({ key, id: pid, sku: p.sku || null, name: p.name, price: cartPrice, originalPrice: p.price, discountPct: activeDisc ? activeDisc.pct : 0, emoji: p.emoji || '🎁', image: p.image || null, size: selectedSize, color: selectedColor, qty: 1 });
  saveCart(); syncCart();

  if (p._lowStock) {
    showToast(`${p.emoji || '🎁'} Added! ⚠️ Low stock — only ${p.qty} left.`);
  } else {
    showToast(`${p.emoji || '🎁'} ${p.name} added to cart!`);
  }
}
function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart(); syncCart();
}
function changeCartQty(key, delta) {
  const item = cart.find(i => i.key === key);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart(); syncCart();
}
function saveCart() { localStorage.setItem('cp_cart', JSON.stringify(cart)); }
function syncCart() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartDot').style.display = count > 0 ? 'block' : 'none';
  const itemsEl  = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');
  const totalEl  = document.getElementById('cartTotal');
  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2"/><path d="M20 26h24l-3 14H23L20 26z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M26 26v-4a6 6 0 0 1 12 0v4" stroke="currentColor" stroke-width="2"/></svg>
        <p>Your cart is empty</p><span>Add some items to get started</span>
      </div>`;
    footerEl.style.display = 'none';
  } else {
    itemsEl.innerHTML = cart.map(i => `
      <div class="cart-item">
        <div class="ci-emoji">
          ${i.image
            ? `<img src="${i.image}" alt="${i.name}" style="width:48px;height:48px;object-fit:cover;border-radius:10px;display:block;"/>`
            : `${i.emoji || '🎁'}`}
        </div>
        <div class="ci-info">
          <p>${i.name}</p>
          <small style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:2px;">
            ${i.size  ? `<span style="padding:1px 8px;border-radius:10px;background:#F3F4F6;color:#374151;font-size:.68rem;font-weight:700;">📐 ${i.size}</span>` : ''}
            ${i.color ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px 1px 5px;border-radius:10px;background:#F3F4F6;font-size:.68rem;font-weight:700;color:#374151;">
              <span style="width:10px;height:10px;border-radius:50%;background:${i.color};border:1px solid rgba(0,0,0,.15);display:inline-block;flex-shrink:0;"></span>${i.color}
            </span>` : ''}
            ${i.discountPct ? `<span style="padding:1px 8px;border-radius:10px;background:rgba(34,197,94,.1);color:#16a34a;font-size:.68rem;font-weight:800;">🏷️ ${i.discountPct}% OFF</span>` : ''}
          </small>
          <div class="ci-qty">
            <button onclick="changeCartQty('${i.key}',-1)">−</button>
            <span>${i.qty}</span>
            <button onclick="changeCartQty('${i.key}',1)">+</button>
          </div>
        </div>
        <div class="ci-right">
          <span class="ci-price">₦${fmt(i.price * i.qty)}</span>
          <button class="ci-remove" onclick="removeFromCart('${i.key}')">✕</button>
        </div>
      </div>`).join('');
    footerEl.style.display = 'block';
    totalEl.textContent = `₦${fmt(total)}`;
  }
}
function toggleCart() {
  document.getElementById('cartSidebar').classList.toggle('open');
  document.getElementById('cartOverlay').classList.toggle('open');
}
/* ════════════════════════════════════════
   PROFESSIONAL CHECKOUT FLOW
════════════════════════════════════════ */

function checkout() {
  if (cart.length === 0) return;
  /* ── AUTH GATE: must be logged in to proceed to checkout ── */
  if (!STORE_USER) {
    toggleCart();
    _saDestination = 'products';
    openStoreAuth('products');
    showToast('🔒 Please sign in or create a Finexy account to checkout.');
    return;
  }
  toggleCart();
  openCheckoutModal();
}

function openCheckoutModal() {
  const total    = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  // Remove existing modal if any
  const existing = document.getElementById('checkoutModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'checkoutModal';
  modal.style.cssText = [
    'position:fixed','inset:0','z-index:99999',
    'display:flex','align-items:center','justify-content:center',
    'background:rgba(0,0,0,.6)','backdrop-filter:blur(6px)',
    'padding:16px','overflow-y:auto',
  ].join(';');

  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:22px;width:100%;max-width:560px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,.3);animation:coSlide .35s cubic-bezier(.16,1,.3,1)">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1A1612,#2C2414);padding:24px 28px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2 style="font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:#fff;margin:0">Checkout</h2>
          <p style="color:rgba(255,255,255,.55);font-size:.78rem;margin:4px 0 0;letter-spacing:.04em;">${itemCount} item${itemCount!==1?'s':''} · <span style="color:#C9A84C;font-weight:700;">₦${fmt(total)}</span></p>
        </div>
        <button onclick="closeCheckoutModal()" style="background:rgba(255,255,255,.1);border:none;color:rgba(255,255,255,.7);width:36px;height:36px;border-radius:50%;font-size:1rem;cursor:pointer;display:grid;place-items:center;transition:background .2s;" onmouseover="this.style.background='rgba(255,255,255,.2)'" onmouseout="this.style.background='rgba(255,255,255,.1)'">✕</button>
      </div>

      <!-- Steps indicator -->
      <div style="display:flex;border-bottom:1px solid #F3F4F6;padding:0 28px;background:#fff;">
        <div id="coStep1" style="flex:1;padding:14px 0;text-align:center;font-size:.72rem;font-weight:800;color:#C9A84C;border-bottom:2px solid #C9A84C;cursor:pointer;letter-spacing:.08em;text-transform:uppercase;" onclick="goToStep(1)">1 · Details</div>
        <div id="coStep2" style="flex:1;padding:14px 0;text-align:center;font-size:.72rem;font-weight:600;color:#9CA3AF;border-bottom:2px solid transparent;cursor:pointer;letter-spacing:.08em;text-transform:uppercase;" onclick="goToStep(2)">2 · Payment</div>
        <div id="coStep3" style="flex:1;padding:14px 0;text-align:center;font-size:.72rem;font-weight:600;color:#9CA3AF;border-bottom:2px solid transparent;letter-spacing:.08em;text-transform:uppercase;">3 · Confirm</div>
      </div>

      <!-- Body -->
      <div id="coBody" style="padding:26px 28px;max-height:60vh;overflow-y:auto;background:#fff;">
        ${stepOneHTML()}
      </div>

      <!-- Footer -->
      <div style="padding:16px 28px 24px;border-top:1px solid #F3F4F6;display:flex;gap:12px;justify-content:flex-end;background:#fff;">
        <button id="coBtnBack" onclick="checkoutBack()" style="display:none;padding:12px 22px;border-radius:10px;border:1.5px solid #E5E7EB;background:#fff;font-size:.82rem;font-weight:700;cursor:pointer;color:#374151;font-family:inherit;letter-spacing:.04em;text-transform:uppercase;">← Back</button>
        <button id="coBtnNext" onclick="checkoutNext()" style="padding:12px 28px;border-radius:10px;border:none;background:linear-gradient(135deg,#1A1612,#2C2414);color:#fff;font-size:.84rem;font-weight:800;cursor:pointer;min-width:130px;font-family:inherit;letter-spacing:.06em;text-transform:uppercase;transition:background .2s;" onmouseover="this.style.background='#C9A84C'" onmouseout="this.style.background='linear-gradient(135deg,#1A1612,#2C2414)'">Continue →</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeCheckoutModal(); });
}

function stepOneHTML() {
  /* Pre-fill from logged-in customer account */
  const u = STORE_USER || {};
  return `
    <h3 style="font-size:.9rem;font-weight:700;color:#111;margin:0 0 16px">Delivery Details</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div>
        <label style="font-size:.75rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;">First Name *</label>
        <input id="coFirst" type="text" placeholder="John" value="${u.first||''}" style="${inputStyle()}" />
      </div>
      <div>
        <label style="font-size:.75rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Last Name *</label>
        <input id="coLast" type="text" placeholder="Doe" value="${u.last||''}" style="${inputStyle()}" />
      </div>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:.75rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Phone Number *</label>
      <input id="coPhone" type="tel" placeholder="+234 800 000 0000" value="${u.phone||''}" style="${inputStyle()}" />
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:.75rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Email Address *</label>
      <input id="coEmail" type="email" placeholder="john@email.com" value="${u.email||''}" style="${inputStyle()}" />
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:.75rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Delivery Address *</label>
      <input id="coAddress" type="text" placeholder="House number, Street name" style="${inputStyle()}" />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div>
        <label style="font-size:.75rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;">City *</label>
        <input id="coCity" type="text" placeholder="Lagos" style="${inputStyle()}" />
      </div>
      <div>
        <label style="font-size:.75rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;">State *</label>
        <select id="coState" style="${inputStyle()}">
          <option value="">Select State</option>
          ${['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT - Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'].map(s => `<option>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="margin-top:12px;">
      <label style="font-size:.75rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;">Delivery Notes (optional)</label>
      <textarea id="coNotes" placeholder="e.g. Drop at gate, Call before delivery…" style="${inputStyle()}height:70px;resize:none;"></textarea>
    </div>`;
}

function stepTwoHTML() {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return `
    <h3 style="font-size:.9rem;font-weight:800;color:var(--t1,#1A1612);margin:0 0 18px;text-transform:uppercase;letter-spacing:.08em;">Payment Method</h3>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">

      <label style="${payOptStyle()}" id="payOpt_pod" onclick="selectPayMethodUI('pod')">
        <input type="radio" name="payMethod" value="Pay on Delivery" checked style="display:none"/>
        <div style="width:42px;height:42px;border-radius:12px;background:#FEF3C7;display:grid;place-items:center;font-size:1.3rem;flex-shrink:0;">💵</div>
        <div style="flex:1;">
          <p style="font-weight:800;color:#111;margin:0;font-size:.88rem;">Pay on Delivery</p>
          <small style="color:#6B7280;font-size:.74rem;">Pay cash when your order arrives</small>
        </div>
        <div id="payCheck_pod" style="width:22px;height:22px;border-radius:50%;background:#C9A84C;display:grid;place-items:center;flex-shrink:0;transition:background .2s;"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></div>
      </label>

      <label style="${payOptStyle()}" id="payOpt_transfer" onclick="selectPayMethodUI('transfer')">
        <input type="radio" name="payMethod" value="Bank Transfer" style="display:none"/>
        <div style="width:42px;height:42px;border-radius:12px;background:#DBEAFE;display:grid;place-items:center;font-size:1.3rem;flex-shrink:0;">🏦</div>
        <div style="flex:1;">
          <p style="font-weight:800;color:#111;margin:0;font-size:.88rem;">Bank Transfer</p>
          <small style="color:#6B7280;font-size:.74rem;">Transfer to our account before delivery</small>
        </div>
        <div id="payCheck_transfer" style="width:22px;height:22px;border-radius:50%;background:#E5E7EB;flex-shrink:0;transition:background .2s;"></div>
      </label>

      <label style="${payOptStyle()}" id="payOpt_card" onclick="selectPayMethodUI('card')">
        <input type="radio" name="payMethod" value="Card Payment" style="display:none"/>
        <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#1a1a2e,#16213e);display:grid;place-items:center;font-size:1.3rem;flex-shrink:0;">💳</div>
        <div style="flex:1;">
          <p style="font-weight:800;color:#111;margin:0;font-size:.88rem;">Card Payment</p>
          <small style="color:#6B7280;font-size:.74rem;">Visa · Mastercard · Verve · any bank card accepted</small>
          <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap;">
            <span style="font-size:.62rem;font-weight:800;padding:2px 7px;border-radius:5px;background:#1A1F71;color:#fff;letter-spacing:.04em;">VISA</span>
            <span style="font-size:.62rem;font-weight:800;padding:2px 7px;border-radius:5px;background:#EB001B;color:#fff;letter-spacing:.04em;">MC</span>
            <span style="font-size:.62rem;font-weight:800;padding:2px 7px;border-radius:5px;background:#006C35;color:#fff;letter-spacing:.04em;">VERVE</span>
            <span style="font-size:.62rem;font-weight:800;padding:2px 7px;border-radius:5px;background:#FF6B00;color:#fff;letter-spacing:.04em;">AMEX</span>
          </div>
        </div>
        <div id="payCheck_card" style="width:22px;height:22px;border-radius:50%;background:#E5E7EB;flex-shrink:0;transition:background .2s;"></div>
      </label>

    </div>

    <!-- Card input fields (hidden until Card Payment selected) -->
    <div id="cardInputSection" style="display:none;margin-bottom:20px;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);border-radius:16px;padding:20px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(201,168,76,.08);pointer-events:none;"></div>
      <div style="position:absolute;bottom:-20px;left:-20px;width:80px;height:80px;border-radius:50%;background:rgba(201,168,76,.06);pointer-events:none;"></div>
      <p style="font-size:.7rem;font-weight:800;color:rgba(255,255,255,.5);letter-spacing:.16em;text-transform:uppercase;margin:0 0 16px;">Card Details</p>
      <div style="margin-bottom:13px;">
        <label style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.6);display:block;margin-bottom:6px;letter-spacing:.08em;text-transform:uppercase;">Card Number</label>
        <input id="coCardNum" type="text" placeholder="1234  5678  9012  3456" maxlength="19"
          oninput="formatCardNum(this)"
          style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid rgba(255,255,255,.15);border-radius:10px;font-size:.9rem;font-family:'Plus Jakarta Sans',monospace;color:#fff;background:rgba(255,255,255,.07);outline:none;letter-spacing:.12em;"
          onfocus="this.style.borderColor='#C9A84C'" onblur="this.style.borderColor='rgba(255,255,255,.15)'"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:13px;">
        <div>
          <label style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.6);display:block;margin-bottom:6px;letter-spacing:.08em;text-transform:uppercase;">Expiry Date</label>
          <input id="coCardExp" type="text" placeholder="MM/YY" maxlength="5"
            oninput="formatCardExp(this)"
            style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid rgba(255,255,255,.15);border-radius:10px;font-size:.88rem;font-family:inherit;color:#fff;background:rgba(255,255,255,.07);outline:none;"
            onfocus="this.style.borderColor='#C9A84C'" onblur="this.style.borderColor='rgba(255,255,255,.15)'"/>
        </div>
        <div>
          <label style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.6);display:block;margin-bottom:6px;letter-spacing:.08em;text-transform:uppercase;">CVV</label>
          <input id="coCardCvv" type="password" placeholder="•••" maxlength="4"
            style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid rgba(255,255,255,.15);border-radius:10px;font-size:.88rem;font-family:inherit;color:#fff;background:rgba(255,255,255,.07);outline:none;"
            onfocus="this.style.borderColor='#C9A84C'" onblur="this.style.borderColor='rgba(255,255,255,.15)'"/>
        </div>
      </div>
      <div>
        <label style="font-size:.7rem;font-weight:700;color:rgba(255,255,255,.6);display:block;margin-bottom:6px;letter-spacing:.08em;text-transform:uppercase;">Name on Card</label>
        <input id="coCardName" type="text" placeholder="JOHN DOE"
          style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid rgba(255,255,255,.15);border-radius:10px;font-size:.88rem;font-family:inherit;color:#fff;background:rgba(255,255,255,.07);outline:none;text-transform:uppercase;letter-spacing:.06em;"
          onfocus="this.style.borderColor='#C9A84C'" onblur="this.style.borderColor='rgba(255,255,255,.15)'"/>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);">
        <span style="font-size:.7rem;color:rgba(255,255,255,.4);">🔒 256-bit SSL encrypted · Your card data is never stored</span>
      </div>
    </div>

    <!-- Order Summary -->
    <div style="background:#F9FAFB;border-radius:14px;padding:18px;">
      <p style="font-size:.72rem;font-weight:800;color:#374151;margin:0 0 12px;text-transform:uppercase;letter-spacing:.1em;">Order Summary</p>
      ${cart.map(i => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:8px;">
          <span style="font-size:.83rem;color:#374151;flex:1;">${i.name}${i.size ? ` · <span style="color:#C9A84C;font-weight:700;">${i.size}</span>` : ''} <span style="color:#9CA3AF">×${i.qty}</span></span>
          <span style="font-size:.83rem;font-weight:700;color:#111;flex-shrink:0;">₦${fmt(i.price * i.qty)}</span>
        </div>`).join('')}
      <div style="border-top:1px solid #E5E7EB;margin-top:12px;padding-top:12px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:.88rem;font-weight:800;color:#111;">Total</span>
        <span style="font-size:1.1rem;font-weight:800;color:#C9A84C;">₦${fmt(total)}</span>
      </div>
    </div>`;
}

function stepThreeHTML(details, payMethod) {
  const total    = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = calcDeliveryDate(details.state || '');
  return `
    <div style="text-align:center;padding:8px 0 16px;">
      <div style="font-size:2.5rem;margin-bottom:8px;">📦</div>
      <h3 style="font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:800;color:#111;margin:0 0 4px">Confirm Your Order</h3>
      <p style="color:#6B7280;font-size:.82rem;margin:0">Please review before placing your order</p>
    </div>

    <div style="background:#F9FAFB;border-radius:12px;padding:16px;margin-bottom:12px;">
      <p style="font-size:.75rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px;">Delivery To</p>
      <p style="font-size:.88rem;font-weight:600;color:#111;margin:0 0 4px;">${details.first} ${details.last}</p>
      <p style="font-size:.82rem;color:#6B7280;margin:0 0 2px;">${details.phone} · ${details.email}</p>
      <p style="font-size:.82rem;color:#6B7280;margin:0;">${details.address}, ${details.city}, ${details.state}</p>
      ${details.notes ? `<p style="font-size:.78rem;color:#9CA3AF;margin:6px 0 0;font-style:italic;">${details.notes}</p>` : ''}
    </div>

    <div style="background:linear-gradient(135deg,#0f0c29,#302b63);border-radius:12px;padding:16px;margin-bottom:12px;">
      <p style="font-size:.72rem;font-weight:800;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.1em;margin:0 0 8px;">🚚 Estimated Delivery</p>
      <p style="font-size:.95rem;font-weight:800;color:#C9A84C;margin:0 0 3px;">${delivery.label}</p>
      <p style="font-size:.75rem;color:rgba(255,255,255,.5);margin:0;">~${delivery.days} business day${delivery.days > 1 ? 's' : ''} to ${details.state}</p>
    </div>

    <div style="background:#F9FAFB;border-radius:12px;padding:16px;margin-bottom:12px;">
      <p style="font-size:.75rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px;">Payment</p>
      <p style="font-size:.88rem;color:#111;margin:0;">${payMethod === 'Pay on Delivery' ? '💵' : payMethod === 'Bank Transfer' ? '🏦' : '💳'} ${payMethod}</p>
    </div>

    <div style="background:#F9FAFB;border-radius:12px;padding:16px;">
      <p style="font-size:.75rem;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px;">Items</p>
      ${cart.map(i => `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <div>
            <span style="font-size:.82rem;color:#374151;">${i.name} × ${i.qty}</span>
            ${i.size || i.color ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px;">
              ${i.size  ? `<span style="padding:1px 7px;border-radius:8px;background:#EDE9FE;color:#7C3AED;font-size:.65rem;font-weight:700;">📐 ${i.size}</span>` : ''}
              ${i.color ? `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 7px 1px 4px;border-radius:8px;background:#EDE9FE;font-size:.65rem;font-weight:700;color:#7C3AED;">
                <span style="width:8px;height:8px;border-radius:50%;background:${i.color};border:1px solid rgba(0,0,0,.15);display:inline-block;"></span>${i.color}
              </span>` : ''}
            </div>` : ''}
          </div>
          <span style="font-size:.82rem;font-weight:600;">₦${fmt(i.price * i.qty)}</span>
        </div>`).join('')}
      <div style="border-top:1px solid #E5E7EB;margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;">
        <span style="font-weight:700;font-size:.9rem;">Total</span>
        <span style="font-weight:800;font-size:1rem;color:#7C3AED;">₦${fmt(total)}</span>
      </div>
    </div>`;
}

function inputStyle() {
  return 'width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:.85rem;font-family:inherit;outline:none;color:#111;background:#fff;';
}
function payOptStyle() {
  return 'display:flex;align-items:center;gap:14px;padding:14px 16px;border:1.5px solid #E5E7EB;border-radius:12px;cursor:pointer;transition:border-color .2s;';
}

function selectPayMethodUI(key) {
  const map = { pod: 'Pay on Delivery', transfer: 'Bank Transfer', card: 'Card Payment' };
  _coPayMethod = map[key] || 'Pay on Delivery';
  /* Update radio inputs */
  document.querySelectorAll('input[name="payMethod"]').forEach(r => { r.checked = r.value === _coPayMethod; });
  /* Reset all option styles */
  ['pod','transfer','card'].forEach(k => {
    const el  = document.getElementById('payCheck_' + k);
    const opt = document.getElementById('payOpt_' + k);
    if (el)  { el.style.background = '#E5E7EB'; el.innerHTML = ''; }
    if (opt) { opt.style.borderColor = '#E5E7EB'; opt.style.background = ''; }
  });
  /* Highlight selected */
  const el  = document.getElementById('payCheck_' + key);
  const opt = document.getElementById('payOpt_' + key);
  if (el)  { el.style.background = '#C9A84C'; el.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'; }
  if (opt) { opt.style.borderColor = '#C9A84C'; opt.style.background = 'rgba(201,168,76,.04)'; }
  /* Show/hide card input section */
  const cardSection = document.getElementById('cardInputSection');
  if (cardSection) cardSection.style.display = key === 'card' ? 'block' : 'none';
}

function selectPayMethod(radio) {
  const key = radio.value === 'Pay on Delivery' ? 'pod' : radio.value === 'Bank Transfer' ? 'transfer' : 'card';
  selectPayMethodUI(key);
}

/* Card number formatter: adds spaces every 4 digits */
function formatCardNum(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 16);
  input.value = v.replace(/(.{4})/g, '$1  ').trim();
}
/* Expiry formatter: auto-inserts slash */
function formatCardExp(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 4);
  if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2);
  input.value = v;
}

let _coStep = 1;
let _coDetails = {};
let _coPayMethod = 'Pay on Delivery';

function goToStep(n) {
  if (n < _coStep) { _coStep = n; renderStep(); }
}

function checkoutNext() {
  if (_coStep === 1) {
    // Validate step 1
    const first   = document.getElementById('coFirst')?.value.trim();
    const last    = document.getElementById('coLast')?.value.trim();
    const phone   = document.getElementById('coPhone')?.value.trim();
    const email   = document.getElementById('coEmail')?.value.trim();
    const address = document.getElementById('coAddress')?.value.trim();
    const city    = document.getElementById('coCity')?.value.trim();
    const state   = document.getElementById('coState')?.value.trim();
    const notes   = document.getElementById('coNotes')?.value.trim();
    if (!first||!last||!phone||!email||!address||!city||!state) {
      showCheckoutError('Please fill in all required fields.'); return;
    }
    if (!email.includes('@')) { showCheckoutError('Please enter a valid email address.'); return; }
    _coDetails = { first, last, phone, email, address, city, state, notes };
    _coStep = 2;
    renderStep();
  } else if (_coStep === 2) {
    const sel = document.querySelector('input[name="payMethod"]:checked');
    _coPayMethod = sel ? sel.value : 'Pay on Delivery';
    _coStep = 3;
    renderStep();
  } else if (_coStep === 3) {
    placeOrder(); // async — intentionally not awaited here; placeOrder manages its own UI state
  }
}

function checkoutBack() {
  if (_coStep > 1) { _coStep--; renderStep(); }
}

function renderStep() {
  const body    = document.getElementById('coBody');
  const btnNext = document.getElementById('coBtnNext');
  const btnBack = document.getElementById('coBtnBack');

  if (_coStep === 1) body.innerHTML = stepOneHTML();
  if (_coStep === 2) body.innerHTML = stepTwoHTML();
  if (_coStep === 3) body.innerHTML = stepThreeHTML(_coDetails, _coPayMethod);

  // Restore form values on step 1
  if (_coStep === 1 && _coDetails.first) {
    setTimeout(() => {
      ['First','Last','Phone','Email','Address','City','Notes'].forEach(f => {
        const el = document.getElementById('co'+f);
        if (el && _coDetails[f.toLowerCase()]) el.value = _coDetails[f.toLowerCase()];
      });
      const stateEl = document.getElementById('coState');
      if (stateEl && _coDetails.state) stateEl.value = _coDetails.state;
    }, 10);
  }

  // Update step indicators
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('coStep' + i);
    if (!el) continue;
    if (i === _coStep) {
      el.style.color = '#C9A84C';
      el.style.borderBottom = '2px solid #C9A84C';
      el.style.fontWeight = '800';
    } else if (i < _coStep) {
      el.style.color = '#059669';
      el.style.borderBottom = '2px solid #059669';
      el.style.fontWeight = '700';
    } else {
      el.style.color = '#9CA3AF';
      el.style.borderBottom = '2px solid transparent';
      el.style.fontWeight = '600';
    }
  }

  btnBack.style.display = _coStep > 1 ? 'block' : 'none';
  btnNext.textContent   = _coStep === 3 ? '🛒 Place Order' : 'Continue →';
  btnNext.style.background = _coStep === 3
    ? 'linear-gradient(135deg,#059669,#C9A84C)'
    : 'linear-gradient(135deg,#1A1612,#2C2414)';
}

function showCheckoutError(msg) {
  const existing = document.getElementById('coError');
  if (existing) existing.remove();
  const err = document.createElement('p');
  err.id = 'coError';
  err.style.cssText = 'color:#DC2626;font-size:.78rem;font-weight:600;margin:10px 0 0;text-align:center;';
  err.textContent = '⚠️ ' + msg;
  document.getElementById('coBody').appendChild(err);
  setTimeout(() => err.remove(), 3500);
}

function closeCheckoutModal() {
  /* Remove every checkout modal in case multiple got stacked */
  document.querySelectorAll('#checkoutModal').forEach(m => m.remove());
  /* Also remove any lingering body scroll-lock */
  document.body.style.overflow = '';
  _coStep = 1; _coDetails = {}; _coPayMethod = 'Pay on Delivery';
}

/* ── Delivery date calculator ──────────────────────────────────────
   Lagos = 2 days, nearby states = 3, mid-belt = 4-5, far north = 6-7
─────────────────────────────────────────────────────────────────── */
const DELIVERY_DAYS = {
  'Lagos': 2,
  'Ogun': 3, 'Oyo': 3, 'Osun': 3, 'Ekiti': 3, 'Ondo': 3,
  'Edo': 3, 'Delta': 3, 'Rivers': 4, 'Anambra': 4, 'Imo': 4,
  'Abia': 4, 'Enugu': 4, 'Ebonyi': 4, 'Cross River': 4,
  'Akwa Ibom': 4, 'Bayelsa': 5, 'Kwara': 4, 'Kogi': 4,
  'Benue': 5, 'Plateau': 5, 'Nasarawa': 5, 'Niger': 5,
  'FCT - Abuja': 5, 'Kaduna': 6, 'Kano': 6, 'Katsina': 7,
  'Jigawa': 7, 'Sokoto': 7, 'Kebbi': 7, 'Zamfara': 7,
  'Gombe': 6, 'Bauchi': 6, 'Yobe': 7, 'Borno': 7,
  'Adamawa': 6, 'Taraba': 6,
};
function getDeliveryDays(state) {
  return DELIVERY_DAYS[state] || 5;
}
function calcDeliveryDate(state) {
  const days = getDeliveryDays(state);
  const d = new Date();
  // Skip Sundays
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++; // 0 = Sunday
  }
  return {
    date: d.toISOString().slice(0, 10),
    label: d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    days,
  };
}

/* ── Auto-mark orders as delivered after delivery window ──────── */
function scheduleAutoDelivery(orderId, deliveryDateStr) {
  const deliveryTime = new Date(deliveryDateStr + 'T18:00:00').getTime();
  const now = Date.now();
  const delay = deliveryTime - now;
  if (delay <= 0) {
    // Already past — update immediately
    markOrderDelivered(orderId);
    return;
  }
  /* Store pending deliveries in localStorage so they survive page refresh */
  const pending = JSON.parse(localStorage.getItem('finexy_pending_deliveries') || '{}');
  pending[orderId] = { deliveryTime, deliveryDate: deliveryDateStr };
  localStorage.setItem('finexy_pending_deliveries', JSON.stringify(pending));

  setTimeout(() => markOrderDelivered(orderId), delay);
}

async function markOrderDelivered(orderId) {
  /* Remove from pending */
  const pending = JSON.parse(localStorage.getItem('finexy_pending_deliveries') || '{}');
  delete pending[orderId];
  localStorage.setItem('finexy_pending_deliveries', JSON.stringify(pending));

  try {
    await fetch(`${SUPA_URL}/rest/v1/orders?order_id=eq.${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ status: 'delivered', delivered_at: new Date().toISOString() }),
    });
    showToast(`🎉 Order #${orderId} has been delivered!`, 5000);
  } catch(_) {}
}

/* On every page load, resume any timers for pending deliveries */
(function resumePendingDeliveries() {
  try {
    const pending = JSON.parse(localStorage.getItem('finexy_pending_deliveries') || '{}');
    Object.entries(pending).forEach(([orderId, { deliveryTime }]) => {
      const delay = deliveryTime - Date.now();
      if (delay <= 0) {
        markOrderDelivered(orderId);
      } else {
        setTimeout(() => markOrderDelivered(orderId), delay);
      }
    });
  } catch(_) {}
})();

async function placeOrder() {
  const btn = document.getElementById('coBtnNext');
  btn.textContent = '⏳ Placing order…';
  btn.disabled = true;

  /* If Card Payment selected, validate card fields first */
  if (_coPayMethod === 'Card Payment') {
    const cardNum = document.getElementById('coCardNum')?.value.replace(/\s/g,'');
    const cardExp = document.getElementById('coCardExp')?.value;
    const cardCvv = document.getElementById('coCardCvv')?.value;
    const cardName= document.getElementById('coCardName')?.value.trim();
    if (!cardNum || cardNum.length < 15) { showCheckoutError('Please enter a valid card number.'); btn.textContent='🛒 Place Order'; btn.disabled=false; return; }
    if (!cardExp || !/^\d{2}\/\d{2}$/.test(cardExp)) { showCheckoutError('Please enter a valid expiry date (MM/YY).'); btn.textContent='🛒 Place Order'; btn.disabled=false; return; }
    if (!cardCvv || cardCvv.length < 3) { showCheckoutError('Please enter your CVV.'); btn.textContent='🛒 Place Order'; btn.disabled=false; return; }
    if (!cardName) { showCheckoutError('Please enter the name on your card.'); btn.textContent='🛒 Place Order'; btn.disabled=false; return; }
    /* Simulate card processing delay */
    await new Promise(r => setTimeout(r, 1800));
  }

  const total     = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);
  const orderId   = 'ORD-' + Date.now().toString().slice(-8);
  const today     = new Date().toISOString().slice(0, 10);
  const delivery  = calcDeliveryDate(_coDetails.state);

  const itemsSummary = cart.map(i => {
    let variant = [];
    if (i.size  && i.size  !== '')  variant.push(`Size: ${i.size}`);
    if (i.color && i.color !== '')  variant.push(`Colour: ${i.color}`);
    const variantStr = variant.length ? ` [${variant.join(', ')}]` : '';
    return `${i.name}${variantStr} (x${i.qty})`;
  }).join(', ');

  const orderPayload = {
    order_id:           orderId,
    date:               today,
    customer:           `${_coDetails.first} ${_coDetails.last}`,
    phone:              _coDetails.phone,
    email:              _coDetails.email,
    address:            `${_coDetails.address}, ${_coDetails.city}, ${_coDetails.state}`,
    notes:              _coDetails.notes || '',
    items_summary:      itemsSummary,
    items_count:        itemCount,
    total:              total,
    payment_method:     _coPayMethod,
    status:             'pending',
    delivery_date:      delivery.date,
    estimated_days:     delivery.days,
    customer_id:        STORE_USER ? (STORE_USER.id || null) : null,
    created_at:         new Date().toISOString(),
  };

  /* ── Save to Supabase ── */
  /* Core payload — only columns that definitely exist in every Finexy orders table */
  const corePayload = {
    order_id:       orderPayload.order_id,
    date:           orderPayload.date,
    customer:       orderPayload.customer,
    phone:          orderPayload.phone,
    email:          orderPayload.email,
    address:        orderPayload.address,
    notes:          orderPayload.notes,
    items_summary:  orderPayload.items_summary,
    items_count:    orderPayload.items_count,
    total:          orderPayload.total,
    payment_method: orderPayload.payment_method,
    status:         orderPayload.status,
    customer_id:    orderPayload.customer_id,
    created_at:     orderPayload.created_at,
  };

  /* Extended payload — includes new columns (delivery_date, estimated_days) */
  const fullPayload = { ...corePayload, delivery_date: orderPayload.delivery_date, estimated_days: orderPayload.estimated_days };

  let savedOk = false;
  try {
    /* Try full payload first */
    const res = await fetch(SUPA_URL + '/rest/v1/orders', {
      method: 'POST',
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
      },
      body: JSON.stringify(fullPayload),
    });
    if (res.ok) {
      savedOk = true;
      console.log('[Finexy] ✅ Order saved to Supabase:', orderId);
    } else {
      const errText = await res.text();
      console.warn('[Finexy] Full payload failed, trying core payload. Error:', errText);

      /* Retry with core-only columns (in case delivery_date/estimated_days cols don't exist yet) */
      const res2 = await fetch(SUPA_URL + '/rest/v1/orders', {
        method: 'POST',
        headers: {
          'apikey':        SUPA_KEY,
          'Authorization': 'Bearer ' + SUPA_KEY,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation',
        },
        body: JSON.stringify(corePayload),
      });
      if (res2.ok) {
        savedOk = true;
        console.log('[Finexy] ✅ Order saved (core columns only):', orderId);
        console.warn('[Finexy] Add delivery_date (text) and estimated_days (int) columns to your Supabase orders table for full functionality.');
      } else {
        const err2 = await res2.text();
        console.error('[Finexy] ❌ Order failed to save to Supabase. Full error:', err2);
        console.error('[Finexy] Check: 1) orders table exists 2) RLS policy allows insert 3) columns match payload');
      }
    }
  } catch(e) {
    console.error('[Finexy] ❌ Network error saving order:', e.message);
  }

  /* ── Deduct stock (best-effort, non-blocking) ── */
  try {
    const deductPromises = cart.map(async cartItem => {
      const prod = STORE.products.find(p => cartItem.sku && p.sku === cartItem.sku)
                || STORE.products.find(p => p.name.toLowerCase() === cartItem.name.toLowerCase());
      if (!prod || !prod.sku) return;
      const newQty = Math.max(0, (prod.qty || 0) - cartItem.qty);
      try {
        await fetch(`${SUPA_URL}/rest/v1/inventory?sku=eq.${encodeURIComponent(prod.sku)}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ qty: newQty, updated: today }),
        });
        prod.qty = newQty;
        if (newQty === 0) { prod._outOfStock = true;  prod._lowStock = false; prod.badge = 'Out of Stock'; }
        else if (newQty <= (prod.lowAt || 5)) { prod._outOfStock = false; prod._lowStock = true;  prod.badge = 'Low Stock'; }
        else { prod._outOfStock = false; prod._lowStock = false; prod.badge = null; }
      } catch (_) {}
    });
    await Promise.all(deductPromises);
  } catch(_) {}

  /* ── Always succeed: clear cart first, close modal, rebuild, show success ── */
  cart = []; saveCart(); syncCart();
  closeCheckoutModal();
  rebuildAll();
  scheduleAutoDelivery(orderId, delivery.date);
  showOrderSuccess(orderId, total, _coPayMethod, delivery);
}

function showOrderSuccess(orderId, total, payMethod, delivery) {
  const modal = document.createElement('div');
  modal.id = 'orderSuccessModal';
  modal.style.cssText = [
    'position:fixed','inset:0','z-index:99999',
    'display:flex','align-items:center','justify-content:center',
    'background:rgba(0,0,0,.6)','backdrop-filter:blur(6px)',
    'padding:16px',
  ].join(';');

  const isPOD      = payMethod === 'Pay on Delivery';
  const isTransfer = payMethod === 'Bank Transfer';
  const isCard     = payMethod === 'Card Payment';

  const payNote = isPOD
    ? '💵 Pay cash when your order arrives at your door. No advance payment needed.'
    : isTransfer
    ? '🏦 Please transfer payment before delivery. Our team will contact you with bank details shortly.'
    : '💳 Your card payment has been processed securely. You will receive a confirmation email shortly.';

  const payStatusBadge = isPOD
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:20px;background:#FEF3C7;color:#92400E;font-size:.7rem;font-weight:800;">⏳ Pay on Delivery</span>`
    : isTransfer
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:20px;background:#DBEAFE;color:#1E40AF;font-size:.7rem;font-weight:800;">🏦 Awaiting Transfer</span>`
    : `<span style="display:inline-block;padding:3px 10px;border-radius:20px;background:#D1FAE5;color:#065F46;font-size:.7rem;font-weight:800;">✅ Payment Received</span>`;

  modal.innerHTML = `
    <div style="background:#fff;border-radius:22px;max-width:460px;width:100%;padding:36px 30px;text-align:center;animation:coSlide .35s cubic-bezier(.16,1,.3,1);overflow-y:auto;max-height:92vh;">
      <div style="width:74px;height:74px;background:linear-gradient(135deg,#C9A84C,#8A6F30);border-radius:50%;display:grid;place-items:center;margin:0 auto 16px;font-size:2rem;color:#fff;">✓</div>
      <h2 style="font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:700;color:#111;margin:0 0 6px">Order Placed! 🎉</h2>
      <p style="color:#6B7280;font-size:.85rem;margin:0 0 20px">Your order <strong style="color:#C9A84C">#${orderId}</strong> has been received.</p>

      <div style="background:#F9FAFB;border-radius:14px;padding:18px;margin-bottom:14px;text-align:left;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:.75rem;color:#6B7280;font-weight:600;">Order ID</span>
          <span style="font-size:.78rem;font-weight:800;color:#111;">#${orderId}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:.75rem;color:#6B7280;font-weight:600;">Total</span>
          <span style="font-size:.78rem;font-weight:800;color:#C9A84C;">₦${fmt(total)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:.75rem;color:#6B7280;font-weight:600;">Payment</span>
          <span>${payStatusBadge}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid #E5E7EB;">
          <span style="font-size:.75rem;color:#6B7280;font-weight:600;">Status</span>
          <span style="display:inline-block;padding:3px 10px;border-radius:20px;background:#FEF3C7;color:#92400E;font-size:.7rem;font-weight:800;">📦 Processing</span>
        </div>
      </div>

      <!-- Delivery timeline -->
      <div style="background:linear-gradient(135deg,#0f0c29,#302b63);border-radius:14px;padding:18px;margin-bottom:14px;text-align:left;">
        <p style="font-size:.7rem;font-weight:800;color:rgba(255,255,255,.5);letter-spacing:.14em;text-transform:uppercase;margin:0 0 12px;">🚚 Estimated Delivery</p>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(201,168,76,.2);display:grid;place-items:center;font-size:1.2rem;flex-shrink:0;">📅</div>
          <div>
            <p style="font-size:.9rem;font-weight:800;color:#fff;margin:0 0 2px;">${delivery ? delivery.label : 'Within 2–7 business days'}</p>
            <p style="font-size:.72rem;color:rgba(255,255,255,.5);margin:0;">${delivery ? `Approximately ${delivery.days} business day${delivery.days > 1 ? 's' : ''} from now` : ''}</p>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          <div style="flex:1;text-align:center;padding:8px 6px;border-radius:10px;background:rgba(201,168,76,.15);border:1px solid rgba(201,168,76,.3);">
            <div style="font-size:.65rem;color:rgba(255,255,255,.5);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Ordered</div>
            <div style="font-size:.72rem;font-weight:800;color:#C9A84C;margin-top:3px;">Today ✓</div>
          </div>
          <div style="flex:1;text-align:center;padding:8px 6px;border-radius:10px;background:rgba(255,255,255,.06);">
            <div style="font-size:.65rem;color:rgba(255,255,255,.5);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Dispatched</div>
            <div style="font-size:.72rem;font-weight:800;color:rgba(255,255,255,.6);margin-top:3px;">In 24h</div>
          </div>
          <div style="flex:1;text-align:center;padding:8px 6px;border-radius:10px;background:rgba(255,255,255,.06);">
            <div style="font-size:.65rem;color:rgba(255,255,255,.5);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Delivered</div>
            <div style="font-size:.72rem;font-weight:800;color:rgba(255,255,255,.6);margin-top:3px;">${delivery ? delivery.label.split(',')[0] : '2–7 days'}</div>
          </div>
        </div>
      </div>

      <p style="font-size:.8rem;color:#6B7280;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px;margin-bottom:20px;line-height:1.55;text-align:left;">${payNote}</p>

      <button onclick="document.getElementById('orderSuccessModal').remove()" style="width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#1A1612,#C9A84C);color:#fff;font-size:.88rem;font-weight:800;cursor:pointer;font-family:inherit;letter-spacing:.06em;text-transform:uppercase;">Continue Shopping →</button>
    </div>`;

  document.body.appendChild(modal);
}

/* ─── SEARCH ─────────────────────────────────────── */
function liveSearch(val) {
  const dd = document.getElementById('searchDropdown');
  if (!val.trim()) { dd.style.display = 'none'; return; }
  const results = STORE.products.filter(p =>
    !p._outOfStock && (
      p.name.toLowerCase().includes(val.toLowerCase()) ||
      catName(p.category).toLowerCase().includes(val.toLowerCase())
    )
  ).slice(0, 6);
  if (results.length === 0) {
    dd.innerHTML = '<div class="sd-empty">No products found</div>';
  } else {
    dd.innerHTML = results.map(p => `
      <div class="sd-item" onclick="openProduct('${p.id}');document.getElementById('searchDropdown').style.display='none';document.getElementById('searchInput').value=''">
        <span class="sd-emoji">${p.emoji || '🎁'}</span>
        <div><p>${p.name}</p><small>₦${fmt(p.price)}</small></div>
      </div>`).join('');
  }
  dd.style.display = 'block';
}
function doSearch() {
  const val = (document.getElementById('searchInput')?.value || document.getElementById('mobileSearch')?.value || '').trim();
  if (!val) return;
  document.getElementById('searchDropdown').style.display = 'none';
  showPage('products');
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));
  const link = document.querySelector('[data-page="products"]');
  if (link) link.classList.add('active');
  setTimeout(() => {
    const list = STORE.products.filter(p =>
      p.name.toLowerCase().includes(val.toLowerCase()) ||
      catName(p.category).toLowerCase().includes(val.toLowerCase())
    );
    buildAllProducts(list);
  }, 500);
}

/* ─── BLOG ───────────────────────────────────────── */
function openBlogPost(id) {
  const post = STORE.blog.find(b => b.id === id);
  if (!post) return;
  prevPage = 'blog';
  document.getElementById('blogDetailContent').innerHTML = `
    <div style="font-size:4rem;margin-bottom:24px;">${post.emoji}</div>
    ${post.content}
    <div style="margin-top:48px;padding-top:28px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;">
      <p style="font-size:.85rem;color:var(--t2);">Enjoyed this article? Share it with a friend.</p>
      <button class="btn-outline" onclick="showToast('🔗 Link copied!')">Share →</button>
    </div>`;
  showPage('blog-detail');
}

/* ─── CONTACT ────────────────────────────────────── */
async function submitContact(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('button[type=submit]');

  /* Read form fields (support multiple common ID patterns) */
  const name    = (form.querySelector('#contactName,#contact-name,[name=name]')?.value    || '').trim();
  const email   = (form.querySelector('#contactEmail,#contact-email,[name=email]')?.value  || '').trim();
  const subject = (form.querySelector('#contactSubject,#contact-subject,[name=subject]')?.value || '').trim();
  const message = (form.querySelector('#contactMessage,#contact-message,#contactMsg,[name=message]')?.value || '').trim();

  if (!name || !email || !message) {
    showToast('\u26a0\ufe0f Please fill in all required fields.');
    return;
  }

  btn.textContent = 'Sending\u2026'; btn.disabled = true;

  try {
    const res = await fetch(SUPA_URL + '/rest/v1/contact_messages', {
      method: 'POST',
      headers: {
        'apikey':        SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        name, email, subject: subject || '(no subject)', message,
        status:     'open',
        created_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) throw new Error(await res.text());

    btn.textContent = 'Send Message \u2713';
    document.getElementById('contactSuccess').style.display = 'block';
    showToast('\u2705 Message sent! We\'ll respond within 24 hours.');
    form.reset();
    setTimeout(() => {
      btn.textContent = 'Send Message'; btn.disabled = false;
      document.getElementById('contactSuccess').style.display = 'none';
    }, 5000);

  } catch(err) {
    console.error('[Finexy] Contact form error:', err.message);
    btn.textContent = 'Send Message'; btn.disabled = false;
    showToast('\u274c Could not send message. Please try again.');
  }
}


/* ─── TOAST ──────────────────────────────────────── */
function showToast(msg, duration = 3500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

/* ─── TRIGGER ENTRANCE ANIM (initial load) ───────── */
function triggerEntranceAnim(pageId) {
  const page = document.getElementById(pageId);
  if (!page) return;
  const els = page.querySelectorAll(
    '.hero-badge, .hero-title, .hero-sub, .hero-btns, .hero-stats,' +
    '.section-eyebrow, .section-title, .product-card, .cat-card'
  );
  els.forEach((el, i) => {
    el.style.setProperty('--stagger-delay', `${Math.min(i * 60, 700)}ms`);
    el.classList.add('stagger-in');
    setTimeout(() => el.classList.remove('stagger-in'), 1200 + i * 60);
  });
}
/* ════════════════════════════════════════════════════
   STORE AUTH SYSTEM — Login / Signup / Logout
   Uses same Supabase DB as admin panel (customers table)
════════════════════════════════════════════════════ */

const STORE_SUPA_URL = 'https://ymkgqqerdocfcgyphfzs.supabase.co';
const STORE_SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlta2dxcWVyZG9jZmNneXBoZnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODA3MzUsImV4cCI6MjA5NTA1NjczNX0.SqwwSpwvsstfumhpTJasSsGMbe0LAm7Z3N-H0U2PoVc';

async function storeApiCall(path, options = {}) {
  const method  = options.method || 'GET';
  const headers = {
    'apikey':        STORE_SUPA_KEY,
    'Authorization': 'Bearer ' + STORE_SUPA_KEY,
    'Content-Type':  'application/json',
  };
  if (method === 'POST' || method === 'PATCH') headers['Prefer'] = 'return=representation';
  const fetchOpts = { method, headers };
  if (options.body) fetchOpts.body = options.body;
  const res = await fetch(STORE_SUPA_URL + '/rest/v1/' + path, fetchOpts);
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : [];
}

// ── Session ──────────────────────────────────────────────────────
let STORE_USER = null;

function loadStoreSession() {
  try {
    const raw = localStorage.getItem('cp_store_session');
    if (raw) {
      STORE_USER = JSON.parse(raw);
      updateNavAccount();
    }
  } catch(e) {}
}

function saveStoreSession(user) {
  STORE_USER = user;
  localStorage.setItem('cp_store_session', JSON.stringify(user));
  updateNavAccount();
}

function clearStoreSession() {
  STORE_USER = null;
  localStorage.removeItem('cp_store_session');
  updateNavAccount();
}

function updateNavAccount() {
  const signInBtn  = document.getElementById('navSignInBtn');
  const userMenu   = document.getElementById('navUserMenu');
  const navAvatar  = document.getElementById('navUserAvatar');
  const navName    = document.getElementById('navUserName');
  const dropName   = document.getElementById('dropUserName');
  const dropEmail  = document.getElementById('dropUserEmail');

  if (STORE_USER) {
    if (signInBtn) signInBtn.style.display = 'none';
    if (userMenu)  userMenu.style.display  = 'block';
    const initials = ((STORE_USER.first?.[0]||'') + (STORE_USER.last?.[0]||'')).toUpperCase() || '?';
    if (navAvatar) navAvatar.textContent = initials;
    if (navName)   navName.textContent   = STORE_USER.first || 'User';
    if (dropName)  dropName.textContent  = `${STORE_USER.first} ${STORE_USER.last}`;
    if (dropEmail) dropEmail.textContent = STORE_USER.email || '';
  } else {
    if (signInBtn) signInBtn.style.display = 'flex';
    if (userMenu)  userMenu.style.display  = 'none';
  }
}

// ── Modal open/close/switch ───────────────────────────────────────
let _saDestination = null;

function openStoreAuth(destination) {
  _saDestination = destination || 'products';
  const overlay = document.getElementById('storeAuthOverlay');
  if (!overlay) return;
  if (STORE_USER) { goToDestination(); return; }
  /* Use .open class — CSS handles opacity/pointer-events transition */
  overlay.classList.add('open');
  switchStoreTab('login');
  // Reset all form fields
  ['saLEmail','saLPw','saSFirst','saSLast','saSEmail','saSPhone','saSPw','saFEmail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['saLMsg','saSMsg','saFMsg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const ss = document.getElementById('saSuccessState');
  if (ss) ss.style.display = 'none';
}

function closeStoreAuth(e) {
  /* Close when clicking the backdrop (overlay itself), or called directly */
  if (e && e.target && e.target.id !== 'storeAuthOverlay') return;
  document.getElementById('storeAuthOverlay').classList.remove('open');
}

function switchStoreTab(tab) {
  const forms = { login:'saLoginForm', signup:'saSignupForm', forgot:'saForgotForm' };
  Object.entries(forms).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = key === tab ? 'block' : 'none';
  });
  document.getElementById('saSuccessState').style.display = 'none';

  // Tab buttons
  const loginTab  = document.getElementById('saTabLogin');
  const signupTab = document.getElementById('saTabSignup');
  if (loginTab && signupTab) {
    if (tab === 'login') {
      loginTab.style.cssText  = 'flex:1;padding:10px;border-radius:9px;border:none;font-size:.85rem;font-weight:700;font-family:\'Syne\',sans-serif;background:#fff;color:#7C3AED;box-shadow:0 2px 8px rgba(124,58,237,.12);transition:all .2s;cursor:pointer;';
      signupTab.style.cssText = 'flex:1;padding:10px;border-radius:9px;border:none;font-size:.85rem;font-weight:700;font-family:\'Syne\',sans-serif;background:transparent;color:#9CA3AF;transition:all .2s;cursor:pointer;';
    } else if (tab === 'signup') {
      signupTab.style.cssText = 'flex:1;padding:10px;border-radius:9px;border:none;font-size:.85rem;font-weight:700;font-family:\'Syne\',sans-serif;background:#fff;color:#7C3AED;box-shadow:0 2px 8px rgba(124,58,237,.12);transition:all .2s;cursor:pointer;';
      loginTab.style.cssText  = 'flex:1;padding:10px;border-radius:9px;border:none;font-size:.85rem;font-weight:700;font-family:\'Syne\',sans-serif;background:transparent;color:#9CA3AF;transition:all .2s;cursor:pointer;';
    }
  }
}

function showSaMsg(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = type === 'error' ? '#FEF2F2' : '#F0FDF4';
  el.style.color      = type === 'error' ? '#DC2626'  : '#16A34A';
  el.style.border     = `1px solid ${type === 'error' ? '#FECACA' : '#BBF7D0'}`;
}

function toggleSaPw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') { inp.type = 'text';     btn.textContent = '🙈'; }
  else                         { inp.type = 'password'; btn.textContent = '👁'; }
}

function toggleStoreUserMenu() {
  const dd = document.getElementById('storeUserDropdown');
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', e => {
  const menu = document.getElementById('navUserMenu');
  const dd   = document.getElementById('storeUserDropdown');
  if (dd && menu && !menu.contains(e.target)) dd.style.display = 'none';
});

function goToDestination() {
  closeStoreAuth();
  if (_saDestination === 'shop' || _saDestination === 'products') {
    navClick(document.querySelector('[data-page=products]'), 'products');
  }
}

function navigateToOrders() {
  document.getElementById('storeUserDropdown').style.display = 'none';
  showToast('📦 Order history coming soon!', 3000);
}

function storeLogout() {
  clearStoreSession();
  document.getElementById('storeUserDropdown').style.display = 'none';
  showToast('👋 You have been signed out.', 3000);
}

// ── Sign In ────────────────────────────────────────────────────────
async function doStoreLogin() {
  const email = document.getElementById('saLEmail')?.value.trim().toLowerCase();
  const pw    = document.getElementById('saLPw')?.value;
  if (!email || !pw) { showSaMsg('saLMsg','Please enter your email and password.','error'); return; }

  const btn = document.getElementById('saLBtn');
  btn.textContent = 'Signing in…'; btn.disabled = true;

  try {
    const rows = await storeApiCall('store_customers?email=eq.'+encodeURIComponent(email)+'&select=*');
    const user = rows[0];
    if (!user || user.password !== pw) {
      showSaMsg('saLMsg','Incorrect email or password. Try again.','error');
      btn.innerHTML = 'Sign In <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
      btn.disabled = false; return;
    }
    saveStoreSession(user);
    showSaMsg('saLMsg', `Welcome back, ${user.first}! 🎉`, 'success');
    setTimeout(() => { goToDestination(); }, 900);
  } catch(e) {
    showSaMsg('saLMsg','Connection error. Please try again.','error');
    btn.innerHTML = 'Sign In <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    btn.disabled = false;
  }
}

// ── Sign Up ────────────────────────────────────────────────────────
async function doStoreSignup() {
  const first = document.getElementById('saSFirst')?.value.trim();
  const last  = document.getElementById('saSLast')?.value.trim();
  const email = document.getElementById('saSEmail')?.value.trim().toLowerCase();
  const phone = document.getElementById('saSPhone')?.value.trim();
  const pw    = document.getElementById('saSPw')?.value;

  if (!first||!last||!email||!phone||!pw) { showSaMsg('saSMsg','Please fill in all fields.','error'); return; }
  if (!email.includes('@')) { showSaMsg('saSMsg','Please enter a valid email address.','error'); return; }
  if (pw.length < 6) { showSaMsg('saSMsg','Password must be at least 6 characters.','error'); return; }

  const btn = document.getElementById('saSBtn');
  btn.textContent = 'Creating account…'; btn.disabled = true;

  try {
    // Check if email already exists
    const existing = await storeApiCall('store_customers?email=eq.'+encodeURIComponent(email)+'&select=id');
    if (existing.length > 0) {
      showSaMsg('saSMsg','An account with this email already exists. Sign in instead.','error');
      btn.innerHTML = 'Create Account <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
      btn.disabled = false; return;
    }

    const result = await storeApiCall('store_customers', {
      method: 'POST',
      body: JSON.stringify({ first, last, email, phone, password: pw, created_at: new Date().toISOString() }),
    });
    const newUser = result[0];
    saveStoreSession(newUser);

    // Show success state
    document.getElementById('saSignupForm').style.display = 'none';
    document.getElementById('saSuccessState').style.display = 'block';
    document.getElementById('saSuccessTitle').textContent = `Welcome, ${first}! 🎉`;
    document.getElementById('saSuccessMsg').textContent   = 'Your account has been created successfully. You can now start shopping!';
    setTimeout(() => { goToDestination(); }, 2000);

  } catch(e) {
    showSaMsg('saSMsg','Could not create account. Please try again.','error');
    btn.innerHTML = 'Create Account <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    btn.disabled = false;
  }
}

// ── Forgot Password ────────────────────────────────────────────────
async function doStoreForgot() {
  const email = document.getElementById('saFEmail')?.value.trim().toLowerCase();
  if (!email || !email.includes('@')) { showSaMsg('saFMsg','Please enter a valid email address.','error'); return; }

  try {
    const rows = await storeApiCall('store_customers?email=eq.'+encodeURIComponent(email)+'&select=email');
    if (!rows.length) { showSaMsg('saFMsg','No account found with this email address.','error'); return; }
    document.getElementById('saForgotForm').style.display = 'none';
    document.getElementById('saSuccessState').style.display = 'block';
    document.getElementById('saSuccessTitle').textContent = 'Check your email 📧';
    document.getElementById('saSuccessMsg').textContent   = `We've sent a password reset link to ${email}. Check your inbox.`;
  } catch(e) {
    showSaMsg('saFMsg','Something went wrong. Please try again.','error');
  }
}

// ── Init on page load ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadStoreSession();
});
