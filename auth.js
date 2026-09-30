(() => {
  'use strict';
  const API = 'https://script.google.com/macros/s/AKfycbzQTAJGkaqzLEZs6xiEBMUp7rnLSxQiZxUQzNPiciAWxdj3ZUL6ObW4iAUfkmutueVasw/exec';
  const SESSION_MS = 12 * 60 * 60 * 1000;
  const $ = id => document.getElementById(id);
  const upper = value => String(value || '').trim().toUpperCase();
  const digits = value => String(value || '').replace(/\D/g, '');
  const role = value => { let out = upper(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_'); if (out === 'DESENVOLVER_MASTER') out = 'DESENVOLVEDOR_MASTER'; return out; };
  const branch = value => { const number = digits(value); return number ? `FILIAL ${parseInt(number, 10)}` : upper(value).replace(/\s+/g, ' '); };
  const deviceId = () => { let id = localStorage.getItem('fs_device_id'); if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `fs-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('fs_device_id', id); } return id; };
  const user = () => ({ filial: branch(localStorage.getItem('fs_filial')), nome: upper(localStorage.getItem('fs_nome')), cargo: role(localStorage.getItem('fs_cargo')), whatsapp: digits(localStorage.getItem('fs_whatsapp')), genero: upper(localStorage.getItem('fs_genero') || 'AUTOMATICO'), token: localStorage.getItem('fs_access_token') || '', podeCompartilhar: localStorage.getItem('fs_pode_compartilhar') === '1' });
  const complete = data => Boolean(data.filial && data.nome && data.cargo && data.whatsapp.length >= 10);
  const fingerprint = data => [branch(data.filial), upper(data.nome), role(data.cargo), digits(data.whatsapp)].join('|');
  const localValid = data => { const verified = Number(localStorage.getItem('fs_access_verified_at') || 0); return localStorage.getItem('fsAuthGlobal') === 'ok-@fildO1060' && verified > 0 && Date.now() - verified < SESSION_MS && localStorage.getItem('fs_access_verified_fingerprint') === fingerprint(data); };

  function setMessage(text, type = 'info') { const box = $('message'); box.textContent = text || ''; box.className = `message${text ? ` show ${type}` : ''}`; }
  function busy(active) { $('enterBtn').disabled = active; $('clearBtn').disabled = active; $('loading').classList.toggle('show', active); $('formGrid').style.display = active ? 'none' : 'grid'; }
  function save(data) {
    const normalized = { filial: branch(data.filial), nome: upper(data.nome), cargo: role(data.cargo), whatsapp: digits(data.whatsapp), genero: upper(data.genero || 'AUTOMATICO'), token: data.token || data.convite_token || '', podeCompartilhar: data.podeCompartilhar === true || data.pode_compartilhar === true };
    localStorage.setItem('fs_filial', normalized.filial); localStorage.setItem('fs_nome', normalized.nome); localStorage.setItem('fs_cargo', normalized.cargo); localStorage.setItem('fs_whatsapp', normalized.whatsapp); localStorage.setItem('fs_genero', normalized.genero); localStorage.setItem('fs_access_token', normalized.token); localStorage.setItem('fs_pode_compartilhar', normalized.podeCompartilhar ? '1' : '0'); localStorage.setItem('fsAuthGlobal', 'ok-@fildO1060'); localStorage.setItem('fs_access_persisted', '1'); localStorage.setItem('fs_access_verified_at', String(Date.now())); localStorage.setItem('fs_access_verified_fingerprint', fingerprint(normalized)); localStorage.setItem('nomeVendedor', normalized.nome); localStorage.setItem('nomeVendedorLogado', normalized.nome); localStorage.setItem('vendedor_nome', normalized.nome);
    sessionStorage.setItem('fs_access_done', '1');
  }
  function clearAuth() { ['fs_filial','fs_nome','fs_cargo','fs_whatsapp','fs_genero','fs_access_token','fs_pode_compartilhar','fsAuthGlobal','fs_access_persisted','fs_access_verified_at','fs_access_verified_fingerprint'].forEach(key => localStorage.removeItem(key)); }
  async function validate(data) {
    const url = `${API}?acao=validarAcesso&filial=${encodeURIComponent(branch(data.filial))}&nome=${encodeURIComponent(upper(data.nome))}&cargo=${encodeURIComponent(role(data.cargo))}&whatsapp=${encodeURIComponent(digits(data.whatsapp))}&token=${encodeURIComponent(data.token || '')}&device_id=${encodeURIComponent(deviceId())}&_=${Date.now()}`;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 16000);
    try { const response = await fetch(url, { cache: 'no-store', signal: controller.signal, redirect: 'follow' }); const text = await response.text(); if (!response.ok) throw new Error(`HTTP ${response.status}`); try { return JSON.parse(text); } catch (_) { throw new Error('Resposta inválida do servidor de acesso'); } }
    finally { clearTimeout(timeout); }
  }
  async function transfer(data) { const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: 'transferirAcesso', filial: branch(data.filial), nome: upper(data.nome), cargo: role(data.cargo), whatsapp: digits(data.whatsapp), token: data.token || '', device_id: deviceId(), master_multi: ['GERENTE','DESENVOLVEDOR_MASTER'].includes(role(data.cargo)) }) }); const text=await response.text(); if(!response.ok) throw new Error(`HTTP ${response.status}`); try{return JSON.parse(text)}catch(_){throw new Error('Resposta inválida do servidor de acesso')} }
  const conflict = json => { const code = upper(json?.codigo); const message = upper(json?.mensagem); return code === 'DEVICE_CONFLICT' || code === 'APARELHO_DIFERENTE' || message.includes('OUTRO APARELHO') || message.includes('OUTRO DISPOSITIVO'); };
  function go() { $('statusDot').classList.add('ok'); setMessage('Acesso autorizado. Abrindo seus resultados…', 'ok'); const target = role(localStorage.getItem('fs_cargo')) === 'VENDEDOR' ? './vendedor.html' : './resultados.html'; setTimeout(() => location.replace(target), 280); }
  async function authorize(data, allowLocalFallback = false) {
    busy(true); setMessage('');
    try {
      let json = await validate(data);
      if (json?.ok === true) { save({ ...data, ...(json.usuario || {}), pode_compartilhar: json.pode_compartilhar }); go(); return; }
      if (conflict(json) && confirm(`${json.mensagem || 'Este acesso está ativo em outro aparelho.'}\n\nDeseja utilizar o acesso neste aparelho?`)) {
        json = await transfer(data); if (json?.ok === true) { save({ ...data, ...(json.usuario || {}), pode_compartilhar: json.pode_compartilhar }); go(); return; }
      }
      clearAuth(); busy(false); fill(data); setMessage(json?.mensagem || 'Acesso não autorizado. Confira os dados informados.', 'error');
    } catch (error) {
      if (allowLocalFallback && localValid(data)) { go(); return; }
      busy(false); fill(data); setMessage('Não foi possível comunicar com o banco de acesso. Verifique sua conexão e tente novamente.', 'error');
    }
  }
  function readForm() { return { filial: branch($('filial').value), nome: upper($('nome').value), cargo: role($('cargo').value), whatsapp: digits($('whatsapp').value), genero: upper($('genero').value), token: window.__inviteToken || user().token || '' }; }
  function fill(data = {}) { $('filial').value = branch(data.filial); $('nome').value = upper(data.nome); $('cargo').value = role(data.cargo); $('whatsapp').value = digits(data.whatsapp); $('genero').value = upper(data.genero || 'AUTOMATICO'); }
  function inviteFromUrl() { const params = new URLSearchParams(location.search); const data = { filial: params.get('filial'), nome: params.get('nome'), cargo: params.get('cargo'), whatsapp: params.get('whatsapp'), genero: params.get('genero'), token: params.get('token') || '' }; window.__inviteToken = data.token; return data; }

  $('accessForm').addEventListener('submit', event => { event.preventDefault(); const data = readForm(); if (!complete(data)) { setMessage('Informe filial, nome completo, cargo e WhatsApp com DDD.', 'error'); return; } authorize(data, false); });
  $('clearBtn').addEventListener('click', () => { clearAuth(); fill({}); setMessage('Dados locais removidos. Informe novamente para acessar.', 'info'); $('filial').focus(); });
  ['filial','nome','cargo'].forEach(id => $(id).addEventListener('input', event => { const position = event.target.selectionStart; event.target.value = upper(event.target.value); try { event.target.setSelectionRange(position, position); } catch (_) {} }));
  $('whatsapp').addEventListener('input', event => { event.target.value = digits(event.target.value); });

  const invite = inviteFromUrl(); const saved = user(); const initial = complete(invite) ? invite : saved; fill(initial);
  if (complete(saved) && localValid(saved)) authorize(saved, true);
  else if (complete(invite)) setMessage('Convite identificado. Confira os dados e toque em Entrar.', 'info');
})();
