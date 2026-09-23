(() => {
  'use strict';

  const STORE = 'fs_gestao_resultados_v2';
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbx9pLFWtpngXQemQLORPiY16pGlxKTU7Hw10cSZSzieoiMmn-CStDKfo5oUENimSwzv/exec';
  const TOKEN = '2c97791424feb4029ae889e3ab094596b158d2f4c680172b';
  const POLL_MS = 12000;
  let timer = null;
  let sending = false;
  let pending = null;

  const enabled = () => /^https:\/\/script\.google\.com\/macros\/s\//.test(ENDPOINT);
  const status = (text, tone = 'ok') => {
    const el = document.getElementById('saveState');
    if (!el) return;
    el.textContent = text;
    el.className = 'save-state';
    if (tone === 'busy') { el.style.background = '#fff6e4'; el.style.color = '#8a5b05'; }
    else if (tone === 'error') { el.style.background = '#fff0f2'; el.style.color = '#b42335'; }
    else { el.style.background = '#e9f8f1'; el.style.color = '#087a4b'; }
  };
  const newestStamp = vault => {
    const stamps = [vault?._cloudUpdatedAt, ...Object.values(vault?.records || {}).map(r => r?.updatedAt)];
    return Math.max(0, ...stamps.map(x => Date.parse(x || 0) || 0));
  };
  const comparable = value => {
    if (!value) return value;
    const copy = JSON.parse(JSON.stringify(value));
    delete copy._cloudUpdatedAt;
    return copy;
  };
  const same = (a, b) => JSON.stringify(comparable(a) || null) === JSON.stringify(comparable(b) || null);

  const parseStamp = value => Date.parse(value || 0) || 0;
  function sellerKey(seller, index = 0) {
    if (seller?.id) return String(seller.id);
    return String(seller?.name || `seller-${index}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  }
  function mergeVaults(remote, local) {
    if (!remote) return local;
    if (!local) return remote;
    const merged = JSON.parse(JSON.stringify(parseStamp(local?._cloudUpdatedAt) >= parseStamp(remote?._cloudUpdatedAt) ? local : remote));
    merged.records = merged.records || {};
    const keys = new Set([...Object.keys(remote.records || {}), ...Object.keys(local.records || {})]);
    keys.forEach(key => {
      const rr = remote.records?.[key], lr = local.records?.[key];
      if (!rr) { merged.records[key] = JSON.parse(JSON.stringify(lr)); return; }
      if (!lr) { merged.records[key] = JSON.parse(JSON.stringify(rr)); return; }
      const base = parseStamp(lr.updatedAt) >= parseStamp(rr.updatedAt) ? lr : rr;
      const out = JSON.parse(JSON.stringify(base));
      const deleted = {};
      const absorbDeleted = source => {
        Object.entries(source?.deletedSellers || {}).forEach(([id, tomb]) => {
          const prior = deleted[id];
          if (!prior || parseStamp(tomb?.deletedAt) >= parseStamp(prior?.deletedAt)) deleted[id] = JSON.parse(JSON.stringify(tomb));
        });
      };
      absorbDeleted(rr); absorbDeleted(lr);
      const map = new Map();
      (rr.sellers || []).forEach((seller, index) => map.set(sellerKey(seller,index), JSON.parse(JSON.stringify(seller))));
      (lr.sellers || []).forEach((seller, index) => {
        const k = sellerKey(seller,index), prior = map.get(k);
        if (!prior || parseStamp(seller.updatedAt) >= parseStamp(prior.updatedAt)) map.set(k, JSON.parse(JSON.stringify(seller)));
      });
      for (const [id, seller] of [...map.entries()]) {
        const tomb = deleted[id];
        if (tomb && parseStamp(tomb.deletedAt) >= parseStamp(seller?.updatedAt)) map.delete(id);
      }
      out.deletedSellers = deleted;
      out.sellers = [...map.values()];
      merged.records[key] = out;
    });
    const latestCloudStamp = Math.max(parseStamp(local?._cloudUpdatedAt), parseStamp(remote?._cloudUpdatedAt));
    merged._cloudUpdatedAt = latestCloudStamp ? new Date(latestCloudStamp).toISOString() : new Date().toISOString();
    return merged;
  }
  function loadRemote() {
    return new Promise((resolve, reject) => {
      const callback = `__resultsMerge_${Date.now()}`;
      const script = document.createElement('script');
      const cleanup = () => { delete window[callback]; script.remove(); };
      window[callback] = response => { cleanup(); response?.ok ? resolve(response.vault || null) : reject(new Error(response?.error || 'Falha')); };
      script.onerror = () => { cleanup(); reject(new Error('Falha de conexão')); };
      script.src = `${ENDPOINT}?action=load&token=${encodeURIComponent(TOKEN)}&callback=${callback}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  async function pushNow() {
    if (!enabled() || sending || !pending) return;
    sending = true;
    let vault = pending;
    pending = null;
    status('↑ Sincronizando com a nuvem…', 'busy');
    try {
      try { vault = mergeVaults(await loadRemote(), vault); } catch (_) { /* mantém a cópia local se a leitura remota falhar */ }
      localStorage.setItem(STORE, JSON.stringify(vault));
      await fetch(ENDPOINT, {
        method: 'POST', mode: 'no-cors', cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save', token: TOKEN, vault })
      });
      status('✓ Dados enviados para a nuvem');
    } catch (error) {
      pending = pending || vault;
      status('⚠ Salvo neste aparelho; nuvem indisponível', 'error');
    } finally {
      sending = false;
      if (pending) timer = setTimeout(pushNow, 1200);
    }
  }

  function queue(vault) {
    if (!enabled()) return;
    const copy = JSON.parse(JSON.stringify(vault));
    copy._cloudUpdatedAt = new Date().toISOString();
    localStorage.setItem(STORE, JSON.stringify(copy));
    pending = copy;
    clearTimeout(timer);
    timer = setTimeout(pushNow, 800);
  }

  function pull() {
    if (!enabled() || pending || sending) return;
    const callback = `__resultsCloud_${Date.now()}`;
    const script = document.createElement('script');
    const cleanup = () => { delete window[callback]; script.remove(); };
    window[callback] = response => {
      try {
        if (!response?.ok) throw new Error(response?.error || 'Falha na sincronização');
        const remote = response.vault;
        const local = JSON.parse(localStorage.getItem(STORE) || 'null');
        if (!remote) {
          if (local) queue(local);
          return;
        }
        if (same(remote, local)) { status('✓ Sincronizado com a nuvem'); return; }
        const reconciled = mergeVaults(remote, local);
        const localJson = JSON.stringify(local || null), reconciledJson = JSON.stringify(reconciled || null);
        localStorage.setItem(STORE, reconciledJson);
        if (localJson !== reconciledJson) {
          pending = reconciled;
          clearTimeout(timer);
          timer = setTimeout(pushNow, 300);
        }
        status('↓ Nova atualização recebida da nuvem', 'busy');
        try {
          const activeView = document.querySelector('.view.active')?.id;
          if (activeView) sessionStorage.setItem('fs_resultados_active_view', activeView);
          sessionStorage.setItem('fs_resultados_scroll_y', String(window.scrollY || 0));
        } catch (_) {}
        setTimeout(() => location.reload(), 700);
      } catch (error) {
        status('⚠ Salvo neste aparelho; sem conexão com a nuvem', 'error');
      } finally { cleanup(); }
    };
    script.onerror = () => { cleanup(); status('⚠ Salvo neste aparelho; sem conexão com a nuvem', 'error'); };
    script.src = `${ENDPOINT}?action=load&token=${encodeURIComponent(TOKEN)}&callback=${callback}&_=${Date.now()}`;
    document.head.appendChild(script);
  }

  window.ResultsCloudSync = { queue, pull, enabled };
  window.addEventListener('DOMContentLoaded', () => {
    if (!enabled()) { status('✓ Dados salvos neste aparelho'); return; }
    status('⟳ Conectando à nuvem…', 'busy');
    setTimeout(pull, 400);
    setInterval(pull, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  });
})();
