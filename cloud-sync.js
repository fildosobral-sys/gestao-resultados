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
  const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

  async function pushNow() {
    if (!enabled() || sending || !pending) return;
    sending = true;
    const vault = pending;
    pending = null;
    status('↑ Sincronizando com a nuvem…', 'busy');
    try {
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
        if (newestStamp(local) > newestStamp(remote)) { queue(local); return; }
        localStorage.setItem(STORE, JSON.stringify(remote));
        status('↓ Novos dados recebidos; atualizando…', 'busy');
        setTimeout(() => location.reload(), 350);
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
