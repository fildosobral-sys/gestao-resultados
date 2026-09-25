(() => {
  'use strict';

  const STORE = 'fs_gestao_resultados_v2';
  const LEGACY_STORE = 'fs_gestao_resultados_v1';
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct2 = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const efficiencyPct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = new Date();
  const monthDefault = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const moneyFields = new Set(['general', 'grossProfit', 'eligible', 'warranty', 'other', 'mixed']);

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const num = (value) => {
    if (typeof value === 'number') return Math.max(0, Number.isFinite(value) ? value : 0);
    let text = String(value ?? '').trim().replace(/R\$|\s/g, '');
    if (!text) return 0;
    if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    const parsed = Number(text);
    return Math.max(0, Number.isFinite(parsed) ? parsed : 0);
  };
  const signedBrl = (value) => { const n = Number(value || 0); return `${n > 0 ? '+ ' : n < 0 ? '− ' : ''}${brl.format(Math.abs(n))}`; };
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const sellerIdentity = (seller = {}, index = 0) => {
    if (seller.id) return String(seller.id);
    const slug = String(seller.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `seller-${slug || index + 1}`;
  };
  const monthLabel = (month) => {
    const [year, number] = month.split('-').map(Number);
    return new Date(year, number - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };
  const automaticWeekEnds = (month) => {
    const [year, number] = String(month || monthDefault).split('-').map(Number);
    const days = new Date(year, number, 0).getDate(), firstDay = new Date(year, number - 1, 1).getDay();
    const mondayOffset = (firstDay + 6) % 7;
    const ends = [], firstEnd = Math.min(days, 7 - mondayOffset);
    for (let end = firstEnd; end < days; end += 7) ends.push(end);
    if (ends.at(-1) !== days) ends.push(days);
    return ends;
  };
  const normalizeWeekEnds = (month, raw) => {
    const [year, number] = String(month || monthDefault).split('-').map(Number), days = new Date(year, number, 0).getDate();
    const source = Array.isArray(raw) ? raw : String(raw || '').split(/[,;\s]+/);
    const ends = [...new Set(source.map((value) => Math.round(num(value))).filter((value) => value >= 1 && value <= days))].sort((a, b) => a - b);
    if (!ends.length) return [];
    if (ends.at(-1) !== days) ends.push(days);
    return ends;
  };
  const automaticWeeks = (month) => automaticWeekEnds(month).length;
  const recordKey = (branch, month) => `${String(branch || 'SEM FILIAL').trim().toUpperCase()}|${month}`;
  const baseRecord = (branch = '', month = monthDefault) => ({
    branch, month, businessDays: 25, weeks: automaticWeeks(month), weekEnds: [],
    mercantileGoal: 1220000, grossProfitGoal: 407000,
    eligibleGoal: 0, eligibleGoalConfirmed: false, servicesGoal: 60000, efficiencyGoal: 0.055,
    goals: [1220000, 1220000, 1281000],
    warrantyGoal: 81200, warrantyWeekly: 13300,
    ecommerce: 0, grossProfitActual: 0, returns: 0, sellerCount: 0,
    auditOwner: '', auditSource: '', auditNote: '', configAudit: [],
    daily: {}, sellers: [], deletedSellers: {}, updatedAt: new Date().toISOString()
  });
  const normalizeRecord = (raw = {}) => {
    const legacyGoal = Array.isArray(raw.goals) ? num(raw.goals[0]) : 0;
    const mercantileGoal = num(raw.mercantileGoal) || legacyGoal || 1220000;
    const weekEnds = normalizeWeekEnds(raw.month || monthDefault, raw.weekEnds);
    return {
      ...baseRecord(raw.branch || '', raw.month || monthDefault), ...raw,
      weeks: weekEnds.length || automaticWeeks(raw.month || monthDefault), weekEnds,
      mercantileGoal,
      grossProfitGoal: num(raw.grossProfitGoal) || 407000,
      eligibleGoal: 0,
      eligibleGoalConfirmed: false,
      servicesGoal: num(raw.servicesGoal) || 60000,
      efficiencyGoal: num(raw.efficiencyGoal) || 0.055,
      goals: [mercantileGoal, mercantileGoal, mercantileGoal * 1.05],
      daily: raw.daily && typeof raw.daily === 'object' ? raw.daily : {},
      sellers: Array.isArray(raw.sellers) ? raw.sellers.map((seller, index) => ({
        ...seller,
        id: sellerIdentity(seller, index),
        daily: seller.daily && typeof seller.daily === 'object' ? seller.daily : {},
        serviceGoal: num(seller.serviceGoal),
        commissionMercantileRate: Object.prototype.hasOwnProperty.call(seller, 'commissionMercantileRate') ? num(seller.commissionMercantileRate) : (num(seller.general) ? num(seller.commissionMercantile) / num(seller.general) * 100 : 0),
        commissionServiceRate: Object.prototype.hasOwnProperty.call(seller, 'commissionServiceRate') ? num(seller.commissionServiceRate) : 5,
        updatedAt: seller.updatedAt || raw.updatedAt || new Date(0).toISOString()
      })) : [],
      deletedSellers: raw.deletedSellers && typeof raw.deletedSellers === 'object' ? raw.deletedSellers : {},
      configAudit: Array.isArray(raw.configAudit) ? raw.configAudit : []
    };
  };

  function tierGoals(source = db) {
    const mercantile = num(source.mercantileGoal), gross = num(source.grossProfitGoal);
    return [
      { name: 'Meta 1', mercantile, grossProfit: gross * 0.95, mercPct: 1, grossPct: 0.95 },
      { name: 'Meta 2', mercantile, grossProfit: gross, mercPct: 1, grossPct: 1 },
      { name: 'Meta 3', mercantile: mercantile * 1.05, grossProfit: gross, mercPct: 1.05, grossPct: 1 }
    ];
  }
  function tierRate(tier, mercantileResult, grossProfitResult, grossAvailable = true) {
    const mercRate = tier.mercantile ? num(mercantileResult) / tier.mercantile : 0;
    const grossRate = tier.grossProfit ? num(grossProfitResult) / tier.grossProfit : 0;
    const overall = grossAvailable ? Math.min(mercRate, grossRate) : mercRate;
    return { mercRate, grossRate, grossAvailable, overall, passed: mercRate >= 1 && (!grossAvailable || grossRate >= 1) };
  }
  function configSnapshot(source = db) {
    return {
      businessDays: num(source.businessDays), weeks: num(source.weeks), weekEnds: normalizeWeekEnds(source.month, source.weekEnds), sellerCount: num(source.sellerCount),
      mercantileGoal: num(source.mercantileGoal), grossProfitGoal: num(source.grossProfitGoal),
      servicesGoal: num(source.servicesGoal), efficiencyGoal: num(source.efficiencyGoal), warrantyGoal: num(source.warrantyGoal), warrantyWeekly: num(source.warrantyWeekly)
    };
  }

  function loadVault() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      if (saved?.records) return saved;
    } catch (error) { /* use migration/default */ }
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE));
      if (legacy) {
        const record = normalizeRecord(legacy);
        const key = recordKey(record.branch, record.month);
        return { version: 2, currentKey: key, records: { [key]: record } };
      }
    } catch (error) { /* use default */ }
    const record = baseRecord();
    const key = recordKey(record.branch, record.month);
    return { version: 2, currentKey: key, records: { [key]: record } };
  }

  let vault = loadVault();
  if (!Array.isArray(vault.historyEntries)) vault.historyEntries = [];
  let db = normalizeRecord(vault.records[vault.currentKey] || Object.values(vault.records)[0] || baseRecord());
  let activeScope = 'branch';
  let activeSellerProfileId = null;
  let openSellerIndex = null;
  let sellerWorkspaceTab = 'overview';
  let printSellerOnlyId = null;
  let openDailyKey = null;
  let openWeeklyIndex = null;
  let dailyExportGesture = false, dailyRenderDeferred = false, dailyGestureTimer;
  function finishDailyExportGesture() {
    clearTimeout(dailyGestureTimer); dailyExportGesture=false;
    if (dailyRenderDeferred) { dailyRenderDeferred=false; renderAll(); }
  }
  // Blur saves data before click. Preserve the clicked button until export finishes.
  document.addEventListener('pointerdown', event => {
    finishDailyExportGesture();
    if (event.target.closest('[data-daily-export], #downloadDailyGoal')) {
      dailyExportGesture=true;
      dailyGestureTimer=setTimeout(finishDailyExportGesture,1500);
    }
  },true);
  document.addEventListener('click',()=>{if(dailyExportGesture)setTimeout(finishDailyExportGesture,0);},true);
  document.addEventListener('pointercancel',finishDailyExportGesture,true);


  function persist(showState = true) {
    const key = recordKey(db.branch, db.month);
    db.updatedAt = new Date().toISOString();
    vault.currentKey = key;
    vault.records[key] = clone(db);
    localStorage.setItem(STORE, JSON.stringify(vault));
    if (window.ResultsCloudSync) window.ResultsCloudSync.queue(vault);
    if (showState) {
      const state = document.getElementById('saveState');
      state.textContent = '✓ Dados salvos neste aparelho';
      state.className = 'save-state';
    }
  }

  function carryRecord(branch, month) {
    return normalizeRecord({
      ...baseRecord(branch, month),
      businessDays: db.businessDays, weeks: automaticWeeks(month), weekEnds: [],
      mercantileGoal: db.mercantileGoal, grossProfitGoal: db.grossProfitGoal,
      servicesGoal: db.servicesGoal, efficiencyGoal: db.efficiencyGoal,
      warrantyGoal: db.warrantyGoal, warrantyWeekly: db.warrantyWeekly,
      sellerCount: db.sellerCount, auditOwner: db.auditOwner, auditSource: db.auditSource,
      sellers: db.sellers.map((seller, index) => ({ id: sellerIdentity(seller, index), name: seller.name || '', assignedGoal: num(seller.assignedGoal), plannedDays: num(seller.plannedDays) || num(db.businessDays), commissionMercantileRate: num(seller.commissionMercantileRate), commissionServiceRate: Object.prototype.hasOwnProperty.call(seller, 'commissionServiceRate') ? num(seller.commissionServiceRate) : 5, general: 0, eligible: 0, warranty: 0, warrantyQty: 0, other: 0, mixed: 0, nfs: 0, invoiceCount: 0, days: 0, justifiedDays: 0, notes: '', commitment: '', deadline: '', updatedAt: new Date().toISOString() }))
    });
  }

  function switchContext(branch, month, keepCurrentData = false) {
    persist(false);
    const nextKey = recordKey(branch, month);
    if (vault.records[nextKey]) db = normalizeRecord(vault.records[nextKey]);
    else if (keepCurrentData) db = normalizeRecord({ ...clone(db), branch, month });
    else db = carryRecord(branch, month);
    activeScope = 'branch';
    persist();
    renderAll();
  }

  function isoDate(year, month, day) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
  function monthParts() {
    const [year, month] = db.month.split('-').map(Number);
    return { year, month, days: new Date(year, month, 0).getDate() };
  }
  function emptyDay(key) {
    return { status: new Date(`${key}T12:00:00`).getDay() === 0 ? 'off' : 'pending', goalPercent: 0, general: 0, grossProfit: 0, eligible: 0, invoiceCount: 0, warranty: 0, warrantyQty: 0, other: 0, mixed: 0, nfs: 0 };
  }
  function dayData(key) { return db.daily[key] || emptyDay(key); }
  function allDays() {
    const { year, month, days } = monthParts();
    return Array.from({ length: days }, (_, index) => {
      const key = isoDate(year, month, index + 1);
      return { key, date: new Date(`${key}T12:00:00`), data: dayData(key) };
    });
  }
  function recordGrossProfit(record = db) {
    const monthly = num(record?.grossProfitActual);
    if (monthly) return monthly;
    return Object.values(record?.daily || {}).reduce((sum, day) => sum + num(day.grossProfit), 0);
  }
  function hasCompleteGrossProfit(items = allDays()) { return recordGrossProfit(db) > 0; }
  function isWorked(day) { return day.status === 'done'; }
  function aggregate(list = allDays().map((item) => item.data)) {
    return list.reduce((total, day) => {
      total.general += num(day.general); total.grossProfit += num(day.grossProfit); total.eligible += num(day.eligible);
      total.warranty += num(day.warranty); total.warrantyQty += num(day.warrantyQty); total.other += num(day.other); total.mixed += num(day.mixed);
      total.nfs += num(day.nfs); total.invoiceCount += num(day.invoiceCount); if (isWorked(day)) total.worked += 1;
      return total;
    }, { general: 0, grossProfit: 0, eligible: 0, warranty: 0, warrantyQty: 0, other: 0, mixed: 0, nfs: 0, invoiceCount: 0, worked: 0 });
  }
  function calculate() {
    const days = allDays().map((item) => item.data);
    const result = aggregate(days);
    result.grossProfit = recordGrossProfit(db);
    result.services = result.warranty + result.other + result.mixed;
    result.revenue = result.general + num(db.ecommerce);
    result.efficiency = result.eligible ? result.services / result.eligible : 0;
    result.conversion = result.nfs ? result.warrantyQty / result.nfs : 0;
    const dailyTickets = days.filter((day) => num(day.invoiceCount) > 0).map((day) => num(day.general) / num(day.invoiceCount));
    result.ticket = dailyTickets.length ? dailyTickets.reduce((sum, value) => sum + value, 0) / dailyTickets.length : 0;
    result.remaining = Math.max(0, num(db.businessDays) - result.worked);
    result.storeDailyAvg = result.worked ? result.general / result.worked : 0;
    result.dailyAvg = result.worked ? result.revenue / result.worked : 0;
    result.projection = result.storeDailyAvg * num(db.businessDays) + num(db.ecommerce);
    result.grossProfitDaily = result.worked ? result.grossProfit / result.worked : 0;
    result.grossProfitProjection = result.grossProfitDaily * num(db.businessDays);
    result.servicesDaily = result.worked ? result.services / result.worked : 0;
    result.servicesProjection = result.servicesDaily * num(db.businessDays);
    result.warrantyDaily = result.worked ? result.warranty / result.worked : 0;
    result.warrantyProjection = result.warrantyDaily * num(db.businessDays);
    return result;
  }
  function grossProfitRate() { return num(db.mercantileGoal) ? num(db.grossProfitGoal) / num(db.mercantileGoal) : 0; }
  function sellerScopeResult(seller) {
    const services = num(seller.warranty) + num(seller.other) + num(seller.mixed);
    const planned = num(seller.plannedDays) || num(db.businessDays);
    const worked = num(seller.days), revenue = num(seller.general), dailyAvg = worked ? revenue / worked : 0;
    const projection = dailyAvg * planned, referenceRate = grossProfitRate();
    return {
      general: revenue, revenue, grossProfit: revenue * referenceRate, eligible: num(seller.eligible), warranty: num(seller.warranty), warrantyQty: num(seller.warrantyQty), other: num(seller.other), mixed: num(seller.mixed),
      services, nfs: num(seller.nfs), invoiceCount: num(seller.invoiceCount), worked, remaining: Math.max(0, planned - worked), dailyAvg, projection,
      grossProfitProjection: projection * referenceRate, servicesProjection: worked ? services / worked * planned : 0,
      efficiency: num(seller.eligible) ? services / num(seller.eligible) : 0, conversion: num(seller.nfs) ? num(seller.warrantyQty) / num(seller.nfs) : 0, ticket: num(seller.invoiceCount) ? revenue / num(seller.invoiceCount) : 0
    };
  }
  function scopeGoalSource() {
    if (activeScope === 'branch') return db;
    let mercantile = 0;
    if (activeScope === 'all') mercantile = db.sellers.reduce((sum, seller) => sum + sellerMetrics(seller).individualGoal, 0);
    else {
      const seller = db.sellers[Number(activeScope.split(':')[1])];
      mercantile = seller ? sellerMetrics(seller).individualGoal : 0;
    }
    const share = num(db.mercantileGoal) ? mercantile / num(db.mercantileGoal) : 0;
    return {
      ...db, mercantileGoal: mercantile, grossProfitGoal: mercantile * grossProfitRate(),
      servicesGoal: num(db.servicesGoal) * share,
      warrantyGoal: num(db.warrantyGoal) * share
    };
  }
  function currentScope() {
    if (activeScope === 'branch') return { type: 'branch', label: db.branch || 'Filial', result: calculate(), goals: db };
    if (activeScope.startsWith('seller:')) {
      const seller = db.sellers[Number(activeScope.split(':')[1])];
      if (seller) return { type: 'seller', label: seller.name || 'Vendedor sem nome', result: sellerScopeResult(seller), goals: scopeGoalSource() };
      activeScope = 'branch'; return currentScope();
    }
    const results = db.sellers.map(sellerScopeResult);
    const result = results.reduce((total, item) => {
      ['general', 'revenue', 'grossProfit', 'eligible', 'warranty', 'warrantyQty', 'other', 'mixed', 'services', 'nfs', 'invoiceCount', 'worked', 'remaining', 'projection', 'grossProfitProjection', 'servicesProjection'].forEach((field) => { total[field] += num(item[field]); });
      return total;
    }, { general: 0, revenue: 0, grossProfit: 0, eligible: 0, warranty: 0, warrantyQty: 0, other: 0, mixed: 0, services: 0, nfs: 0, invoiceCount: 0, worked: 0, remaining: 0, projection: 0, grossProfitProjection: 0, servicesProjection: 0 });
    result.dailyAvg = result.worked ? result.revenue / result.worked : 0;
    result.efficiency = result.eligible ? result.services / result.eligible : 0;
    result.conversion = result.nfs ? result.warrantyQty / result.nfs : 0;
    result.ticket = result.invoiceCount ? result.revenue / result.invoiceCount : 0;
    return { type: 'all', label: 'Todos os vendedores', result, goals: scopeGoalSource() };
  }
  function renderScopeSelector() {
    const select = document.getElementById('scopeQuick'); if (!select) return;
    const options = [`<option value="branch">${esc(db.branch || 'Filial não informada')} — Filial</option>`];
    if (db.sellers.length) options.push('<option value="all">Todos os vendedores</option>');
    db.sellers.forEach((seller, index) => options.push(`<option value="seller:${index}">${esc(seller.name || `Vendedor ${index + 1}`)}</option>`));
    select.innerHTML = options.join('');
    if (![...select.options].some((option) => option.value === activeScope)) activeScope = 'branch';
    select.value = activeScope;
  }
  function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
  function clampRate(value) { return Math.max(0, Math.min(100, value * 100)); }
  function statusClass(value) { return value >= 1 ? 'positive' : value >= 0.85 ? 'warning' : 'negative'; }
  function configuredSellerCount() {
    return Math.max(Math.round(num(db.sellerCount)), db.sellers.filter((seller) => seller.name?.trim()).length);
  }
  function dailyGoalMetrics(key, source = dayData(key)) {
    const percent = num(source.goalPercent);
    const branchGoal = num(db.mercantileGoal) * percent / 100;
    // Regra diária oficial: serviços correspondem a 7% da missão mercantil do dia.
    const serviceGoal = branchGoal * 0.07;
    const namedSellers = db.sellers.map((seller) => String(seller.name || '').trim()).filter(Boolean);
    const sellerCount = Math.max(Math.round(num(db.sellerCount)), namedSellers.length);
    const sellerNames = namedSellers.slice(0, sellerCount);
    while (sellerNames.length < sellerCount) sellerNames.push(`Vendedor ${sellerNames.length + 1}`);
    const perSeller = sellerCount ? branchGoal / sellerCount : 0;
    const servicePerSeller = sellerCount ? serviceGoal / sellerCount : 0;
    const actualServices = num(source.warranty) + num(source.other) + num(source.mixed);
    return { key, percent, branchGoal, serviceGoal, sellerCount, sellerNames, perSeller, servicePerSeller, actualServices };
  }
  function dayReachedPrimaryGoal(data) {
    if (data.status !== 'done') return false;
    if (num(data.goalPercent) > 0) {
      const daily = dailyGoalMetrics('', data);
      return num(data.general) >= daily.branchGoal && daily.actualServices >= daily.serviceGoal;
    }
    const tier = tierGoals()[0], days = Math.max(1, num(db.businessDays));
    const mercantileReached = num(data.general) >= tier.mercantile / days;
    return mercantileReached && (!num(data.grossProfit) || num(data.grossProfit) >= tier.grossProfit / days);
  }

  function selectedDailyGoalDate() {
    const input = document.getElementById('dailyGoalDate');
    const first = `${db.month}-01`, last = `${db.month}-${String(monthParts().days).padStart(2, '0')}`;
    const todayKey = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    if (!input.value || input.value < first || input.value > last) input.value = todayKey.startsWith(`${db.month}-`) ? todayKey : first;
    input.min = first; input.max = last;
    return input.value;
  }
  function renderDailyGoalSummary(metrics) {
    document.getElementById('dailyGoalSummary').innerHTML = `
      <div class="daily-goal-metric highlight"><span>META DA FILIAL NO DIA</span><strong>${brl.format(metrics.branchGoal)}</strong></div>
      <div class="daily-goal-metric"><span>META DE SERVIÇOS DO DIA</span><strong>${brl.format(metrics.serviceGoal)}</strong></div>
      <div class="daily-goal-metric"><span>META POR VENDEDOR</span><strong>${metrics.sellerCount ? brl.format(metrics.perSeller) : 'Cadastre a equipe'}</strong></div>
      <div class="daily-goal-metric"><span>SERVIÇOS/GARANTIA POR VENDEDOR</span><strong>${metrics.sellerCount ? brl.format(metrics.servicePerSeller) : 'Cadastre a equipe'}</strong></div>`;
    document.getElementById('dailyGoalTeam').innerHTML = metrics.sellerCount
      ? `<strong>Média automática por vendedor:</strong> ${brl.format(metrics.perSeller)} de mercantil e ${brl.format(metrics.servicePerSeller)} de serviços/garantia (7%) para cada um, considerando ${metrics.sellerCount} vendedor(es).`
      : '<strong>Equipe ainda não configurada.</strong> Informe a quantidade de vendedores em Configuração ou cadastre os nomes na aba Vendedores.';
    const key = selectedDailyGoalDate(), greeting = timeGreeting(), message = missionMessage({ id: db.branch || 'filial', name: 'Equipe' }, key, 'positive');
    document.getElementById('dailyGoalMotivation').innerHTML = `<strong>${greeting}, equipe!</strong><br>${esc(message)}<br><small>Mensagem exclusiva para ${new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR')}.</small>`;
    document.getElementById('downloadDailyGoal').disabled = !metrics.percent;
    let achievements=document.getElementById('dailyAchievements');
    if (!achievements) { achievements=document.createElement('div'); achievements.id='dailyAchievements'; achievements.className='daily-achievements'; document.getElementById('dailyGoalMotivation').before(achievements); }
    achievements.innerHTML=dailyAchievement(dayData(key),metrics).map(item=>`<div class="daily-achievement ${item.state}"><span>${esc(item.label)} · meta ${esc(item.target)}</span><strong>${esc(item.value)}</strong><b>${esc(item.status)}</b><small>${esc(item.note)}</small></div>`).join('');

  }
  function renderMonthlyGoalProgram() {
    const grid = document.getElementById('monthlyGoalGrid');
    if (!grid) return;
    const { days } = monthParts();
    grid.innerHTML = Array.from({ length: days }, (_, index) => {
      const day = index + 1, key = `${db.month}-${String(day).padStart(2,'0')}`;
      const value = num(dayData(key).goalPercent);
      return `<label class="monthly-goal-day"><span>${String(day).padStart(2,'0')}</span><input type="number" min="0" max="100" step="0.01" inputmode="decimal" data-month-goal="${key}" value="${value || ''}" placeholder="%"></label>`;
    }).join('');
  }
  function saveMonthlyGoalProgram() {
    const inputs = [...document.querySelectorAll('[data-month-goal]')];
    inputs.forEach((input) => {
      const key = input.dataset.monthGoal, data = { ...dayData(key) };
      data.goalPercent = num(input.value);
      db.daily[key] = data;
    });
    persist();
    const status = document.getElementById('monthlyGoalStatus');
    if (status) status.textContent = '✓ Programação mensal salva. Os mesmos percentuais já alimentam automaticamente a filial e os vendedores.';
    renderDailyGoalPlanner();
    renderDaily();
  }
  function renderDailyGoalPlanner() {
    const key = selectedDailyGoalDate(), metrics = dailyGoalMetrics(key);
    const percentInput = document.getElementById('dailyGoalPercent');
    percentInput.value = metrics.percent || '';
    renderDailyGoalSummary(metrics);
    renderMonthlyGoalProgram();
  }
  function previewDailyGoalFromPlanner() {
    const key = selectedDailyGoalDate(), data = { ...dayData(key), goalPercent: num(document.getElementById('dailyGoalPercent').value) };
    db.daily[key] = data;
    persist(false);
    renderDailyGoalSummary(dailyGoalMetrics(key, data));
  }
  function saveDailyGoalFromPlanner() {
    const key = selectedDailyGoalDate(), data = { ...dayData(key) };
    data.goalPercent = num(document.getElementById('dailyGoalPercent').value);
    db.daily[key] = data; persist(); renderAll();
  }
  function roundedCanvasRect(ctx, x, y, width, height, radius = 24) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
  }
  function fitCanvasFont(ctx, text, maxWidth, weight = 800, startSize = 23, minSize = 14) {
    let size = startSize; ctx.font = `${weight} ${size}px Arial, sans-serif`;
    while (size > minSize && ctx.measureText(String(text)).width > maxWidth) { size -= 1; ctx.font = `${weight} ${size}px Arial, sans-serif`; }
  }
  function drawCanvasMetric(ctx, x, y, width, height, label, value, accent = false, note = '') {
    ctx.fillStyle = accent ? '#e3f2ff' : '#f4f7fc'; roundedCanvasRect(ctx, x, y, width, height, 24); ctx.fill();
    const compact = height <= 105, labelY = y + (compact ? 27 : 32), valueY = y + (compact ? 70 : note ? 80 : 86);
    ctx.fillStyle = '#64748b'; fitCanvasFont(ctx, String(label).toUpperCase(), width - 56, 800, compact ? 18 : 20, 11); ctx.fillText(String(label).toUpperCase(), x + 28, labelY);
    ctx.fillStyle = '#102a43'; fitCanvasFont(ctx, value, width - 56, 900, compact ? 31 : 36, 19); ctx.fillText(value, x + 28, valueY);
    if (note) { ctx.fillStyle = '#64748b'; fitCanvasFont(ctx, note, width - 56, 600, 16, 11); ctx.fillText(note, x + 28, y + height - 14); }
  }
  function drawCenteredCanvasMetric(ctx, x, y, width, height, label, value, accent = false, note = '') {
    ctx.fillStyle = accent ? '#e3f2ff' : '#f4f7fc'; roundedCanvasRect(ctx, x, y, width, height, 24); ctx.fill();
    ctx.textAlign = 'center';
    const compact = height <= 105, labelY = y + (compact ? 27 : 32), valueY = y + (compact ? 70 : note ? 80 : 86);
    ctx.fillStyle = '#64748b'; fitCanvasFont(ctx, String(label).toUpperCase(), width - 48, 800, compact ? 18 : 20, 11); ctx.fillText(String(label).toUpperCase(), x + width / 2, labelY);
    ctx.fillStyle = '#102a43'; fitCanvasFont(ctx, value, width - 48, 900, compact ? 31 : 36, 19); ctx.fillText(value, x + width / 2, valueY);
    if (note) { ctx.fillStyle = '#64748b'; fitCanvasFont(ctx, note, width - 48, 600, 16, 11); ctx.fillText(note, x + width / 2, y + height - 14); }
    ctx.textAlign = 'left';
  }
  function drawWrappedCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || '').split(/\s+/); let line = '', lines = [];
    words.forEach((word) => { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; });
    if (line) lines.push(line); lines = lines.slice(0, maxLines);
    lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
  }
  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.')), 'image/png'));
  }
  async function shareOrDownloadImage(canvas, filename, title) {
    const blob = await canvasToBlob(canvas).catch(() => null);
    const file = blob ? new File([blob], filename, { type: 'image/png' }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
    } catch (error) { if (error.name === 'AbortError') return; }
    const anchor = document.createElement('a');
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    anchor.href = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      if (blob) URL.revokeObjectURL(anchor.href);
      anchor.remove();
    }, 1800);
  }
  function imageHeader(ctx, title, subtitle, width, centered = false) {
    const gradient = ctx.createLinearGradient(0, 0, width, 0); gradient.addColorStop(0, '#0879e8'); gradient.addColorStop(1, '#6b4ce6');
    ctx.fillStyle = gradient; roundedCanvasRect(ctx, 54, 50, width - 108, 220, 38); ctx.fill();
    const textX = centered ? width / 2 : 92; ctx.textAlign = centered ? 'center' : 'left';
    ctx.fillStyle = '#ffffff'; ctx.font = '900 53px Arial, sans-serif'; ctx.fillText(title, textX, 139);
    ctx.font = '600 25px Arial, sans-serif'; ctx.fillText(subtitle, textX, 198); ctx.textAlign = 'left';
  }

  function sellerDayStatusLabel(day) {
    if (day?.status === 'done') return '✅ Finalizado';
    if (day?.status === 'partial') return '🟡 Parcial';
    if (day?.status === 'off') return '💤 Não trabalha';
    if (day?.status === 'medical') return '🩺 Atestado';
    if (day?.status === 'justified') return '📋 Justificada';
    return '⚠️ Pendente';
  }
  function sellerDayHighlight(day, mercRate, servRate, conversion = null, efficiency = null, seed = '') {
    const hash = String(seed || '').split('').reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
    const pick = (items) => items[Math.abs(hash || 0) % items.length];
    const convOk = conversion !== null && conversion >= 0.35;
    const effOk = efficiency !== null && efficiency >= 0.07;
    const fullyHit = mercRate >= 1 && servRate >= 1 && convOk && effOk;
    const middle = mercRate >= .8 || servRate >= .8 || convOk || effOk || day?.status === 'partial';
    const success = [
      { badge: '🏆 META BATIDA', heroEmoji: '🥇😄', title: 'Parabéns! Você voou hoje.', message: 'Meta batida em grande estilo. Seu resultado mostra foco, disciplina e força comercial. Continue nesse ritmo e use essa entrega para inspirar a equipe.', quote: '“O sucesso é a soma de pequenos esforços repetidos dia após dia.” — Robert Collier' },
      { badge: '🎉 SHOW DE RESULTADO', heroEmoji: '🏅🤩', title: 'Entrega forte e completa.', message: 'Você bateu os principais indicadores do dia e transformou esforço em resultado. Excelente performance para puxar o time para cima.', quote: '“Acredite que você pode, assim você já está no meio do caminho.” — Theodore Roosevelt' },
      { badge: '🚀 DIA DE CAMPEÃO', heroEmoji: '🏆🔥', title: 'Resultado para comemorar.', message: 'Hoje você mostrou consistência e talento comercial. Siga firme porque alta performance também se constrói na repetição das boas atitudes.', quote: '“A vitória pertence ao mais perseverante.” — Napoleão Bonaparte' }
    ];
    const warning = [
      { badge: '👏 BOA PARCIAL', heroEmoji: '🙂📈', title: 'Você está no jogo e com potencial.', message: 'A parcial mostra evolução. Continue acelerando porque ainda dá para transformar esse movimento em meta batida.', quote: '“Grandes oportunidades nascem de ter sabido aproveitar as pequenas.” — Bill Gates' },
      { badge: '⚡ QUASE LÁ', heroEmoji: '😎💪', title: 'Bom caminho, mantenha a pressão.', message: 'Seu desempenho já mostra sinais positivos. Mantenha o foco no próximo atendimento e continue crescendo ao longo do dia.', quote: '“A persistência realiza o impossível.” — Provérbio chinês' },
      { badge: '📣 PARCIAL FORTE', heroEmoji: '😊🏃', title: 'Falta pouco para virar o placar.', message: 'Você já construiu uma base boa de resultado. Ajuste o passo final e busque transformar a parcial em entrega completa.', quote: '“Não importa a velocidade, desde que você não pare.” — Confúcio' }
    ];
    const low = [
      { badge: '💪 VAMOS PRA CIMA', heroEmoji: '🙂🌅', title: 'Hoje foi preparação para amanhã ser ainda melhor.', message: 'Nem todo dia fecha no ponto ideal, mas consistência se constrói no processo. Respire, reajuste a rota e volte mais forte na próxima oportunidade.', quote: '“O sucesso é ir de fracasso em fracasso sem perder o entusiasmo.” — Winston Churchill' },
      { badge: '🌱 SEGUIMOS FIRMES', heroEmoji: '😉✨', title: 'Cada atendimento é uma nova chance.', message: 'Se o dia não saiu como esperado, use isso como aprendizado e combustível. Amanhã pode começar melhor com atitude, foco e disciplina.', quote: '“Nossa maior glória não está em nunca cair, mas em nos levantar toda vez que caímos.” — Confúcio' },
      { badge: '🔄 NOVA OPORTUNIDADE', heroEmoji: '😌📚', title: 'O importante é não parar.', message: 'Resultado abaixo da meta não define sua capacidade. O que faz a diferença é continuar, aprender rápido e reagir no próximo atendimento.', quote: '“A energia e a persistência conquistam todas as coisas.” — Benjamin Franklin' }
    ];
    const picked = fullyHit ? pick(success) : middle ? pick(warning) : pick(low);
    return { ...picked, theme: fullyHit ? 'success' : middle ? 'warning' : 'danger', fullyHit, middle, low: !fullyHit && !middle };
  }
  async function managerDownloadSellerDayImage(seller, key) {
    if (!seller || !key) return;
    const day = seller.daily?.[key] || emptyDay(key), mission = sellerMissionMetrics(seller, key);
    const services = num(day.warranty) + num(day.other) + num(day.mixed);
    const ticket = num(day.invoiceCount) ? num(day.general) / num(day.invoiceCount) : 0;
    const conversion = num(day.nfs) ? num(day.warrantyQty) / num(day.nfs) : 0;
    const efficiency = num(day.eligible) ? services / num(day.eligible) : 0;
    const mercCommission = Object.prototype.hasOwnProperty.call(day,'commissionMercantile') ? num(day.commissionMercantile) : num(day.general) * num(day.commissionMercantileRate) / 100;
    const serviceCommission = Object.prototype.hasOwnProperty.call(day,'commissionService') ? num(day.commissionService) : services * .05;
    const totalCommission = mercCommission + serviceCommission;
    const mercRate = mission.mercantileGoal ? num(day.general) / mission.mercantileGoal : 0;
    const servRate = mission.serviceGoal ? services / mission.serviceGoal : 0;
    const highlight = sellerDayHighlight(day, mercRate, servRate, conversion, efficiency, `${seller.name||''}-${key}-${num(day.general)}-${services}`);
    const mercHit = !!mission.percent && num(day.general) >= mission.mercantileGoal;
    const serviceHit = !!mission.percent && services >= mission.serviceGoal;
    const conversionHit = num(day.nfs) ? conversion >= 0.35 : false;
    const efficiencyHit = num(day.eligible) ? efficiency >= 0.07 : false;
    const allGoalsHit = mercHit && serviceHit && conversionHit && efficiencyHit;
    const partialGoalsHit = [mercHit, serviceHit, conversionHit, efficiencyHit].filter(Boolean).length >= 2 || highlight.middle;
    const metricTone = (hit, partial=false, neutral=false) => allGoalsHit ? '#e4f8ec' : neutral ? '#ffffff' : hit ? '#e9f8ef' : partial ? '#fff5df' : '#fff1f3';
    const date = new Date(`${key}T12:00:00`);
    const todayIso = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1560;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4f7fb'; ctx.fillRect(0,0,canvas.width,canvas.height);
    imageHeader(ctx, 'MEU RESULTADO DO DIA', `${seller.name || 'Vendedor'} • ${db.branch || 'Filial'} • ${date.toLocaleDateString('pt-BR',{weekday:'long', day:'2-digit', month:'long', year:'numeric'})}`, canvas.width, false);
    const badgeW = allGoalsHit ? 470 : 360;
    const grad = ctx.createLinearGradient(0,0,badgeW,0); grad.addColorStop(0,'#0b83e6'); grad.addColorStop(1,'#694ce7');
    ctx.fillStyle = grad; roundedCanvasRect(ctx, 54, 290, badgeW, 56, 22); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '900 22px Arial, sans-serif'; ctx.fillText(highlight.badge, 80, 326);
    ctx.font = allGoalsHit ? '900 62px Arial, sans-serif' : '900 48px Arial, sans-serif'; ctx.fillText(highlight.heroEmoji || '', allGoalsHit ? 865 : 920, 332);
    const card = (x,y,w,h,label,value,note,bg='#ffffff') => {
      ctx.fillStyle = bg; roundedCanvasRect(ctx, x, y, w, h, 24); ctx.fill();
      ctx.strokeStyle = '#e1e7f0'; ctx.lineWidth = 1; roundedCanvasRect(ctx, x, y, w, h, 24); ctx.stroke();
      ctx.fillStyle = '#6a7b90'; ctx.font = '800 17px Arial, sans-serif'; ctx.fillText(label, x+20, y+32);
      ctx.fillStyle = '#102a43'; ctx.font = '900 28px Arial, sans-serif'; ctx.fillText(value, x+20, y+77);
      ctx.fillStyle = '#77859a'; ctx.font = '600 15px Arial, sans-serif'; writeWrappedText(ctx, note, x+20, y+108, w-40, 2, 20);
    };
    card(54, 378, 305, 142, 'VENDA MERCANTIL', brl.format(num(day.general)), mission.percent ? `${mercHit ? 'Meta batida • ' : 'Minha meta '}${brl.format(mission.mercantileGoal)}` : 'Meta diária aguardando distribuição', metricTone(mercHit, mercRate >= .75, !mission.percent));
    card(387, 378, 305, 142, 'SERVIÇOS', brl.format(services), mission.percent ? `${serviceHit ? 'Meta batida • ' : 'Minha meta '}${brl.format(mission.serviceGoal)}` : 'Meta diária aguardando distribuição', metricTone(serviceHit, servRate >= .75, !mission.percent));
    card(720, 378, 305, 142, 'COMISSÕES', brl.format(totalCommission), allGoalsHit ? 'Dia forte • mercantil + serviços' : 'Mercantil + serviços', allGoalsHit ? '#e9f8ef' : partialGoalsHit ? '#fff5df' : '#eefaf4');
    card(54, 546, 305, 142, 'PERCENTUAL DO DIA', mission.percent ? `${mission.percent.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%` : '—', mission.percent ? `Minha meta ${brl.format(mission.mercantileGoal)} • serviços ${brl.format(mission.serviceGoal)}` : 'Sem percentual do dia', metricTone(mercHit || serviceHit, mission.percent && (mercRate >= .75 || servRate >= .75), !mission.percent));
    card(387, 546, 305, 142, 'CONVERSÃO', num(day.nfs) ? efficiencyPct.format(conversion) : '—', num(day.nfs) ? (conversionHit ? 'Meta 35,00% • atingida' : 'Meta 35,00%') : 'Sem base suficiente', metricTone(conversionHit, num(day.nfs) && conversion >= .25, !num(day.nfs)));
    card(720, 546, 305, 142, 'EFICIÊNCIA', num(day.eligible) ? efficiencyPct.format(efficiency) : '—', num(day.eligible) ? (efficiencyHit ? 'Meta 7,00% • atingida' : 'Meta 7,00%') : 'Sem base suficiente', metricTone(efficiencyHit, num(day.eligible) && efficiency >= .05, !num(day.eligible)));
    card(54, 714, 305, 142, 'TICKET MÉDIO', ticket ? brl.format(ticket) : '—', `${num(day.invoiceCount)} nota(s) fiscal(is)`, allGoalsHit ? '#e4f8ec' : '#ffffff');
    card(387, 714, 305, 142, 'QTD. ELEGÍVEL', String(num(day.nfs)), `${num(day.warrantyQty)} garantia(s)`, allGoalsHit ? '#e4f8ec' : '#ffffff');
    card(720, 714, 305, 142, 'STATUS', sellerDayStatusLabel(day), allGoalsHit ? 'Todos os indicadores-chave bateram meta' : key === todayIso ? 'Resultado do dia atual' : 'Resultado referente à data selecionada', metricTone(allGoalsHit, partialGoalsHit));
    ctx.fillStyle = allGoalsHit ? '#ecf9f1' : partialGoalsHit ? '#fff8e6' : '#ffffff'; roundedCanvasRect(ctx, 54, 900, 972, 265, 26); ctx.fill();
    ctx.strokeStyle = '#e1e7f0'; roundedCanvasRect(ctx, 54, 900, 972, 265, 26); ctx.stroke();
    ctx.fillStyle = '#0879e8'; ctx.font = '900 29px Arial, sans-serif'; ctx.fillText('LEITURA DO DIA', 86, 952);
    const lines = [
      `Status atual: ${sellerDayStatusLabel(day)}`,
      mission.percent ? `Mercantil: ${mercHit ? 'meta atingida' : 'abaixo da meta diária'}.` : 'Meta mercantil ainda não distribuída.',
      mission.percent ? `Serviços: ${serviceHit ? 'meta atingida' : 'abaixo da meta diária'}.` : 'Meta de serviços ainda não distribuída.',
      `Conversão: ${num(day.nfs) ? (conversionHit ? 'meta de 35% atingida' : 'abaixo da meta de 35%') : 'sem base suficiente no dia'}.`,
      `Eficiência: ${num(day.eligible) ? (efficiencyHit ? 'meta de 7% atingida' : 'abaixo da meta de 7%') : 'sem base suficiente no dia'}.`
    ];
    ctx.fillStyle = '#102a43'; ctx.font = '700 21px Arial, sans-serif';
    lines.forEach((line, i) => writeWrappedText(ctx, line, 86, 1010 + i*42, 900, 2, 22));
    ctx.fillStyle = allGoalsHit ? '#e8f7ef' : partialGoalsHit ? '#fff6dd' : '#eef6ff'; roundedCanvasRect(ctx, 54, 1200, 972, 250, 26); ctx.fill();
    ctx.fillStyle = '#0d2b45'; ctx.font = '900 24px Arial, sans-serif'; ctx.fillText(highlight.title, 86, 1250);
    ctx.font = '700 21px Arial, sans-serif'; writeWrappedText(ctx, highlight.message, 86, 1295, 900, 4, 28);
    ctx.fillStyle = '#47617d'; ctx.font = 'italic 18px Arial, sans-serif'; writeWrappedText(ctx, highlight.quote || '', 86, 1392, 900, 2, 24);
    ctx.fillStyle = '#7b8798'; ctx.font = '600 16px Arial, sans-serif';
    ctx.fillText(`Atualizado em ${new Date().toLocaleString('pt-BR')} • Gestão de Resultados`, 54, 1520);
    const safe = String(seller.name || 'vendedor').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();
    await shareOrDownloadImage(canvas, `resultado-dia-${key}-${safe}.png`, `Resultado do dia - ${seller.name || 'Vendedor'}`);
  }

  // Daily mission targets are independent of the configurable monthly efficiency target.
  function dailyAchievement(data, metrics) {
    const services = metrics.actualServices, eligible = num(data.eligible), quantity = num(data.nfs);
    const efficiency = eligible ? services / eligible : null;
    const conversion = quantity ? num(data.warrantyQty) / quantity : null;
    const ready = data.status === 'done';
    const build = (label, actual, target, format, base = true, rate = false) => {
      const available = ready && base && target > 0;
      const difference = available ? actual - target : null;
      const passed = available && difference >= -1e-9;
      const delta = rate ? `${(Math.abs(difference) * 100).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})} p.p.` : brl.format(Math.abs(difference));
      return {label, value: base ? format(actual) : 'Não calculada', target: format(target),
        state: available ? passed ? 'passed' : 'failed' : 'pending',
        status: available ? passed ? 'META ATINGIDA' : 'META NÃO ATINGIDA' : data.status === 'off' ? 'DIA SEM TRABALHO' : !ready ? 'AGUARDANDO LANÇAMENTO' : 'BASE NÃO INFORMADA',
        note: available ? passed ? difference > 1e-9 ? `Acima da meta: ${delta}` : 'Meta atingida exatamente' : `Faltam ${delta}` : 'Informe os dados para comparar'};
    };
    return [
      build('Venda mercantil', num(data.general), metrics.branchGoal, x => brl.format(x)),
      build('Serviços realizados', services, metrics.serviceGoal, x => brl.format(x)),
      build('Eficiência', efficiency, .07, x => efficiencyPct.format(x), eligible > 0, true),
      build('Taxa de conversão', conversion, .35, x => efficiencyPct.format(x), quantity > 0, true)
    ];
  }
  function downloadCanvasNow(canvas, filename) {
    // Keep the download inside the click activation, including on mobile browsers.
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png'); link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
  }
  async function exportQuickDashboard() {
    try {
      const scope=currentScope(),result=scope.result,goals=scope.goals,firstGoal=tierGoals(goals)[0].mercantile;
      const sellers=scope.type==='seller'?1:configuredSellerCount(),days=Math.max(0,result.remaining),perDay=value=>days?value/days:0;
      const salesGap=Math.max(0,firstGoal-result.revenue),servicesGap=Math.max(0,num(goals.servicesGoal)-result.services);
      const conversion=result.nfs?result.warrantyQty/result.nfs:0;
      const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1510;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#f4f7fc';ctx.fillRect(0,0,1080,1510);
      imageHeader(ctx,'LEITURA RÁPIDA',`${db.branch||'Filial'} | ${monthLabel(db.month)} | Meta 1`,1080);
      const section=(title,y,color)=>{ctx.fillStyle=color;ctx.font='900 28px Arial, sans-serif';ctx.fillText(title,70,y)};
      section('VENDA MERCANTIL',330,'#174579');
      drawCenteredCanvasMetric(ctx,60,365,465,155,'Falta no mês',brl.format(salesGap),false,`Meta: ${brl.format(firstGoal)}`);
      drawCenteredCanvasMetric(ctx,555,365,465,155,'Necessário por dia',brl.format(perDay(salesGap)),true,`${days} dia(s) restante(s)`);
      drawCenteredCanvasMetric(ctx,60,545,465,155,'Falta por vendedor',sellers?brl.format(salesGap/sellers):'Equipe não configurada',false,`${sellers||0} vendedor(es)`);
      drawCenteredCanvasMetric(ctx,555,545,465,155,'Dia por vendedor',sellers?brl.format(perDay(salesGap)/sellers):'Equipe não configurada',true,'Missão diária individual');
      section('SERVIÇOS',765,'#6246bd');
      drawCenteredCanvasMetric(ctx,60,800,465,155,'Falta no mês',brl.format(servicesGap),false,`Meta: ${brl.format(num(goals.servicesGoal))}`);
      drawCenteredCanvasMetric(ctx,555,800,465,155,'Necessário por dia',brl.format(perDay(servicesGap)),true,`${days} dia(s) restante(s)`);
      drawCenteredCanvasMetric(ctx,60,980,465,155,'Falta por vendedor',sellers?brl.format(servicesGap/sellers):'Equipe não configurada',false,`${sellers||0} vendedor(es)`);
      drawCenteredCanvasMetric(ctx,555,980,465,155,'Dia por vendedor',sellers?brl.format(perDay(servicesGap)/sellers):'Equipe não configurada',true,'Missão diária individual');
      section('INDICADORES',1200,'#174579');
      drawCenteredCanvasMetric(ctx,60,1235,465,145,'Eficiência',efficiencyPct.format(result.efficiency),result.efficiency>=num(db.efficiencyGoal),`Meta: ${efficiencyPct.format(num(db.efficiencyGoal))}`);
      drawCenteredCanvasMetric(ctx,555,1235,465,145,'Taxa de conversão',result.nfs?efficiencyPct.format(conversion):'Não calculada',conversion>=.35,'Meta: 35,00%');
      ctx.fillStyle='#718096';ctx.font='600 18px Arial, sans-serif';ctx.textAlign='center';ctx.fillText('FS Soluções • Gestão de Resultados • valores atualizados no momento da geração',540,1450);ctx.textAlign='left';
      const safeBranch=String(db.branch||'filial').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase();
      await shareOrDownloadImage(canvas,`leitura-rapida-${safeBranch}-${db.month}.png`,'Leitura rápida da Gestão de Resultados');
    } catch(error) { alert(error.message||'Não foi possível gerar a leitura rápida.'); }
  }
  function exportDailyGoalImage(key, includeResults = false) {
    try {
      const data = dayData(key), metrics = dailyGoalMetrics(key, data);
      if (!metrics.percent) { alert('Informe o percentual da meta deste dia antes de baixar.'); return; }
      const date = new Date(`${key}T12:00:00`);
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = includeResults ? 1900 : 1280;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      imageHeader(ctx, includeResults ? 'PARCIAL DO DIA - FILIAL' : 'META DO DIA - FILIAL', `${db.branch || 'Filial não informada'} | ${date.toLocaleDateString('pt-BR')}`, 1080);
      const heading = (text, y) => {ctx.fillStyle='#102a43'; ctx.font='900 31px Arial, sans-serif'; ctx.fillText(text,64,y);};
      heading('Missão do dia', 325);
      drawCanvasMetric(ctx,64,350,460,140,'Meta mercantil',brl.format(metrics.branchGoal),true,`${metrics.percent.toLocaleString('pt-BR')}% da meta mensal`);
      drawCanvasMetric(ctx,556,350,460,140,'Meta de serviços',brl.format(metrics.serviceGoal),false,'7% da missão mercantil do dia');
      drawCanvasMetric(ctx,64,510,460,105,'Meta de eficiência','7,00%');
      drawCanvasMetric(ctx,556,510,460,105,'Meta de conversão','35,00%');
      heading('Média por vendedor', 668);
      drawCanvasMetric(ctx,64,690,460,140,'Mercantil por vendedor',metrics.sellerCount ? brl.format(metrics.perSeller) : 'Equipe não cadastrada',true,`${metrics.sellerCount} vendedor(es)`);
      drawCanvasMetric(ctx,556,690,460,140,'Serviços por vendedor',metrics.sellerCount ? brl.format(metrics.servicePerSeller) : 'Equipe não cadastrada',false,'7% da referência mercantil individual');
      if (includeResults) {
        heading('Resultado registrado no dia',885);
        dailyAchievement(data,metrics).forEach((item,index) => {
          const x=64+(index%2)*492, y=910+Math.floor(index/2)*222;
          const colors=item.state==='passed' ? ['#e6f7ee','#087747'] : item.state==='failed' ? ['#fff0f1','#b4233b'] : ['#f1f5f9','#526175'];
          ctx.fillStyle=colors[0]; roundedCanvasRect(ctx,x,y,460,202,24); ctx.fill();
          ctx.fillStyle='#526175'; fitCanvasFont(ctx,item.label.toUpperCase(),412,800,20,16); ctx.fillText(item.label.toUpperCase(),x+24,y+32);
          ctx.fillStyle=colors[1]; fitCanvasFont(ctx,item.value,412,900,38,22); ctx.fillText(item.value,x+24,y+80);
          ctx.font='800 19px Arial'; ctx.fillText(item.status,x+24,y+116);
          fitCanvasFont(ctx,item.note,412,800,22,16);ctx.fillText(item.note,x+24,y+152);
          ctx.fillStyle='#526175';ctx.font='600 18px Arial';ctx.fillText(`Meta: ${item.target}`,x+24,y+182);
        });
        drawCanvasMetric(ctx,64,1370,460,130,'Venda elegível',brl.format(num(data.eligible)),false,'Base da eficiência');
        drawCanvasMetric(ctx,556,1370,460,130,'Ticket médio',num(data.invoiceCount) ? brl.format(num(data.general)/num(data.invoiceCount)) : 'Não calculado',false,`${num(data.invoiceCount)} notas fiscais | ${num(data.warrantyQty)} garantias / ${num(data.nfs)} elegíveis`);
        ctx.fillStyle='#edf7ff';roundedCanvasRect(ctx,64,1530,952,265,28);ctx.fill();
        ctx.fillStyle='#0879e8';ctx.font='900 30px Arial';ctx.fillText(`${timeGreeting()}, equipe!`,94,1580);
        ctx.fillStyle='#203a56';ctx.font='800 25px Arial';
        drawWrappedCanvasText(ctx,missionMessage({id:db.branch || 'filial',name:'Equipe'},key,'positive'),94,1630,875,34,3);
        ctx.font='600 19px Arial';ctx.fillText('Eficiência: serviços ÷ venda elegível. Conversão: garantias ÷ qtd. elegível.',94,1760);
        ctx.fillStyle='#748296';ctx.font='600 18px Arial';ctx.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')} pela Gestão de Resultados`,64,1855);
      } else {
        ctx.fillStyle='#edf7ff'; roundedCanvasRect(ctx,64,890,952,250,28); ctx.fill();
        ctx.fillStyle='#0879e8'; ctx.font='900 30px Arial'; ctx.fillText('MISSÃO LIBERADA PARA A EQUIPE',94,950);
        ctx.fillStyle='#203a56'; ctx.font='800 24px Arial';
        drawWrappedCanvasText(ctx,'Percentual do dia registrado. As metas individuais dos vendedores são calculadas automaticamente a partir da meta de cada um.',94,1000,875,34,4);
        ctx.fillStyle='#748296';ctx.font='600 18px Arial';ctx.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')} pela Gestão de Resultados`,64,1215);
      }
      const safeBranch=String(db.branch || 'filial').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-');
      downloadCanvasNow(canvas,`${includeResults?'parcial':'meta'}-diaria-${safeBranch}-${key}.png`);
    } catch(error) { console.error(error); alert('Não foi possível gerar a imagem. Tente novamente.'); }
  }

  function dailyIssues() {
    const issues = [];
    allDays().forEach(({ key, date, data }) => {
      const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const hasValue = ['general', 'eligible', 'invoiceCount', 'warranty', 'warrantyQty', 'other', 'mixed', 'nfs'].some((field) => num(data[field]) > 0);
      if (num(data.eligible) > num(data.general)) issues.push(`${label}: venda elegível maior que a venda geral.`);
      if (num(data.nfs) > 0 && num(data.warrantyQty) > num(data.nfs)) issues.push(`${label}: quantidade de garantias maior que a quantidade elegível.`);
      if (data.status === 'off' && hasValue) issues.push(`${label}: dia sem trabalho possui valores.`);
      if (data.status === 'pending' && date < new Date(today.getFullYear(), today.getMonth(), today.getDate()) && key.slice(0, 7) === monthDefault) issues.push(`${label}: dia anterior ainda está pendente.`);
    });
    return issues;
  }

  function ensureOverviewOrganization() {
    const root = document.querySelector('#overview .kpis');
    if (!root || root.dataset.organized === '1') return;
    const cardOf = (id) => document.getElementById(id)?.closest('.kpi');
    const mercCards = [cardOf('eligibleKpi'), cardOf('grossProfitKpi')].filter(Boolean);
    const ticketCard = cardOf('ticketKpi');
    let serviceAverageCard = document.getElementById('serviceAverageKpi')?.closest('.kpi');
    if (!serviceAverageCard) {
      serviceAverageCard = document.createElement('article');
      serviceAverageCard.className = 'kpi overview-service-average-card';
      serviceAverageCard.innerHTML = '<div class="label">Média serviços / dia</div><div class="value" id="serviceAverageKpi">R$ 0,00</div><div class="sub" id="serviceAverageKpiSub">Média do período</div>';
    }
    const servicesCards = [cardOf('servicesKpi'), serviceAverageCard, cardOf('conversionKpi'), cardOf('efficiencyKpi')].filter(Boolean);
    let invoiceCard = document.getElementById('invoiceCountKpi')?.closest('.kpi');
    if (!invoiceCard) {
      invoiceCard = document.createElement('article');
      invoiceCard.className = 'kpi overview-invoice-card';
      invoiceCard.innerHTML = '<div class="label">Notas fiscais total</div><div class="value" id="invoiceCountKpi">0</div><div class="sub">Quantidade total de notas fiscais</div>';
    }
    let invoiceAvgCard = document.getElementById('invoiceAverageKpi')?.closest('.kpi');
    if (!invoiceAvgCard) {
      invoiceAvgCard = document.createElement('article');
      invoiceAvgCard.className = 'kpi overview-invoice-average-card';
      invoiceAvgCard.innerHTML = '<div class="label">Média notas fiscais / dia</div><div class="value" id="invoiceAverageKpi">0</div><div class="sub" id="invoiceAverageKpiSub">Média do período</div>';
    }
    let invoiceSellerCard = document.getElementById('invoicePerSellerKpi')?.closest('.kpi');
    if (!invoiceSellerCard) {
      invoiceSellerCard = document.createElement('article');
      invoiceSellerCard.className = 'kpi overview-invoice-seller-card';
      invoiceSellerCard.innerHTML = '<div class="label">Notas fiscais / vendedor</div><div class="overview-invoice-seller-split"><div><span>Média dia / vendedor</span><strong id="invoicePerSellerDayKpi">0</strong></div><div><span>Total / vendedor</span><strong id="invoicePerSellerKpi">0</strong></div></div><div class="sub" id="invoicePerSellerKpiSub">Média da equipe</div>';
    }
    if (invoiceSellerCard && !document.getElementById('invoicePerSellerDayKpi')) {
      invoiceSellerCard.classList.add('overview-invoice-seller-card');
      invoiceSellerCard.innerHTML = '<div class="label">Notas fiscais / vendedor</div><div class="overview-invoice-seller-split"><div><span>Média dia / vendedor</span><strong id="invoicePerSellerDayKpi">0</strong></div><div><span>Total / vendedor</span><strong id="invoicePerSellerKpi">0</strong></div></div><div class="sub" id="invoicePerSellerKpiSub">Média da equipe</div>';
    }
    const group = (cls,title,subtitle,cards) => {
      const section = document.createElement('section');
      section.className = `overview-kpi-group ${cls}`;
      section.innerHTML = `<header><strong>${title}</strong><small>${subtitle}</small></header><div class="overview-kpi-grid"></div>`;
      const grid = section.querySelector('.overview-kpi-grid');
      cards.filter(Boolean).forEach(card => grid.appendChild(card));
      return section;
    };
    root.innerHTML = '';
    root.classList.add('overview-kpi-organized');
    root.appendChild(group('merc','🛒 Mercantil','Vendas e resultado mercantil',mercCards));
    root.appendChild(group('indicators','📄 Notas Fiscais e Ticket Médio','Quantidade, média, por vendedor e ticket médio',[invoiceCard,invoiceAvgCard,invoiceSellerCard,ticketCard]));
    root.appendChild(group('services','🔐 Serviços','Serviços, conversão e eficiência',servicesCards));
    root.dataset.organized = '1';
  }

  function renderOverview() {
    const scope = currentScope(), result = scope.result, goalSource = scope.goals;
    ensureOverviewOrganization();
    const grossAvailable = scope.type !== 'branch' || hasCompleteGrossProfit();
    setText('heroEyebrow', scope.type === 'branch' ? 'Venda mercantil total da filial' : scope.type === 'all' ? 'Venda mercantil total dos vendedores' : `Venda mercantil total — ${scope.label}`);
    setText('revenueHero', brl.format(result.revenue)); setText('workedHero', result.worked); setText('remainingHero', result.remaining);
    setText('dailyHero', brl.format(result.dailyAvg)); setText('projectionHero', brl.format(result.projection));
    ['workedHero','remainingHero','dailyHero'].forEach((id) => document.getElementById(id)?.parentElement?.classList.add('overview-hero-stat-shift'));
    setText('eligibleKpi', brl.format(result.eligible)); setText('servicesKpi', brl.format(result.services));
    setText('grossProfitKpiLabel', scope.type === 'branch' ? 'Lucro bruto' : 'Lucro bruto de referência');
    setText('grossProfitKpi', grossAvailable ? brl.format(result.grossProfit) : 'Não informado');
    setText('grossProfitKpiSub', scope.type === 'branch' ? (grossAvailable ? `${pct.format(num(goalSource.grossProfitGoal) ? result.grossProfit / num(goalSource.grossProfitGoal) : 0)} da meta de lucro` : 'Não interfere no percentual mercantil') : `${pct2.format(grossProfitRate())} da venda mercantil`);
    const conversion = result.nfs ? result.warrantyQty / result.nfs : 0;
    setText('efficiencyKpi', efficiencyPct.format(result.efficiency)); setText('conversionKpi', result.nfs ? efficiencyPct.format(conversion) : 'Não calculada'); setText('ticketKpi', brl.format(result.ticket));
    setText('invoiceCountKpi', result.invoiceCount.toLocaleString('pt-BR'));
    setText('nfKpi', 'Venda mercantil ÷ notas fiscais');
    const invoiceAverage = result.worked ? result.invoiceCount / result.worked : 0;
    const overviewSellerCount = configuredSellerCount();
    const invoicePerSeller = overviewSellerCount ? result.invoiceCount / overviewSellerCount : 0;
    const invoicePerSellerDay = overviewSellerCount && result.worked ? result.invoiceCount / overviewSellerCount / result.worked : 0;
    const formatOverviewCount = (value) => Number(value || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: Number.isInteger(Number(value || 0)) ? 0 : 1,
      maximumFractionDigits: 1
    });
    setText('invoiceAverageKpi', formatOverviewCount(invoiceAverage));
    setText('invoiceAverageKpiSub', `${result.worked || 0} dia(s) considerado(s)`);
    setText('invoicePerSellerDayKpi', overviewSellerCount && result.worked ? formatOverviewCount(invoicePerSellerDay) : '—');
    setText('invoicePerSellerKpi', overviewSellerCount ? formatOverviewCount(invoicePerSeller) : '—');
    setText('invoicePerSellerKpiSub', overviewSellerCount ? `${overviewSellerCount} vendedor(es) • ${result.worked || 0} dia(s)` : 'Equipe não configurada');
    const serviceAverage = result.worked ? result.services / result.worked : 0;
    setText('serviceAverageKpi', brl.format(serviceAverage));
    setText('serviceAverageKpiSub', `${result.worked || 0} dia(s) considerado(s)`);
    const setOverviewTone = (id, tone = '') => {
      const card = document.getElementById(id)?.closest('.kpi');
      if (!card) return;
      card.classList.remove('status-positive','status-warning','status-negative');
      if (tone) card.classList.add(`status-${tone}`);
    };
    if (result.nfs > 0) setOverviewTone('conversionKpi', conversion >= .30 ? 'positive' : conversion >= .20 ? 'warning' : 'negative');
    else setOverviewTone('conversionKpi');
    if (result.eligible > 0) setOverviewTone('efficiencyKpi', result.efficiency >= .07 ? 'positive' : result.efficiency >= .05 ? 'warning' : 'negative');
    else setOverviewTone('efficiencyKpi');
    const tiers = tierGoals(goalSource), firstGoal = tiers[0].mercantile;
    const projectedRate = firstGoal ? result.projection / firstGoal : 0;
    const projectedGrossRate = tiers[0].grossProfit ? result.grossProfitProjection / tiers[0].grossProfit : 0;
    const projectionTextEl = document.getElementById('projectionText');
    if (projectionTextEl) {
      projectionTextEl.classList.add('projection-executive-status');
      projectionTextEl.innerHTML = result.worked
        ? `<span class="projection-status-chip merc"><b>${pct.format(projectedRate)}</b><small>Mercantil</small></span>${grossAvailable ? `<span class="projection-status-chip gross"><b>${pct.format(projectedGrossRate)}</b><small>Lucro bruto</small></span>` : `<span class="projection-status-chip neutral"><b>—</b><small>Lucro bruto não informado</small></span>`}`
        : '<span class="projection-status-chip neutral"><b>—</b><small>Preencha os resultados diários para calcular</small></span>';
    }
    document.getElementById('projectionBar').style.width = `${clampRate(projectedRate)}%`;
    document.getElementById('goalGrid').innerHTML = tiers.map((tier) => {
      const rates = tierRate(tier, result.revenue, result.grossProfit, grossAvailable);
      const missingMerc = Math.max(0, tier.mercantile - result.revenue), missingGross = Math.max(0, tier.grossProfit - result.grossProfit);
      const needMerc = result.remaining ? missingMerc / result.remaining : 0, needGross = result.remaining ? missingGross / result.remaining : 0;
      const grossStatus = grossAvailable ? pct.format(rates.grossRate) : 'Não informado';
      const grossMissing = grossAvailable ? brl.format(missingGross) : '—';
      const grossNeed = grossAvailable ? brl.format(needGross) : '—';
      return `<article class="goal ${rates.passed ? 'goal-pass' : ''}"><div class="goal-head"><div><div class="goal-title">${tier.name}</div><div class="goal-subtitle">${grossAvailable ? `${pct.format(tier.mercPct)} mercantil + ${pct.format(tier.grossPct)} lucro bruto` : `${pct.format(tier.mercPct)} mercantil • lucro bruto não informado`}</div></div><span class="pill ${statusClass(rates.overall)}">${rates.passed ? '✓ Atingida' : pct.format(rates.overall)}</span></div><div class="bar"><span style="width:${clampRate(rates.overall)}%"></span></div><dl class="goal-dual"><dt></dt><dd class="goal-col-head">Mercantil</dd><dd class="goal-col-head">Lucro bruto</dd><dt>Objetivo</dt><dd>${brl.format(tier.mercantile)}</dd><dd>${brl.format(tier.grossProfit)}</dd><dt>Atingimento</dt><dd class="${statusClass(rates.mercRate)}">${pct.format(rates.mercRate)}</dd><dd class="${grossAvailable ? statusClass(rates.grossRate) : ''}">${grossStatus}</dd><dt>Falta</dt><dd class="${missingMerc ? 'negative' : 'positive'}">${brl.format(missingMerc)}</dd><dd class="${grossAvailable ? (missingGross ? 'negative' : 'positive') : ''}">${grossMissing}</dd><dt>Necessário/dia</dt><dd>${brl.format(needMerc)}</dd><dd>${grossNeed}</dd></dl></article>`;
    }).join('');
    const servicesRate = num(goalSource.servicesGoal) ? result.services / num(goalSource.servicesGoal) : 0;
    setText('servicesRate', pct.format(servicesRate)); document.getElementById('servicesRate').className = `pill ${statusClass(servicesRate)}`;
    setText('servicesCurrent', brl.format(result.services)); setText('servicesGoal', brl.format(num(goalSource.servicesGoal)));
    {
      const serviceProjectionEl = document.getElementById('servicesProjection');
      if (serviceProjectionEl) {
        const serviceProjectionRate = num(goalSource.servicesGoal) ? result.servicesProjection / num(goalSource.servicesGoal) : 0;
        serviceProjectionEl.classList.add('services-projection-executive');
        serviceProjectionEl.innerHTML = `<span class="services-projection-chip"><small>Projeção</small><b>${brl.format(result.servicesProjection)}</b></span><span class="services-projection-chip rate"><small>Atingimento projetado</small><b>${pct.format(serviceProjectionRate)}</b></span>`;
      }
    }
    document.getElementById('servicesBar').style.width = `${clampRate(servicesRate)}%`;
    const sellerCount = scope.type === 'seller' ? 1 : configuredSellerCount();
    const plannedDays = Math.max(1, num(scope.type === 'seller' ? result.worked + result.remaining : db.businessDays));
    const remainingDays = Math.max(0, num(result.remaining));
    const mercantileGap = Math.max(0, firstGoal - result.revenue);
    const servicesGap = Math.max(0, num(goalSource.servicesGoal) - result.services);
    const gapMetric = (label, value, note, type = 'mercantile') => `<div class="monthly-gap-metric ${type}"><span>${label}</span><strong class="${value ? 'negative' : 'positive'}">${brl.format(value)}</strong><small>${note}</small></div>`;
    const mercGapCards = [
      gapMetric('Falta mercantil total', mercantileGap, `Meta 1: ${brl.format(firstGoal)}`),
      gapMetric('Mercantil / dia da filial', remainingDays ? mercantileGap / remainingDays : 0, `${remainingDays} dia(s) restante(s)`),
      gapMetric('Mercantil / vendedor', sellerCount ? mercantileGap / sellerCount : 0, sellerCount ? `${sellerCount} vendedor(es)` : 'Configure a equipe'),
      gapMetric('Mercantil / dia / vendedor', sellerCount && remainingDays ? mercantileGap / remainingDays / sellerCount : 0, sellerCount ? `Divisão diária para ${sellerCount}` : 'Configure a equipe')
    ].join('');
    const servicesGapCards = [
      gapMetric('Falta serviços total', servicesGap, `Meta: ${brl.format(num(goalSource.servicesGoal))}`, 'services'),
      gapMetric('Serviços / dia da filial', remainingDays ? servicesGap / remainingDays : 0, `${remainingDays} dia(s) restante(s)`, 'services'),
      gapMetric('Serviços / vendedor', sellerCount ? servicesGap / sellerCount : 0, sellerCount ? `${sellerCount} vendedor(es)` : 'Configure a equipe', 'services'),
      gapMetric('Serviços / dia / vendedor', sellerCount && remainingDays ? servicesGap / remainingDays / sellerCount : 0, sellerCount ? `Divisão diária para ${sellerCount}` : 'Configure a equipe', 'services')
    ].join('');
    document.getElementById('monthlyGapGrid').innerHTML = `<section class="monthly-gap-group merc"><header><strong>🛒 MERCANTIL</strong><small>Falta total → necessário por dia → por vendedor → dia/vendedor</small></header><div class="monthly-gap-group-grid">${mercGapCards}</div></section><section class="monthly-gap-group services"><header><strong>🔐 SERVIÇOS</strong><small>Falta total → necessário por dia → por vendedor → dia/vendedor</small></header><div class="monthly-gap-group-grid">${servicesGapCards}</div></section>`;
    const detailLayout = document.getElementById('overviewDetailLayout');
    const ecommercePanel = document.getElementById('ecommerceOverview');
    const showEcommerce = scope.type === 'branch';
    detailLayout.classList.toggle('without-ecommerce', !showEcommerce);
    ecommercePanel.hidden = !showEcommerce;
    if (showEcommerce) {
      const ecommerce = num(db.ecommerce), consolidated = result.revenue;
      setText('storeSalesOverview', brl.format(result.general));
      setText('ecommerceSalesOverview', brl.format(ecommerce));
      setText('consolidatedSalesOverview', brl.format(consolidated));
      setText('consolidatedDailyOverview', brl.format(result.dailyAvg));
      document.getElementById('ecommerceGoalBars').innerHTML = tiers.map((tier) => {
        const rate = tier.mercantile ? consolidated / tier.mercantile : 0;
        return `<div class="commerce-bar-row"><div><strong>${tier.name}</strong><span>${pct.format(rate)}</span></div><div class="bar"><span style="width:${clampRate(rate)}%"></span></div><small>${brl.format(consolidated)} de ${brl.format(tier.mercantile)}</small></div>`;
      }).join('');
    }
    const messages = [];
    if (!db.branch) messages.push('Informe a filial antes de fechar ou imprimir o resultado.');
    if (!result.worked) messages.push('Comece pelo lançamento diário para ativar as análises.');
    else {
      const achieved = tiers.filter((tier) => tierRate(tier, result.revenue, result.grossProfit, grossAvailable).passed).at(-1);
      messages.push(achieved ? `${scope.label} já atingiu a ${achieved.name}${grossAvailable ? ' nos dois critérios' : ' pelo resultado mercantil'}.` : grossAvailable ? `Meta 1 pendente: faltam ${brl.format(Math.max(0, firstGoal - result.revenue))} em mercantil e ${brl.format(Math.max(0, tiers[0].grossProfit - result.grossProfit))} em lucro bruto${scope.type === 'branch' ? '' : ' de referência'}.` : `Meta 1 mercantil pendente: faltam ${brl.format(Math.max(0, firstGoal - result.revenue))}. Lucro bruto não informado.`);
      messages.push(grossAvailable ? (result.projection >= firstGoal && result.grossProfitProjection >= tiers[0].grossProfit ? 'O ritmo atual projeta fechamento dentro da Meta 1.' : 'A projeção ainda não atende aos dois critérios da Meta 1.') : (result.projection >= firstGoal ? 'O ritmo atual projeta fechamento dentro da Meta 1 mercantil.' : 'A projeção mercantil ainda está abaixo da Meta 1.'));
      messages.push(`Eficiência: ${efficiencyPct.format(result.efficiency)} • meta: ${efficiencyPct.format(num(db.efficiencyGoal))}.`);
    }
    const issues = dailyIssues(); if (issues.length) messages.push(`${issues.length} pendência(s) precisam de revisão no lançamento diário.`);
    const conversionTarget=.35,efficiencyTarget=num(db.efficiencyGoal),quickMetric=(label,value)=>`<div class="quick-metric"><span>${label}</span><strong>${value}</strong></div>`;
    document.getElementById('insights').innerHTML=`<div class="quick-dashboard"><div class="quick-dashboard-head"><h3>Resumo da Meta 1</h3><button type="button" class="quick-share" id="quickShare">⇧ Compartilhar</button></div><section class="quick-group"><div class="quick-group-title">Venda mercantil</div><div class="quick-grid">${quickMetric('Falta no mês',brl.format(mercantileGap))}${quickMetric('Necessário/dia',brl.format(remainingDays?mercantileGap/remainingDays:0))}${quickMetric('Falta/vendedor',sellerCount?brl.format(mercantileGap/sellerCount):'—')}${quickMetric('Dia/vendedor',sellerCount&&remainingDays?brl.format(mercantileGap/remainingDays/sellerCount):'—')}</div></section><section class="quick-group services"><div class="quick-group-title">Serviços</div><div class="quick-grid">${quickMetric('Falta no mês',brl.format(servicesGap))}${quickMetric('Necessário/dia',brl.format(remainingDays?servicesGap/remainingDays:0))}${quickMetric('Falta/vendedor',sellerCount?brl.format(servicesGap/sellerCount):'—')}${quickMetric('Dia/vendedor',sellerCount&&remainingDays?brl.format(servicesGap/remainingDays/sellerCount):'—')}</div></section><div class="quick-statuses"><div class="quick-status ${result.efficiency<efficiencyTarget?'attention':''}"><span>Eficiência</span><strong>${efficiencyPct.format(result.efficiency)}</strong><small>Meta ${efficiencyPct.format(efficiencyTarget)}</small></div><div class="quick-status ${conversion<conversionTarget?'attention':''}"><span>Conversão</span><strong>${result.nfs?efficiencyPct.format(conversion):'—'}</strong><small>Meta 35,00%</small></div></div>${issues.length?`<div class="quick-alert">⚠ ${issues.length} pendência(s) no lançamento diário precisam de revisão.</div>`:''}</div>`;
    document.getElementById('quickShare')?.addEventListener('click',exportQuickDashboard);
  }

  function moneyInput(field, value, key, disabled = false) {
    return `<input class="money-input" data-f="${field}" inputmode="decimal" type="text" value="${value ? esc(brl.format(value)) : ''}" aria-label="${field} em ${key}" ${disabled ? 'disabled' : ''}>`;
  }
  function statusSelect(data) {
    return `<select class="status-${data.status}" data-f="status"><option value="pending" ${data.status === 'pending' ? 'selected' : ''}>Pendente</option><option value="done" ${data.status === 'done' ? 'selected' : ''}>✓ Lançado</option><option value="off" ${data.status === 'off' ? 'selected' : ''}>Não trabalha</option></select>`;
  }
  function renderDaily() {
    const rows = allDays();
    renderDailyGoalPlanner();
    const todayKey = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    document.getElementById('dailyBody').innerHTML = rows.map(({ key, date, data }) => {
      const services = num(data.warranty) + num(data.other) + num(data.mixed);
      const efficiency = num(data.eligible) ? services / num(data.eligible) : 0;
      const conversion = num(data.nfs) ? num(data.warrantyQty) / num(data.nfs) : 0;
      const ticket = num(data.invoiceCount) ? num(data.general) / num(data.invoiceCount) : 0;
      const disabled = data.status === 'off';
      const reached = dayReachedPrimaryGoal(data);
      const classes = [disabled ? 'day-off' : '', key === todayKey ? 'today-row' : '', reached ? 'goal-hit' : ''].join(' ');
      const dailyGoal = dailyGoalMetrics(key, data);
      const integerInput = (field) => `<input data-f="${field}" inputmode="numeric" type="number" min="0" step="1" value="${num(data[field]) || ''}" ${disabled ? 'disabled' : ''}>`;
      return `<tr class="${classes}" data-date="${key}"><td><strong>${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</strong><br><span class="muted">${date.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>${dailyGoal.percent ? `<span class="day-goal-table-note">${dailyGoal.percent.toLocaleString('pt-BR')}% · ${brl.format(dailyGoal.branchGoal)}</span><button class="day-goal-table-btn" data-daily-export="${key}">Imagem do dia</button>` : ''}${reached ? '<br><span class="goal-hit-badge">Meta dia ✓</span>' : ''}</td><td>${statusSelect(data)}</td><td>${moneyInput('general', num(data.general), key, disabled)}</td><td>${moneyInput('eligible', num(data.eligible), key, disabled)}</td><td>${integerInput('invoiceCount')}</td><td class="derived">${brl.format(ticket)}</td><td>${integerInput('nfs')}</td><td>${moneyInput('warranty', num(data.warranty), key, disabled)}</td><td>${moneyInput('other', num(data.other), key, disabled)}</td><td>${moneyInput('mixed', num(data.mixed), key, disabled)}</td><td class="derived">${brl.format(services)}</td><td>${integerInput('warrantyQty')}</td><td class="derived">${num(data.nfs) ? efficiencyPct.format(conversion) : '—'}</td><td class="derived ${statusClass(efficiency / 0.07)}">${efficiencyPct.format(efficiency)}</td></tr>`;
    }).join('');
    document.getElementById('dailyCards').innerHTML = rows.map(({ key, date, data }) => {
      const services = num(data.warranty) + num(data.other) + num(data.mixed);
      const efficiency = num(data.eligible) ? services / num(data.eligible) : 0;
      const conversion = num(data.nfs) ? num(data.warrantyQty) / num(data.nfs) : 0;
      const ticket = num(data.invoiceCount) ? num(data.general) / num(data.invoiceCount) : 0;
      const disabled = data.status === 'off', reached = dayReachedPrimaryGoal(data);
      const dailyGoal = dailyGoalMetrics(key, data), isOpen = openDailyKey === key;
      const numberField = (field, label) => `<div class="day-card-field"><label>${label}</label><input data-f="${field}" inputmode="numeric" type="number" min="0" step="1" value="${num(data[field]) || ''}" ${disabled ? 'disabled' : ''}></div>`;
      return `<article class="day-card ${isOpen ? 'is-open' : ''} ${disabled ? 'day-off' : ''} ${key === todayKey ? 'today-row' : ''} ${reached ? 'goal-hit' : ''}" data-date="${key}"><div class="day-card-head"><button class="day-card-toggle" type="button" aria-expanded="${isOpen}" aria-controls="day-content-${key}"><div class="day-card-title"><strong>${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</strong><span>${date.toLocaleDateString('pt-BR', { weekday: 'long' })}</span>${reached ? '<span class="goal-hit-badge">Meta dia atingida ✓</span>' : ''}</div><span class="day-card-chevron" aria-hidden="true">⌄</span></button>${statusSelect(data)}</div><div class="day-card-content" id="day-content-${key}" ${isOpen ? '' : 'hidden'}><div class="day-goal-strip"><div><label>Percentual do dia (%)</label><input data-f="goalPercent" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${dailyGoal.percent || ''}" placeholder="Ex.: 3,51"></div><div class="day-goal-mini"><span>META FILIAL</span><strong>${brl.format(dailyGoal.branchGoal)}</strong></div><div class="day-goal-mini"><span>SERVIÇOS DO DIA</span><strong>${brl.format(dailyGoal.serviceGoal)}</strong></div><div class="day-goal-mini"><span>POR VENDEDOR</span><strong>${dailyGoal.sellerCount ? brl.format(dailyGoal.perSeller) : '—'}</strong></div><button class="btn small day-goal-export" data-daily-export="${key}" ${dailyGoal.percent ? '' : 'disabled'}>Baixar imagem HD</button></div><div class="day-card-grid"><div class="day-card-field"><label>Venda mercantil</label>${moneyInput('general', num(data.general), key, disabled)}</div><div class="day-card-field"><label>Venda elegível</label>${moneyInput('eligible', num(data.eligible), key, disabled)}</div>${numberField('invoiceCount', 'NFs')}${numberField('nfs', 'Quantidade elegível')}<div class="day-card-field"><label>Garantia (R$)</label>${moneyInput('warranty', num(data.warranty), key, disabled)}</div><div class="day-card-field"><label>Outros serviços</label>${moneyInput('other', num(data.other), key, disabled)}</div><div class="day-card-field"><label>Presta-mista</label>${moneyInput('mixed', num(data.mixed), key, disabled)}</div>${numberField('warrantyQty', 'Quantidade de garantias')}</div><div class="day-card-results"><div><span>TICKET MÉDIO</span><strong>${brl.format(ticket)}</strong></div><div><span>SERVIÇOS</span><strong>${brl.format(services)}</strong></div><div><span>CONVERSÃO</span><strong>${num(data.nfs) ? efficiencyPct.format(conversion) : '—'}</strong></div><div><span>EFICIÊNCIA</span><strong class="${statusClass(efficiency / 0.07)}">${efficiencyPct.format(efficiency)}</strong></div></div></div></article>`;
    }).join('');
    bindDailyInputs(document.getElementById('dailyBody'));
    bindDailyInputs(document.getElementById('dailyCards'));
    document.querySelectorAll('.day-card-toggle').forEach((button) => button.addEventListener('click', () => {
      const card = button.closest('[data-date]');
      openDailyKey = openDailyKey === card.dataset.date ? null : card.dataset.date;
      renderDaily();
      if (openDailyKey) document.querySelector(`.day-card[data-date="${openDailyKey}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    document.querySelectorAll('[data-daily-export]').forEach((button) => button.addEventListener('click', () => {
      const key = button.dataset.dailyExport, data = dayData(key);
      const hasResults = ['general','eligible','invoiceCount','nfs','warranty','warrantyQty','other','mixed'].some((field) => num(data[field]) > 0);
      exportDailyGoalImage(key, hasResults);
    }));
    const issues = dailyIssues();
    const box = document.getElementById('dailyValidation');
    box.classList.toggle('show', issues.length > 0);
    box.innerHTML = issues.length ? `<strong>Revise ${issues.length} pendência(s):</strong><br>${issues.slice(0, 5).map(esc).join('<br>')}${issues.length > 5 ? `<br>+ ${issues.length - 5} outra(s)` : ''}` : '';
  }
  function bindMoneyBehavior(input) {
    if (!input || input.dataset.moneyBound) return;
    input.dataset.moneyBound = '1';
    input.addEventListener('focus', () => { const value = num(input.value); input.value = value ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; input.select(); });
    input.addEventListener('blur', () => { const value = num(input.value); input.value = value ? brl.format(value) : ''; });
  }
  function bindDailyInputs(container) {
    container.querySelectorAll('.money-input').forEach(bindMoneyBehavior);
    container.querySelectorAll('[data-f]').forEach((element) => {
      element.addEventListener('change', (event) => {
        const holder = event.target.closest('[data-date]');
        const key = holder.dataset.date, field = event.target.dataset.f;
        const data = { ...dayData(key) };
        if (field === 'status') {
          data.status = event.target.value;
          if (data.status === 'done') data.dashboardWorkedExplicit = true;
          else data.dashboardWorkedExplicit = false;
          if (data.status === 'off') ['general', 'eligible', 'invoiceCount', 'warranty', 'warrantyQty', 'other', 'mixed', 'nfs'].forEach((item) => { data[item] = 0; });
        } else {
          data[field] = ['invoiceCount', 'nfs', 'warrantyQty'].includes(field) ? Math.round(num(event.target.value)) : num(event.target.value);
          if (field !== 'goalPercent') {
            data.dashboardWorkedExplicit = true;
            if (data.status === 'pending') data.status = 'done';
          }
        }
        db.daily[key] = data; persist(); renderAll();
      });
      if (['invoiceCount', 'nfs', 'warrantyQty'].includes(element.dataset.f)) element.addEventListener('blur', (event) => {
        const holder = event.target.closest('[data-date]'); if (!holder) return;
        const value = Math.round(num(event.target.value));
        if (value === Math.round(num(dayData(holder.dataset.date)[element.dataset.f]))) return;
        event.target.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  function weekBuckets() {
    return calendarWeekBuckets(allDays(), db.weekEnds);
  }
  function calendarWeekBuckets(days, customEnds = []) {
    const ends = normalizeWeekEnds(days[0]?.key?.slice(0, 7) || db.month, customEnds);
    if (ends.length) {
      const buckets = ends.map(() => []);
      days.forEach((item) => {
        const day = item.date.getDate(), found = ends.findIndex((end) => day <= end), index = found < 0 ? buckets.length - 1 : found;
        buckets[index].push(item);
      });
      return buckets.filter((items) => items.length);
    }
    const buckets = [], keys = [];
    days.forEach((item) => {
      const monday = new Date(item.date); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const key = `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
      let index = keys.indexOf(key);
      if (index < 0) { keys.push(key); buckets.push([]); index = buckets.length - 1; }
      buckets[index].push(item);
    });
    return buckets;
  }
  function weekStats(items) {
    const result = aggregate(items.map((item) => item.data));
    result.services = result.warranty + result.other + result.mixed;
    result.efficiency = result.eligible ? result.services / result.eligible : 0;
    result.pendingDays = items.filter((item) => item.data.status === 'pending').length;
    return result;
  }
  function weekPhase(items, pendingDays) {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const first = new Date(items[0].date); first.setHours(0, 0, 0, 0);
    const last = new Date(items.at(-1).date); last.setHours(0, 0, 0, 0);
    if (todayStart < first) return 'future';
    if (todayStart > last || pendingDays === 0) return 'closed';
    return 'current';
  }
  function weekTargetContext(items) {
    const workingDays = items.filter((item) => item.data.status !== 'off');
    const monthWorkingDays = allDays().filter((item) => item.data.status !== 'off').length;
    const configuredDays = workingDays.filter((item) => num(item.data.goalPercent) > 0);
    const share = configuredDays.reduce((sum, item) => sum + num(item.data.goalPercent), 0) / 100;
    return { share, plannedShare: monthWorkingDays ? workingDays.length / monthWorkingDays : 0, configured: configuredDays.length, expected: workingDays.length, useDaily: workingDays.length > 0 && configuredDays.length === workingDays.length };
  }
  function weeklyTierTarget(tier, context, weeks) {
    const share = context.useDaily ? context.share : context.plannedShare || 1 / weeks;
    return {
      ...tier,
      mercantile: tier.mercantile * share,
      grossProfit: tier.grossProfit * share
    };
  }
  function renderWeekly() {
    const weeks = Math.max(1, num(db.weeks));
    const grid = document.getElementById('weeklyGrid');
    grid.innerHTML = weekBuckets().map((items, index) => {
      const result = weekStats(items), targetContext = weekTargetContext(items);
      const monthResult = calculate();
      result.grossProfit = monthResult.general ? monthResult.grossProfit * result.general / monthResult.general : 0;
      const grossAvailable = hasCompleteGrossProfit(items);
      const serviceTarget = targetContext.useDaily ? num(db.servicesGoal) * targetContext.share : num(db.servicesGoal) * targetContext.plannedShare;
      const serviceRate = serviceTarget ? result.services / serviceTarget : 0;
      const primaryTarget = weeklyTierTarget(tierGoals()[0], targetContext, weeks).mercantile;
      const plannedDays = items.filter((item) => item.data.status !== 'off').length;
      const sellerCount = configuredSellerCount();
      const salesGap = Math.max(0, primaryTarget - result.general), serviceGap = Math.max(0, serviceTarget - result.services);
      const salesBalance = result.general - primaryTarget, serviceBalance = result.services - serviceTarget;
      const averageDay = result.worked ? result.general / result.worked : 0, serviceAverageDay = result.worked ? result.services / result.worked : 0;
      const targetDay = plannedDays ? primaryTarget / plannedDays : 0, targetServiceDay = plannedDays ? serviceTarget / plannedDays : 0;
      const salesDailyDelta = averageDay - targetDay, serviceDailyDelta = serviceAverageDay - targetServiceDay;
      const paceProjection = averageDay * plannedDays, paceServiceProjection = serviceAverageDay * plannedDays, ticket = result.invoiceCount ? result.general / result.invoiceCount : 0;
      const goals = tierGoals().map((tier) => {
        const target = weeklyTierTarget(tier, targetContext, weeks), mercTarget = target.mercantile, grossTarget = target.grossProfit;
        const rates = tierRate(target, result.general, result.grossProfit, grossAvailable);
        const missingMerc = Math.max(0, mercTarget - result.general), missingGross = Math.max(0, grossTarget - result.grossProfit);
        return `<div class="week-goal ${rates.passed ? 'goal-pass' : ''}"><header><span>${tier.name}</span><span class="${statusClass(rates.overall)}">${rates.passed ? '✓ Atingida' : pct.format(rates.overall)}</span></header><dl><dt>Mercantil / semana</dt><dd>${brl.format(mercTarget)}</dd><dt>Lucro bruto / semana</dt><dd>${grossAvailable ? brl.format(grossTarget) : 'Não informado'}</dd><dt>Falta mercantil</dt><dd class="${missingMerc ? 'negative' : 'positive'}">${brl.format(missingMerc)}</dd><dt>Falta lucro bruto</dt><dd class="${grossAvailable ? (missingGross ? 'negative' : 'positive') : ''}">${grossAvailable ? brl.format(missingGross) : '—'}</dd></dl></div>`;
      }).join('');
      const primary = tierRate(weeklyTierTarget(tierGoals()[0], targetContext, weeks), result.general, result.grossProfit, grossAvailable);
      const hasResults = result.worked > 0 || result.general > 0 || result.grossProfit > 0;
      const phase = weekPhase(items, result.pendingDays);
      const visualClass = phase === 'future' ? '' : phase === 'current' ? 'week-near' : primary.passed ? 'week-good' : 'week-bad';
      const targetNote = targetContext.useDaily
        ? `Meta semanal calculada pela soma dos percentuais diários: ${pct2.format(targetContext.share)} da meta mensal.`
        : targetContext.configured
          ? `Percentuais diários incompletos (${targetContext.configured}/${targetContext.expected}); meta proporcional aos dias úteis desta semana.`
          : 'Meta proporcional aos dias úteis da semana, sempre de segunda-feira a domingo.';
      const efficiencyRate = num(db.efficiencyGoal) ? result.efficiency / num(db.efficiencyGoal) : 0;
      const mercantileStatus = hasResults ? (result.general >= primaryTarget ? 'passed' : 'failed') : '';
      const efficiencyStatus = result.eligible > 0 ? (result.efficiency >= .07 ? 'passed' : result.efficiency >= .05 ? 'attention' : 'failed') : '';
      const projectionRate = primaryTarget ? paceProjection / primaryTarget : 0;
      const expanded = openWeeklyIndex === index;
      const toggleStatus = phase === 'future' ? '' : phase === 'current' ? 'warning' : primary.passed ? 'positive' : 'negative';
      const pendingLabel = result.pendingDays === 1 ? '1 pendente' : `${result.pendingDays} pendentes`;
      const donut = (label, rate, value, color) => `<div class="week-donut-item"><div class="week-donut" style="--rate:${Math.min(100, Math.max(0, rate * 100)).toFixed(2)};--donut:${color}"><strong>${pct.format(rate)}</strong></div><strong>${label}</strong><small>${value}</small></div>`;
      const chart = `<div class="week-chart-panel" ${expanded ? '' : 'hidden'}><div class="week-chart-title"><strong>Percentuais e projeção da semana</strong><span>Comparação com as metas do período</span></div><div class="week-donut-grid">${donut('Mercantil', primary.mercRate, `${brl.format(result.general)} de ${brl.format(primaryTarget)}`, primary.mercRate >= 1 ? '#169b62' : '#df4053')}${donut('Serviços', serviceRate, `${brl.format(result.services)} de ${brl.format(serviceTarget)}`, serviceRate >= 1 ? '#169b62' : '#df4053')}${donut('Projeção', projectionRate, brl.format(paceProjection), projectionRate >= 1 ? '#169b62' : '#0879e8')}</div></div>`;
      const conversion = result.nfs ? result.warrantyQty / result.nfs : 0;
      const conversionTarget = 0.35;
      const conversionStatus = result.nfs ? (conversion >= .30 ? 'passed' : conversion >= .20 ? 'attention' : 'failed') : '';
      const sellerNote = sellerCount ? `${sellerCount} vendedor(es)` : 'Configure a equipe';
      const perSellerSales = sellerCount ? salesBalance / sellerCount : 0;
      const perSellerService = sellerCount ? serviceBalance / sellerCount : 0;
      const perDaySellerSales = sellerCount && plannedDays ? salesBalance / plannedDays / sellerCount : 0;
      const perDaySellerService = sellerCount && plannedDays ? serviceBalance / plannedDays / sellerCount : 0;
      const invoiceAverage = result.worked ? result.invoiceCount / result.worked : 0;
      const invoicePerSeller = sellerCount ? result.invoiceCount / sellerCount : 0;
      const formatCount = (value) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Number(value || 0)) ? 0 : 1, maximumFractionDigits: 1 });
      const serviceProjectionRate = serviceTarget ? paceServiceProjection / serviceTarget : 0;
      const weekMetric = (label, value, note = '', cls = '') => `<div class="metric ${cls}"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
      const mercGroup = [
        weekMetric('VENDA MERCANTIL', brl.format(result.general), primaryTarget ? `${pct.format(primary.mercRate)} da meta • Meta ${brl.format(primaryTarget)} • ${salesBalance >= 0 ? 'acima' : 'abaixo'} ${brl.format(Math.abs(salesBalance))}` : '', `result-status ${mercantileStatus}`),
        weekMetric('LUCRO BRUTO', grossAvailable ? brl.format(result.grossProfit) : 'Não informado', grossAvailable ? 'Resultado proporcional da semana' : 'Sem informação cadastrada'),
        weekMetric('MÉDIA MERCANTIL / DIA', brl.format(averageDay), `Meta/dia: ${brl.format(targetDay)}`),
        weekMetric('SALDO MERCANTIL / DIA', `<span class="${salesDailyDelta >= 0 ? 'positive' : 'negative'}">${signedBrl(salesDailyDelta)}</span>`, `Meta/dia: ${brl.format(targetDay)} • ${salesDailyDelta >= 0 ? 'acima' : 'abaixo'} ${brl.format(Math.abs(salesDailyDelta))}`),
        weekMetric('SALDO MERCANTIL / VENDEDOR', `<span class="${perSellerSales >= 0 ? 'positive' : 'negative'}">${signedBrl(perSellerSales)}</span>`, `${sellerNote} • ${perSellerSales >= 0 ? 'acima' : 'abaixo'} ${brl.format(Math.abs(perSellerSales))}`),
        weekMetric('SALDO MERCANTIL / DIA / VENDEDOR', `<span class="${perDaySellerSales >= 0 ? 'positive' : 'negative'}">${signedBrl(perDaySellerSales)}</span>`, `${sellerNote} • ${perDaySellerSales >= 0 ? 'acima' : 'abaixo'} ${brl.format(Math.abs(perDaySellerSales))}`, 'emphasized'),
        weekMetric('PROJEÇÃO PELO RITMO', brl.format(paceProjection), primaryTarget ? `${pct.format(projectionRate)} da meta` : 'Sem meta definida')
      ].join('');
      const indicatorGroup = [
        weekMetric('NOTAS FISCAIS TOTAL', String(result.invoiceCount), `${result.worked} dia(s) lançado(s)`),
        weekMetric('MÉDIA NOTAS FISCAIS / DIA', formatCount(invoiceAverage), `${result.worked} dia(s) considerado(s)`),
        weekMetric('NOTAS FISCAIS / VENDEDOR', formatCount(invoicePerSeller), sellerNote),
        weekMetric('TICKET MÉDIO', result.invoiceCount ? brl.format(ticket) : '—', `${result.invoiceCount || 0} nota(s) fiscal(is)`)
      ].join('');
      const servicesGroup = [
        weekMetric('SERVIÇOS', brl.format(result.services), serviceTarget ? `${pct.format(serviceRate)} da meta • Meta ${brl.format(serviceTarget)} • ${serviceBalance >= 0 ? 'acima' : 'abaixo'} ${brl.format(Math.abs(serviceBalance))}` : '', serviceRate >= 1 ? 'result-status passed' : 'result-status failed'),
        weekMetric('MÉDIA SERVIÇOS / DIA', brl.format(serviceAverageDay), `Meta/dia: ${brl.format(targetServiceDay)}`),
        weekMetric('SALDO SERVIÇOS / DIA', `<span class="${serviceDailyDelta >= 0 ? 'positive' : 'negative'}">${signedBrl(serviceDailyDelta)}</span>`, `Meta/dia: ${brl.format(targetServiceDay)} • ${serviceDailyDelta >= 0 ? 'acima' : 'abaixo'} ${brl.format(Math.abs(serviceDailyDelta))}`),
        weekMetric('SALDO SERVIÇOS / VENDEDOR', `<span class="${perSellerService >= 0 ? 'positive' : 'negative'}">${signedBrl(perSellerService)}</span>`, `${sellerNote} • ${perSellerService >= 0 ? 'acima' : 'abaixo'} ${brl.format(Math.abs(perSellerService))}`),
        weekMetric('SALDO SERVIÇOS / DIA / VENDEDOR', `<span class="${perDaySellerService >= 0 ? 'positive' : 'negative'}">${signedBrl(perDaySellerService)}</span>`, `${sellerNote} • ${perDaySellerService >= 0 ? 'acima' : 'abaixo'} ${brl.format(Math.abs(perDaySellerService))}`, 'emphasized services'),
        weekMetric('TAXA DE CONVERSÃO', result.nfs ? efficiencyPct.format(conversion) : 'Não calculada', result.nfs ? `${result.warrantyQty} garantia(s) ÷ ${result.nfs} elegível(is) • Meta 35%` : 'Meta 35%', `result-status ${conversionStatus}`),
        weekMetric('EFICIÊNCIA', result.eligible > 0 ? efficiencyPct.format(result.efficiency) : 'Não calculada', 'Meta 7%', `result-status ${efficiencyStatus}`),
        weekMetric('PROJEÇÃO DE SERVIÇOS', brl.format(paceServiceProjection), serviceTarget ? `${pct.format(serviceProjectionRate)} da meta` : 'Sem meta definida')
      ].join('');
      return `<article class="week ${visualClass}"><div class="week-top"><div><div class="week-title">${index + 1}ª semana</div><div class="week-date">${items[0].date.toLocaleDateString('pt-BR')} a ${items.at(-1).date.toLocaleDateString('pt-BR')}</div></div><div class="week-head-actions">${result.pendingDays && phase !== 'future' ? `<span class="week-pending-chip ${phase === 'current' ? 'current' : ''}">${pendingLabel}</span>` : ''}<button type="button" class="week-status-toggle ${toggleStatus}" data-week-toggle="${index}" aria-expanded="${expanded}"><span>${hasResults || phase === 'closed' ? pct.format(primary.overall) : 'Sem dados'}</span><span class="chevron">⌄</span></button></div></div>${chart}<div class="week-indicator-groups"><section class="week-indicator-group merc"><header><strong>🛒 Mercantil</strong><small>Vendas, médias, saldos e projeção</small></header><div class="week-indicator-grid">${mercGroup}</div></section><section class="week-indicator-group indicators"><header><strong>📄 Notas Fiscais e Ticket Médio</strong><small>Quantidade, média, por vendedor e ticket médio</small></header><div class="week-indicator-grid">${indicatorGroup}</div></section><section class="week-indicator-group services"><header><strong>🔐 Serviços</strong><small>Serviços, conversão, eficiência, saldos e projeção</small></header><div class="week-indicator-grid">${servicesGroup}</div></section></div><div class="hint">${targetNote}${grossAvailable ? ' • Lucro bruto mensal distribuído pela participação da semana nas vendas.' : ' • Lucro bruto não informado; percentual calculado somente pelo mercantil.'}</div><div class="week-goals">${goals}</div></article>`;
    }).join('');
    grid.querySelectorAll('[data-week-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.weekToggle);
        openWeeklyIndex = openWeeklyIndex === index ? null : index;
        renderWeekly();
      });
    });
  }

  function sellerMetrics(seller) {
    const services = num(seller.warranty) + num(seller.other) + num(seller.mixed);
    const count = num(db.sellerCount) || db.sellers.length;
    const individualGoal = num(seller.assignedGoal) || (count ? num(db.mercantileGoal) / count : 0);
    const serviceGoal = num(seller.serviceGoal);
    const rate = individualGoal ? num(seller.general) / individualGoal : 0;
    const serviceRate = serviceGoal ? services / serviceGoal : 0;
    const ticket = num(seller.invoiceCount) ? num(seller.general) / num(seller.invoiceCount) : 0;
    const conversion = num(seller.nfs) ? num(seller.warrantyQty) / num(seller.nfs) : 0;
    const hasEligible = num(seller.eligible) > 0, efficiency = hasEligible ? services / num(seller.eligible) : 0;
    const plannedDays = num(seller.plannedDays) || num(db.businessDays);
    const projection = num(seller.days) ? (num(seller.general) / num(seller.days)) * plannedDays : 0;
    const serviceProjection = num(seller.days) ? (services / num(seller.days)) * plannedDays : 0;
    const dailyAverage = num(seller.days) ? num(seller.general) / num(seller.days) : 0;
    const serviceDailyAverage = num(seller.days) ? services / num(seller.days) : 0;
    const targetDailyAverage = plannedDays ? individualGoal / plannedDays : 0;
    const serviceTargetDailyAverage = plannedDays ? serviceGoal / plannedDays : 0;
    const missing = Math.max(0, individualGoal - num(seller.general));
    const serviceMissing = Math.max(0, serviceGoal - services);
    const remainingDays = Math.max(0, plannedDays - num(seller.days));
    const neededPerDay = remainingDays ? missing / remainingDays : 0;
    const serviceNeededPerDay = remainingDays ? serviceMissing / remainingDays : 0;
    const projectedGap = individualGoal - projection, serviceProjectedGap = serviceGoal - serviceProjection;
    const grossReference = individualGoal * grossProfitRate();
    return { services, individualGoal, serviceGoal, grossReference, plannedDays, remainingDays, rate, serviceRate, ticket, conversion, hasEligible, efficiency, projection, serviceProjection, projectedGap, serviceProjectedGap, dailyAverage, serviceDailyAverage, targetDailyAverage, serviceTargetDailyAverage, missing, serviceMissing, neededPerDay, serviceNeededPerDay };
  }
  function timeGreeting(moment = new Date()) {
    const hour = moment.getHours();
    return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  }
  const positiveMotivations = [
    'Seu resultado mostra consistência. Continue firme e transforme o bom ritmo em uma grande entrega.',
    'Parabéns pela evolução! Mantenha o foco e faça deste dia mais um passo acima.',
    'Você está construindo um excelente caminho. Siga com energia, disciplina e confiança.',
    'O bom resultado de hoje nasceu do seu esforço. Continue nessa pegada!',
    'Seu desempenho inspira confiança. Preserve o ritmo e busque uma entrega ainda melhor.',
    'Você está mostrando força comercial. Aproveite o embalo e avance com determinação.',
    'Meta se conquista com constância, e você está no caminho certo. Vamos em frente!',
    'Excelente ritmo! Continue cuidando de cada oportunidade e celebrando cada avanço.',
    'Seu trabalho está aparecendo nos números. Mantenha a intensidade e vá além.',
    'Parabéns pela entrega! Hoje é dia de repetir as boas atitudes e ampliar o resultado.',
    'Você provou que consegue. Agora é manter a confiança e continuar crescendo.',
    'O resultado positivo confirma sua dedicação. Siga firme, uma venda de cada vez.',
    'Grande desempenho! Continue com atitude, presença e vontade de vencer.',
    'Seu esforço está gerando resultado. Proteja esse ritmo e busque novas oportunidades.',
    'Você está fazendo acontecer. Mantenha o foco e deixe seu resultado falar ainda mais alto.',
    'Parabéns pelo avanço! Consistência hoje significa uma meta mais próxima amanhã.',
    'O caminho está bem construído. Continue acelerando com qualidade e confiança.',
    'Seu ritmo é positivo e merece reconhecimento. Siga forte até o fechamento.',
    'Boa entrega! Continue transformando atendimento em confiança e confiança em resultado.',
    'Você está vencendo o dia com trabalho. Mantenha a energia e continue avançando.',
    'O resultado mostra que sua estratégia está funcionando. Repita o que deu certo e evolua.',
    'Parabéns pela performance! Sua constância pode fazer deste mês um grande marco.',
    'Você está deixando a meta cada vez mais perto. Continue firme e concentrado.',
    'Ótimo trabalho! Preserve a disciplina e busque uma oportunidade a mais hoje.',
    'Seu desempenho merece destaque. Continue com humildade, energia e ambição saudável.',
    'O bom momento é fruto da sua dedicação. Aproveite e faça o dia render ainda mais.',
    'Você está mostrando que resultado se constrói com atitude. Continue nessa direção.',
    'Parabéns! Mantenha o padrão de excelência e siga conquistando novos resultados.',
    'Seu avanço fortalece toda a equipe. Continue sendo protagonista da sua meta.',
    'O ritmo está forte. Confie no processo, cuide do cliente e continue entregando.',
    'Feche o dia com a mesma força que começou. Você está preparado para ir além.'
  ];
  const supportMotivations = [
    'Um resultado abaixo do esperado não define sua capacidade. Levante a cabeça e recomece forte hoje.',
    'Dias difíceis também fazem parte da caminhada. Confie em você e busque a próxima oportunidade.',
    'Não carregue o peso de ontem. Hoje existe uma nova chance de fazer diferente e avançar.',
    'Respire, reorganize o foco e siga. Sua reação de hoje pode mudar todo o resultado do mês.',
    'O momento pede calma e atitude. Você tem capacidade para recuperar e surpreender.',
    'Nem todo dia sai como planejado, mas todo novo dia permite uma grande retomada.',
    'Seu potencial continua intacto. Ajuste a rota, mantenha a confiança e volte para o jogo.',
    'Resultado é construção. Dê o próximo passo com coragem e deixe a evolução acontecer.',
    'Não se abata pelos números atuais. Concentre-se na próxima venda e faça acontecer.',
    'A meta ainda está viva. Trabalhe uma oportunidade por vez e confie na sua recuperação.',
    'Você não precisa resolver tudo de uma vez. Vença o próximo atendimento e ganhe ritmo.',
    'Transforme a pressão em direção. Foco no cliente, atitude na abordagem e confiança no fechamento.',
    'O mês ainda oferece oportunidades. Recomece com energia e mostre sua força.',
    'Uma fase difícil é passageira. Sua disciplina e sua atitude podem virar esse cenário.',
    'Não permita que um resultado momentâneo diminua sua confiança. Você pode reagir.',
    'A recuperação começa em uma decisão: acreditar, agir e persistir. Conte com a equipe.',
    'Hoje é um novo ponto de partida. Faça o básico bem feito e recupere o ritmo.',
    'Olhe para frente. Cada cliente é uma possibilidade real de mudar o seu dia.',
    'Você já superou desafios antes. Use sua experiência e volte ainda mais determinado.',
    'O resultado pode oscilar, mas sua atitude precisa permanecer forte. Siga em frente.',
    'Sem culpa e sem medo: analise, ajuste e ataque as melhores oportunidades de hoje.',
    'Acredite no processo. Constância e coragem transformam dias difíceis em grandes viradas.',
    'Sua meta não exige perfeição, exige persistência. Continue tentando com inteligência.',
    'Não desista do mês por causa de um dia. A próxima conversa pode abrir uma grande venda.',
    'Você tem talento e capacidade. Recupere a confiança e coloque energia na próxima ação.',
    'Toda virada começa pequena. Conquiste a primeira venda e deixe o ritmo crescer.',
    'O cenário atual não é o resultado final. Continue trabalhando e escreva uma nova história.',
    'Mantenha a cabeça erguida. O apoio está aqui e as oportunidades continuam chegando.',
    'Use o resultado como orientação, não como peso. Ajuste a estratégia e avance.',
    'Ainda há tempo para reagir. Faça deste dia o início de uma sequência positiva.',
    'Confie na sua força. Persistência, foco e uma boa oportunidade podem mudar tudo.'
  ];
  const nameSeed = (value) => [...String(value || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  function suggestedMissionTone(seller) {
    const key = arguments[1] || selectedSellerMissionDate(), period = sellerPeriodAnalysis(seller, key);
    if (period.hasResult) return period.positive ? 'positive' : 'support';
    const metrics = sellerMetrics(seller), hasResult = num(seller.general) > 0 || num(seller.days) > 0;
    if (!hasResult) return 'positive';
    return metrics.projection >= metrics.individualGoal || metrics.rate >= 1 ? 'positive' : 'support';
  }
  function selectedMissionTone(seller, key) {
    return seller.missionTones?.[key] || suggestedMissionTone(seller, key);
  }
  function missionMessage(subject, key, tone = 'positive') {
    const day = Math.max(1, Number(String(key).slice(-2)) || 1), list = tone === 'support' ? supportMotivations : positiveMotivations;
    const index = (day - 1 + nameSeed(subject?.id || subject?.name) % list.length) % list.length;
    const firstName = String(subject?.name || 'Equipe').trim().split(/\s+/)[0] || 'Equipe';
    return `${firstName}, ${list[index].charAt(0).toLowerCase()}${list[index].slice(1)}`;
  }
  function sellerMissionMetrics(seller, key) {
    const metrics = sellerMetrics(seller), percent = num(dayData(key).goalPercent), branchMission = dailyGoalMetrics(key);
    const mercantileGoal = metrics.individualGoal * percent / 100;
    const serviceGoal = num(seller.serviceGoal) * percent / 100;
    return { key, percent, mercantileGoal, serviceGoal, branchMercantileGoal: branchMission.branchGoal, branchServiceGoal: branchMission.serviceGoal, branchMercantilePerSeller: branchMission.perSeller, branchServicePerSeller: branchMission.servicePerSeller, sellerCount: branchMission.sellerCount, metrics };
  }
  const EFFICIENCY_TARGET = 0.07, CONVERSION_TARGET = 0.35;
  function sellerResultPeriod(seller) {
    if (seller.resultPeriod) return seller.resultPeriod;
    const hasLegacyResult = num(seller.general) > 0 || num(seller.eligible) > 0 || num(seller.warranty) + num(seller.other) + num(seller.mixed) > 0 || num(seller.nfs) > 0;
    return hasLegacyResult ? 'accumulated' : 'none';
  }
  function sellerPeriodAnalysis(seller, key) {
    const mission = sellerMissionMetrics(seller, key), metrics = mission.metrics, period = sellerResultPeriod(seller);
    const labels = { goalMonth: 'Meta do mês, sem resultado', none: 'Meta do dia, sem resultado', day: 'Resultado do dia', week: 'Resultado da semana', fortnight: 'Resultado da quinzena', accumulated: 'Acumulado até o momento', month: 'Fechamento do mês', custom: 'Período personalizado' };
    const hasResult = period !== 'none' && period !== 'goalMonth';
    const periodDays = period === 'day' ? 1 : period === 'month' ? metrics.plannedDays : Math.max(1, num(seller.days));
    const mercantileTarget = period === 'day' ? mission.mercantileGoal : period === 'month' ? metrics.individualGoal : metrics.targetDailyAverage * periodDays;
    const serviceTarget = period === 'day' ? mission.serviceGoal : period === 'month' ? metrics.serviceGoal : metrics.serviceTargetDailyAverage * periodDays;
    const branchMonthlyShare = mission.sellerCount ? num(db.mercantileGoal) / mission.sellerCount : 0;
    const branchDailyAverage = branchMonthlyShare / Math.max(1, num(db.businessDays) || metrics.plannedDays);
    const branchMercantileTarget = period === 'day' ? mission.branchMercantilePerSeller : period === 'month' ? branchMonthlyShare : branchDailyAverage * periodDays;
    const branchMonthlyServiceShare = mission.sellerCount ? num(db.servicesGoal) / mission.sellerCount : 0;
    const branchServiceDailyAverage = branchMonthlyServiceShare / Math.max(1, num(db.businessDays) || metrics.plannedDays);
    const branchServiceTarget = period === 'day' ? mission.branchServicePerSeller : period === 'month' ? branchMonthlyServiceShare : branchServiceDailyAverage * periodDays;
    const sales = num(seller.general), services = metrics.services, eligible = num(seller.eligible);
    const mercantileRate = mercantileTarget ? sales / mercantileTarget : 0, serviceRate = serviceTarget ? services / serviceTarget : 0;
    const branchMercantileRate = branchMercantileTarget ? sales / branchMercantileTarget : 0, branchServiceRate = branchServiceTarget ? services / branchServiceTarget : 0;
    const efficiency = eligible ? services / eligible : 0, conversion = num(seller.nfs) ? num(seller.warrantyQty) / num(seller.nfs) : 0;
    const mercantileDifference = sales - mercantileTarget, serviceDifference = services - serviceTarget;
    const branchMercantileDifference = sales - branchMercantileTarget, branchServiceDifference = services - branchServiceTarget;
    const reachedEitherReference = (mercantileRate >= 1 && serviceRate >= 1) || (branchMercantileRate >= 1 && branchServiceRate >= 1);
    const positive = hasResult && reachedEitherReference && efficiency >= EFFICIENCY_TARGET && conversion >= CONVERSION_TARGET;
    const dateRange = seller.resultStart || seller.resultEnd ? `${seller.resultStart ? new Date(`${seller.resultStart}T12:00:00`).toLocaleDateString('pt-BR') : 'início'} a ${seller.resultEnd ? new Date(`${seller.resultEnd}T12:00:00`).toLocaleDateString('pt-BR') : 'hoje'}` : '';
    return { ...mission, period, periodLabel: labels[period] || labels.custom, dateRange, hasResult, periodDays, mercantileTarget, serviceTarget, branchMercantileTarget, branchServiceTarget, sales, services, eligible, mercantileRate, serviceRate, branchMercantileRate, branchServiceRate, efficiency, conversion, mercantileDifference, serviceDifference, branchMercantileDifference, branchServiceDifference, positive };
  }
  function selectedSellerMissionDate() {
    const input = document.getElementById('sellerMissionDate');
    const first = `${db.month}-01`, last = `${db.month}-${String(monthParts().days).padStart(2, '0')}`;
    const todayKey = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    if (!input.value || input.value < first || input.value > last) input.value = todayKey.startsWith(`${db.month}-`) ? todayKey : first;
    input.min = first; input.max = last; return input.value;
  }
  function renderSellerMission(seller) {
    const key = selectedSellerMissionDate(), mission = sellerMissionMetrics(seller, key), analysis = sellerPeriodAnalysis(seller, key);
    const financial = sellerFinancials(seller), financialComparison = sellerFinancialComparison(seller, analysis.period);
    const suggested = suggestedMissionTone(seller, key), tone = selectedMissionTone(seller, key), message = missionMessage(seller, key, tone);
    const isMonthlyGoal = analysis.period === 'goalMonth';
    const summaryItems = isMonthlyGoal ? [
      ['Meta mercantil mensal', brl.format(mission.metrics.individualGoal)], ['Meta mensal de serviços', brl.format(mission.metrics.serviceGoal)],
      ['Média mercantil por dia', brl.format(mission.metrics.targetDailyAverage)], ['Média de serviços por dia', brl.format(mission.metrics.serviceTargetDailyAverage)],
      ['Eficiência de serviços', '7,00%'], ['Taxa de conversão', '35,00%'],
      ['Ganho se bater as metas', brl.format(financial.targetTotal)], [financialComparison.currentLabel, brl.format(financialComparison.current)], [financialComparison.gapLabel, brl.format(Math.abs(financialComparison.gap))]
    ] : [
      ['Percentual do dia', mission.percent ? `${mission.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : 'Não informado'],
      ['Mercantil da filial/vendedor', mission.sellerCount ? brl.format(mission.branchMercantilePerSeller) : 'Equipe não configurada'], ['Serviços da filial/vendedor', mission.sellerCount ? brl.format(mission.branchServicePerSeller) : 'Equipe não configurada'],
      ['Eficiência', '7,00%'], ['Conversão', '35,00%'], [`${mission.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% sobre a meta individual`, brl.format(mission.mercantileGoal)], ['Serviços individuais do dia', brl.format(mission.serviceGoal)],
      ['Ganho se bater as metas', brl.format(financial.targetTotal)], [financialComparison.currentLabel, brl.format(financialComparison.current)], [financialComparison.gapLabel, brl.format(Math.abs(financialComparison.gap))]
    ];
    document.getElementById('sellerMissionSummary').innerHTML = summaryItems.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    document.getElementById('sellerMissionSectionTitle').textContent = isMonthlyGoal ? 'Meta do mês do vendedor' : 'Missão do dia do vendedor';
    document.getElementById('sellerMissionDateField').hidden = isMonthlyGoal;
    const preview = document.getElementById('sellerPeriodPreview');
    preview.innerHTML = analysis.hasResult
      ? `<strong>${esc(analysis.periodLabel)}${analysis.dateRange ? ` • ${esc(analysis.dateRange)}` : ''}</strong><br>${analysis.period === 'month' ? 'Fechamento comparado com a meta mensal completa.' : `Projeção proporcional a ${analysis.periodDays} dia(s) trabalhado(s), de ${analysis.metrics.plannedDays} planejado(s).`}<div class="period-preview-grid"><div><span>META PELA FILIAL</span><b>${brl.format(analysis.branchMercantileTarget)}</b></div><div><span>ATINGIMENTO FILIAL</span><b>${pct2.format(analysis.branchMercantileRate)}</b></div><div><span>META INDIVIDUAL</span><b>${brl.format(analysis.mercantileTarget)}</b></div><div><span>ATINGIMENTO INDIVIDUAL</span><b>${pct2.format(analysis.mercantileRate)}</b></div><div><span>${financialComparison.currentLabel.toUpperCase()}</span><b>${brl.format(financialComparison.current)}</b></div><div><span>${financialComparison.gapLabel.toUpperCase()}</span><b>${brl.format(Math.abs(financialComparison.gap))}</b></div></div>`
      : isMonthlyGoal
        ? `<strong>Imagem da meta do mês</strong><br>Serão mostradas as metas mensais mercantil e de serviços, os indicadores fixos e as projeções financeiras. O percentual e as missões do dia não aparecerão.`
        : `<strong>Imagem da meta do dia</strong><br>A imagem mostrará o percentual do dia, a missão da filial por vendedor, a missão individual e a mensagem motivacional, sem resultados.`;
    document.querySelectorAll('[data-mission-tone]').forEach((button) => button.classList.toggle('active', button.dataset.missionTone === tone));
    document.getElementById('sellerToneSuggestion').textContent = seller.missionTones?.[key] ? 'Tom escolhido manualmente para este dia' : `Sugestão automática: ${suggested === 'positive' ? 'resultado positivo' : 'apoio e recuperação'}`;
    document.getElementById('sellerMotivationPreview').innerHTML = `${esc(message)}<br><small>Mensagem exclusiva deste dia; não se repete durante o mês.</small>`;
    document.getElementById('sellerMissionImage').disabled = !isMonthlyGoal && !mission.percent;
    document.getElementById('sellerMissionImage').textContent = isMonthlyGoal ? 'Baixar / compartilhar meta do mês' : 'Baixar / compartilhar missão em imagem';
  }
  async function exportSellerMonthlyGoalImage(seller, key, analysis, financial) {
    const metrics = analysis.metrics, tone = selectedMissionTone(seller, key), motivationalText = missionMessage(seller, key, tone);
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1620;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const [year, month] = String(db.month).split('-').map(Number);
    imageHeader(ctx, 'META DO MÊS - VENDEDOR', `${seller.name || 'Vendedor'}  |  ${new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`, canvas.width);

    ctx.fillStyle = '#f5f2ff'; roundedCanvasRect(ctx, 54, 305, 972, 510, 30); ctx.fill();
    ctx.fillStyle = '#6b4ce6'; roundedCanvasRect(ctx, 76, 331, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 30px Arial, sans-serif'; ctx.fillText('META INDIVIDUAL DO VENDEDOR', 102, 359);
    drawCanvasMetric(ctx, 64, 390, 460, 125, 'Meta mercantil mensal', brl.format(metrics.individualGoal), true);
    drawCanvasMetric(ctx, 556, 390, 460, 125, 'Meta mensal de serviços', brl.format(metrics.serviceGoal));
    drawCanvasMetric(ctx, 64, 535, 460, 125, 'Média mercantil por dia', brl.format(metrics.targetDailyAverage), true, `Meta mensal ÷ ${metrics.plannedDays} dias planejados`);
    drawCanvasMetric(ctx, 556, 535, 460, 125, 'Média de serviços por dia', brl.format(metrics.serviceTargetDailyAverage), false, `Meta de serviços ÷ ${metrics.plannedDays} dias planejados`);
    drawCanvasMetric(ctx, 64, 680, 460, 105, 'Eficiência de serviços', '7,00%');
    drawCanvasMetric(ctx, 556, 680, 460, 105, 'Taxa de conversão', '35,00%');

    ctx.fillStyle = '#effaf5'; roundedCanvasRect(ctx, 54, 845, 972, 350, 30); ctx.fill();
    ctx.fillStyle = '#169b62'; roundedCanvasRect(ctx, 76, 871, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 29px Arial, sans-serif'; ctx.fillText('PROJEÇÃO FINANCEIRA', 102, 899);
    drawCanvasMetric(ctx, 64, 920, 460, 125, 'Ganho se bater as metas', brl.format(financial.targetTotal), true, 'Inclui comissões, repousos e atestados');
    drawCanvasMetric(ctx, 556, 920, 460, 125, 'Projeção no ritmo atual', brl.format(financial.projectedTotal), false, num(seller.days) ? `${num(seller.days)} dia(s) considerado(s)` : 'Aguardando resultados');
    drawCanvasMetric(ctx, 64, 1065, 296, 105, 'Comissão mercantil', pct2.format(financial.mercantileRate));
    drawCanvasMetric(ctx, 392, 1065, 296, 105, 'Comissão de serviços', pct2.format(financial.serviceRate));
    drawCanvasMetric(ctx, 720, 1065, 296, 105, 'Repousos + atestados', `${financial.paidDays} dia(s)`);

    ctx.fillStyle = tone === 'positive' ? '#e9f8f1' : '#fff0f2'; roundedCanvasRect(ctx, 64, 1230, 952, 190, 26); ctx.fill();
    ctx.fillStyle = '#203a56'; ctx.font = '700 25px Arial, sans-serif'; drawWrappedCanvasText(ctx, motivationalText, 94, 1288, 884, 34, 3);
    ctx.fillStyle = '#102a43'; ctx.font = '800 20px Arial, sans-serif'; ctx.fillText(`${db.branch || 'Filial não informada'}`, 64, 1485);
    ctx.fillStyle = '#748296'; ctx.font = '600 17px Arial, sans-serif'; ctx.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')} pela Gestão de Resultados`, 64, 1525);
    const safeName = String(seller.name || 'vendedor').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    await shareOrDownloadImage(canvas, `meta-mensal-${safeName || 'vendedor'}-${db.month}.png`, `Meta do mês - ${seller.name || 'Vendedor'}`);
  }
  async function exportSellerMissionImage(seller, key = selectedSellerMissionDate()) {
    if (!seller) return;
    const analysis = sellerPeriodAnalysis(seller, key), mission = analysis, metrics = analysis.metrics, financial = sellerFinancials(seller);
    const tone = selectedMissionTone(seller, key), motivationalText = missionMessage(seller, key, tone), financialComparison = sellerFinancialComparison(seller, analysis.period);
    if (analysis.period === 'goalMonth') { await exportSellerMonthlyGoalImage(seller, key, analysis, financial); return; }
    if (!mission.percent) { alert('Informe primeiro o percentual deste dia na meta diária da filial.'); return; }
    const hasFollowUp = analysis.hasResult;
    const date = new Date(`${key}T12:00:00`), canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = hasFollowUp ? 2210 : 1660;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    imageHeader(ctx, hasFollowUp ? 'RESULTADO - VENDEDOR' : 'MISSÃO DO DIA - VENDEDOR', `${seller.name || 'Vendedor'}  |  ${date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`, canvas.width);

    ctx.fillStyle = '#edf7ff'; roundedCanvasRect(ctx, 54, 300, 972, 340, 30); ctx.fill();
    ctx.fillStyle = '#0879e8'; roundedCanvasRect(ctx, 76, 326, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 30px Arial, sans-serif'; ctx.fillText('PEDIDO DA EMPRESA PARA A FILIAL', 102, 354);
    drawCanvasMetric(ctx, 64, 378, 296, 125, 'Percentual do dia', `${mission.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
    drawCanvasMetric(ctx, 392, 378, 296, 125, 'Mercantil filial / vendedor', mission.sellerCount ? brl.format(mission.branchMercantilePerSeller) : 'Não configurada', true);
    drawCanvasMetric(ctx, 720, 378, 296, 125, 'Serviços filial / vendedor', mission.sellerCount ? brl.format(mission.branchServicePerSeller) : 'Não configurada', true);
    drawCanvasMetric(ctx, 64, 519, 460, 101, 'Eficiência de serviços', '7,00%');
    drawCanvasMetric(ctx, 556, 519, 460, 101, 'Taxa de conversão', '35,00%');

    ctx.fillStyle = '#f5f2ff'; roundedCanvasRect(ctx, 54, 665, 972, 420, 30); ctx.fill();
    ctx.fillStyle = '#6b4ce6'; roundedCanvasRect(ctx, 76, 691, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 30px Arial, sans-serif'; ctx.fillText('META INDIVIDUAL DO VENDEDOR', 102, 719);
    ctx.fillStyle = '#64748b'; ctx.font = '700 20px Arial, sans-serif'; ctx.fillText(`Meta mensal cadastrada: ${brl.format(metrics.individualGoal)}  •  ${metrics.plannedDays} dias planejados`, 102, 751);
    drawCanvasMetric(ctx, 64, 778, 296, 125, 'Percentual aplicado', `${mission.percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
    drawCanvasMetric(ctx, 392, 778, 296, 125, 'Mercantil individual do dia', brl.format(mission.mercantileGoal), true, `${mission.percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da meta individual`);
    drawCanvasMetric(ctx, 720, 778, 296, 125, 'Serviços individuais do dia', brl.format(mission.serviceGoal), false, 'Percentual aplicado à meta de serviços individual');
    drawCanvasMetric(ctx, 64, 922, 460, 137, 'Meta mercantil por dia planejado', brl.format(metrics.targetDailyAverage), false, `${brl.format(metrics.individualGoal)} ÷ ${metrics.plannedDays} dias`);
    drawCanvasMetric(ctx, 556, 922, 460, 137, 'Meta de serviços por dia planejado', brl.format(metrics.serviceTargetDailyAverage), false, `${brl.format(metrics.serviceGoal)} ÷ ${metrics.plannedDays} dias`);

    ctx.fillStyle = '#effaf5'; roundedCanvasRect(ctx, 54, 1110, 972, 225, 30); ctx.fill();
    ctx.fillStyle = '#169b62'; roundedCanvasRect(ctx, 76, 1136, 9, 36, 5); ctx.fill();
    ctx.fillStyle = '#102a43'; ctx.font = '900 29px Arial, sans-serif'; ctx.fillText('PROJEÇÃO FINANCEIRA', 102, 1164);
    drawCanvasMetric(ctx, 64, 1182, 296, 130, 'Ganho se bater as metas', brl.format(financial.targetTotal), true, `Merc. ${pct2.format(financial.mercantileRate)} • Serv. ${pct2.format(financial.serviceRate)}`);
    drawCanvasMetric(ctx, 392, 1182, 296, 130, financialComparison.currentLabel, brl.format(financialComparison.current), false, num(seller.days) ? `${num(seller.days)} de ${financial.plannedDays} dia(s)` : 'Aguardando resultados');
    drawCanvasMetric(ctx, 720, 1182, 296, 130, financialComparison.gapLabel, brl.format(Math.abs(financialComparison.gap)), false, financialComparison.gapNote);
    if (hasFollowUp) {
      const rangeNote = analysis.dateRange || analysis.periodLabel;
      ctx.fillStyle = '#102a43'; ctx.font = '900 31px Arial, sans-serif'; ctx.fillText('RESULTADO DO PERÍODO', 64, 1400);
      ctx.fillStyle = '#64748b'; ctx.font = '600 18px Arial, sans-serif'; ctx.fillText(rangeNote, 64, 1428);
      const mercantileCards = [
        ['Mercantil realizado', brl.format(analysis.sales)],
        [`Filial: ${analysis.branchMercantileDifference >= 0 ? 'acima' : 'falta'}`, brl.format(Math.abs(analysis.branchMercantileDifference)), `Atingiu ${pct2.format(analysis.branchMercantileRate)}`],
        [`Individual: ${analysis.mercantileDifference >= 0 ? 'acima' : 'falta'}`, brl.format(Math.abs(analysis.mercantileDifference)), `Atingiu ${pct2.format(analysis.mercantileRate)}`]
      ];
      mercantileCards.forEach(([label, value, note], index) => drawCanvasMetric(ctx, 64 + index * 328, 1450, 296, 140, label, value, index === 1, note));
      const serviceCards = [
        ['Serviços realizados', brl.format(analysis.services)],
        [`Filial: ${analysis.branchServiceDifference >= 0 ? 'acima' : 'falta'}`, brl.format(Math.abs(analysis.branchServiceDifference)), `Atingiu ${pct2.format(analysis.branchServiceRate)}`],
        [`Individual: ${analysis.serviceDifference >= 0 ? 'acima' : 'falta'}`, brl.format(Math.abs(analysis.serviceDifference)), `Atingiu ${pct2.format(analysis.serviceRate)}`]
      ];
      serviceCards.forEach(([label, value, note], index) => drawCanvasMetric(ctx, 64 + index * 328, 1610, 296, 140, label, value, index === 1, note));
      const indicatorCards = [
        ['Eficiência atual', analysis.eligible ? efficiencyPct.format(analysis.efficiency) : 'Não calculada', 'Meta 7%'],
        ['Conversão atual', analysis.sales ? efficiencyPct.format(analysis.conversion) : 'Não calculada', 'Meta 35%'],
        ['Situação', analysis.positive ? 'Meta atingida' : 'Abaixo da meta', analysis.positive ? 'Parabéns pelo resultado' : 'Siga firme na recuperação']
      ];
      indicatorCards.forEach(([label, value, note], index) => drawCanvasMetric(ctx, 64 + index * 328, 1770, 296, 140, label, value, index < 2, note));
    }
    const motivationY = hasFollowUp ? 1940 : 1370, branchY = hasFollowUp ? 2145 : 1575, footerY = hasFollowUp ? 2182 : 1615;
    ctx.fillStyle = tone === 'positive' ? '#e9f8f1' : '#fff0f2'; roundedCanvasRect(ctx, 64, motivationY, 952, 170, 26); ctx.fill();
    ctx.fillStyle = '#203a56'; ctx.font = '700 25px Arial, sans-serif'; drawWrappedCanvasText(ctx, motivationalText, 94, motivationY + 58, 884, 34, 3);
    ctx.fillStyle = '#102a43'; ctx.font = '800 20px Arial, sans-serif'; ctx.fillText(`${db.branch || 'Filial não informada'}`, 64, branchY);
    ctx.fillStyle = '#748296'; ctx.font = '600 17px Arial, sans-serif'; ctx.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')} pela Gestão de Resultados`, 64, footerY);
    const safeName = String(seller.name || 'vendedor').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    await shareOrDownloadImage(canvas, `${hasFollowUp ? 'resultado' : 'missao-diaria'}-${safeName || 'vendedor'}-${key}.png`, `${hasFollowUp ? analysis.periodLabel : 'Missão do dia'} - ${seller.name || 'Vendedor'}`);
  }
  function sellerHistoricalCommissionRates(seller, source = db) {
    const currentId = sellerIdentity(seller, (source.sellers || db.sellers || []).indexOf(seller));
    const currentName = sellerKey(seller.name || '');
    let mercSales = 0, mercCommission = 0, serviceSales = 0, serviceCommission = 0, samples = 0;
    const consume = (item) => {
      if (!item) return;
      const entries = Object.values(item.daily || {});
      let g = 0, svc = 0, mc = 0, sc = 0;
      if (entries.length) {
        entries.forEach((day) => {
          const ds = num(day.warranty) + num(day.other) + num(day.mixed);
          g += num(day.general); svc += ds;
          mc += Object.prototype.hasOwnProperty.call(day,'commissionMercantile') ? num(day.commissionMercantile) : num(day.general) * num(day.commissionMercantileRate) / 100;
          sc += Object.prototype.hasOwnProperty.call(day,'commissionService') ? num(day.commissionService) : ds * .05;
        });
      } else {
        g = num(item.general); svc = num(item.warranty)+num(item.other)+num(item.mixed);
        mc = num(item.commissionMercantile) || g * num(item.commissionMercantileRate) / 100;
        sc = num(item.commissionService) || svc * (Object.prototype.hasOwnProperty.call(item,'commissionServiceRate') ? num(item.commissionServiceRate)/100 : .05);
      }
      if (g > 0 || svc > 0) samples += 1;
      mercSales += g; mercCommission += mc; serviceSales += svc; serviceCommission += sc;
    };
    consume(seller);
    const branch = String(source.branch || db.branch || '').trim().toLocaleUpperCase('pt-BR');
    Object.values(vault.records || {}).forEach((record) => {
      if (record === source || String(record.month) === String(source.month)) return;
      if (String(record.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch) return;
      const match = (record.sellers || []).find((item,index) => sellerIdentity(item,index) === currentId || sellerKey(item.name) === currentName);
      if (match) consume(match);
    });
    return {
      mercantileRate: mercSales ? mercCommission / mercSales : 0,
      serviceRate: serviceSales ? serviceCommission / serviceSales : 0,
      samples,
      mercSales, serviceSales, mercCommission, serviceCommission
    };
  }
  function sellerPendingInfo(seller) {
    const [yy, mm] = String(db.month || '').split('-').map(Number), last = new Date(yy, mm, 0).getDate();
    const sameMonth = yy === today.getFullYear() && mm === today.getMonth()+1;
    const cutoff = sameMonth ? Math.min(today.getDate(), last) : (new Date(yy,mm,0) < today ? last : 0);
    let overdue = 0, considered = 0;
    for (let d=1; d<=cutoff; d++) {
      const key = `${db.month}-${String(d).padStart(2,'0')}`;
      const branchDay = dayData(key), sellerDay = seller.daily?.[key];
      const status = sellerDay?.status || branchDay.status;
      if (status === 'off' || status === 'medical' || status === 'justified') continue;
      considered += 1;
      const has = sellerDay && (sellerDay.status === 'done' || sellerDay.status === 'partial' || hasSellerDayValue(sellerDay));
      if (!has) overdue += 1;
    }
    return { overdue, considered };
  }
  function sellerHistoricalCommissionRates(seller) {
    const id = sellerIdentity(seller, db.sellers.indexOf(seller)), name = seller.name || '';
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    let mercSales = 0, mercCommission = 0, serviceSales = 0, serviceCommission = 0, months = 0;
    Object.values(vault.records || {}).forEach((record) => {
      if (!record || record === db || record.month === db.month || String(record.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch) return;
      const match = (record.sellers || []).find((item, index) => sellerIdentity(item, index) === id || sellerKey(item.name) === sellerKey(name));
      if (!match) return;
      const entries = Object.values(match.daily || {});
      let mSales = 0, mComm = 0, sSales = 0, sComm = 0;
      entries.forEach((day) => {
        const services = num(day.warranty) + num(day.other) + num(day.mixed);
        mSales += num(day.general);
        mComm += Object.prototype.hasOwnProperty.call(day,'commissionMercantile') ? num(day.commissionMercantile) : num(day.general) * num(day.commissionMercantileRate) / 100;
        sSales += services;
        sComm += Object.prototype.hasOwnProperty.call(day,'commissionService') ? num(day.commissionService) : services * .05;
      });
      if (!entries.length) {
        mSales = num(match.general); mComm = num(match.commissionMercantile) || mSales * num(match.commissionMercantileRate) / 100;
        sSales = num(match.warranty) + num(match.other) + num(match.mixed); sComm = num(match.commissionService) || sSales * .05;
      }
      if (mSales || sSales) months += 1;
      mercSales += mSales; mercCommission += mComm; serviceSales += sSales; serviceCommission += sComm;
    });
    return { mercRate: mercSales ? mercCommission / mercSales : 0, serviceRate: serviceSales ? serviceCommission / serviceSales : 0, months };
  }
  function sellerFinancials(seller, source = db) {
    const [year, month] = String(source.month || db.month).split('-').map(Number), calendarDays = new Date(year, month, 0).getDate();
    const services = num(seller.warranty) + num(seller.other) + num(seller.mixed);
    const sourceCount = num(source.sellerCount) || (source.sellers || []).length;
    const individualGoal = num(seller.assignedGoal) || (sourceCount ? num(source.mercantileGoal) / sourceCount : 0), serviceGoal = num(seller.serviceGoal);
    const dailyEntries = Object.values(seller.daily || {});
    const hasDailyCommission = dailyEntries.some((day) => Object.prototype.hasOwnProperty.call(day,'commissionMercantile') || Object.prototype.hasOwnProperty.call(day,'commissionService') || num(day.commissionMercantileRate) > 0);
    const legacyMercRate = num(seller.commissionMercantileRate) / 100;
    const mercantileCommission = hasDailyCommission ? dailyEntries.reduce((sum, day) => sum + (Object.prototype.hasOwnProperty.call(day,'commissionMercantile') ? num(day.commissionMercantile) : num(day.general) * num(day.commissionMercantileRate) / 100), 0) : (num(seller.commissionMercantile) || num(seller.general) * legacyMercRate);
    const serviceCommission = hasDailyCommission ? dailyEntries.reduce((sum, day) => { const dayServices=num(day.warranty)+num(day.other)+num(day.mixed); return sum + (Object.prototype.hasOwnProperty.call(day,'commissionService') ? num(day.commissionService) : dayServices*.05); }, 0) : (num(seller.commissionService) || services*.05);
    const historicalRates = sellerHistoricalCommissionRates(seller, source);
    const effectiveMercantileRate = num(historicalRates.mercantileRate ?? historicalRates.mercRate) || (num(seller.general) ? mercantileCommission / num(seller.general) : legacyMercRate);
    const serviceRate = num(historicalRates.serviceRate) || (services ? serviceCommission / services : 0);
    const commissionSubtotal = mercantileCommission + serviceCommission;
    const plannedDays = num(seller.plannedDays) || num(source.businessDays);
    const sundayCount = Array.from({length:calendarDays}, (_,i) => new Date(year, month-1, i+1).getDay() === 0 ? 1 : 0).reduce((a,b)=>a+b,0);
    const automaticRestDays = sundayCount;
    const restDays = Object.prototype.hasOwnProperty.call(seller, 'restDays') && String(seller.restDays) !== '' ? num(seller.restDays) : automaticRestDays;
    const dailyWorkedDays = dailyEntries.filter((day) => day && !['off','medical','justified'].includes(day.status) && (day.status === 'done' || day.status === 'partial' || ['general','eligible','warranty','other','mixed','nfs','warrantyQty'].some((field)=>num(day[field])>0))).length;
    const dailyJustifiedDays = dailyEntries.filter((day)=>day && ['medical','justified'].includes(day.status)).length;
    const justifiedDays = Math.max(num(seller.justifiedDays), dailyJustifiedDays), paidDays = restDays + justifiedDays, workedDays = Math.max(num(seller.days), dailyWorkedDays);
    const currentDailyCommission = workedDays ? commissionSubtotal / workedDays : 0;
    const dsr = currentDailyCommission * paidDays, total = commissionSubtotal + dsr;
    const projectedSubtotal = workedDays ? currentDailyCommission * plannedDays : 0;
    const projectedDsr = plannedDays ? projectedSubtotal / plannedDays * paidDays : 0, projectedTotal = projectedSubtotal + projectedDsr;
    const targetMercantileCommission = individualGoal * effectiveMercantileRate;
    const targetServiceCommission = serviceGoal * serviceRate;
    const targetSubtotal = targetMercantileCommission + targetServiceCommission;
    const targetPaid = plannedDays ? targetSubtotal / plannedDays * paidDays : 0, targetTotal = targetSubtotal + targetPaid;
    return { services, serviceCommission, mercantileCommission, commissionSubtotal, plannedDays, calendarDays, sundayCount, automaticRestDays, restDays, justifiedDays, paidDays, workedDays, dsr, total, projectedSubtotal, projectedDsr, projectedTotal, mercantileRate: effectiveMercantileRate, serviceRate, commissionHistorySamples: num(historicalRates.samples ?? historicalRates.months), targetMercantileCommission, targetServiceCommission, targetSubtotal, targetPaid, targetTotal };
  }
  function sellerFinancialComparison(seller, period = sellerResultPeriod(seller)) {
    const financial = sellerFinancials(seller), isClosure = period === 'month';
    const current = isClosure ? financial.total : financial.projectedTotal;
    const gap = financial.targetTotal - current;
    return {
      ...financial, isClosure, current, gap,
      currentLabel: isClosure ? 'Ganho apurado no fechamento' : 'Projeção financeira atual',
      gapLabel: isClosure ? (gap > 0.005 ? 'Quanto deixou de ganhar' : 'Diferença no fechamento') : 'Diferença financeira projetada',
      gapNote: gap > 0.005 ? 'Abaixo do potencial das metas' : gap < -0.005 ? 'Acima do potencial das metas' : 'Projeção financeira atendida'
    };
  }
  function sellerProfileHistory(seller) {
    const id = sellerIdentity(seller, db.sellers.indexOf(seller)), name = seller.name || '';
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    return Object.values(vault.records || {}).filter((record) => String(record.branch || '').trim().toLocaleUpperCase('pt-BR') === branch).map((record) => {
      const match = (record.sellers || []).find((item, index) => sellerIdentity(item, index) === id || sellerKey(item.name) === sellerKey(name));
      if (!match) return null;
      const financial = sellerFinancials(match, record), services = num(match.warranty) + num(match.other) + num(match.mixed);
      return { month: record.month, seller: match, financial, services, ticket: num(match.invoiceCount) ? num(match.general) / num(match.invoiceCount) : 0 };
    }).filter(Boolean).sort((a, b) => b.month.localeCompare(a.month));
  }
  function sellerDailyAggregate(seller) {
    const entries = Object.entries(seller?.daily || {});
    const total = entries.reduce((acc, [, day]) => {
      acc.general += num(day.general); acc.eligible += num(day.eligible); acc.invoiceCount += num(day.invoiceCount);
      acc.nfs += num(day.nfs); acc.warranty += num(day.warranty); acc.warrantyQty += num(day.warrantyQty);
      acc.other += num(day.other); acc.mixed += num(day.mixed); if (day.status === 'done') acc.days += 1;
      return acc;
    }, { general:0, eligible:0, invoiceCount:0, nfs:0, warranty:0, warrantyQty:0, other:0, mixed:0, days:0 });
    total.services = total.warranty + total.other + total.mixed;
    total.efficiency = total.eligible ? total.services / total.eligible : 0;
    total.conversion = total.nfs ? total.warrantyQty / total.nfs : 0;
    return total;
  }
  function renderSellerDailyDetail(seller) {
    const panel = document.getElementById('sellerDailyDetail'); if (!panel || !seller) return;
    const days = Object.entries(seller.daily || {}).sort(([a],[b]) => a.localeCompare(b));
    const total = sellerDailyAggregate(seller);
    const rows = days.map(([key, day]) => {
      const services = num(day.warranty)+num(day.other)+num(day.mixed);
      const efficiency = num(day.eligible) ? services/num(day.eligible) : 0;
      const conversion = num(day.nfs) ? num(day.warrantyQty)/num(day.nfs) : 0;
      return `<tr><td>${new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR')}</td><td>${day.status==='done'?'Lançado':day.status==='off'?'Não trabalha':'Pendente'}</td><td>${brl.format(num(day.general))}</td><td>${brl.format(num(day.eligible))}</td><td>${brl.format(services)}</td><td>${num(day.nfs)}</td><td>${num(day.warrantyQty)}</td><td>${num(day.nfs)?efficiencyPct.format(conversion):'—'}</td><td>${num(day.eligible)?efficiencyPct.format(efficiency):'—'}</td></tr>`;
    }).join('');
    panel.innerHTML = `<div class="section-title"><div><h2>Lançamentos diários do vendedor</h2><div class="hint">Dados recebidos pela sincronização do acesso individual. A visão do gestor é somente de acompanhamento.</div></div></div><div class="seller-summary"><div class="metric"><span>Mercantil acumulado</span><strong>${brl.format(total.general)}</strong></div><div class="metric"><span>Serviços acumulados</span><strong>${brl.format(total.services)}</strong></div><div class="metric"><span>Conversão</span><strong>${total.nfs?efficiencyPct.format(total.conversion):'—'}</strong></div><div class="metric"><span>Eficiência</span><strong>${total.eligible?efficiencyPct.format(total.efficiency):'—'}</strong></div></div><div class="table-wrap"><table><thead><tr><th>Dia</th><th>Status</th><th>Mercantil</th><th>Elegível</th><th>Serviços</th><th>Qtd. elegível</th><th>Garantias</th><th>Conversão</th><th>Eficiência</th></tr></thead><tbody>${rows || '<tr><td colspan="9" style="text-align:center">Nenhum lançamento diário recebido ainda.</td></tr>'}</tbody></table></div>`;
  }
  function sellerWorkspaceWeeks(seller) {
    const [year, month] = String(db.month || '').split('-').map(Number), lastDay = new Date(year, month, 0).getDate();
    const days = Array.from({length:lastDay}, (_,i) => {
      const key = `${year}-${String(month).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
      const date = new Date(`${key}T12:00:00`);
      const managed = db.daily?.[key] || {};
      const data = { status: managed.status === 'off' ? 'off' : 'pending', ...(seller.daily?.[key] || {}) };
      return { key, date, data, goalPercent:num(managed.goalPercent), managedStatus: managed.status || 'pending' };
    });
    const rawEnds = Array.isArray(db.weekEnds) ? db.weekEnds : String(db.weekEnds || '').split(/[,;\s]+/);
    let ends = [...new Set(rawEnds.map(v=>Math.round(num(v))).filter(v=>v>=1&&v<=lastDay))].sort((a,b)=>a-b);
    if (ends.length && ends.at(-1) !== lastDay) ends.push(lastDay);
    let buckets = [];
    if (ends.length) {
      buckets = ends.map(()=>[]);
      days.forEach(item => { const d=item.date.getDate(), idx=ends.findIndex(end=>d<=end); buckets[idx<0?buckets.length-1:idx].push(item); });
      buckets = buckets.filter(Boolean).filter(x=>x.length);
    } else {
      const map = new Map();
      days.forEach(item => { const monday=new Date(item.date); monday.setDate(monday.getDate()-((monday.getDay()+6)%7)); const k=isoDate(monday.getFullYear(),monday.getMonth()+1,monday.getDate()); if(!map.has(k))map.set(k,[]); map.get(k).push(item); });
      buckets=[...map.values()];
    }
    return buckets.map((items,index) => {
      const tmp={daily:Object.fromEntries(items.map(it=>[it.key,it.data]))}, a=sellerDailyAggregate(tmp);
      const share=items.reduce((sum,it)=>sum+num(it.goalPercent),0)/100;
      const mercGoal=num(seller.assignedGoal)*share, serviceGoal=num(seller.serviceGoal)*share;
      const launched=items.filter(it=>it.data.status==='done'||it.data.status==='partial'||hasSellerDayValue(it.data)).length;
      const working=items.filter(it=>it.data.status!=='off'&&it.managedStatus!=='off').length;
      const pending=Math.max(0,working-launched);
      const mercRate=mercGoal?a.general/mercGoal:0, serviceRate=serviceGoal?a.services/serviceGoal:0;
      const endDate=items.at(-1).date, startDate=items[0].date, now=new Date(today); now.setHours(12,0,0,0);
      const phase=now<startDate?'future':now>endDate?'closed':'current';
      const tone = phase==='future' ? 'future' : (phase==='closed' && pending>0 ? 'mid' : (mercRate>=1 && serviceRate>=1 ? 'good' : (mercRate>=.7 || serviceRate>=.7 || launched ? 'mid' : 'bad')));
      return { index, items, a, share, mercGoal, serviceGoal, launched, working, pending, phase, startDate, endDate, first:startDate, last:endDate, mercRate, serviceRate, tone };
    });
  }
  function sellerWorkspaceWeekCard(w) {
    const conv = w.a.nfs ? efficiencyPct.format(w.a.conversion) : '—', eff = w.a.eligible ? efficiencyPct.format(w.a.efficiency) : '—';
    const missingMerc = Math.max(0,w.mercGoal-w.a.general), missingServ = Math.max(0,w.serviceGoal-w.a.services);
    const avgMerc = w.launched ? w.a.general/w.launched : 0, avgServ = w.launched ? w.a.services/w.launched : 0, targetMercDay=w.working?w.mercGoal/w.working:0, targetServDay=w.working?w.serviceGoal/w.working:0, deltaMercDay=avgMerc-targetMercDay, deltaServDay=avgServ-targetServDay;
    const projMerc = w.launched ? avgMerc*w.working : 0, projServ = w.launched ? avgServ*w.working : 0;
    const ticket = w.a.invoiceCount ? w.a.general/w.a.invoiceCount : 0;
    const commissions = w.items.reduce((sum,item) => {
      const day = item.data || {};
      const services = num(day.warranty)+num(day.other)+num(day.mixed);
      const merc = Object.prototype.hasOwnProperty.call(day,'commissionMercantile') ? num(day.commissionMercantile) : num(day.general)*num(day.commissionMercantileRate)/100;
      const serv = Object.prototype.hasOwnProperty.call(day,'commissionService') ? num(day.commissionService) : services*.05;
      return sum + merc + serv;
    },0);
    const range = w.first && w.last ? `${w.first.toLocaleDateString('pt-BR')} a ${w.last.toLocaleDateString('pt-BR')}` : '';
    const badge = w.phase==='future'?'Futura':w.phase==='current'?'Em andamento':w.pending>0?'Encerrada com pendências':w.tone==='good'?'Meta atingida':'Encerrada abaixo da meta';
    const card=(label,value,note='',cls='')=>`<div class="${cls}"><span>${label}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</div>`;
    const invoiceAvg=w.launched?w.a.invoiceCount/w.launched:0;
    const mercGroup=[
      card('💰 Mercantil',brl.format(w.a.general),w.mercGoal?`${pct.format(w.mercRate)} da meta • falta ${brl.format(missingMerc)}`:'Meta não cadastrada'),
      card('⚡ Média mercantil/dia',brl.format(avgMerc),`${w.launched} dia(s) lançado(s)`),
      card('↕ Saldo mercantil/dia',signedBrl(deltaMercDay),`Meta/dia ${brl.format(targetMercDay)}`,deltaMercDay>=0?'positive':'negative'),
      card('📈 Projeção mercantil',brl.format(projMerc),w.mercGoal?pct.format(projMerc/w.mercGoal)+' projetado':'Sem meta')
    ].join('');
    const indicatorGroup=[
      card('📄 Notas fiscais total',String(w.a.invoiceCount||0),`${w.launched} dia(s) lançado(s)`),
      card('📊 Média notas fiscais/dia',invoiceAvg.toLocaleString('pt-BR',{minimumFractionDigits:Number.isInteger(invoiceAvg)?0:1,maximumFractionDigits:1}),`${w.launched} dia(s) considerado(s)`),
      card('🎯 Conversão',conv,w.a.nfs?`${w.a.warrantyQty} garantia(s) ÷ ${w.a.nfs} elegível(is) • Meta 35%`:'Meta 35%'),
      card('⚡ Eficiência',eff,'Meta 7%'),
      card('🧾 Ticket médio',w.a.invoiceCount?brl.format(ticket):'—',`${w.a.invoiceCount||0} nota(s) fiscal(is)`)
    ].join('');
    const servicesGroup=[
      card('🛡️ Serviços',brl.format(w.a.services),w.serviceGoal?`${pct.format(w.serviceRate)} da meta • falta ${brl.format(missingServ)}`:'Meta não cadastrada'),
      card('⚡ Média serviços/dia',brl.format(avgServ),`${w.working} dia(s) planejado(s)`),
      card('↕ Saldo serviços/dia',signedBrl(deltaServDay),`Meta/dia ${brl.format(targetServDay)}`,deltaServDay>=0?'positive':'negative'),
      card('📈 Projeção serviços',brl.format(projServ),w.serviceGoal?pct.format(projServ/w.serviceGoal)+' projetado':'Sem meta')
    ].join('');
    const auxGroup=`<div class="seller-week-aux">${card('💵 Comissões',brl.format(commissions),'Mercantil + serviços')}${card('📅 Dias da semana',`${w.launched}/${w.working}`,`${w.pending} pendente(s)`)}${card('📊 Distribuição',pct2.format(w.share),'da meta mensal')}</div>`;
    return `<article class="seller-week-card ${w.tone}"><header><div><strong>${w.index+1}ª semana</strong><small>${range}</small></div><span>${badge}</span></header><div class="seller-week-indicator-groups"><section class="seller-week-indicator-group merc"><header><strong>🛒 Mercantil</strong><small>Vendas, médias, saldos e projeção</small></header><div class="seller-week-grid">${mercGroup}</div></section><section class="seller-week-indicator-group indicators"><header><strong>📄 Notas Fiscais e Indicadores</strong><small>Quantidade, médias, conversão, eficiência e ticket</small></header><div class="seller-week-grid">${indicatorGroup}</div></section><section class="seller-week-indicator-group services"><header><strong>🔧 Serviços</strong><small>Serviços, médias, saldos e projeção</small></header><div class="seller-week-grid">${servicesGroup}</div></section></div>${auxGroup}<footer>Semana sincronizada com a configuração gerencial e com a distribuição diária da competência.</footer></article>`;
  }
  function sellerWorkspacePeriodCard(label, aggregateData={}, mercGoal=0, serviceGoal=0) {
    const a = aggregateData || {};
    const services = num(a.services);
    const mercRate = num(mercGoal) ? num(a.general) / num(mercGoal) : 0;
    const servRate = num(serviceGoal) ? services / num(serviceGoal) : 0;
    const conv = num(a.nfs) ? num(a.warrantyQty) / num(a.nfs) : num(a.conversion);
    const eff = num(a.eligible) ? services / num(a.eligible) : num(a.efficiency);
    return `<article class="seller-workspace-card seller-period-card"><span>${esc(label)}</span><strong>${brl.format(num(a.general))}</strong><small>Serviços ${brl.format(services)}${num(mercGoal)?` • Mercantil ${pct.format(mercRate)}`:''}${num(serviceGoal)?` • Serviços ${pct.format(servRate)}`:''}</small><div class="seller-period-mini"><b>Conversão ${num(a.nfs)||conv?efficiencyPct.format(conv):'—'}</b><b>Eficiência ${num(a.eligible)||eff?efficiencyPct.format(eff):'—'}</b></div></article>`;
  }
  function hasSellerDayValue(day){return !!day&&['general','eligible','warranty','other','mixed','nfs','warrantyQty'].some(f=>num(day[f])>0)}
  function sellerDashboardPeriodRows(seller, period='month') {
    const all=Object.entries(seller?.daily||{}).sort(([a],[b])=>a.localeCompare(b));
    if(period==='month') return all;
    const [yy,mm]=String(db.month||'').split('-').map(Number), last=new Date(yy,mm,0).getDate();
    let anchor=(yy===today.getFullYear()&&mm===today.getMonth()+1)?today.getDate():last;
    if(period==='week') { const d=new Date(yy,mm-1,anchor), dow=(d.getDay()+6)%7, start=Math.max(1,anchor-dow), end=Math.min(last,start+6); return all.filter(([k])=>{const day=Number(k.slice(-2));return day>=start&&day<=end}); }
    if(period==='fortnight') { const start=anchor<=15?1:16, end=anchor<=15?15:last; return all.filter(([k])=>{const day=Number(k.slice(-2));return day>=start&&day<=end}); }
    if(period==='bimester') {
      const currentKey=String(db.month||'');
      const currentDate=new Date(`${currentKey}-01T12:00:00`);
      const prevDate=new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1, 12);
      const prevKey=`${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
      const monthMap=new Map(sellerProfileHistory(seller).map(entry=>[String(entry.month), entry.seller]));
      if(!monthMap.has(currentKey)) monthMap.set(currentKey, seller);
      return [prevKey,currentKey].flatMap(monthKey=>Object.entries(monthMap.get(monthKey)?.daily||{}).filter(([,d])=>hasSellerDayValue(d)).sort(([a],[b])=>a.localeCompare(b)));
    }
    return all;
  }
  function sellerDashboardAggregateRows(rows) { const tmp={daily:Object.fromEntries(rows)}; return sellerDailyAggregate(tmp); }
  function dashboardMetricValue(day, metric) { const services=num(day.warranty)+num(day.other)+num(day.mixed); if(metric==='services')return services;if(metric==='conversion')return num(day.nfs)?num(day.warrantyQty)/num(day.nfs)*100:0;if(metric==='efficiency')return num(day.eligible)?services/num(day.eligible)*100:0;if(metric==='ticket')return num(day.invoiceCount)?num(day.general)/num(day.invoiceCount):0;if(metric==='invoice')return num(day.invoiceCount);if(metric==='gain'){const mc=Object.prototype.hasOwnProperty.call(day,'commissionMercantile')?num(day.commissionMercantile):num(day.general)*num(day.commissionMercantileRate)/100;const sc=Object.prototype.hasOwnProperty.call(day,'commissionService')?num(day.commissionService):services*.05;return mc+sc;}return num(day.general); }
  function dashboardFormat(value, metric){ if(metric==='invoice')return Number(value||0).toLocaleString('pt-BR',{minimumFractionDigits:Number.isInteger(Number(value||0))?0:1,maximumFractionDigits:1}); return ['conversion','efficiency'].includes(metric)?`${Number(value||0).toFixed(1).replace('.',',')}%`:brl.format(value||0); }
  function dashboardLabel(metric){ return ({merc:'Venda mercantil',services:'Serviços',conversion:'Conversão',efficiency:'Eficiência',ticket:'Ticket médio',invoice:'Notas fiscais',gain:'Ganhos'})[metric]||'Venda mercantil'; }
  function dashboardAxisFormat(value, metric){
    const numValue = Number(value || 0);
    if (['conversion','efficiency'].includes(metric)) return `${numValue.toFixed(numValue >= 10 ? 0 : 1).replace('.',',')}%`;
    if (metric === 'invoice') return numValue.toFixed(numValue >= 10 ? 0 : 1).replace('.',',');
    if (numValue >= 1e6) return `R$ ${(numValue / 1e6).toFixed(1).replace('.',',')} mi`;
    if (numValue >= 1000) return `R$ ${(numValue / 1000).toFixed(numValue >= 10000 ? 0 : 1).replace('.',',')} mil`;
    return `R$ ${numValue.toFixed(0).replace('.',',')}`;
  }
  function dashboardDataFormat(value, metric){
    const numValue = Number(value || 0);
    if (['conversion','efficiency'].includes(metric)) return `${numValue.toFixed(2).replace('.',',')}%`;
    if (metric === 'invoice') return numValue.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0});
    return brl.format(numValue);
  }
  function dashboardSvg(values, labels, metric, type='bar', expanded=false, statusFlags=[]) {
    const W=expanded?Math.max(960,Math.min(1700,120+Math.max(1,values.length)*52)):760,H=expanded?372:312,left=68,right=18,top=54,bottom=expanded?44:34,maxValue=Math.max(...values,0),axisMax=maxValue>0?maxValue*1.18:1;
    const dense=values.length>12, veryDense=values.length>22;
    const x=i=>type==='bar'?left+(i+.5)*((W-left-right)/Math.max(1,values.length)):left+i*((W-left-right)/Math.max(1,values.length-1));
    const y=v=>H-bottom-(Math.max(0,v)/axisMax)*(H-top-bottom);
    if(!values.length)return '<div class="empty">Sem dados no período selecionado.</div>';
    const ticks=5;
    const tickValues=Array.from({length:ticks},(_,i)=>axisMax-(axisMax/(ticks-1))*i);
    const grid=tickValues.map(v=>{const yy=y(v);return `<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" stroke="#e7edf4" stroke-width="1"/><text x="8" y="${yy+4}" fill="#718096" font-size="10">${dashboardAxisFormat(v,metric)}</text>`;}).join('');
    const step=expanded?1:Math.max(1,Math.ceil(labels.length/8));
    const axisLabels=labels.map((label,i)=>i%step===0?`<text x="${x(i)}" y="${H-10}" text-anchor="middle" fill="#718096" font-size="${expanded?12.1:11}" font-weight="${expanded?700:400}">${esc(label)}</text>`:'').join('');
    let marks='';
    if(type==='line'){
      const points=values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
      const fontSize=veryDense?7.7:dense?8.8:11;
      marks=`<polyline points="${points}" fill="none" stroke="#1688ec" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`+
        values.map((v,i)=>{const state=statusFlags[i]||'',arrow=state==='up'?'▲':state==='down'?'▼':'',arrowColor=state==='up'?'#169b62':'#df4053',arrowY=Math.max(top+10,y(v)-18),labelY=Math.max(top+22,Math.min(H-bottom-5,y(v)+(dense&&i%2?12:-8)));return `${arrow?`<text x="${x(i)}" y="${arrowY}" text-anchor="middle" fill="${arrowColor}" font-size="${expanded?13:11}" font-weight="900">${arrow}</text>`:''}<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="#644de8"/><text x="${x(i)}" y="${labelY}" text-anchor="middle" fill="#516174" font-size="${fontSize}" font-weight="700">${dashboardAxisFormat(v,metric)}</text>`;}).join('');
    } else {
      const unit=(W-left-right)/Math.max(1,values.length),barWidth=Math.max(5,unit*.58),fontSize=veryDense?6.2:dense?6.8:11;
      marks=values.map((v,i)=>{
        const xx=left+i*unit+unit*.21,yy=y(v),hh=Math.max(2,H-bottom-yy),cx=xx+barWidth/2;
        const state=statusFlags[i]||'';
        const tone=state==='up'?'#169b62':state==='down'?'#df4053':'#111827';
        const arrowY=Math.max(18,yy-31);
        const valueY=Math.max(34,yy-10);
        const arrow=state==='up'?`<text x="${cx}" y="${arrowY}" text-anchor="middle" fill="#169b62" font-size="${expanded?13:11}" font-weight="900">▲</text>`:state==='down'?`<text x="${cx}" y="${arrowY}" text-anchor="middle" fill="#df4053" font-size="${expanded?13:11}" font-weight="900">▼</text>`:'';
        return `${arrow}<text x="${cx}" y="${valueY}" text-anchor="middle" fill="${tone}" font-size="${fontSize}" font-weight="900">${dashboardDataFormat(v,metric)}</text><rect x="${xx}" y="${yy}" width="${barWidth}" height="${hh}" rx="5" fill="url(#g)"/>`;
      }).join('');
    }
    return `<svg class="svg-chart" viewBox="0 0 ${W} ${H}" role="img"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1688ec"/><stop offset="1" stop-color="#6550e8"/></linearGradient></defs>${grid}<line x1="${left}" y1="${H-bottom}" x2="${W-right}" y2="${H-bottom}" stroke="#dce5f0"/>${marks}${axisLabels}</svg>`;
  }
  function dashboardDualCompareSvg(rows, labels, expanded=false){
    if(!rows.length) return '<div class="empty">Sem dados no período selecionado.</div>';
    const merc=rows.map(([,d])=>num(d.general));
    const eff=rows.map(([,d])=>{const sv=num(d.warranty)+num(d.other)+num(d.mixed),el=num(d.eligible);return el?sv/el*100:0});
    const W=expanded?Math.max(1280,Math.min(2400,220+rows.length*92)):780,H=expanded?500:340,left=78,right=78,top=74,bottom=52,plotH=H-top-bottom;
    const mPos=Math.max(0,...merc),mNeg=Math.min(0,...merc),ePos=Math.max(0,...eff),eNeg=Math.min(0,...eff);
    const hasNeg=mNeg<0||eNeg<0,negFrac=hasNeg?Math.min(.42,Math.max(.20,Math.abs(mNeg)/(Math.max(1,mPos)+Math.abs(mNeg)),Math.abs(eNeg)/(Math.max(1,ePos)+Math.abs(eNeg)))):0;
    const zeroY=H-bottom-plotH*negFrac,posH=zeroY-top,negH=H-bottom-zeroY;
    const ym=v=>v>=0?zeroY-(mPos? v/mPos*posH:0):zeroY+(mNeg? Math.abs(v)/Math.abs(mNeg)*negH:0);
    const ye=v=>v>=0?zeroY-(ePos? v/ePos*posH:0):zeroY+(eNeg? Math.abs(v)/Math.abs(eNeg)*negH:0);
    const unit=(W-left-right)/Math.max(1,rows.length),groupW=expanded?Math.min(unit*.82,78):Math.min(unit*.78,50),gap=expanded?Math.max(8,groupW*.15):Math.max(3,groupW*.12),bw=(groupW-gap)/2;
    const gridPos=hasNeg?[top,(top+zeroY)/2,zeroY,(zeroY+H-bottom)/2,H-bottom]:Array.from({length:5},(_,i)=>top+(plotH*i/4));
    const grid=gridPos.map((yy,i)=>{
      const leftVal=hasNeg?(i===0?mPos:i===1?mPos/2:i===2?0:i===3?mNeg/2:mNeg):mPos*(1-i/4);
      const rightVal=hasNeg?(i===0?ePos:i===1?ePos/2:i===2?0:i===3?eNeg/2:eNeg):ePos*(1-i/4);
      return `<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" stroke="#e7edf4"/><text x="8" y="${yy+4}" fill="#718096" font-size="10">${dashboardAxisFormat(leftVal,'merc')}</text><text x="${W-right+8}" y="${yy+4}" fill="#718096" font-size="10">${Number(rightVal).toFixed(1).replace('.',',')}%</text>`;
    }).join('');
    const step=expanded?1:Math.max(1,Math.ceil(labels.length/8));
    const labs=labels.map((l,i)=>`<text class="dual-x-label ${i%step===0?'':'dual-x-compact'}" x="${left+(i+.5)*unit}" y="${H-12}" text-anchor="middle" fill="#718096" font-size="${expanded?12.1:11}" font-weight="${expanded?700:400}">${esc(l)}</text>`).join('');
    const bars=rows.map(([,d],i)=>{
      const values=[merc[i],eff[i]],maps=[ym,ye],colors=[['#1688ec','#6550e8'],['#f59e0b','#f7c55c']],cx=left+(i+.5)*unit,base=cx-groupW/2;
      return values.map((v,j)=>{
        const xx=base+j*(bw+gap),yv=maps[j](v),yy=Math.min(zeroY,yv),hh=Math.max(2,Math.abs(zeroY-yv)),labelY=v>=0?Math.max(top+12,yy-(expanded?(j===0?(i%2?22:9):(i%2?9:22)):8)):Math.min(H-bottom-4,yy+hh+(expanded?(j===0?(i%2?24:14):(i%2?14:24)):14)),tone=j===0?'#1268bd':'#b66b00',gid=`bd-${i}-${j}-${expanded?1:0}`,txt=j===0?brl.format(v):`${Number(v).toFixed(2).replace('.',',')}%`;
        return `<defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${colors[j][0]}"/><stop offset="1" stop-color="${colors[j][1]}"/></linearGradient></defs><rect x="${xx}" y="${yy}" width="${bw}" height="${hh}" rx="4" fill="url(#${gid})"/><text x="${xx+bw/2}" y="${labelY}" text-anchor="middle" fill="${tone}" font-size="${expanded?8.2:6.4}" font-weight="900" style="paint-order:stroke;stroke:#fff;stroke-width:${expanded?3:2}px;stroke-linejoin:round">${txt}</text>`;
      }).join('');
    }).join('');
    return `<div class="dual-chart-legend"><span><i class="merc"></i>Venda mercantil (R$)</span><span><i class="eff"></i>Eficiência (%)</span></div><svg class="svg-chart dual-compare-svg" viewBox="0 0 ${W} ${H}" role="img">${grid}<line x1="${left}" y1="${zeroY}" x2="${W-right}" y2="${zeroY}" stroke="#9aa9ba" stroke-width="1.4"/>${bars}${labs}</svg>`;
  }
  function dashboardMercEfficiencyTrendSvg(rows, labels, expanded=false){
    if(!rows.length) return '<div class="empty">Sem dados no período selecionado.</div>';
    const merc=rows.map(([,d])=>num(d.general)),eff=rows.map(([,d])=>{const sv=num(d.warranty)+num(d.other)+num(d.mixed),el=num(d.eligible);return el?sv/el*100:0});
    const W=expanded?Math.max(1280,Math.min(2400,220+rows.length*92)):780,H=expanded?500:340,left=72,right=72,top=78,bottom=52;
    const ml=Math.min(0,...merc),mh=Math.max(0,...merc),ms=(mh-ml)||1,mMin=ml<0?ml-ms*.12:0,mMax=mh+ms*.12,el=Math.min(0,...eff),eh=Math.max(0,...eff),es=(eh-el)||1,eMin=el<0?el-es*.12:0,eMax=eh+es*.12;
    const x=i=>left+i*((W-left-right)/Math.max(1,rows.length-1)),ym=v=>top+(mMax-v)/(mMax-mMin)*(H-top-bottom),ye=v=>top+(eMax-v)/(eMax-eMin)*(H-top-bottom);
    const ticks=5,mTicks=Array.from({length:ticks},(_,i)=>mMax-(mMax-mMin)*i/(ticks-1)),eTicks=Array.from({length:ticks},(_,i)=>eMax-(eMax-eMin)*i/(ticks-1));
    const grid=mTicks.map((v,i)=>{const yy=top+(H-top-bottom)*i/(ticks-1);return `<line x1="${left}" y1="${yy}" x2="${W-right}" y2="${yy}" stroke="#e7edf4"/><text x="8" y="${yy+4}" fill="#718096" font-size="10">${dashboardAxisFormat(v,'merc')}</text><text x="${W-right+8}" y="${yy+4}" fill="#718096" font-size="10">${Number(eTicks[i]).toFixed(1).replace('.',',')}%</text>`}).join('');
    const path=(arr,fn)=>arr.map((v,i)=>`${x(i)},${fn(v)}`).join(' '),step=expanded?1:Math.max(1,Math.ceil(labels.length/8));
    const labs=labels.map((l,i)=>`<text class="dual-x-label ${i%step===0?'':'dual-x-compact'}" x="${x(i)}" y="${H-12}" text-anchor="middle" fill="#718096" font-size="${expanded?12.1:11}">${esc(l)}</text>`).join('');
    const labelSize=expanded?8.2:6.2;
    const mp=merc.map((v,i)=>{const yy=ym(v),offset=expanded?(i%2?28:13):10,ty=yy<top+offset+4?yy+16:yy-offset;return `<circle cx="${x(i)}" cy="${yy}" r="3.5" fill="#1688ec"><title>${esc(labels[i])} • Mercantil ${brl.format(v)}</title></circle><text x="${x(i)}" y="${ty}" text-anchor="middle" fill="#1268bd" font-size="${labelSize}" font-weight="800" style="paint-order:stroke;stroke:#fff;stroke-width:${expanded?3:2}px;stroke-linejoin:round">${brl.format(v)}</text>`}).join('');
    const ep=eff.map((v,i)=>{const yy=ye(v),offset=expanded?(i%2?16:31):16,ty=yy>H-bottom-offset-4?yy-14:yy+offset;return `<circle cx="${x(i)}" cy="${yy}" r="3.5" fill="#f59e0b"><title>${esc(labels[i])} • Eficiência ${v.toFixed(2).replace('.',',')}%</title></circle><text x="${x(i)}" y="${ty}" text-anchor="middle" fill="#b66b00" font-size="${labelSize}" font-weight="800" style="paint-order:stroke;stroke:#fff;stroke-width:${expanded?3:2}px;stroke-linejoin:round">${v.toFixed(2).replace('.',',')}%</text>`}).join('');
    return `<div class="dual-chart-legend"><span><i class="merc"></i>Mercantil (R$)</span><span><i class="eff"></i>Eficiência (%)</span></div><svg class="svg-chart dual-trend-svg" viewBox="0 0 ${W} ${H}" role="img">${grid}<polyline points="${path(merc,ym)}" fill="none" stroke="#1688ec" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${path(eff,ye)}" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>${mp}${ep}${labs}</svg>`;
  }
  function dashboardMercServicesCompareSection(rows, customLabels=null){
    const multiMonth=new Set(rows.map(([k])=>String(k).slice(0,7))).size>1;
    const labels=Array.isArray(customLabels)&&customLabels.length===rows.length?customLabels:rows.map(([k])=>multiMonth?`${String(k).slice(8,10)}/${String(k).slice(5,7)}`:String(Number(String(k).slice(-2))));
    return `<section class="dashboard-section branch-theme-mercservices"><div class="dashboard-section-head"><div><h3>📊 Mercantil × Eficiência</h3><p>Comparação entre venda mercantil e eficiência no período selecionado.</p></div></div><div class="dashboard-chart-grid"><div class="dashboard-card dual-chart-card"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>Mercantil × Eficiência</h4><div class="hint">Barras lado a lado, com escalas próprias: mercantil em R$ e eficiência em %. Valores negativos descem abaixo da linha zero.</div>${dashboardDualCompareSvg(rows,labels,false)}</div><div class="dashboard-card dual-chart-card"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>Tendência: Mercantil × Eficiência</h4><div class="hint">Azul = valor mercantil; amarelo = percentual de eficiência.</div>${dashboardMercEfficiencyTrendSvg(rows,labels,false)}</div></div></section>`;
  }
  function dashboardPieLabels(parts,total){let start=0;return parts.map(part=>{const val=Math.max(0,Number(part||0)),percent=total?val/total*100:0;if(percent<7){start+=percent;return '';}const mid=(start+percent/2)*3.6-90,rad=mid*Math.PI/180,cx=50+Math.cos(rad)*27,cy=50+Math.sin(rad)*27;start+=percent;return `<span class="dashboard-pie-label" style="left:${cx}%;top:${cy}%">${percent.toFixed(0).replace('.',',')}%</span>`;}).join('');}
  function dashboardCompositionBars(parts,total){
    const items=[['Garantia',parts[0],'#668ce8'],['Presta-mista',parts[1],'#57d6c5'],['Outros',parts[2],'#f5b84f']];
    return `<div class="dashboard-composition-bars">${items.map(([label,value,color])=>{const val=Math.max(0,num(value)),percent=total?val/total*100:0;return `<div class="dashboard-composition-bar"><div class="dashboard-composition-bar-head"><span>${label}</span><strong>${percent.toFixed(1).replace('.',',')}% · ${brl.format(val)}</strong></div><div class="dashboard-composition-track"><i style="width:${Math.max(0,Math.min(100,percent))}%;background:${color}"></i></div></div>`;}).join('')}</div>`;
  }
  function sellerDashboardCompareRows(seller, period='month', compare='none') {
    if(compare==='none') return [];
    const rows=sellerDashboardPeriodRows(seller,period);
    if(!rows.length) return [];
    const historyMap=new Map(sellerProfileHistory(seller).map(entry=>[String(entry.month), entry.seller]));
    const currentMonth=String(db.month||'');
    const baseDate=new Date(`${currentMonth}-01T12:00:00`);
    if(compare==='previous' && period!=='year'){
      if(period==='bimester'){
        const prev2=new Date(baseDate.getFullYear(), baseDate.getMonth()-2, 1, 12), prev1=new Date(baseDate.getFullYear(), baseDate.getMonth()-1, 1, 12);
        const monthKeys=[`${prev2.getFullYear()}-${String(prev2.getMonth()+1).padStart(2,'0')}`,`${prev1.getFullYear()}-${String(prev1.getMonth()+1).padStart(2,'0')}`];
        return monthKeys.flatMap(monthKey=>Object.entries(historyMap.get(monthKey)?.daily||{}).filter(([,d])=>hasSellerDayValue(d)).sort(([a],[b])=>a.localeCompare(b)));
      }
      const dates=rows.map(([k])=>Number(k.slice(-2))), lo=Math.min(...dates), hi=Math.max(...dates), span=hi-lo+1;
      let plo=Math.max(1,lo-span), phi=Math.max(0,lo-1);
      if(phi<1) return [];
      return Object.entries(seller?.daily||{}).filter(([k,d])=>{const day=Number(k.slice(-2));return day>=plo&&day<=phi&&hasSellerDayValue(d)}).sort(([a],[b])=>a.localeCompare(b));
    }
    if(compare==='lastYear'){
      if(period==='bimester'){
        const targetCurrent=`${baseDate.getFullYear()-1}-${String(baseDate.getMonth()+1).padStart(2,'0')}`;
        const prevDate=new Date(baseDate.getFullYear(), baseDate.getMonth()-1, 1, 12);
        const targetPrev=`${prevDate.getFullYear()-1}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
        return [targetPrev,targetCurrent].flatMap(monthKey=>Object.entries(historyMap.get(monthKey)?.daily||{}).filter(([,d])=>hasSellerDayValue(d)).sort(([a],[b])=>a.localeCompare(b)));
      }
      const target=`${Number(String(db.month).slice(0,4))-1}-${String(db.month).slice(5,7)}`;
      const h=sellerProfileHistory(seller).find(x=>x.month===target);
      if(!h?.seller?.daily) return [];
      return Object.entries(h.seller.daily).filter(([,d])=>hasSellerDayValue(d)).sort(([a],[b])=>a.localeCompare(b)).slice(0,31);
    }
    return [];
  }
  function dashboardDayStatus(seller, key, day, metric){
    const services=num(day.warranty)+num(day.other)+num(day.mixed);
    if(metric==='conversion') return num(day.nfs)>0 ? (num(day.warrantyQty)/num(day.nfs)>=.35?'up':'down') : '';
    if(metric==='efficiency') return num(day.eligible)>0 ? (services/num(day.eligible)>=.07?'up':'down') : '';
    if(metric!=='merc'&&metric!=='services') return '';
    if(seller){
      const mission=sellerMissionMetrics(seller,key);
      if(!mission?.percent) return '';
      const target=metric==='merc'?num(mission.mercantileGoal):num(mission.serviceGoal);
      const actual=metric==='merc'?num(day.general):services;
      return actual>=target?'up':'down';
    }
    const mission=dailyGoalMetrics(key);
    if(!mission?.percent) return '';
    const target=metric==='merc'?num(mission.branchGoal):num(mission.serviceGoal);
    const actual=metric==='merc'?num(day.general):services;
    return actual>=target?'up':'down';
  }
  function dashboardSection(seller, rows, metric, title, subtitle, compareRows=[]){
    const vals=rows.map(([,d])=>dashboardMetricValue(d,metric)), multiMonth=new Set(rows.map(([k])=>String(k).slice(0,7))).size>1, labels=rows.map(([k])=>multiMonth?`${String(k).slice(8,10)}/${String(k).slice(5,7)}`:String(Number(k.slice(-2)))), statusFlags=rows.map(([k,d])=>dashboardDayStatus(seller,k,d,metric)), agg=sellerDashboardAggregateRows(rows);
    const total=metric==='services'?agg.services:metric==='conversion'?(agg.nfs?agg.warrantyQty/agg.nfs*100:0):metric==='efficiency'?(agg.eligible?agg.services/agg.eligible*100:0):metric==='ticket'?(agg.invoiceCount?agg.general/agg.invoiceCount:0):metric==='invoice'?agg.invoiceCount:metric==='gain'?rows.reduce((a,[,d])=>a+dashboardMetricValue(d,'gain'),0):agg.general;
    const cagg=sellerDashboardAggregateRows(compareRows), ctotal=!compareRows.length?0:metric==='services'?cagg.services:metric==='conversion'?(cagg.nfs?cagg.warrantyQty/cagg.nfs*100:0):metric==='efficiency'?(cagg.eligible?cagg.services/cagg.eligible*100:0):metric==='ticket'?(cagg.invoiceCount?cagg.general/cagg.invoiceCount:0):metric==='invoice'?cagg.invoiceCount:metric==='gain'?compareRows.reduce((a,[,d])=>a+dashboardMetricValue(d,'gain'),0):cagg.general;
    const nz=vals.filter(v=>v>0), best=nz.length?Math.max(...nz):0, worst=nz.length?Math.min(...nz):0, half=Math.max(1,Math.floor(vals.length/2)), fa=vals.slice(0,half), qa=vals.slice(half), f=fa.length?fa.reduce((a,b)=>a+b,0)/fa.length:0, q=qa.length?qa.reduce((a,b)=>a+b,0)/qa.length:0, trend=f?(q-f)/f:0, delta=ctotal?(total-ctotal)/ctotal:0;
    const invoiceDays = agg.days || rows.length || 0, invoiceAverage = metric==='invoice' && invoiceDays ? agg.invoiceCount / invoiceDays : 0, invoicePerSeller = metric==='invoice' && !seller ? (configuredSellerCount() ? agg.invoiceCount / configuredSellerCount() : 0) : 0;
    const invoiceKpis = metric==='invoice' ? `<div class="dashboard-kpi"><span>Média / dia</span><strong>${dashboardFormat(invoiceAverage,'invoice')}</strong><small>${invoiceDays} dia(s) considerado(s)</small></div>${!seller?`<div class="dashboard-kpi"><span>Por vendedor</span><strong>${dashboardFormat(invoicePerSeller,'invoice')}</strong><small>${configuredSellerCount()||0} vendedor(es)</small></div>`:''}` : '';
    const multiLabel=multiMonth?'período':'dia', chartHint=multiMonth?'Somente períodos com lançamento.':(labels.length>31?'Período consolidado com múltiplos dias.':'Somente dias com lançamento. Até 31 barras no mês.');
    return `<section class="dashboard-section" id="seller-dash-${metric}"><div class="dashboard-section-head"><div><h3>${title}</h3><p>${subtitle}</p></div><span class="dashboard-section-total">${dashboardFormat(total,metric)}</span></div><div class="dashboard-kpis"><div class="dashboard-kpi"><span>Resultado</span><strong>${dashboardFormat(total,metric)}</strong></div>${invoiceKpis}<div class="dashboard-kpi"><span>Melhor dia</span><strong>${dashboardFormat(best,metric)}</strong></div><div class="dashboard-kpi"><span>Menor dia</span><strong>${dashboardFormat(worst,metric)}</strong></div><div class="dashboard-kpi"><span>Tendência</span><strong class="${trend>.02?'trend-up':trend<-.02?'trend-down':'trend-flat'}">${trend>.02?'▲ Ascendente':trend<-.02?'▼ Descendente':'→ Estável'}</strong></div>${compareRows.length?`<div class="dashboard-kpi"><span>Comparativo</span><strong class="${delta>0?'trend-up':delta<0?'trend-down':'trend-flat'}">${(delta>=0?'▲ ':'▼ ')+Math.abs(delta*100).toFixed(1).replace('.',',')}%</strong><small>${dashboardFormat(ctotal,metric)} no período comparado</small></div>`:''}</div><div class="dashboard-chart-grid"><div class="dashboard-card" data-chart-values="${vals.join(',')}" data-chart-labels="${labels.join(',')}" data-chart-status="${statusFlags.join(',')}" data-chart-metric="${metric}" data-chart-type="bar"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>${title} por ${multiLabel}</h4><div class="hint">${chartHint}</div>${dashboardSvg(vals,labels,metric,'bar',false,statusFlags)}</div><div class="dashboard-card" data-chart-values="${vals.join(',')}" data-chart-labels="${labels.join(',')}" data-chart-status="${statusFlags.join(',')}" data-chart-metric="${metric}" data-chart-type="line"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>Tendência</h4><div class="hint">Evolução do indicador ao longo do período selecionado.</div>${dashboardSvg(vals,labels,metric,'line',false,statusFlags)}</div></div></section>`;
  }
  function dashboardPrint(title, html){
    const win=window.open('','_blank'); if(!win){alert('Permita pop-ups para gerar o relatório.');return;}
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17324d;margin:0}h1{font-size:22px;margin:0 0 12px}.dashboard-controls,.dashboard-report-actions{display:none!important}.seller-dashboard-shell,.team-dashboard-modal-content{border:0!important;padding:0!important;background:#fff!important}.dashboard-section{break-inside:avoid;margin:0 0 12px;padding:10px;border:1px solid #dce5f0;border-radius:12px}.dashboard-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dashboard-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.dashboard-kpi,.dashboard-card{border:1px solid #e1e7ef;border-radius:10px;padding:8px}.dashboard-pie-wrap{display:grid;grid-template-columns:130px 1fr;gap:10px}.dashboard-pie{width:120px;height:120px;border-radius:50%}.svg-chart{width:100%}button,select{display:none!important}</style></head><body><h1>${esc(title)}</h1>${html}</body></html>`);win.document.close();win.focus();setTimeout(()=>win.print(),250);
  }
  function sellerDashboardMarkup(seller, period='month', compare='none') {
    if(period==='year'){
      const history=sellerProfileHistory(seller).slice().sort((a,b)=>a.month.localeCompare(b.month)), year=Number(String(db.month).slice(0,4)), prevYear=year-1;
      const current=history.filter(h=>Number(h.month.slice(0,4))===year), previous=history.filter(h=>Number(h.month.slice(0,4))===prevYear), monthNames=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      const series=(metric,set)=>monthNames.map((_,i)=>{const h=set.find(x=>Number(x.month.slice(5,7))===i+1);if(!h)return 0; if(metric==='services')return h.services;if(metric==='gain')return h.financial.total;if(metric==='conversion'){const a=h.seller.daily?sellerDailyAggregate(h.seller):null;return a?.nfs?a.conversion*100:0}if(metric==='efficiency'){const a=h.seller.daily?sellerDailyAggregate(h.seller):null;return a?.eligible?a.efficiency*100:0}if(metric==='ticket'){const a=h.seller.daily?sellerDailyAggregate(h.seller):null;return a?.invoiceCount?a.general/a.invoiceCount:0}if(metric==='invoice'){const a=h.seller.daily?sellerDailyAggregate(h.seller):null;return a?.invoiceCount||0}return num(h.seller.general)+num(h.seller.ecommerce)});
      const metrics=[['merc','💰 Mercantil'],['services','🛡️ Serviços'],['conversion','🎯 Conversão'],['efficiency','⚡ Eficiência'],['ticket','🧾 Ticket médio'],['invoice','📄 Notas fiscais'],['gain','💵 Ganhos']];
      return `<div class="seller-dashboard-shell"><div class="dashboard-controls"><div><label>Período</label><select data-dash-period><option value="week">Semana</option><option value="fortnight">15 dias</option><option value="bimester">Bimestre</option><option value="month">Mês</option><option value="year" selected>Ano</option></select></div><div><label>Comparação</label><select data-dash-compare><option value="none" ${compare==='none'?'selected':''}>Somente ${year}</option><option value="lastYear" ${compare==='lastYear'?'selected':''}>${year} × ${prevYear}</option></select></div><div class="dashboard-report-actions"><label>Relatório</label><button class="btn primary" type="button" data-dash-print>🧾 Baixar / imprimir A4</button></div></div>${metrics.map(([m,t])=>{const v=series(m,current),pv=series(m,previous),ct=v.reduce((a,b)=>a+b,0),pt=pv.reduce((a,b)=>a+b,0),delta=pt?(ct-pt)/pt:0;return `<section class="dashboard-section" id="seller-dash-${m}"><div class="dashboard-section-head"><div><h3>${t}</h3><p>${year}${compare==='lastYear'?` comparado com ${prevYear}`:''}</p></div><span class="dashboard-section-total">${dashboardFormat(ct,m)}</span></div><div class="dashboard-kpis"><div class="dashboard-kpi"><span>${year}</span><strong>${dashboardFormat(ct,m)}</strong></div><div class="dashboard-kpi"><span>${prevYear}</span><strong>${compare==='lastYear'?dashboardFormat(pt,m):'—'}</strong></div><div class="dashboard-kpi"><span>Evolução</span><strong class="${delta>0?'trend-up':delta<0?'trend-down':'trend-flat'}">${compare==='lastYear'&&pt?(delta>=0?'▲ ':'▼ ')+Math.abs(delta*100).toFixed(1).replace('.',',')+'%':'—'}</strong></div></div><div class="dashboard-card" data-chart-values="${v.join(',')}" data-chart-labels="${monthNames.join(',')}" data-chart-metric="${m}" data-chart-type="bar"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>Mês a mês</h4>${dashboardSvg(v,monthNames,m,'bar')}${compare==='lastYear'?`<div class="dashboard-year-note">Ano anterior disponível para comparação: ${pt?dashboardFormat(pt,m):'sem dados'}.</div>`:''}</div></section>`}).join('')}</div>`;
    }
    const rows=sellerDashboardPeriodRows(seller,period).filter(([,d])=>hasSellerDayValue(d)).slice(0,31), compareRows=sellerDashboardCompareRows(seller,period,compare), agg=sellerDashboardAggregateRows(rows), w=num(agg.warranty),m=num(agg.mixed),o=num(agg.other),mix=w+m+o||1,pie=`conic-gradient(#668ce8 0 ${w/mix*100}%,#57d6c5 ${w/mix*100}% ${(w+m)/mix*100}%,#f5b84f ${(w+m)/mix*100}% 100%)`;
    const label=period==='week'?'Semana':period==='fortnight'?'15 dias':period==='bimester'?'Bimestre':'Mês';
    return `<div class="seller-dashboard-shell"><div class="dashboard-controls"><div><label>Período</label><select data-dash-period><option value="week" ${period==='week'?'selected':''}>Semana</option><option value="fortnight" ${period==='fortnight'?'selected':''}>15 dias</option><option value="bimester" ${period==='bimester'?'selected':''}>Bimestre</option><option value="month" ${period==='month'?'selected':''}>Mês</option><option value="year">Ano</option></select></div><div><label>Comparação</label><select data-dash-compare><option value="none" ${compare==='none'?'selected':''}>Somente atual</option><option value="previous" ${compare==='previous'?'selected':''}>Atual × período anterior</option><option value="lastYear" ${compare==='lastYear'?'selected':''}>Atual × mesmo período ano anterior</option></select></div><div class="dashboard-report-actions"><label>Relatório</label><button class="btn primary" type="button" data-dash-print>🧾 Baixar / imprimir A4</button></div></div><div class="dashboard-overview-note">📅 ${label} • ${rows.length} dia(s) com lançamento • filtros aplicados a todos os gráficos abaixo</div>${dashboardSection(seller,rows,'merc','💰 Venda mercantil','Volume vendido e comportamento diário.',compareRows)}${dashboardSection(seller,rows,'services','🛡️ Serviços','Garantias, presta-mista e outros serviços.',compareRows)}<section class="dashboard-section"><div class="dashboard-section-head"><div><h3>🧩 Composição dos serviços</h3><p>Participação de cada tipo de serviço no período.</p></div><span class="dashboard-section-total">${brl.format(agg.services)}</span></div><div class="dashboard-pie-wrap dashboard-service-composition"><div class="dashboard-pie" style="background:${pie}">${dashboardPieLabels([w,m,o],mix)}</div>${dashboardCompositionBars([w,m,o],mix)}</div></section>${dashboardMercServicesCompareSection(rows)}${dashboardSection(seller,rows,'conversion','🎯 Conversão','Garantias vendidas ÷ quantidade elegível. Meta 35%.',compareRows)}${dashboardSection(seller,rows,'efficiency','⚡ Eficiência','Serviços ÷ venda elegível. Meta 7%.',compareRows)}${dashboardSection(seller,rows,'ticket','🧾 Ticket médio','Venda mercantil ÷ notas fiscais.',compareRows)}${dashboardSection(seller,rows,'invoice','📄 Notas fiscais','Total de notas fiscais e média diária do vendedor.',compareRows)}${dashboardSection(seller,rows,'gain','💵 Ganhos','Comissões em R$ informadas nos lançamentos.',compareRows)}</div>`;
  }
  function mountSellerDashboard(seller, root){ if(!root)return; let period=root.dataset.period||'month',compare=root.dataset.compare||'none'; const draw=()=>{root.innerHTML=sellerDashboardMarkup(seller,period,compare); const p=root.querySelector('[data-dash-period]'),c=root.querySelector('[data-dash-compare]'),print=root.querySelector('[data-dash-print]'); if(p)p.onchange=()=>{period=p.value;root.dataset.period=period;draw()};if(c)c.onchange=()=>{compare=c.value;root.dataset.compare=compare;draw()};if(print)print.onclick=()=>dashboardPrint(`${seller.name||'Vendedor'} — Dashboard`,root.innerHTML);};draw(); }
  function ensureTeamDashboardModal(){let layer=document.getElementById('teamDashboardLayer');if(layer)return layer;layer=document.createElement('section');layer.id='teamDashboardLayer';layer.className='team-dashboard-layer';layer.setAttribute('aria-hidden','true');layer.innerHTML=`<div class="team-dashboard-modal"><header><div><small>GESTÃO DE RESULTADOS</small><h2>📊 Dashboard da equipe</h2><p>Visão consolidada e comparativa de todos os vendedores.</p></div><button class="btn" type="button" data-team-close>✕ Fechar</button></header><div class="team-dashboard-modal-content" id="teamDashboardModalContent"></div></div>`;document.body.appendChild(layer);layer.querySelector('[data-team-close]').onclick=closeTeamDashboard;layer.addEventListener('click',e=>{if(e.target===layer)closeTeamDashboard()});return layer;}
  function closeTeamDashboard(){const l=document.getElementById('teamDashboardLayer');if(!l)return;l.classList.remove('open');l.setAttribute('aria-hidden','true');document.body.style.overflow='';}
  function renderTeamMetric(period, metric){const items=db.sellers.map((seller,index)=>{const rows=sellerDashboardPeriodRows(seller,period).filter(([,d])=>hasSellerDayValue(d)),a=sellerDashboardAggregateRows(rows),value=metric==='services'?a.services:metric==='conversion'?(a.nfs?a.conversion*100:0):metric==='efficiency'?(a.eligible?a.efficiency*100:0):metric==='ticket'?(a.invoiceCount?a.general/a.invoiceCount:0):metric==='invoice'?a.invoiceCount:metric==='gain'?rows.reduce((z,[,d])=>z+dashboardMetricValue(d,'gain'),0):a.general+(period==='month'?num(seller.ecommerce):0);return{name:seller.name||`Vendedor ${index+1}`,value}}).sort((a,b)=>b.value-a.value);const max=Math.max(...items.map(x=>x.value),1);return `<section class="team-metric-section"><div class="dashboard-section-head"><div><h3>${dashboardLabel(metric)}</h3><p>Comparativo entre vendedores no período selecionado.</p></div></div><div class="team-seller-bars">${items.map((r,i)=>`<div class="team-seller-bar"><span class="rank">${i+1}</span><b>${esc(r.name)}</b><div class="team-track"><i style="width:${Math.max(2,r.value/max*100)}%"></i></div><strong>${dashboardFormat(r.value,metric)}</strong></div>`).join('')||'<div class="empty">Sem vendedores cadastrados.</div>'}</div></section>`;}
  function renderTeamDashboard(){const layer=ensureTeamDashboardModal(),host=layer.querySelector('#teamDashboardModalContent');if(!layer.classList.contains('open'))return;const period=host.dataset.period||'month',compare=host.dataset.compare||'none';const metrics=['merc','services','conversion','efficiency','ticket','invoice','gain'];host.innerHTML=`<div class="dashboard-controls"><div><label>Período</label><select id="teamDashPeriod"><option value="week" ${period==='week'?'selected':''}>Semana</option><option value="fortnight" ${period==='fortnight'?'selected':''}>15 dias</option><option value="month" ${period==='month'?'selected':''}>Mês</option></select></div><div><label>Comparação</label><select id="teamDashCompare"><option value="none" ${compare==='none'?'selected':''}>Somente atual</option><option value="previous" ${compare==='previous'?'selected':''}>Atual × período anterior</option></select></div><div class="dashboard-report-actions"><label>Relatório</label><button class="btn primary" id="teamDashPrint" type="button">🧾 Baixar / imprimir A4</button></div></div><div class="team-dashboard-summary"><div><span>Vendedores</span><strong>${db.sellers.length}</strong></div><div><span>Atualizados hoje</span><strong>${db.sellers.filter(s=>sellerDailyStatus(s).cls!=='bad').length}</strong></div><div><span>Pendentes</span><strong>${db.sellers.filter(s=>sellerDailyStatus(s).cls==='bad').length}</strong></div></div>${metrics.map(m=>renderTeamMetric(period,m)).join('')}`;host.querySelector('#teamDashPeriod').onchange=e=>{host.dataset.period=e.target.value;renderTeamDashboard()};host.querySelector('#teamDashCompare').onchange=e=>{host.dataset.compare=e.target.value;renderTeamDashboard()};host.querySelector('#teamDashPrint').onclick=()=>dashboardPrint('Dashboard da equipe',host.innerHTML);}
  function openTeamDashboard(){const layer=ensureTeamDashboardModal();layer.classList.add('open');layer.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';renderTeamDashboard();}

  function branchDashboardHasVisibleDay(day) {
    if (!day || ['off','medical','justified'].includes(day.status)) return false;
    const hasValues = ['general','eligible','warranty','other','mixed','invoiceCount','nfs','warrantyQty'].some((field) => num(day[field]) > 0);
    // Dia visível = houve resultado real OU o gestor registrou/finalizou o expediente,
    // inclusive quando a loja abriu e o resultado terminou em zero. Dias apenas
    // existentes no calendário, sem lançamento e sem finalização, ficam fora.
    const explicitlyWorked = day.status === 'done' || day.status === 'partial' || day.dashboardWorkedExplicit === true;
    return hasValues || explicitlyWorked;
  }
  function branchDashboardCustomRows(start, end) {
    if (!start || !end) return [];
    let a = new Date(start + 'T12:00:00'), b = new Date(end + 'T12:00:00');
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return [];
    if (a > b) [a, b] = [b, a];
    const targetBranch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    const records = Object.values(vault.records || {}).filter((item) => item && String(item.branch || '').trim().toLocaleUpperCase('pt-BR') === targetBranch);
    const byMonth = new Map(records.map((item) => [String(item.month), item]));
    if (db?.month) byMonth.set(String(db.month), db);
    const rows = [];
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`, record = byMonth.get(`${y}-${m}`), data = record?.daily?.[key];
      if (branchDashboardHasVisibleDay(data)) rows.push([key, data]);
    }
    return rows;
  }
  function branchDashboardRows(period='month') {
    const all = Object.entries(db.daily || {}).filter(([, day]) => branchDashboardHasVisibleDay(day)).sort(([a],[b]) => a.localeCompare(b));
    if (period === 'month') return all;
    const [yy, mm] = String(db.month || '').split('-').map(Number);
    const last = new Date(yy, mm, 0).getDate();
    let anchorDay = (yy === today.getFullYear() && mm === today.getMonth() + 1) ? today.getDate() : last;
    if (period === 'week') {
      const d = new Date(yy, mm - 1, anchorDay), dow = (d.getDay() + 6) % 7, start = Math.max(1, anchorDay - dow), end = Math.min(last, start + 6);
      return all.filter(([key]) => { const day = Number(key.slice(-2)); return day >= start && day <= end; });
    }
    if (period === 'fortnight') {
      const start = anchorDay <= 15 ? 1 : 16, end = anchorDay <= 15 ? 15 : last;
      return all.filter(([key]) => { const day = Number(key.slice(-2)); return day >= start && day <= end; });
    }
    if (period === 'bimester') {
      const targetBranch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
      const currentDate = new Date(`${db.month}-01T12:00:00`);
      const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1, 12);
      const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
      const prevRecord = Object.values(vault.records || {}).find((item) => item && item.month === prevKey && String(item.branch || '').trim().toLocaleUpperCase('pt-BR') === targetBranch);
      return [prevRecord?.daily || {}, db.daily || {}].flatMap(bucket => Object.entries(bucket).filter(([, day]) => branchDashboardHasVisibleDay(day)).sort(([a],[b]) => a.localeCompare(b)));
    }
    return all;
  }
  function branchDashboardCompareRows(period='month', compare='none') {
    const rows = branchDashboardRows(period);
    if (!rows.length || compare === 'none') return [];
    const targetBranch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    const baseDate = new Date(`${db.month}-01T12:00:00`);
    const findRecordByMonth = (monthKey) => Object.values(vault.records || {}).find((item) => item && item.month === monthKey && String(item.branch || '').trim().toLocaleUpperCase('pt-BR') === targetBranch);
    if (compare === 'previous' && period !== 'year') {
      if (period === 'bimester') {
        const prev2 = new Date(baseDate.getFullYear(), baseDate.getMonth()-2, 1, 12), prev1 = new Date(baseDate.getFullYear(), baseDate.getMonth()-1, 1, 12);
        const monthKeys = [`${prev2.getFullYear()}-${String(prev2.getMonth()+1).padStart(2,'0')}`,`${prev1.getFullYear()}-${String(prev1.getMonth()+1).padStart(2,'0')}`];
        return monthKeys.flatMap(monthKey => Object.entries(findRecordByMonth(monthKey)?.daily || {}).filter(([, day]) => branchDashboardHasVisibleDay(day)).sort(([a],[b]) => a.localeCompare(b)));
      }
      const dates = rows.map(([key]) => Number(key.slice(-2))), lo = Math.min(...dates), hi = Math.max(...dates), span = hi - lo + 1;
      const prevStart = Math.max(1, lo - span), prevEnd = Math.max(0, lo - 1);
      if (prevEnd < 1) return [];
      return Object.entries(db.daily || {}).filter(([key, day]) => {
        const numDay = Number(key.slice(-2));
        return numDay >= prevStart && numDay <= prevEnd && branchDashboardHasVisibleDay(day);
      }).sort(([a],[b]) => a.localeCompare(b));
    }
    if (compare === 'lastYear') {
      if (period === 'bimester') {
        const prevMonth = new Date(baseDate.getFullYear(), baseDate.getMonth()-1, 1, 12);
        const targets = [`${prevMonth.getFullYear()-1}-${String(prevMonth.getMonth()+1).padStart(2,'0')}`,`${baseDate.getFullYear()-1}-${String(baseDate.getMonth()+1).padStart(2,'0')}`];
        return targets.flatMap(monthKey => Object.entries(findRecordByMonth(monthKey)?.daily || {}).filter(([, day]) => branchDashboardHasVisibleDay(day)).sort(([a],[b]) => a.localeCompare(b)));
      }
      const targetMonth = `${Number(String(db.month).slice(0, 4)) - 1}-${String(db.month).slice(5, 7)}`;
      const record = findRecordByMonth(targetMonth);
      if (!record?.daily) return [];
      return Object.entries(record.daily).filter(([, day]) => branchDashboardHasVisibleDay(day)).sort(([a],[b]) => a.localeCompare(b)).slice(0, 31);
    }
    return [];
  }
  function branchDashboardYearSeries(metric, year) {
    const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    const targetBranch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    return months.map((monthKey) => {
      const record = monthKey === db.month ? db : Object.values(vault.records || {}).find((item) => item && item.month === monthKey && String(item.branch || '').trim().toLocaleUpperCase('pt-BR') === targetBranch);
      if (!record) return 0;
      const a = aggregate(Object.values(record.daily || {}));
      const services = a.warranty + a.other + a.mixed;
      if (metric === 'services') return services;
      if (metric === 'conversion') return a.nfs ? a.warrantyQty / a.nfs * 100 : 0;
      if (metric === 'efficiency') return a.eligible ? services / a.eligible * 100 : 0;
      if (metric === 'ticket') return a.invoiceCount ? a.general / a.invoiceCount : 0;
      if (metric === 'invoice') return a.invoiceCount;
      return a.general + num(record.ecommerce);
    });
  }

  function branchDashboardYearMercEfficiencyRows(year){
    const targetBranch=String(db.branch||'').trim().toLocaleUpperCase('pt-BR');
    return Array.from({length:12},(_,i)=>{
      const monthKey=`${year}-${String(i+1).padStart(2,'0')}`;
      const record=monthKey===db.month?db:Object.values(vault.records||{}).find(item=>item&&item.month===monthKey&&String(item.branch||'').trim().toLocaleUpperCase('pt-BR')===targetBranch);
      if(!record)return [`${monthKey}-01`,{general:0,warranty:0,other:0,mixed:0,eligible:0}];
      const a=aggregate(Object.values(record.daily||{}));
      return [`${monthKey}-01`,{general:num(a.general)+num(record.ecommerce),warranty:num(a.warranty),other:num(a.other),mixed:num(a.mixed),eligible:num(a.eligible)}];
    });
  }

  function branchDashboardMarkup(period='month', compare='none') {
    const metrics = [['merc','💰 Venda mercantil'], ['services','🛡️ Serviços'], ['conversion','🎯 Conversão'], ['efficiency','⚡ Eficiência'], ['ticket','🧾 Ticket médio'], ['invoice','📄 Notas fiscais']];
    if (period === 'year') {
      const year = Number(String(db.month).slice(0, 4)), previousYear = year - 1, monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      return `<div class="seller-dashboard-shell"><div class="dashboard-controls"><div><label>Período</label><select data-branch-dash-period><option value="week">Semana</option><option value="fortnight">15 dias</option><option value="bimester">Bimestre</option><option value="month">Mês</option><option value="year" selected>Ano</option></select></div><div><label>Comparação</label><select data-branch-dash-compare><option value="none" ${compare==='none'?'selected':''}>Somente ${year}</option><option value="lastYear" ${compare==='lastYear'?'selected':''}>${year} × ${previousYear}</option></select></div><div class="dashboard-report-actions"><label>Relatório</label><button class="btn primary" type="button" data-branch-dash-print>🧾 Baixar / imprimir A4</button></div></div>${metrics.map(([metric, title]) => { const vals = branchDashboardYearSeries(metric, year), prevVals = branchDashboardYearSeries(metric, previousYear), currentTotal = vals.reduce((sum, value) => sum + value, 0), previousTotal = prevVals.reduce((sum, value) => sum + value, 0), delta = previousTotal ? (currentTotal - previousTotal) / previousTotal : 0; return `<section class="dashboard-section branch-theme-${metric}"><div class="dashboard-section-head"><div><h3>${title}</h3><p>${year}${compare === 'lastYear' ? ` comparado com ${previousYear}` : ''}.</p></div><span class="dashboard-section-total">${dashboardFormat(currentTotal, metric)}</span></div><div class="dashboard-kpis"><div class="dashboard-kpi"><span>${year}</span><strong>${dashboardFormat(currentTotal, metric)}</strong></div><div class="dashboard-kpi"><span>${previousYear}</span><strong>${compare === 'lastYear' ? dashboardFormat(previousTotal, metric) : '—'}</strong></div><div class="dashboard-kpi"><span>Evolução</span><strong class="${delta > 0 ? 'trend-up' : delta < 0 ? 'trend-down' : 'trend-flat'}">${compare === 'lastYear' && previousTotal ? (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta * 100).toFixed(1).replace('.', ',') + '%' : '—'}</strong></div></div><div class="dashboard-card" data-chart-values="${vals.join(',')}" data-chart-labels="${monthNames.join(',')}" data-chart-metric="${metric}" data-chart-type="bar"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>Mês a mês</h4>${dashboardSvg(vals, monthNames, metric, 'bar')}${compare === 'lastYear' ? `<div class="dashboard-year-note">Ano anterior disponível para comparação: ${previousTotal ? dashboardFormat(previousTotal, metric) : 'sem dados'}.</div>` : ''}</div></section>`; }).join('')}${dashboardMercServicesCompareSection(branchDashboardYearMercEfficiencyRows(year),monthNames)}</div>`;
    }
    const customStart = arguments[2] || '', customEnd = arguments[3] || '';
    const rows = period === 'custom' ? branchDashboardCustomRows(customStart, customEnd) : branchDashboardRows(period).slice(0, 31), compareRows = period === 'custom' ? [] : branchDashboardCompareRows(period, compare), agg = sellerDashboardAggregateRows(rows), w = num(agg.warranty), m = num(agg.mixed), o = num(agg.other), mix = w + m + o || 1, pie = `conic-gradient(#668ce8 0 ${w / mix * 100}%,#57d6c5 ${w / mix * 100}% ${(w + m) / mix * 100}%,#f5b84f ${(w + m) / mix * 100}% 100%)`, label = period === 'week' ? 'Semana' : period === 'fortnight' ? '15 dias' : period === 'bimester' ? 'Bimestre' : period === 'custom' ? 'Personalizado' : 'Mês';
    const customRange = period === 'custom' ? `<div class="branch-custom-range"><div><label>Data inicial</label><input type="date" data-branch-range-start value="${customStart}"></div><div><label>Data final</label><input type="date" data-branch-range-end value="${customEnd}"></div><button class="btn soft" type="button" data-branch-range-apply>Aplicar período</button><small>Escolha o intervalo desejado. O filtro é aplicado a todos os indicadores e gráficos da filial.</small></div>` : '';
    const customLabel = period === 'custom' && customStart && customEnd ? ` • ${new Date(customStart + 'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(customEnd + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';
    return `<div class="seller-dashboard-shell"><div class="dashboard-controls"><div><label>Período</label><select data-branch-dash-period><option value="week" ${period==='week'?'selected':''}>Semana</option><option value="fortnight" ${period==='fortnight'?'selected':''}>15 dias</option><option value="bimester" ${period==='bimester'?'selected':''}>Bimestre</option><option value="month" ${period==='month'?'selected':''}>Mês</option><option value="year">Ano</option><option value="custom" ${period==='custom'?'selected':''}>Personalizado</option></select></div><div><label>Comparação</label><select data-branch-dash-compare ${period==='custom'?'disabled':''}><option value="none" ${compare==='none'?'selected':''}>Somente atual</option><option value="previous" ${compare==='previous'?'selected':''}>Atual × período anterior</option><option value="lastYear" ${compare==='lastYear'?'selected':''}>Atual × mesmo período ano anterior</option></select></div><div class="dashboard-report-actions"><label>Relatório</label><button class="btn primary" type="button" data-branch-dash-print>🧾 Baixar / imprimir A4</button></div></div>${customRange}<div class="dashboard-overview-note">📅 ${label}${customLabel} • ${rows.length} dia(s) trabalhado(s) • visão do gestor consolidada na filial</div>${dashboardSection(null, rows, 'merc', '💰 Venda mercantil', 'Volume vendido e comportamento diário da filial.', compareRows)}${dashboardSection(null, rows, 'services', '🛡️ Serviços', 'Garantias, presta-mista e outros serviços da filial.', compareRows)}<section class="dashboard-section branch-theme-services"><div class="dashboard-section-head"><div><h3>🧩 Composição dos serviços</h3><p>Participação de cada tipo de serviço no período.</p></div><span class="dashboard-section-total">${brl.format(agg.services)}</span></div><div class="dashboard-pie-wrap dashboard-service-composition"><div class="dashboard-pie" style="background:${pie}">${dashboardPieLabels([w,m,o],mix)}</div>${dashboardCompositionBars([w,m,o],mix)}</div></section>${dashboardMercServicesCompareSection(rows)}${dashboardSection(null, rows, 'conversion', '🎯 Conversão', 'Garantias vendidas ÷ quantidade elegível. Meta 35%.', compareRows)}${dashboardSection(null, rows, 'efficiency', '⚡ Eficiência', 'Serviços ÷ venda elegível. Meta 7%.', compareRows)}${dashboardSection(null, rows, 'ticket', '🧾 Ticket médio', 'Venda mercantil ÷ notas fiscais.', compareRows)}${dashboardSection(null, rows, 'invoice', '📄 Notas fiscais', 'Total de notas fiscais, média diária e referência por vendedor.', compareRows)}</div>`;
  }
  function mountBranchDashboard(root) {
    if (!root) return;
    let period = root.dataset.period || 'month', compare = root.dataset.compare || 'none';
    let customStart = root.dataset.customStart || '', customEnd = root.dataset.customEnd || '';
    const ensureDefaultRange = () => {
      if (customStart && customEnd) return;
      const base = String(db.month || '');
      if (!/^\d{4}-\d{2}$/.test(base)) return;
      const [yy, mm] = base.split('-').map(Number), last = new Date(yy, mm, 0).getDate();
      customStart = customStart || `${base}-01`;
      customEnd = customEnd || `${base}-${String(last).padStart(2, '0')}`;
    };
    const draw = () => {
      if (period === 'custom') ensureDefaultRange();
      root.innerHTML = branchDashboardMarkup(period, compare, customStart, customEnd);
      const p = root.querySelector('[data-branch-dash-period]'), c = root.querySelector('[data-branch-dash-compare]'), print = root.querySelector('[data-branch-dash-print]');
      const startInput = root.querySelector('[data-branch-range-start]'), endInput = root.querySelector('[data-branch-range-end]'), apply = root.querySelector('[data-branch-range-apply]');
      if (p) p.onchange = () => { period = p.value; if (period === 'custom') { compare = 'none'; ensureDefaultRange(); } root.dataset.period = period; draw(); };
      if (c) c.onchange = () => { compare = c.value; root.dataset.compare = compare; draw(); };
      if (apply) apply.onclick = () => {
        const a = startInput?.value, b = endInput?.value;
        if (!a || !b) { alert('Selecione a data inicial e a data final.'); return; }
        customStart = a; customEnd = b;
        if (new Date(customStart + 'T12:00:00') > new Date(customEnd + 'T12:00:00')) [customStart, customEnd] = [customEnd, customStart];
        root.dataset.customStart = customStart; root.dataset.customEnd = customEnd;
        compare = 'none'; root.dataset.compare = compare;
        draw();
      };
      if (print) print.onclick = () => dashboardPrint(`Dashboard da filial — ${db.branch || 'Filial'}`, root.innerHTML);
    };
    draw();
  }
  function renderBranchDashboard() {
    const root = document.getElementById('branchDashboardRoot');
    if (!root) return;
    try {
      mountBranchDashboard(root);
    } catch (error) {
      console.error('Falha ao renderizar dashboard da filial:', error);
      root.innerHTML = '<div class="empty">O dashboard consolidado da filial está temporariamente indisponível. As demais áreas continuam acessíveis.</div>';
    }
  }
  
  function renderSellerWorkspace(seller) {
    const host=document.getElementById('sellerWorkspace'); if(!host)return;
    if(!seller){ host.innerHTML='<div class="empty">Vendedor não encontrado nesta competência.</div>'; return; }
    let total={general:0,eligible:0,invoiceCount:0,nfs:0,warranty:0,warrantyQty:0,other:0,mixed:0,days:0,services:0,efficiency:0,conversion:0};
    let metrics={plannedDays:num(db.businessDays)||0};
    let history=[];
    try{ total=sellerDailyAggregate(seller); }catch(e){ console.error('Falha no agregado diário do vendedor:',e); }
    try{ metrics=sellerMetrics(seller); }catch(e){ console.error('Falha nas métricas do vendedor:',e); }
    try{ history=sellerProfileHistory(seller); }catch(e){ console.error('Falha no histórico do vendedor:',e); history=[]; }
    const [workspaceYear,workspaceMonth]=String(db.month||'').split('-').map(Number), workspaceLastDay=new Date(workspaceYear,workspaceMonth,0).getDate();
    const days=Array.from({length:workspaceLastDay},(_,i)=>{const key=`${workspaceYear}-${String(workspaceMonth).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;const branchDay=db.daily?.[key]||{};const base={status:branchDay.status==='off'?'off':'pending'};return [key,{...base,...(seller.daily?.[key]||{})}]}).sort(([a],[b])=>a.localeCompare(b));
    let financial={mercantileCommission:0,serviceCommission:0,commissionSubtotal:0,projectedDsr:0,projectedSubtotal:0,projectedTotal:0,restDays:0,justifiedDays:0,workedDays:0,plannedDays:num(db.businessDays)||0,mercantileRate:0,serviceRate:0,commissionHistorySamples:0,targetTotal:0};
    try{ financial=sellerFinancials(seller); }catch(e){ console.error('Falha no financeiro do vendedor:',e); }
    const ecommerce=num(seller.ecommerce), mercTotal=total.general+ecommerce, planned=Math.max(1,num(db.businessDays)||metrics.plannedDays||1), consideredDays=Math.max(total.days,financial.workedDays||0), remaining=Math.max(0,planned-consideredDays), projMerc=consideredDays?total.general/consideredDays*planned+ecommerce:ecommerce, projServ=consideredDays?total.services/consideredDays*planned:0, avgMerc=consideredDays?mercTotal/consideredDays:0, avgServ=consideredDays?total.services/consideredDays:0, needMerc=remaining?Math.max(0,num(seller.assignedGoal)-mercTotal)/remaining:0, needServ=remaining?Math.max(0,num(seller.serviceGoal)-total.services)/remaining:0;
    const todayKey=isoDate(today.getFullYear(), today.getMonth()+1, today.getDate()), todayData=seller.daily?.[todayKey];
    const hasToday=!!(todayData&&(todayData.status==='done'||todayData.status==='partial'||hasSellerDayValue(todayData)));
    const todayExcused=!!(todayData&&['off','medical','justified'].includes(todayData.status));
    const pendingToday=String(db.month)===todayKey.slice(0,7)&&!hasToday&&!todayExcused;
    const launchedDays=days.filter(([,d])=>d.status==='done'||d.status==='partial'||hasSellerDayValue(d)).length; let pendingInfo={overdue:0,considered:0}; try{pendingInfo=sellerPendingInfo(seller)}catch(e){console.error('Falha nas pendências do vendedor:',e)} const overdueDays=pendingInfo.overdue;
    const monthPending=Math.max(0,planned-launchedDays);
    const tabs=[['overview','🏠 Visão geral'],['daily','📝 Lançamentos'],['weekly','📊 Semanal'],['goals','🎯 Metas'],['dashboard','📊 Dashboard'],['compiled','📈 Compilado']];
    const mercRate=num(seller.assignedGoal)?mercTotal/num(seller.assignedGoal):0, servRate=num(seller.serviceGoal)?total.services/num(seller.serviceGoal):0;
    const statusTone=pendingToday||overdueDays?'attention':hasToday?'ok':'neutral';
    const overview=`<div class="seller-overview-strip"><div><span>📅 LANÇAMENTOS</span><strong>${launchedDays}</strong><small>${monthPending} dia(s) ainda sem lançamento no mês</small></div><div class="${statusTone}"><span>${pendingToday?'⚠️':'✅'} PENDÊNCIAS</span><strong>${monthPending}</strong><small>${pendingToday?'Pendente hoje • ':''}${overdueDays?`${overdueDays} dia(s) vencido(s) • `:''}${monthPending?`${monthPending} pendente(s) na competência`:'nenhuma pendência registrada'}</small></div><div><span>🌐 E-COMMERCE + COMISSÃO</span><strong>${brl.format(ecommerce)}</strong><small>Comissão ${brl.format(num(seller.ecommerceCommission))} • entra no mercantil e nos ganhos</small></div></div>
    <h3 class="seller-block-title">📊 Desempenho e projeção</h3><div class="seller-workspace-grid">${[
      ['💰 Mercantil',brl.format(mercTotal),`${num(seller.assignedGoal)?pct.format(mercRate):'—'} da meta${ecommerce?` • inclui ${brl.format(ecommerce)} de e-commerce`:''}`],['🛡️ Serviços',brl.format(total.services),num(seller.serviceGoal)?`${pct.format(servRate)} da meta`:'Meta não cadastrada'],
      ['🎯 Conversão',total.nfs?efficiencyPct.format(total.conversion):'—','Meta 35%'],['⚡ Eficiência',total.eligible?efficiencyPct.format(total.efficiency):'—','Meta 7%'],
      ['📈 Projeção mercantil',brl.format(projMerc),num(seller.assignedGoal)?`${pct.format(projMerc/num(seller.assignedGoal))} projetado`:'—'],['📈 Projeção serviços',brl.format(projServ),num(seller.serviceGoal)?`${pct.format(projServ/num(seller.serviceGoal))} projetado`:'—'],
      ['⚡ Média mercantil/dia',brl.format(avgMerc),`Necessário ${brl.format(needMerc)}/dia`],['⚡ Média serviços/dia',brl.format(avgServ),`Necessário ${brl.format(needServ)}/dia`],
      ['📅 Dias considerados',String(consideredDays),`${remaining} restante(s) de ${planned}`],['💰 Comissão e-commerce',brl.format(num(seller.ecommerceCommission)),'Somada à projeção de ganhos'],['💹 Comissão média mercantil',financial.mercantileRate?pct2.format(financial.mercantileRate):'—',financial.commissionHistorySamples>1?`Média ponderada com ${financial.commissionHistorySamples} competência(s)`:'Calculada pelos lançamentos atuais'],['💹 Comissão média serviços',financial.serviceRate?pct2.format(financial.serviceRate):'—',financial.commissionHistorySamples>1?`Média ponderada com ${financial.commissionHistorySamples} competência(s)`:'Calculada pelos lançamentos atuais']
    ].map(([l,v,n])=>`<div class="seller-workspace-card"><span>${l}</span><strong>${v}</strong><small>${n}</small></div>`).join('')}</div>
    <h3 class="seller-block-title">💵 Ganhos e projeção financeira</h3><div class="seller-finance-dashboard"><div class="seller-finance-main"><span>💰 PROJEÇÃO DE GANHO TOTAL</span><strong>${brl.format(financial.projectedTotal)}</strong><small>Comissões projetadas + DSR estimado</small></div>${[
      ['Comissão mercantil atual',brl.format(financial.mercantileCommission),'Valor lançado pelo vendedor'],
      ['Comissão serviços atual',brl.format(financial.serviceCommission),'Valor lançado pelo vendedor'],
      ['Subtotal atual',brl.format(financial.commissionSubtotal),'Mercantil + serviços'],
      ['DSR estimado',brl.format(financial.projectedDsr),`${financial.restDays} domingo(s)/repouso(s) • ${financial.justifiedDays} ausência(s) considerada(s)`],
      ['Projeção das comissões',brl.format(financial.projectedSubtotal),`${financial.workedDays} dia(s) considerados de ${financial.plannedDays}`],
      ['Média comissão mercantil',pct2.format(financial.mercantileRate),`${financial.commissionHistorySamples||1} competência(s) considerada(s)`],
      ['Média comissão serviços',pct2.format(financial.serviceRate),`${financial.commissionHistorySamples||1} competência(s) considerada(s)`],
      ['Ganho se bater as metas',brl.format(financial.targetTotal),'Potencial financeiro pelas metas cadastradas']
    ].map(([l,v,n])=>`<div class="seller-finance-item"><span>${l}</span><strong>${v}</strong><small>${n}</small></div>`).join('')}</div>`;
    const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daily=`<div class="seller-day-cards">${days.length?days.map(([key,day])=>{
      const dateObj=new Date(`${key}T12:00:00`), dateOnly=new Date(dateObj.getFullYear(),dateObj.getMonth(),dateObj.getDate());
      const isFuture=dateOnly>normalizedToday;
      const services=num(day.warranty)+num(day.other)+num(day.mixed),conv=num(day.nfs)?num(day.warrantyQty)/num(day.nfs):0,eff=num(day.eligible)?services/num(day.eligible):0;
      const mercComm=Object.prototype.hasOwnProperty.call(day,'commissionMercantile')?num(day.commissionMercantile):num(day.general)*num(day.commissionMercantileRate)/100;
      const servComm=Object.prototype.hasOwnProperty.call(day,'commissionService')?num(day.commissionService):services*.05;
      const has=hasSellerDayValue(day), excused=['off','medical','justified'].includes(day.status);
      const st=day.status==='off'?'💤 Não trabalha':day.status==='medical'?'🩺 Atestado':day.status==='justified'?'📋 Justificada':day.status==='done'?'✅ Finalizado':has||day.status==='partial'?'🟡 Parcial':isFuture?'⏳ Aguardando':'⚠️ Pendente';
      const mission=sellerMissionMetrics(seller,key);
      const mercHit=!!mission.percent && num(day.general)>=num(mission.mercantileGoal);
      const serviceHit=!!mission.percent && services>=num(mission.serviceGoal);
      const conversionHit=num(day.nfs)?conv>=0.35:false;
      const efficiencyHit=num(day.eligible)?eff>=0.07:false;
      const indicators=[];
      if(mission.percent){indicators.push(mercHit,serviceHit);} if(num(day.nfs))indicators.push(conversionHit); if(num(day.eligible))indicators.push(efficiencyHit);
      const passedCount=indicators.filter(Boolean).length;
      const dayToneClass=excused?'seller-day-excused':isFuture&&!has?'seller-day-future':!has&&day.status!=='partial'?'':indicators.length&&passedCount===indicators.length?'seller-day-hit':passedCount>0?'seller-day-partial':'seller-day-miss';
      const missionStrip = mission.percent ? `<div class="seller-day-mission-strip"><div><span>📅 PERCENTUAL DO DIA</span><strong>${mission.percent.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%</strong><small>Distribuição aplicada pela gestão</small></div><div><span>MINHA META DO DIA</span><strong>${brl.format(mission.mercantileGoal)}</strong><small>Calculada sobre a sua meta mensal</small></div><div><span>META DE SERVIÇOS</span><strong>${brl.format(mission.serviceGoal)}</strong><small>Referência financeira de 7%</small></div><div><span>OBJETIVOS FIXOS</span><strong>35% • 7%</strong><small>Conversão e eficiência</small></div><button type="button" class="btn small" data-seller-day-image="${key}" ${isFuture&&!has?'disabled':''}>📲 Baixar imagem HD</button></div>` : `<div class="seller-day-mission-strip empty-mission"><div><span>📅 META DO DIA</span><strong>Aguardando percentual da filial</strong><small>O percentual cadastrado na gestão alimentará automaticamente este dia.</small></div></div>`;
      const detail=excused
        ? `<div class="seller-day-occurrence"><span>OCORRÊNCIA</span><strong>${st}</strong><small>Dia sem indicadores comerciais. Nenhum resultado ou imagem de desempenho é exigido.</small></div>`
        : `${missionStrip}<div class="seller-day-result-label">RESULTADO REGISTRADO</div>${[
          ['MERCANTIL',brl.format(num(day.general))],['VENDA ELEGÍVEL',brl.format(num(day.eligible))],['SERVIÇOS',brl.format(services)],['NOTAS FISCAIS',String(num(day.invoiceCount))],['QTD. ELEGÍVEL',String(num(day.nfs))],['QTD. GARANTIAS',String(num(day.warrantyQty))],['CONVERSÃO',num(day.nfs)?efficiencyPct.format(conv):'—'],['EFICIÊNCIA',num(day.eligible)?efficiencyPct.format(eff):'—'],['COMISSÃO MERC.',brl.format(mercComm)],['COMISSÃO SERVIÇOS',brl.format(servComm)],['TOTAL COMISSÕES',brl.format(mercComm+servComm)]
        ].map(([l,v])=>`<div><span>${l}</span><strong>${v}</strong></div>`).join('')}`;
      return `<article class="seller-day-card seller-day-accordion ${isFuture&&!has?'seller-day-future':''} ${dayToneClass}" data-seller-day="${key}"><button type="button" class="seller-day-head" data-seller-day-toggle="${key}" aria-expanded="false"><div><span>DIA</span><strong>${dateObj.toLocaleDateString('pt-BR',{day:'2-digit',month:'long'})}</strong></div><div class="seller-day-status"><span>STATUS</span><strong>${st}</strong></div><span class="seller-day-chevron">⌄</span></button><div class="seller-day-detail" hidden>${detail}</div></article>`
    }).join(''):'<div class="empty">Nenhum lançamento recebido deste vendedor.</div>'}</div>`;
    let weeks=[]; try{weeks=sellerWorkspaceWeeks(seller)}catch(e){console.error('Falha no semanal do vendedor:',e)} const weekly=`<div class="seller-week-list">${weeks.length?weeks.map(sellerWorkspaceWeekCard).join(''):'<div class="empty">Sem resultados semanais ainda.</div>'}</div>`;
    const goals=`<div class="seller-goal-pair"><div class="seller-goal-box"><span>💰 Meta mercantil mensal</span><h2>${brl.format(num(seller.assignedGoal))}</h2><div class="seller-progress"><i style="width:${Math.min(100,mercRate*100)}%"></i></div><b>${num(seller.assignedGoal)?pct.format(mercRate):'Não cadastrada'}</b><p>${num(seller.assignedGoal)?`Faltam ${brl.format(Math.max(0,num(seller.assignedGoal)-mercTotal))}`:'O vendedor ainda não cadastrou esta meta.'}</p></div><div class="seller-goal-box service"><span>🛡️ Meta de serviços mensal</span><h2>${brl.format(num(seller.serviceGoal))}</h2><div class="seller-progress"><i style="width:${Math.min(100,servRate*100)}%"></i></div><b>${num(seller.serviceGoal)?pct.format(servRate):'Não cadastrada'}</b><p>${num(seller.serviceGoal)?`Faltam ${brl.format(Math.max(0,num(seller.serviceGoal)-total.services))}`:'O vendedor ainda não cadastrou esta meta.'}</p></div></div><div class="seller-workspace-grid" style="margin-top:12px"><div class="seller-workspace-card"><span>🎯 Conversão</span><strong>35,00%</strong><small>Meta fixa</small></div><div class="seller-workspace-card"><span>⚡ Eficiência</span><strong>7,00%</strong><small>Meta fixa</small></div><div class="seller-workspace-card"><span>💵 Comissões</span><strong>Em R$</strong><small>Informadas nos lançamentos</small></div><div class="seller-workspace-card"><span>📅 Dias da filial</span><strong>${planned}</strong><small>Definidos pela gestão</small></div></div>`;
    let compiled='';
    try {
      const branchResult=calculate();
      const branchMercRate=num(db.mercantileGoal)?num(branchResult.revenue)/num(db.mercantileGoal):0;
      const branchServRate=num(db.servicesGoal)?num(branchResult.services)/num(db.servicesGoal):0;
      const sellerMercRate=num(seller.assignedGoal)?mercTotal/num(seller.assignedGoal):0;
      const sellerServRate=num(seller.serviceGoal)?total.services/num(seller.serviceGoal):0;
      const branchConv=num(branchResult.nfs)?num(branchResult.warrantyQty)/num(branchResult.nfs):0;
      const sellerConv=num(total.nfs)?num(total.warrantyQty)/num(total.nfs):0;
      const branchEff=num(branchResult.eligible)?num(branchResult.services)/num(branchResult.eligible):0;
      const sellerEff=num(total.eligible)?num(total.services)/num(total.eligible):0;
      const branchTicket=num(branchResult.invoiceCount)?num(branchResult.revenue)/num(branchResult.invoiceCount):0;
      const sellerTicket=num(total.invoiceCount)?mercTotal/num(total.invoiceCount):0;
      const diffPp=(sellerRate,branchRate)=>sellerRate-branchRate;
      const compareTone=d=>d>.02?'positive':d<-.02?'negative':'neutral';
      const compareText=d=>d>.02?`▲ ${pct2.format(Math.abs(d))} acima`:d<-.02?`▼ ${pct2.format(Math.abs(d))} abaixo`:'≈ alinhado';
      const compRow=(icon,label,branchValue,sellerValue,branchRate,sellerRate,valueFmt=brl.format)=>{const d=diffPp(sellerRate,branchRate);return `<div class="seller-compiled-row"><div class="seller-compiled-title"><span>${icon} ${label}</span><b class="${compareTone(d)}">${compareText(d)}</b></div><div class="seller-compiled-cols"><div><small>FILIAL</small><strong>${valueFmt(branchValue)}</strong><span>${pct.format(branchRate)} da referência</span></div><div><small>VENDEDOR</small><strong>${valueFmt(sellerValue)}</strong><span>${pct.format(sellerRate)} da meta</span></div></div></div>`};
      const pctValue=v=>efficiencyPct.format(v);
      const nfGoalBranch=Math.max(1,num(branchResult.invoiceCount));
      const nfRateBranch=num(db.businessDays)?num(branchResult.invoiceCount)/Math.max(1,num(db.businessDays)):0;
      const nfRateSeller=num(db.businessDays)?num(total.invoiceCount)/Math.max(1,num(db.businessDays)):0;
      const trendGap=num(seller.assignedGoal)?projMerc/num(seller.assignedGoal)-branchResult.projection/Math.max(1,num(db.mercantileGoal)):0;
      const trendText=trendGap>.02?'Vendedor projetando acima do ritmo da filial':trendGap<-.02?'Vendedor projetando abaixo do ritmo da filial':'Vendedor acompanhando o ritmo da filial';
      compiled=`<div class="seller-compiled-hero"><span>📈 COMPARATIVO FILIAL × VENDEDOR</span><strong>${trendText}</strong><small>Mesma competência e mesma janela de acompanhamento. Diferenças exibidas em pontos percentuais.</small></div><div class="seller-compiled-list">${compRow('💰','Mercantil',branchResult.revenue,mercTotal,branchMercRate,sellerMercRate)}${compRow('🛡️','Serviços',branchResult.services,total.services,branchServRate,sellerServRate)}${compRow('🎯','Conversão',branchConv,sellerConv,branchConv,sellerConv,pctValue)}${compRow('⚡','Eficiência',branchEff,sellerEff,branchEff,sellerEff,pctValue)}${compRow('🧾','Ticket médio',branchTicket,sellerTicket,branchTicket?Math.min(1,branchTicket/Math.max(branchTicket,sellerTicket||1)):0,sellerTicket?Math.min(1,sellerTicket/Math.max(branchTicket||1,sellerTicket)):0)}${compRow('📄','Notas fiscais',branchResult.invoiceCount,total.invoiceCount,nfRateBranch,nfRateSeller,v=>String(Math.round(v)))}</div><div class="seller-compiled-foot"><div><span>PROJEÇÃO FILIAL</span><strong>${brl.format(branchResult.projection)}</strong><small>${num(db.mercantileGoal)?pct.format(branchResult.projection/num(db.mercantileGoal)):'—'} da meta</small></div><div><span>PROJEÇÃO VENDEDOR</span><strong>${brl.format(projMerc)}</strong><small>${num(seller.assignedGoal)?pct.format(projMerc/num(seller.assignedGoal)):'—'} da meta</small></div></div>`;
    } catch (compiledError) {
      console.error('Falha no compilado do vendedor:', compiledError);
      compiled='<div class="empty">O histórico compilado está temporariamente indisponível. Os dados atuais permanecem acessíveis.</div>';
    }
    const dashboard='<div class="seller-dashboard-target" data-period="month" data-metric="merc" data-compare="prev"></div>'; host.innerHTML=`${tabs.map(([id])=>`<section class="seller-workspace-view ${sellerWorkspaceTab===id?'active':''}" data-seller-workspace-view="${id}">${id==='overview'?overview:id==='daily'?daily:id==='weekly'?weekly:id==='goals'?goals:id==='dashboard'?dashboard:compiled}</section>`).join('')}<nav class="seller-workspace-tabs seller-workspace-tabs-bottom">${tabs.map(([id,label])=>`<button class="seller-workspace-tab ${sellerWorkspaceTab===id?'active':''}" data-seller-workspace-tab="${id}">${label}</button>`).join('')}</nav>`; const dashRoot=host.querySelector('.seller-dashboard-target'); if(dashRoot && sellerWorkspaceTab==='dashboard'){ try{mountSellerDashboard(seller,dashRoot)}catch(e){console.error('Falha no dashboard do vendedor:',e);dashRoot.innerHTML='<div class="empty">Dashboard temporariamente indisponível. As demais informações do vendedor continuam acessíveis.</div>'} }
    const activeWorkspaceTab=host.querySelector('.seller-workspace-tab.active');
    if(activeWorkspaceTab){try{activeWorkspaceTab.scrollIntoView({inline:'center',block:'nearest'});}catch{}}
    host.querySelectorAll('[data-seller-workspace-tab]').forEach(btn=>btn.addEventListener('click',()=>{sellerWorkspaceTab=btn.dataset.sellerWorkspaceTab;renderSellerWorkspace(seller);const modal=document.querySelector('#sellerProfile>article');if(modal)modal.scrollTo({top:0,behavior:'smooth'});}));
    host.querySelectorAll('[data-seller-day-toggle]').forEach(btn=>btn.addEventListener('click',()=>{const card=btn.closest('.seller-day-accordion'),detail=card?.querySelector('.seller-day-detail'),open=btn.getAttribute('aria-expanded')==='true';btn.setAttribute('aria-expanded',String(!open));if(detail)detail.hidden=open;card?.classList.toggle('open',!open);}));
    host.querySelectorAll('[data-seller-day-image]').forEach(btn=>btn.addEventListener('click',()=>managerDownloadSellerDayImage(seller, btn.dataset.sellerDayImage)));
  }
  function renderSellerProfile() {
    if (!activeSellerProfileId) return;
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId);
    if (!seller) { activeSellerProfileId = null; return; }
    // Render the manager workspace first. Secondary/legacy blocks must never blank the seller view.
    try { renderSellerWorkspace(seller); } catch (workspaceError) { console.error('Falha no workspace do vendedor:', workspaceError); }
    const metrics = sellerMetrics(seller), financial = sellerFinancials(seller), history = sellerProfileHistory(seller), period = sellerPeriodAnalysis(seller, selectedSellerMissionDate()), financialComparison = sellerFinancialComparison(seller, period.period);
    const expectedTotal = financial.targetTotal;
    const sellerIndex = db.sellers.indexOf(seller);
    document.getElementById('sellerProfileTitle').textContent = seller.name || `Vendedor ${sellerIndex + 1}`;
    const syncLabel = seller.updatedAt ? `sincronização ativa • ${new Date(seller.updatedAt).toLocaleString('pt-BR')}` : 'sincronização pendente';
    document.getElementById('sellerProfileSubtitle').textContent = `${db.branch || 'Filial não informada'} • ${monthLabel(db.month)} • ${syncLabel}`;
    document.getElementById('sellerProfileKpis').innerHTML = [
      ['Venda mercantil total', brl.format(num(seller.general))], ['Venda elegível (base eficiência)', brl.format(num(seller.eligible))], ['Meta mercantil', brl.format(metrics.individualGoal)], ['Meta mercantil por dia planejado', brl.format(metrics.targetDailyAverage)], ['Atingimento mercantil', pct.format(metrics.rate)],
      ['Falta mercantil', brl.format(metrics.missing)], ['Média mercantil/dia', brl.format(metrics.dailyAverage)], ['Projeção mercantil', brl.format(metrics.projection)], ['Necessário/dia', brl.format(metrics.neededPerDay)],
      ['Serviços acumulados', brl.format(metrics.services)], ['Meta serviços (7%)', brl.format(metrics.serviceGoal)], ['Meta de serviços por dia planejado', brl.format(metrics.serviceTargetDailyAverage)], ['Atingimento serviços', pct.format(metrics.serviceRate)],
      ['Falta serviços', brl.format(metrics.serviceMissing)], ['Média serviços/dia', brl.format(metrics.serviceDailyAverage)], ['Projeção serviços', brl.format(metrics.serviceProjection)], ['Eficiência', metrics.hasEligible ? efficiencyPct.format(metrics.efficiency) : 'Não calculada'],
      ['Taxa de conversão', period.sales ? efficiencyPct.format(period.conversion) : 'Não calculada'], ['Meta fixa de conversão', '35,00%'], ['Período do resultado', period.periodLabel],
      ['Dias planejados', metrics.plannedDays], ['Dias trabalhados', num(seller.days)], ['Dias restantes', metrics.remainingDays]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    renderSellerMission(seller);
    document.getElementById('profileCommissionMercantileRate').value = '';
    document.getElementById('profileCommissionServiceRate').value = '';
    document.getElementById('profileRestDays').value = financial.restDays;
    document.getElementById('profileJustifiedDays').value = num(seller.justifiedDays) || '';
    document.getElementById('sellerFinanceResults').innerHTML = `<div class="metric"><span>COMISSÃO MERCANTIL</span><strong>${brl.format(financial.mercantileCommission)}</strong></div><div class="metric"><span>COMISSÃO SERVIÇOS</span><strong>${brl.format(financial.serviceCommission)}</strong></div><div class="metric"><span>SUBTOTAL COMISSÕES</span><strong>${brl.format(financial.commissionSubtotal)}</strong></div><div class="metric"><span>REPOUSOS + ATESTADOS ESTIMADOS</span><strong>${brl.format(financial.dsr)}</strong><small>${financial.restDays} repouso(s) + ${financial.justifiedDays} atestado(s)</small></div><div class="metric financial-highlight"><span>GANHO APURADO / ESTIMADO</span><strong>${brl.format(financial.total)}</strong></div><div class="metric financial-highlight"><span>${financialComparison.currentLabel.toUpperCase()}</span><strong>${brl.format(financialComparison.current)}</strong></div><div class="metric financial-highlight"><span>GANHO SE BATER AS METAS</span><strong>${brl.format(financial.targetTotal)}</strong></div><div class="metric financial-highlight"><span>${financialComparison.gapLabel.toUpperCase()}</span><strong>${brl.format(Math.abs(financialComparison.gap))}</strong><small>${financialComparison.gapNote}</small></div><div class="metric"><span>MÉDIA % COMISSÃO MERCANTIL</span><strong>${pct2.format(financial.mercantileRate)}</strong><small>média ponderada pelo histórico disponível</small></div><div class="metric"><span>MÉDIA % COMISSÃO SERVIÇOS</span><strong>${pct2.format(financial.serviceRate)}</strong><small>média ponderada pelo histórico disponível</small></div><div class="metric"><span>COMISSÃO-ALVO MERCANTIL</span><strong>${brl.format(financial.targetMercantileCommission)}</strong></div><div class="metric"><span>COMISSÃO-ALVO SERVIÇOS</span><strong>${brl.format(financial.targetServiceCommission)}</strong></div>`;
    const projectionRate = expectedTotal ? financial.projectedTotal / expectedTotal : 0;
    document.getElementById('sellerProfileDirection').innerHTML = `<strong>Leitura para a reunião:</strong> ${!financial.mercantileRate && !financial.serviceRate ? 'informe as taxas de comissão para ativar as projeções financeiras.' : financial.projectedTotal >= expectedTotal && expectedTotal ? 'a projeção financeira está dentro ou acima do ganho previsto ao bater as metas.' : expectedTotal && financial.projectedTotal ? `a projeção atual está em ${pct.format(projectionRate)} do ganho previsto ao bater as metas.` : `ao atingir as metas cadastradas, a estimativa de ganho é ${brl.format(expectedTotal)}, incluindo repousos e atestados informados.`}`;
    const historyRow = (item) => `<tr><td>${esc(monthLabel(item.month))}</td><td>${brl.format(num(item.seller.general))}</td><td>${brl.format(item.services)}</td><td>${brl.format(item.ticket)}</td><td>${brl.format(item.financial.mercantileCommission)}</td><td>${brl.format(item.financial.serviceCommission)}</td><td>${brl.format(item.financial.dsr)}</td><td>${brl.format(item.financial.total)}</td><td>${pct2.format(item.financial.mercantileRate)}</td></tr>`;
    document.getElementById('sellerProfileHistoryBody').innerHTML = history.length ? history.map(historyRow).join('') : '<tr><td colspan="9">Nenhum histórico disponível.</td></tr>';
    renderSellerDailyDetail(seller);
    document.getElementById('sellerProfileHistoryCards').innerHTML = history.length ? history.map((item) => `<article class="compiled-card"><header><strong>${esc(monthLabel(item.month))}</strong><span class="trend-badge stable">${pct2.format(item.financial.mercantileRate)}</span></header><div class="compiled-card-grid"><div class="metric"><span>VENDA</span><strong>${brl.format(num(item.seller.general))}</strong></div><div class="metric"><span>SERVIÇOS</span><strong>${brl.format(item.services)}</strong></div><div class="metric"><span>DSR</span><strong>${brl.format(item.financial.dsr)}</strong></div><div class="metric"><span>GANHO TOTAL</span><strong>${brl.format(item.financial.total)}</strong></div></div></article>`).join('') : '<div class="empty">Nenhum histórico disponível.</div>';
    try { renderSellerWorkspace(seller); } catch (workspaceError) { console.error('Falha ao atualizar workspace do vendedor:', workspaceError); }
  }
  function syncSellerRow(row) {
    if (!row) return null;
    const index = Number(row.dataset.i), seller = db.sellers[index]; if (!seller) return null;
    const textFields = new Set(['name', 'notes', 'commitment', 'deadline', 'resultPeriod', 'resultStart', 'resultEnd']);
    const integerFields = new Set(['warrantyQty', 'nfs', 'invoiceCount', 'days', 'plannedDays', 'restDays', 'justifiedDays']);
    row.querySelectorAll('[data-f]').forEach((element) => {
      const field = element.dataset.f;
      seller[field] = textFields.has(field) ? element.value : integerFields.has(field) ? Math.round(num(element.value)) : num(element.value);
    });
    seller.updatedAt = new Date().toISOString();
    return { index, seller };
  }
  function sellerDailyStatus(seller) {
    const [year, month] = String(db.month || '').split('-').map(Number);
    const todayKey = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const inMonth = todayKey.startsWith(`${db.month}-`);
    const key = inMonth ? todayKey : `${db.month}-${String(Math.min(new Date(year, month, 0).getDate(), 1)).padStart(2,'0')}`;
    const day = seller.daily?.[key], pending = sellerPendingInfo(seller);
    const hasAny = day && (day.status==='partial' || ['general','eligible','warranty','other','mixed','nfs','warrantyQty'].some((field) => num(day[field]) > 0));
    if (day?.status === 'done' || hasAny) return { label:'Atualizado hoje', cls:'ok', overdue:pending.overdue };
    if (day?.status === 'off' || day?.status === 'medical' || day?.status === 'justified') return { label:'Sem lançamento hoje', cls:'ok', overdue:pending.overdue };
    return { label:'Pendente hoje', cls:'bad', overdue:pending.overdue };
  }
  let sellerEditIndex = -1;
  function openSellerEditor(index) {
    const seller = db.sellers[index]; if (!seller) return;
    sellerEditIndex = index;
    const layer = document.getElementById('sellerEditLayer');
    document.getElementById('sellerEditName').value = seller.name || '';
    document.getElementById('sellerEditGoal').value = num(seller.assignedGoal) || '';
    document.getElementById('sellerEditServiceGoal').value = num(seller.serviceGoal) || '';
    layer.classList.add('open'); layer.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
    setTimeout(()=>document.getElementById('sellerEditName')?.focus(),30);
  }
  function closeSellerEditor() {
    sellerEditIndex = -1; const layer = document.getElementById('sellerEditLayer'); if (!layer) return;
    layer.classList.remove('open'); layer.setAttribute('aria-hidden','true'); if(!document.body.classList.contains('seller-modal-open'))document.body.style.overflow='';
  }
  function saveSellerEditor() {
    if (sellerEditIndex < 0) return;
    const seller = db.sellers[sellerEditIndex]; if (!seller) return closeSellerEditor();
    const name = String(document.getElementById('sellerEditName').value || '').trim();
    if (!name) { alert('Informe o nome do vendedor.'); return; }
    seller.name = name;
    seller.assignedGoal = num(document.getElementById('sellerEditGoal').value);
    seller.serviceGoal = num(document.getElementById('sellerEditServiceGoal').value);
    seller.updatedAt = new Date().toISOString();
    persist(); closeSellerEditor(); renderAll(); showView('sellers');
  }
  function deleteSellerFromManager(index) {
    const seller = db.sellers[index]; if (!seller) return;
    const name = seller.name || `Vendedor ${index + 1}`;
    const warning = `Excluir ${name} da Gestão de Resultados?\n\nIsso remove o cadastro operacional e os dados deste vendedor desta competência no aparelho/nuvem da Gestão. O acesso/login, se existir, deve ser removido separadamente em Administração de acessos.`;
    if (!confirm(warning)) return;
    const id = sellerIdentity(seller, index);
    db.deletedSellers = db.deletedSellers && typeof db.deletedSellers === 'object' ? db.deletedSellers : {};
    db.deletedSellers[id] = { id, name, deletedAt: new Date().toISOString() };
    db.sellers.splice(index, 1); activeSellerProfileId = null; activeScope = 'branch';
    persist(); renderAll(); showView('sellers');
  }

  function openSellerManagerProfile(index) {
    const seller = db.sellers[index]; if (!seller) return;
    const sellerId = sellerIdentity(seller, index);
    const params = new URLSearchParams({
      managerView: '1',
      seller: String(seller.name || `Vendedor ${index + 1}`),
      sellerId: String(seller.id || sellerId),
      branch: String(db.branch || ''),
      month: String(db.month || '')
    });
    params.set('viewVersion','33'); location.href = `./vendedor.html?${params.toString()}&v=33`;
  }

  function sellerDirectorySeverity(seller) {
    const pendingInfo = sellerPendingInfo(seller);
    const overdue = Math.max(0, num(pendingInfo.overdue));
    if (overdue > 3) return { tone:'bad', label:'Atraso crítico', note:`${overdue} dia(s) pendente(s)` };
    if (overdue > 0) return { tone:'warn', label:'Atenção', note:`${overdue} dia(s) pendente(s)` };
    return { tone:'good', label:'Em dia', note:'Lançamentos dentro do prazo' };
  }
  function sellerDirectoryScore(seller) {
    const daily = sellerDailyAggregate(seller);
    const metrics = sellerMetrics(seller);
    const mercRate = num(metrics.individualGoal) ? (daily.general + num(seller.ecommerce)) / Math.max(1, num(metrics.individualGoal)) : 0;
    const servRate = num(metrics.serviceGoal) ? daily.services / Math.max(1, num(metrics.serviceGoal)) : 0;
    const conv = num(daily.conversion);
    const eff = num(daily.efficiency);
    const overdue = sellerPendingInfo(seller).overdue;
    return mercRate * 1000 + servRate * 400 + conv * 120 + eff * 90 - overdue * 35;
  }
  function renderSellers() {
    const updatedToday = db.sellers.filter((seller) => sellerDailyStatus(seller).cls !== 'bad').length;
    const pendingToday = db.sellers.filter((seller) => sellerDailyStatus(seller).cls === 'bad').length;
    const goalsHit = db.sellers.filter((seller) => {
      const a = sellerDailyAggregate(seller), merc = a.general + num(seller.ecommerce), mg = num(seller.assignedGoal), sg = num(seller.serviceGoal);
      return (mg && merc >= mg) || (sg && a.services >= sg);
    }).length;
    document.getElementById('sellerSummary').innerHTML = [
      ['👥 Vendedores', db.sellers.length], ['✅ Atualizados hoje', updatedToday], ['⚠️ Pendentes hoje', pendingToday], ['🏆 Metas batidas', goalsHit]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    const list = document.getElementById('sellerList');
    renderSellerBackupPanel();
    if (!db.sellers.length) {
      list.innerHTML = '<div class="empty">Nenhum vendedor cadastrado. Toque em “+ Vendedor” para começar.</div>';
      return;
    }
    const ordered = db.sellers.map((seller, index) => ({ seller, index }))
      .sort((a, b) => {
        const scoreDiff = sellerDirectoryScore(b.seller) - sellerDirectoryScore(a.seller);
        if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;
        const overdueDiff = sellerPendingInfo(a.seller).overdue - sellerPendingInfo(b.seller).overdue;
        if (overdueDiff) return overdueDiff;
        return String(a.seller.name || '').localeCompare(String(b.seller.name || ''), 'pt-BR');
      });
    list.innerHTML = ordered.map(({ seller, index }, orderIndex) => {
      const metrics = sellerMetrics(seller), daily = sellerDailyAggregate(seller), status = sellerDailyStatus(seller), severity = sellerDirectorySeverity(seller);
      const launchedCount = Object.values(seller.daily || {}).filter((d) => d && (d.status === 'done' || d.status === 'partial' || hasSellerDayValue(d))).length;
      const monthPending = Math.max(0, metrics.plannedDays - launchedCount);
      const syncLabel = seller.updatedAt ? new Date(seller.updatedAt).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '—';
      return `<article class="seller-directory-card status-${severity.tone}" data-i="${index}">
        <div class="seller-card-head tone-${severity.tone}"><span class="seller-card-rank">#${orderIndex + 1}</span><span class="seller-card-avatar">${seller.profilePhoto?`<img src="${esc(seller.profilePhoto)}" alt="Foto de ${esc(seller.name||'vendedor')}">`:esc((seller.name||'V').charAt(0).toUpperCase())}</span><div class="seller-card-head-copy"><strong>${esc(seller.name || `Vendedor ${index + 1}`)}</strong><small>${severity.label} • ${severity.note}</small></div></div>
        <div class="seller-person"><strong>${esc(seller.name || `Vendedor ${index + 1}`)}</strong><span>${metrics.plannedDays} dias planejados • ${launchedCount} lançados • ${Math.max(0, metrics.plannedDays - launchedCount)} sem lançamento</span></div>
        <div class="seller-mini-kpi"><span>Mercantil</span><strong>${brl.format(daily.general + num(seller.ecommerce))}</strong></div>
        <div class="seller-mini-kpi"><span>Serviços</span><strong>${brl.format(daily.services)}</strong></div>
        <div class="seller-mini-kpi"><span>Conversão</span><strong>${daily.nfs ? efficiencyPct.format(daily.conversion) : '—'}</strong></div>
        <div class="seller-mini-kpi"><span>Eficiência</span><strong>${daily.eligible ? efficiencyPct.format(daily.efficiency) : '—'}</strong></div>
        <div class="seller-card-footer"><div class="seller-card-status"><span class="seller-pending ${severity.tone}">${status.label}${monthPending ? ` • ${monthPending} no mês` : ''}</span>${severity.note ? `<span class="seller-overdue tone-${severity.tone}">📅 ${severity.note}</span>` : ''}<small class="seller-updated"><span class="updated-full">🕐 ${seller.updatedAt ? new Date(seller.updatedAt).toLocaleString('pt-BR') : 'Sem atualização'}</span><span class="updated-short">🕐 ${syncLabel}</span></small></div><div class="seller-card-footer-actions"><div class="seller-card-updated-mobile">🕐 ${syncLabel}</div><div class="seller-directory-actions"><button type="button" class="btn primary small seller-open-btn" data-open-seller="${index}"><span class="action-icon">👁️</span><span class="action-label">Ver</span></button><button type="button" class="btn secondary small seller-edit-btn" data-edit-seller="${index}"><span class="action-icon">✏️</span><span class="action-label">Editar</span></button><button type="button" class="btn danger small seller-delete-btn" data-delete-seller="${index}"><span class="action-icon">🗑️</span><span class="action-label">Excluir</span></button></div></div></div>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-open-seller]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      openSellerManagerProfile(Number(button.dataset.openSeller));
    }));
    list.querySelectorAll('[data-edit-seller]').forEach((button) => button.addEventListener('click', () => openSellerEditor(Number(button.dataset.editSeller))));
    list.querySelectorAll('[data-delete-seller]').forEach((button) => button.addEventListener('click', () => deleteSellerFromManager(Number(button.dataset.deleteSeller))));
    if (!document.documentElement.dataset.sellerEyeDelegationV22) {
      document.documentElement.dataset.sellerEyeDelegationV22 = '1';
      document.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-open-seller]');
        if (!button) return;
        event.preventDefault(); event.stopPropagation();
        openSellerManagerProfile(Number(button.dataset.openSeller));
      }, true);
    }
    const teamBtn = document.getElementById('teamDashboardBtn');
    if (teamBtn && !teamBtn.dataset.bound) {
      teamBtn.dataset.bound = '1';
      teamBtn.addEventListener('click', openTeamDashboard);
    }
    const oldHost = document.getElementById('teamDashboardHost');
    if (oldHost) oldHost.hidden = true;
  }
  const sellerResultFields = ['general', 'eligible', 'warranty', 'warrantyQty', 'other', 'mixed', 'nfs', 'invoiceCount', 'days', 'justifiedDays'];
  function renderSellerBackupPanel(message = '') {
    const select = document.getElementById('sellerBackupTarget'); if (!select) return;
    const previous = select.value || 'auto';
    select.innerHTML = '<option value="auto">Identificar automaticamente pelo arquivo</option>' + db.sellers.map((seller, index) => `<option value="${esc(sellerIdentity(seller, index))}">${esc(seller.name || `Vendedor ${index + 1}`)}</option>`).join('');
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    const result = document.getElementById('sellerBackupResult');
    if (message) result.innerHTML = `<div class="audit-item">${message}</div>`;
  }
  function selectedBackupSeller(requireSelection = true) {
    const selected = document.getElementById('sellerBackupTarget').value;
    if (selected !== 'auto') return db.sellers.find((seller, index) => sellerIdentity(seller, index) === selected) || null;
    if (activeScope.startsWith('seller:')) return db.sellers[Number(activeScope.split(':')[1])] || null;
    if (db.sellers.length === 1) return db.sellers[0];
    if (requireSelection) alert('Selecione um vendedor antes de continuar.');
    return null;
  }
  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 700);
  }
  function sellerBackupPayload(seller) {
    const id = sellerIdentity(seller, db.sellers.indexOf(seller)), name = seller.name || 'Vendedor';
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    const exportedAt = new Date().toISOString(), exportId = `seller-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const records = Object.values(vault.records || {}).filter((record) => String(record.branch || '').trim().toLocaleUpperCase('pt-BR') === branch).map((record) => {
      const match = (record.sellers || []).find((item, index) => sellerIdentity(item, index) === id || sellerKey(item.name) === sellerKey(name));
      return match ? { month: record.month, branch: record.branch, businessDays: record.businessDays, snapshotAt: match.updatedAt || record.updatedAt || exportedAt, seller: clone({ ...match, id }) } : null;
    }).filter(Boolean).sort((a, b) => a.month.localeCompare(b.month));
    return {
      kind: 'fs-seller-backup', version: 2, mode: 'snapshot-replace', exportId, exportedAt,
      seller: { id, name }, origin: { branch: db.branch || '', month: db.month },
      records, historyEntries: (vault.historyEntries || []).filter((entry) => sellerKey(entry.seller) === sellerKey(name)).map(clone)
    };
  }
  function recordForSellerImport(branch, month) {
    const key = recordKey(branch, month);
    if (vault.records[key]) return normalizeRecord(vault.records[key]);
    return normalizeRecord({ ...baseRecord(branch, month), businessDays: db.businessDays, weeks: db.weeks, mercantileGoal: db.mercantileGoal, grossProfitGoal: db.grossProfitGoal, servicesGoal: db.servicesGoal, efficiencyGoal: db.efficiencyGoal, warrantyGoal: db.warrantyGoal, warrantyWeekly: db.warrantyWeekly, sellers: [] });
  }
  function importSellerPayload(payload, forcedSeller = null, filename = 'backup.json') {
    if (payload?.kind !== 'fs-seller-backup' || ![1, 2].includes(payload.version) || !payload.seller || !Array.isArray(payload.records)) throw new Error(`${filename}: arquivo não é um backup individual válido.`);
    const canonicalId = forcedSeller ? sellerIdentity(forcedSeller, db.sellers.indexOf(forcedSeller)) : String(payload.seller.id || sellerIdentity(payload.seller));
    const canonicalName = forcedSeller?.name || payload.seller.name || 'Vendedor importado';
    const destinationBranch = db.branch || payload.origin?.branch || 'SEM FILIAL';
    let updatedMonths = 0, unchangedMonths = 0, protectedMonths = 0;
    payload.records.forEach((incomingRecord) => {
      if (!/^\d{4}-\d{2}$/.test(incomingRecord.month || '') || !incomingRecord.seller) return;
      const record = recordForSellerImport(destinationBranch, incomingRecord.month);
      const index = record.sellers.findIndex((seller, sellerIndex) => sellerIdentity(seller, sellerIndex) === canonicalId || sellerKey(seller.name) === sellerKey(canonicalName));
      const current = index >= 0 ? record.sellers[index] : null;
      const incomingStamp = incomingRecord.snapshotAt || incomingRecord.seller.updatedAt || payload.exportedAt || new Date(0).toISOString();
      const currentStamp = current?._sync?.lastSnapshotAt || current?.updatedAt || new Date(0).toISOString();
      const sameExport = Boolean(current?._sync?.lastExportId && payload.exportId && current._sync.lastExportId === payload.exportId);
      const currentHasResults = Boolean(current && (sellerResultFields.some((field) => num(current[field]) > 0) || current.notes || current.commitment));
      if (currentHasResults && (sameExport || Date.parse(incomingStamp) === Date.parse(currentStamp))) { unchangedMonths += 1; return; }
      if (currentHasResults && Date.parse(incomingStamp) < Date.parse(currentStamp)) { protectedMonths += 1; return; }
      const merged = { ...(current || {}), ...clone(incomingRecord.seller), id: canonicalId, name: canonicalName, updatedAt: incomingStamp, _sync: { lastSnapshotAt: incomingStamp, lastExportId: payload.exportId || '', importedAt: new Date().toISOString(), source: 'backup-individual' } };
      if (num(current?.assignedGoal)) merged.assignedGoal = current.assignedGoal;
      if (index >= 0) record.sellers[index] = merged; else record.sellers.push(merged);
      vault.records[recordKey(destinationBranch, incomingRecord.month)] = normalizeRecord(record); updatedMonths += 1;
    });
    if (!vault.historyEntries) vault.historyEntries = [];
    (payload.historyEntries || []).forEach((entry) => {
      const normalized = { ...clone(entry), branch: destinationBranch, seller: canonicalName };
      const index = vault.historyEntries.findIndex((item) => String(item.branch).toLocaleUpperCase('pt-BR') === destinationBranch.toLocaleUpperCase('pt-BR') && sellerKey(item.seller) === sellerKey(canonicalName) && item.month === normalized.month);
      if (index >= 0) vault.historyEntries[index] = normalized; else vault.historyEntries.push(normalized);
    });
    if (!Array.isArray(vault.importLog)) vault.importLog = [];
    vault.importLog.push({ at: new Date().toISOString(), filename, sellerId: canonicalId, seller: canonicalName, months: updatedMonths, unchangedMonths, protectedMonths, exportId: payload.exportId || '' });
    vault.importLog = vault.importLog.slice(-100);
    return { seller: canonicalName, months: updatedMonths, unchangedMonths, protectedMonths };
  }
  const readJsonFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => { try { resolve(JSON.parse(reader.result)); } catch (error) { reject(new Error(`${file.name}: JSON inválido.`)); } }; reader.onerror = () => reject(new Error(`${file.name}: não foi possível ler o arquivo.`)); reader.readAsText(file);
  });

  const sellerKey = (name) => String(name || '').trim().toLocaleLowerCase('pt-BR');
  function previousMonth(month, offset = 1) {
    const [year, number] = month.split('-').map(Number);
    const date = new Date(year, number - 1 - offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  const average = (values) => values.length ? values.reduce((sum, value) => sum + num(value), 0) / values.length : 0;
  const signedPct = (value) => `${value > 0 ? '+' : ''}${pct.format(value)}`;
  const trendClass = (value) => value > 0.025 ? 'up' : value < -0.025 ? 'down' : 'stable';
  const trendLabel = (value) => value > 0.025 ? 'Crescimento' : value < -0.025 ? 'Queda' : 'Estável';
  function branchResultFromRecord(record) {
    const days = Object.values(record.daily || {});
    const dailySales = days.reduce((sum, day) => sum + num(day.general), 0) + num(record.ecommerce);
    const sellerSales = (record.sellers || []).reduce((sum, seller) => sum + num(seller.general), 0);
    return Math.max(0, dailySales || sellerSales);
  }
  function relativeMonth(month, offset) {
    const [year, number] = String(month || db.month).split('-').map(Number);
    const date = new Date(year, number - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  function recordForMonth(month) {
    if (month === db.month) return db;
    const direct = vault.records?.[recordKey(db.branch, month)];
    if (direct) return direct;
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    return Object.values(vault.records || {}).find((record) => record.month === month && String(record.branch || '').trim().toLocaleUpperCase('pt-BR') === branch) || null;
  }
  function recordCalendar(record, month) {
    const [year, number] = month.split('-').map(Number), count = new Date(year, number, 0).getDate();
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(year, number - 1, index + 1), key = `${month}-${String(index + 1).padStart(2, '0')}`;
      const stored = record?.daily?.[key] || {};
      return { date, key, data: { status: date.getDay() === 0 ? 'off' : 'pending', ...stored } };
    });
  }
  function recordAggregate(items, record) {
    const days = items.map((item) => item.data || item), working = days.filter((day) => day.status !== 'off');
    const sales = days.reduce((sum, day) => sum + num(day.general), 0), eligible = days.reduce((sum, day) => sum + num(day.eligible), 0);
    const services = days.reduce((sum, day) => sum + num(day.warranty) + num(day.other) + num(day.mixed), 0);
    const warrantyQty = days.reduce((sum, day) => sum + num(day.warrantyQty), 0);
    const nfs = days.reduce((sum, day) => sum + num(day.nfs), 0), invoiceCount = days.reduce((sum, day) => sum + num(day.invoiceCount), 0), worked = days.filter((day) => day.status === 'done').length;
    return { sales, eligible, services, warrantyQty, nfs, invoiceCount, worked, plannedDays: working.length, efficiency: eligible ? services / eligible : 0, conversion: nfs ? warrantyQty / nfs : 0, ticket: invoiceCount ? sales / invoiceCount : 0, ecommerce: 0 };
  }
  function makePeriodPoint({ label, sublabel, stats, target, serviceTarget, grossProfit = 0, grossTarget = 0, sellerCount, hasData, month = '' }) {
    const sales = Math.max(0, stats.sales + num(stats.ecommerce)), services = stats.services;
    const plannedDays = Math.max(1, stats.plannedDays), worked = stats.worked;
    const gap = Math.max(0, target - sales), serviceGap = Math.max(0, serviceTarget - services);
    return { label, sublabel, month, sales, services, grossProfit, grossTarget, target, serviceTarget, rate: target ? sales / target : 0, grossRate: grossTarget ? grossProfit / grossTarget : 0, serviceRate: serviceTarget ? services / serviceTarget : 0, worked, plannedDays, averageDay: worked ? sales / worked : 0, targetDay: target / plannedDays, gap, gapDay: gap / plannedDays, gapSeller: gap / Math.max(1, sellerCount), serviceAverageDay: worked ? services / worked : 0, serviceTargetDay: serviceTarget / plannedDays, serviceGap, serviceGapDay: serviceGap / plannedDays, serviceGapSeller: serviceGap / Math.max(1, sellerCount), sellerCount, ticket: stats.ticket, conversion: stats.conversion, nfs: stats.nfs, invoiceCount: stats.invoiceCount, projection: worked ? (sales / worked) * plannedDays : 0, efficiency: stats.efficiency, hasData };
  }
  function compiledTemporalAnalysis() {
    const interval = document.getElementById('compiledPeriod')?.value || vault.compiledPreferences?.period || 'month';
    const reference = document.getElementById('compiledReference')?.value || vault.compiledPreferences?.reference || db.month;
    let points = [], months = [reference];
    if (interval === 'month') {
      const record = recordForMonth(reference), basis = record || db, calendar = recordCalendar(record, reference), buckets = calendarWeekBuckets(calendar, basis?.weekEnds), weekCount = buckets.length;
      const monthWorkingDays = calendar.filter((item) => item.data.status !== 'off').length;
      points = buckets.map((items, index) => {
        const stats = recordAggregate(items, record), working = items.filter((item) => item.data.status !== 'off');
        const configured = working.filter((item) => num(item.data.goalPercent) > 0), share = configured.reduce((sum, item) => sum + num(item.data.goalPercent), 0) / 100;
        const useDaily = working.length > 0 && configured.length === working.length;
        const plannedShare = monthWorkingDays ? working.length / monthWorkingDays : 1 / Math.max(1, weekCount);
        const appliedShare = useDaily ? share : plannedShare;
        const target = num(basis?.mercantileGoal) * appliedShare;
        const serviceTarget = useDaily ? num(basis?.servicesGoal) * share : num(basis?.servicesGoal) * plannedShare;
        const monthStats = recordAggregate(calendar, record);
        const grossProfit = monthStats.sales ? recordGrossProfit(record) * stats.sales / monthStats.sales : 0;
        const grossTarget = num(basis?.grossProfitGoal) * appliedShare;
        const sellerCount = Math.max(1, num(basis?.sellerCount), (basis?.sellers || []).filter((seller) => seller.name?.trim()).length);
        const first = items[0].date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), last = items.at(-1).date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const pendingDays = items.filter((item) => item.data.status === 'pending').length;
        return { ...makePeriodPoint({ label: `${index + 1}ª semana`, sublabel: `${first} a ${last}`, month: reference, stats, target, serviceTarget, grossProfit, grossTarget, sellerCount, hasData: Boolean(record && (stats.worked || stats.sales || stats.services || grossProfit)) }), phase: weekPhase(items, pendingDays), pendingDays };
      });
    } else {
      const length = interval === 'quarter' ? 3 : interval === 'semester' ? 6 : 12;
      months = Array.from({ length }, (_, index) => relativeMonth(reference, index - length + 1));
      points = months.map((month) => {
        const record = recordForMonth(month), basis = record || (month === reference ? db : null), stats = recordAggregate(recordCalendar(record, month), record);
        stats.ecommerce = num(record?.ecommerce);
        const target = num(basis?.mercantileGoal), serviceTarget = num(basis?.servicesGoal) || target * 0.07;
        const sellerCount = Math.max(1, num(basis?.sellerCount), (basis?.sellers || []).filter((seller) => seller.name?.trim()).length);
        const grossProfit = recordGrossProfit(record), grossTarget = num(basis?.grossProfitGoal);
        return makePeriodPoint({ label: monthLabel(month), sublabel: record ? `${stats.worked} dia(s) lançado(s)` : 'Sem dados armazenados', month, stats, target, serviceTarget, grossProfit, grossTarget, sellerCount, hasData: Boolean(record && (stats.worked || stats.sales || stats.services || grossProfit)) });
      });
    }
    const valid = points.filter((point) => point.hasData), ranked = [...valid].sort((a, b) => b.rate - a.rate);
    const totals = points.reduce((sum, point) => ({ sales: sum.sales + point.sales, services: sum.services + point.services, grossProfit: sum.grossProfit + point.grossProfit, target: sum.target + point.target, grossTarget: sum.grossTarget + point.grossTarget, serviceTarget: sum.serviceTarget + point.serviceTarget, worked: sum.worked + point.worked, plannedDays: sum.plannedDays + (point.target ? point.plannedDays : 0), nfs: sum.nfs + point.nfs, invoiceCount: sum.invoiceCount + point.invoiceCount }), { sales: 0, services: 0, grossProfit: 0, target: 0, grossTarget: 0, serviceTarget: 0, worked: 0, plannedDays: 0, nfs: 0, invoiceCount: 0 });
    totals.gap = Math.max(0, totals.target - totals.sales);
    return { interval, reference, months, points, valid, best: ranked[0] || null, worst: ranked.at(-1) || null, bestEfficiency: [...valid].sort((a, b) => b.efficiency - a.efficiency)[0] || null, totals };
  }
  function weeklyPeriodHighlights(months) {
    const weeks = [];
    months.forEach((month) => {
      const record = recordForMonth(month);
      if (!record) return;
      calendarWeekBuckets(recordCalendar(record, month), record.weekEnds).forEach((items, index) => {
        const stats = recordAggregate(items, record);
        if (!(stats.worked || stats.sales || stats.services)) return;
        weeks.push({ label: `${index + 1}ª semana · ${monthLabel(month)}`, sales: stats.sales, services: stats.services, efficiency: stats.efficiency });
      });
    });
    weeks.forEach((week, index) => {
      const previous = weeks[index - 1];
      week.salesGrowth = previous?.sales ? week.sales / previous.sales - 1 : null;
      week.servicesGrowth = previous?.services ? week.services / previous.services - 1 : null;
    });
    const bestBy = (field) => weeks.filter((week) => Number.isFinite(week[field])).sort((a, b) => b[field] - a[field])[0] || null;
    return { bestSales: bestBy('salesGrowth'), bestServices: bestBy('servicesGrowth'), bestEfficiency: [...weeks].sort((a, b) => b.efficiency - a.efficiency)[0] || null };
  }
  function renderTierBalanceDashboard(data) {
    const totals = data.totals;
    const months = data.months.map((month) => {
      const record = recordForMonth(month), basis = record || (month === data.reference ? db : null);
      if (!basis) return null;
      const stats = recordAggregate(recordCalendar(record, month), record);
      const ecommerce = num(record?.ecommerce), storeSales = stats.sales, sales = storeSales + ecommerce;
      return { month, record, basis, storeSales, ecommerce, sales, gross: recordGrossProfit(record), target: num(basis.mercantileGoal), grossTarget: num(basis.grossProfitGoal), worked: stats.worked, plannedDays: stats.plannedDays, sellerCount: Math.max(1, num(basis.sellerCount), (basis.sellers || []).filter((seller) => seller.name?.trim()).length) };
    }).filter(Boolean);
    let mercCarry = 0, grossCarry = 0, grossSeen = false;
    const signed = (value) => `${value >= 0 ? '+' : '−'} ${brl.format(Math.abs(value))}`;
    const moneyState = (value, available = true) => available ? `<strong class="${value >= 0 ? 'positive' : 'negative'}">${signed(value)}</strong>` : '<strong>—</strong>';
    const monthlyHtml = months.map((item) => {
      const meta3 = item.target * 1.05, mercMonth = item.sales - meta3, mercPrevious = mercCarry;
      mercCarry += mercMonth;
      const hasGross = item.gross > 0, grossMonth = hasGross ? item.gross - item.grossTarget : 0, grossPrevious = grossCarry, grossPreviousAvailable = grossSeen;
      if (hasGross) { grossCarry += grossMonth; grossSeen = true; }
      const mercRate = item.target ? item.sales / item.target : 0, grossRate = item.grossTarget ? item.gross / item.grossTarget : 0;
      return `<article class="balance-month-card"><h4 class="balance-month-title">${esc(monthLabel(item.month))}</h4><div class="balance-table-wrap"><table class="balance-table"><thead><tr><th>Indicador</th><th>Meta 100%</th><th>Meta 3 (105%)</th><th>Realizado</th><th>Atingimento sobre 100%</th><th>Saldo do mês p/ Meta 3</th><th>Saldo anterior</th><th>Resultado acumulado</th></tr></thead><tbody><tr><td><span class="indicator-icon">🛒</span>Mercantil</td><td>${brl.format(item.target)}</td><td>${brl.format(meta3)}</td><td><strong>${brl.format(item.sales)}</strong></td><td class="${statusClass(mercRate)}"><strong>${pct2.format(mercRate)}</strong></td><td>${moneyState(mercMonth)}</td><td>${moneyState(mercPrevious)}</td><td>${moneyState(mercCarry)}</td></tr><tr><td><span class="indicator-icon">▥</span>Lucro bruto</td><td>${brl.format(item.grossTarget)}</td><td>${brl.format(item.grossTarget)}</td><td><strong>${hasGross ? brl.format(item.gross) : 'Não informado'}</strong></td><td class="${hasGross ? statusClass(grossRate) : ''}"><strong>${hasGross ? pct2.format(grossRate) : '—'}</strong></td><td>${moneyState(grossMonth, hasGross)}</td><td>${moneyState(grossPrevious, grossPreviousAvailable)}</td><td>${moneyState(grossCarry, grossSeen)}</td></tr></tbody></table></div><div class="balance-composition">Composição mercantil: Loja física <strong>${brl.format(item.storeSales)}</strong> + E-commerce <strong>${brl.format(item.ecommerce)}</strong> = <strong>${brl.format(item.sales)}</strong></div></article>`;
    }).join('');
    const nextLabel = monthLabel(relativeMonth(data.reference, 1));
    document.getElementById('periodTierDashboard').innerHTML = monthlyHtml || '<div class="empty">Não há competências salvas neste intervalo.</div>';
    if (months.length) document.getElementById('periodTierDashboard').insertAdjacentHTML('beforeend', `<div class="carry-panel"><h4>Saldo para ${esc(nextLabel)}</h4><div class="carry-row"><span>🛒 Mercantil (Meta 3)</span>${moneyState(mercCarry)}</div><div class="carry-row"><span>▥ Lucro bruto</span>${moneyState(grossCarry, grossSeen)}</div></div>`);

    const finalMonth = months.at(-1) || { worked: totals.worked, plannedDays: totals.plannedDays, sellerCount: configuredSellerCount() };
    const sellerCount = Math.max(1, finalMonth.sellerCount || configuredSellerCount());
    const remainingDays = Math.max(0, finalMonth.plannedDays - finalMonth.worked), divisor = Math.max(1, remainingDays || finalMonth.plannedDays);
    const tiers = [
      { name: 'Meta 1', mercantile: totals.target, gross: totals.grossTarget * 0.95 },
      { name: 'Meta 2', mercantile: totals.target, gross: totals.grossTarget },
      { name: 'Meta 3', mercantile: totals.target * 1.05, gross: totals.grossTarget }
    ];
    const situation = (balance, suffix = '') => balance >= 0 ? `Vendeu a mais ${brl.format(balance)}${suffix}` : `Faltou ${brl.format(Math.abs(balance))}${suffix}`;
    document.getElementById('periodTierClosing').innerHTML = tiers.map((tier) => {
      const balance = totals.sales - tier.mercantile, grossBalance = totals.grossProfit - tier.gross;
      const dailyBalance = balance / divisor, sellerDaily = dailyBalance / sellerCount;
      const mercRate = tier.mercantile ? totals.sales / tier.mercantile : 0, grossRate = tier.gross ? totals.grossProfit / tier.gross : 0;
      const overall = totals.grossProfit ? Math.min(mercRate, grossRate) : mercRate;
      return `<article class="closing-card"><header><strong>${tier.name}</strong><span class="${statusClass(overall)}">${pct.format(overall)}</span></header><div class="closing-row"><span>Venda geral / meta</span><strong>${brl.format(totals.sales)} / ${brl.format(tier.mercantile)}</strong></div><div class="closing-row"><span>Saldo geral</span><strong class="${balance >= 0 ? 'positive' : 'negative'}">${situation(balance)}</strong></div><div class="closing-row"><span>Média atual/dia da loja</span><strong>${brl.format(totals.worked ? totals.sales / totals.worked : 0)}</strong></div><div class="closing-row"><span>Saldo distribuído por dia</span><strong class="${dailyBalance >= 0 ? 'positive' : 'negative'}">${situation(dailyBalance)}</strong></div><div class="closing-row"><span>Saldo por vendedor/dia</span><strong class="${sellerDaily >= 0 ? 'positive' : 'negative'}">${situation(sellerDaily)}</strong></div><div class="closing-row"><span>Dias restantes / equipe</span><strong>${remainingDays} dia(s) • ${sellerCount} vendedor(es)</strong></div><div class="closing-row"><span>Saldo do lucro bruto</span><strong class="${grossBalance >= 0 ? 'positive' : 'negative'}">${totals.grossProfit ? situation(grossBalance) : 'Não informado'}</strong></div></article>`;
    }).join('');
  }
  function renderWeeklyGrowthDashboard(data) {
    const highlights = weeklyPeriodHighlights(data.months);
    const cards = [
      ['Melhor crescimento mercantil', highlights.bestSales, 'salesGrowth'],
      ['Melhor crescimento de serviços', highlights.bestServices, 'servicesGrowth'],
      ['Maior eficiência semanal', highlights.bestEfficiency, 'efficiency']
    ];
    document.getElementById('weeklyGrowthDashboard').innerHTML = cards.map(([title, item, field]) => `<article class="weekly-growth-card"><span>${title}</span><strong>${item ? pct2.format(item[field]) : 'Sem comparação'}</strong><small>${item ? esc(item.label) : 'São necessárias semanas com lançamentos.'}</small></article>`).join('');
  }
  function renderTemporalDashboard() {
    const data = compiledTemporalAnalysis(), totals = data.totals;
    const intervalName = data.interval === 'month' ? monthLabel(data.reference) : data.interval === 'quarter' ? 'trimestre móvel' : data.interval === 'semester' ? 'semestre móvel' : 'últimos 12 meses';
    document.getElementById('periodDashboardHint').textContent = data.interval === 'month' ? `${monthLabel(data.reference)} detalhado por semanas.` : `${intervalName} encerrado em ${monthLabel(data.reference)}, detalhado por meses.`;
    document.getElementById('periodSummary').innerHTML = [
      ['Venda no período', brl.format(totals.sales)], ['Atingimento mercantil', totals.target ? pct.format(totals.sales / totals.target) : 'Sem meta'],
      ['Média por dia lançado', brl.format(totals.worked ? totals.sales / totals.worked : 0)], ['Falta total', brl.format(totals.gap)]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    document.getElementById('periodHighlights').innerHTML = data.valid.length ? [
      ['MELHOR PERÍODO', data.best.label, `${pct.format(data.best.rate)} da meta`], ['PERÍODO DE ATENÇÃO', data.worst.label, `${pct.format(data.worst.rate)} da meta`],
      ['MAIOR EFICIÊNCIA', data.bestEfficiency.label, efficiencyPct.format(data.bestEfficiency.efficiency)]
    ].map(([label, value, note]) => `<article class="period-highlight"><span>${label}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('') : '<div class="empty">Ainda não há lançamentos no intervalo escolhido.</div>';
    document.getElementById('periodChart').innerHTML = data.points.map((point) => `<article class="period-chart-row"><div class="period-chart-head"><strong>${esc(point.label)}</strong><span>${point.hasData ? `${brl.format(point.sales)} · ${pct.format(point.rate)}` : 'Sem dados'}</span></div><div class="bar-line"><label>Mercantil</label><div class="bar-track"><span class="bar-fill" style="width:${Math.min(100, point.rate * 100).toFixed(2)}%"></span></div><b>${pct.format(point.rate)}</b></div><div class="bar-line"><label>Lucro bruto</label><div class="bar-track"><span class="bar-fill gross" style="width:${Math.min(100, point.grossRate * 100).toFixed(2)}%"></span></div><b>${point.grossProfit ? pct.format(point.grossRate) : '—'}</b></div><div class="bar-line"><label>Serviços</label><div class="bar-track"><span class="bar-fill service" style="width:${Math.min(100, point.serviceRate * 100).toFixed(2)}%"></span></div><b>${pct.format(point.serviceRate)}</b></div></article>`).join('');
    renderTierBalanceDashboard(data);
    renderWeeklyGrowthDashboard(data);
    document.getElementById('periodDetailGrid').innerHTML = data.points.map((point) => {
      const marker = point.phase === 'future' ? '' : point.phase === 'current' ? 'current' : point.phase === 'closed' ? (point.rate >= 1 ? 'achieved' : 'missed') : point.hasData ? (point.rate >= 1 ? 'achieved' : 'missed') : '';
      const efficiencyReached = num(db.efficiencyGoal) > 0 && point.efficiency >= num(db.efficiencyGoal);
      const mini = (label, value, className = '', boxClass = '') => `<div class="period-mini ${boxClass}"><span>${label}</span><strong class="${className}">${value}</strong></div>`;
      return `<article class="period-detail ${marker}"><header><div><strong>${esc(point.label)}</strong><small>${esc(point.sublabel)}</small></div><div class="period-rate ${statusClass(point.rate)}">${pct.format(point.rate)}</div></header><div class="period-detail-metrics">${mini('VENDA', brl.format(point.sales), '', point.hasData ? point.rate >= 1 ? 'status-pass' : 'status-fail' : '')}${mini('META', brl.format(point.target))}${mini('LUCRO BRUTO', point.grossProfit ? brl.format(point.grossProfit) : 'Não informado')}${mini('MÉDIA / DIA', brl.format(point.averageDay))}${mini('META / DIA', brl.format(point.targetDay))}${mini('FALTA TOTAL', brl.format(point.gap), point.gap ? 'negative' : 'positive')}${mini('FALTA / DIA', brl.format(point.gapDay), point.gap ? 'negative' : 'positive')}${mini('FALTA / VENDEDOR', brl.format(point.gapSeller), point.gap ? 'negative' : 'positive')}${mini('PROJEÇÃO', brl.format(point.projection))}${mini('TICKET MÉDIO', brl.format(point.ticket))}${mini('SERVIÇOS', brl.format(point.services))}${mini('SERVIÇOS / DIA', brl.format(point.serviceAverageDay))}${mini('SERVIÇOS: FALTA / DIA', brl.format(point.serviceGapDay), point.serviceGap ? 'negative' : 'positive')}${mini('SERVIÇOS: FALTA / VEND.', brl.format(point.serviceGapSeller), point.serviceGap ? 'negative' : 'positive')}${mini('EFICIÊNCIA', point.hasData && point.efficiency > 0 ? efficiencyPct.format(point.efficiency) : 'Não calculada', '', point.hasData && point.efficiency > 0 ? efficiencyReached ? 'status-pass' : 'status-fail' : '')}${mini('NOTAS FISCAIS', point.invoiceCount)}${mini('QTD. ELEGÍVEL', point.nfs)}${mini('TAXA DE CONVERSÃO', point.nfs ? efficiencyPct.format(point.conversion) : 'Não calculada')}</div></article>`;
    }).join('');
  }
  function compiledAnalysis() {
    const selectedPeriod = document.getElementById('compiledPeriod')?.value || vault.compiledPreferences?.period || 'month';
    const period = selectedPeriod === 'semester' ? 6 : selectedPeriod === 'year' ? 12 : 3;
    const months = Array.from({ length: period }, (_, index) => previousMonth(db.month, index + 1));
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    const historicalRecords = months.map((month) => vault.records[recordKey(db.branch, month)]).filter((record) => record && String(record.branch || '').trim().toLocaleUpperCase('pt-BR') === branch);
    const branchHistory = historicalRecords.map(branchResultFromRecord).filter((value) => value > 0);
    const branchCurrent = calculate(), branchProjection = branchCurrent.projection;
    const branchBaseline = average(branchHistory) || num(db.mercantileGoal), branchHasData = branchCurrent.worked > 0 || branchCurrent.revenue > 0;
    const branchTrend = branchHasData && branchBaseline ? branchProjection / branchBaseline - 1 : 0;
    const rows = db.sellers.filter((seller) => seller.name?.trim()).map((seller, sellerIndex) => {
      const id = sellerIdentity(seller, sellerIndex), name = seller.name.trim(), metrics = sellerMetrics(seller);
      const historyMap = new Map();
      historicalRecords.forEach((record) => {
        const match = (record.sellers || []).find((item, index) => sellerIdentity(item, index) === id || sellerKey(item.name) === sellerKey(name));
        if (match) historyMap.set(record.month, num(match.general));
      });
      (vault.historyEntries || []).forEach((entry) => { if (String(entry.branch || '').trim().toLocaleUpperCase('pt-BR') === branch && sellerKey(entry.seller) === sellerKey(name) && months.includes(entry.month)) historyMap.set(entry.month, num(entry.sales)); });
      const historyValues = [...historyMap.values()].filter((value) => value > 0), historicalAverage = average(historyValues);
      const baseline = historicalAverage || metrics.individualGoal, currentProjection = metrics.projection;
      const sellerTrend = baseline ? currentProjection / baseline - 1 : 0, goalRate = metrics.individualGoal ? currentProjection / metrics.individualGoal : 0;
      const trendGap = sellerTrend - branchTrend;
      const sellerHasData = num(seller.days) > 0 || num(seller.general) > 0;
      let diagnosis = sellerHasData ? 'Acompanhando a filial' : 'Aguardando lançamentos', diagnosisClass = 'stable';
      if (sellerHasData && goalRate >= 1 && trendGap >= -0.05) { diagnosis = 'Crescendo com a filial'; diagnosisClass = 'up'; }
      else if (sellerHasData && trendGap > 0.10) { diagnosis = 'Acima do ritmo da filial'; diagnosisClass = 'up'; }
      else if (sellerHasData && (trendGap < -0.10 || goalRate < 0.85)) { diagnosis = 'Abaixo do ritmo esperado'; diagnosisClass = 'down'; }
      const strengths = [], attentions = [], opportunities = [];
      if (goalRate >= 1) strengths.push('projeção acima da meta individual');
      if (metrics.efficiency >= num(db.efficiencyGoal)) strengths.push('eficiência dentro ou acima da meta');
      if (trendGap > 0.05) strengths.push('crescimento superior ao da filial');
      if (sellerHasData && goalRate < 0.85) attentions.push(`projeção em ${pct.format(goalRate)} da meta`);
      if (trendGap < -0.10) attentions.push('evolução abaixo do movimento da filial');
      if (metrics.efficiency < num(db.efficiencyGoal)) opportunities.push(`elevar eficiência para ${efficiencyPct.format(num(db.efficiencyGoal))}`);
      if (metrics.dailyAverage && metrics.individualGoal > currentProjection) opportunities.push(`buscar ${brl.format((metrics.individualGoal - num(seller.general)) / Math.max(1, metrics.plannedDays - num(seller.days)))} por dia restante`);
      return { id, name, metrics, currentProjection, historicalAverage, historyCount: historyValues.length, sellerTrend, branchTrend, trendGap, goalRate, diagnosis, diagnosisClass, strengths, attentions, opportunities };
    });
    return { period, months, branchCurrent, branchProjection, branchBaseline, branchTrend, branchHasData, branchHistoryCount: branchHistory.length, rows };
  }
  function renderCompiled() {
    const mode = document.getElementById('compiledMode'); if (!mode) return;
    const periodSelect = document.getElementById('compiledPeriod');
    const referenceInput = document.getElementById('compiledReference');
    if (!periodSelect.dataset.ready) {
      const savedPeriod = vault.compiledPreferences?.period;
      periodSelect.value = ['month', 'quarter', 'semester', 'year'].includes(savedPeriod) ? savedPeriod : savedPeriod === '6' ? 'semester' : savedPeriod === '12' ? 'year' : 'month';
      referenceInput.value = vault.compiledPreferences?.reference || db.month;
      periodSelect.dataset.ready = '1';
    }
    const previous = mode.value || vault.compiledPreferences?.mode || 'all';
    mode.innerHTML = '<option value="all">Filial × todos os vendedores</option>' + db.sellers.filter((seller) => seller.name?.trim()).map((seller, index) => `<option value="${esc(sellerIdentity(seller, index))}">Filial × ${esc(seller.name.trim())}</option>`).join('');
    if ([...mode.options].some((option) => option.value === previous)) mode.value = previous;
    renderTemporalDashboard();
    const data = compiledAnalysis(), visibleRows = mode.value === 'all' ? data.rows : data.rows.filter((row) => row.id === mode.value);
    const aligned = data.rows.filter((row) => row.diagnosisClass !== 'down').length, growing = data.rows.filter((row) => row.sellerTrend > 0.025).length, attention = data.rows.filter((row) => row.diagnosisClass === 'down').length;
    document.getElementById('compiledSummary').innerHTML = [
      ['Projeção da filial', brl.format(data.branchProjection)], ['Tendência da filial', signedPct(data.branchTrend)],
      ['Vendedores acompanhando', `${aligned} de ${data.rows.length}`], ['Precisam de atenção', attention]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    document.getElementById('branchTrendPanel').innerHTML = `<div class="trend-hero"><span>Panorama da filial</span><div class="trend-value">${signedPct(data.branchTrend)}</div><div>${trendLabel(data.branchTrend)} na projeção atual</div><div class="muted">Comparação com ${data.branchHistoryCount ? `a média de ${data.branchHistoryCount} competência(s)` : 'a meta atual, pois ainda não há histórico suficiente'}.</div></div><div class="trend-details"><div class="metric"><span>PROJEÇÃO ATUAL</span><strong>${brl.format(data.branchProjection)}</strong></div><div class="metric"><span>BASE COMPARATIVA</span><strong>${brl.format(data.branchBaseline)}</strong></div><div class="metric"><span>VENDEDORES EM CRESCIMENTO</span><strong>${growing}</strong></div><div class="metric"><span>EFICIÊNCIA DA FILIAL</span><strong>${efficiencyPct.format(data.branchCurrent.efficiency)}</strong></div></div>`;
    const rowHtml = (row) => `<tr><td class="compiled-person"><strong>${esc(row.name)}</strong><span>${row.historyCount ? `${row.historyCount} mês(es) na base` : 'sem histórico; comparação pela meta'}</span></td><td>${brl.format(row.currentProjection)}</td><td>${row.historicalAverage ? brl.format(row.historicalAverage) : '—'}</td><td><span class="trend-badge ${trendClass(row.sellerTrend)}">${signedPct(row.sellerTrend)}</span></td><td><span class="trend-badge ${trendClass(row.branchTrend)}">${signedPct(row.branchTrend)}</span></td><td class="${statusClass(row.goalRate)}">${pct.format(row.goalRate)}</td><td>${efficiencyPct.format(row.metrics.efficiency)}</td><td><span class="trend-badge ${row.diagnosisClass}">${esc(row.diagnosis)}</span></td></tr>`;
    document.getElementById('compiledTableBody').innerHTML = visibleRows.length ? visibleRows.map(rowHtml).join('') : '<tr><td colspan="8">Cadastre vendedores e resultados para gerar o comparativo.</td></tr>';
    document.getElementById('compiledCards').innerHTML = visibleRows.length ? visibleRows.map((row) => `<article class="compiled-card"><header><div><strong>${esc(row.name)}</strong><div class="muted">${row.historyCount ? `${row.historyCount} mês(es) analisados` : 'Comparação pela meta'}</div></div><span class="trend-badge ${row.diagnosisClass}">${esc(row.diagnosis)}</span></header><div class="compiled-card-grid"><div class="metric"><span>PROJEÇÃO</span><strong>${brl.format(row.currentProjection)}</strong></div><div class="metric"><span>TENDÊNCIA</span><strong>${signedPct(row.sellerTrend)}</strong></div><div class="metric"><span>META</span><strong>${pct.format(row.goalRate)}</strong></div><div class="metric"><span>EFICIÊNCIA</span><strong>${efficiencyPct.format(row.metrics.efficiency)}</strong></div></div></article>`).join('') : '<div class="empty">Cadastre vendedores e resultados para gerar o comparativo.</div>';
    const names = (items) => items.map((row) => row.name).join(', ');
    const strongRows = visibleRows.filter((row) => row.strengths.length), attentionRows = visibleRows.filter((row) => row.attentions.length), opportunityRows = visibleRows.filter((row) => row.opportunities.length);
    const individual = visibleRows.length === 1 ? visibleRows[0] : null;
    document.getElementById('compiledInsights').innerHTML = `<article class="insight-card strength"><h3>Pontos fortes</h3><p>${individual ? (individual.strengths.join('; ') || 'Ainda não há destaque consolidado; acompanhe a evolução durante o mês.') : (strongRows.length ? `${esc(names(strongRows))}: apresentam indicadores positivos no período.` : 'Nenhum destaque consolidado ainda.')}</p></article><article class="insight-card attention"><h3>Pontos de atenção</h3><p>${individual ? (individual.attentions.join('; ') || 'Sem alerta crítico no momento.') : (attentionRows.length ? `${esc(names(attentionRows))}: estão abaixo do ritmo esperado e precisam de acompanhamento.` : 'Equipe acompanhando o ritmo esperado.')}</p></article><article class="insight-card opportunity"><h3>Oportunidade e direcionamento</h3><p>${individual ? (individual.opportunities.join('; ') || 'Manter o ritmo e reforçar as práticas que estão funcionando.') : (opportunityRows.length ? `Priorizar plano de ação com ${esc(names(opportunityRows))}, revisando necessidade diária, eficiência e serviços.` : 'Manter acompanhamento semanal e reconhecer a evolução da equipe.')}</p></article>`;
  }
  function selectedHistoryMonths(period = '3') {
    if (period === 'previousYear') {
      const year = Number(db.month.slice(0, 4)) - 1;
      return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    }
    return Array.from({ length: Math.max(1, Number(period) || 3) }, (_, index) => previousMonth(db.month, index + 1));
  }
  function allSellerHistory() {
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
    const merged = new Map();
    Object.values(vault.records || {}).forEach((record) => {
      if (String(record.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch || !Array.isArray(record.sellers)) return;
      record.sellers.forEach((seller) => {
        if (!seller.name || !num(seller.general)) return;
        const entry = { branch: record.branch, seller: seller.name.trim(), month: record.month, sales: num(seller.general), days: num(seller.days), source: 'Resultado mensal da plataforma', manual: false };
        merged.set(`${sellerKey(entry.seller)}|${entry.month}`, entry);
      });
    });
    (vault.historyEntries || []).forEach((entry) => {
      if (String(entry.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch || !entry.seller || !entry.month) return;
      merged.set(`${sellerKey(entry.seller)}|${entry.month}`, { ...entry, sales: num(entry.sales), days: num(entry.days), manual: true });
    });
    return [...merged.values()];
  }
  function goalSuggestions() {
    const period = document.getElementById('historyPeriod')?.value || vault.goalPreferences?.period || '3';
    const method = document.getElementById('goalMethod')?.value || vault.goalPreferences?.method || 'share';
    const monthSet = new Set(selectedHistoryMonths(period));
    const history = allSellerHistory().filter((entry) => monthSet.has(entry.month));
    const names = new Map();
    db.sellers.forEach((seller) => { if (seller.name?.trim()) names.set(sellerKey(seller.name), seller.name.trim()); });
    history.forEach((entry) => names.set(sellerKey(entry.seller), entry.seller.trim()));
    const count = names.size;
    const teamTotal = history.reduce((sum, entry) => sum + num(entry.sales), 0);
    const rows = [...names].map(([key, name]) => {
      const entries = history.filter((entry) => sellerKey(entry.seller) === key);
      const total = entries.reduce((sum, entry) => sum + num(entry.sales), 0);
      const days = entries.reduce((sum, entry) => sum + num(entry.days), 0);
      const months = new Set(entries.map((entry) => entry.month)).size;
      const monthlyAverage = months ? total / months : 0;
      const share = teamTotal ? total / teamTotal : count ? 1 / count : 0;
      let suggested = method === 'average' ? monthlyAverage : method === 'equal' ? num(db.mercantileGoal) / Math.max(1, count) : num(db.mercantileGoal) * share;
      if (!suggested && count) suggested = num(db.mercantileGoal) / count;
      const goalShare = num(db.mercantileGoal) ? suggested / num(db.mercantileGoal) : 0;
      return { key, name, entries, months, total, days, monthlyAverage, weeklyAverage: monthlyAverage / 4.33, dailyAverage: days ? total / days : 0, share, suggested, grossReference: num(db.grossProfitGoal) * goalShare };
    }).sort((a, b) => b.suggested - a.suggested || a.name.localeCompare(b.name, 'pt-BR'));
    return { period, method, history, rows, teamTotal, analyzedMonths: monthSet.size };
  }
  function renderGoalsHistory() {
    const period = document.getElementById('historyPeriod'), method = document.getElementById('goalMethod');
    if (!period || !method) return;
    period.value = vault.goalPreferences?.period || period.value || '3';
    method.value = vault.goalPreferences?.method || method.value || 'share';
    const data = goalSuggestions();
    const recommendedTotal = data.rows.reduce((sum, row) => sum + row.suggested, 0);
    const averageTeamMonth = data.history.length ? data.teamTotal / Math.max(1, new Set(data.history.map((entry) => entry.month)).size) : 0;
    document.getElementById('goalMethodNote').textContent = data.method === 'share'
      ? 'A meta da filial é distribuída conforme a participação de cada vendedor no período. A soma das metas individuais fecha com a meta mercantil da filial.'
      : data.method === 'average'
        ? 'Cada meta sugerida repete a média mensal real do vendedor. A soma pode ficar acima ou abaixo da meta da filial.'
        : 'A meta mercantil da filial é dividida igualmente entre os vendedores cadastrados ou encontrados no histórico.';
    document.getElementById('historySummary').innerHTML = [
      ['Período de referência', data.period === 'previousYear' ? 'Ano anterior' : `${data.analyzedMonths} meses`],
      ['Vendedores analisados', data.rows.length],
      ['Média mensal da equipe', brl.format(averageTeamMonth)],
      ['Total das metas sugeridas', brl.format(recommendedTotal)]
    ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
    const emptyRow = '<tr><td colspan="9" class="empty">Cadastre vendedores e resultados históricos para calcular as médias.</td></tr>';
    document.getElementById('goalSuggestionBody').innerHTML = data.rows.length ? data.rows.map((row) => `<tr><td class="history-person"><strong>${esc(row.name)}</strong><span>${row.entries.length ? `${row.entries.length} registro(s)` : 'Sem histórico'}</span></td><td>${row.months}</td><td>${brl.format(row.total)}</td><td>${brl.format(row.monthlyAverage)}</td><td>${brl.format(row.weeklyAverage)}</td><td>${brl.format(row.dailyAverage)}</td><td>${pct.format(row.share)}</td><td><strong>${brl.format(row.suggested)}</strong></td><td>${brl.format(row.grossReference)}</td></tr>`).join('') : emptyRow;
    document.getElementById('goalSuggestionCards').innerHTML = data.rows.length ? data.rows.map((row) => `<article class="history-card"><h3>${esc(row.name)}</h3><div class="muted">${row.months} mês(es) com resultado • participação ${pct.format(row.share)}</div><div class="history-stats"><div class="metric"><span>MÉDIA/MÊS</span><strong>${brl.format(row.monthlyAverage)}</strong></div><div class="metric"><span>MÉDIA/DIA</span><strong>${brl.format(row.dailyAverage)}</strong></div><div class="metric"><span>MÉDIA/SEMANA</span><strong>${brl.format(row.weeklyAverage)}</strong></div><div class="metric"><span>LUCRO REFERÊNCIA</span><strong>${brl.format(row.grossReference)}</strong></div><div class="metric recommended"><span>META INDIVIDUAL SUGERIDA</span><strong>${brl.format(row.suggested)}</strong></div></div></article>`).join('') : '<div class="empty">Cadastre vendedores e resultados históricos para calcular as médias.</div>';
    const currentSeller = document.getElementById('historySeller').value;
    const sellerNames = [...new Set([...db.sellers.map((seller) => seller.name?.trim()), ...allSellerHistory().map((entry) => entry.seller?.trim())].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    document.getElementById('historySeller').innerHTML = sellerNames.length ? sellerNames.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('') : '<option value="">Cadastre um vendedor primeiro</option>';
    if (sellerNames.includes(currentSeller)) document.getElementById('historySeller').value = currentSeller;
    const manual = (vault.historyEntries || []).filter((entry) => String(entry.branch || '').trim().toLocaleUpperCase('pt-BR') === String(db.branch || '').trim().toLocaleUpperCase('pt-BR')).sort((a, b) => b.month.localeCompare(a.month));
    document.getElementById('manualHistoryList').innerHTML = manual.length ? manual.map((entry) => `<div class="history-entry"><span><strong>${esc(entry.seller)}</strong></span><span>${esc(monthLabel(entry.month))}</span><span>${brl.format(num(entry.sales))}</span><span>${num(entry.days)} dias</span><button class="btn danger small" data-history-remove="${esc(entry.id)}">Excluir</button></div>`).join('') : '<div class="empty">Nenhum resultado anterior informado manualmente.</div>';
    document.querySelectorAll('[data-history-remove]').forEach((button) => button.addEventListener('click', () => {
      if (!confirm('Excluir este registro histórico?')) return;
      vault.historyEntries = vault.historyEntries.filter((entry) => entry.id !== button.dataset.historyRemove); persist(false); renderGoalsHistory();
    }));
    bindMoneyBehavior(document.getElementById('historySales'));
    if (!document.getElementById('historyMonth').value) document.getElementById('historyMonth').value = previousMonth(db.month, 1);
  }
  function saveHistoryEntry() {
    const seller = document.getElementById('historySeller').value.trim();
    const month = document.getElementById('historyMonth').value;
    const sales = num(document.getElementById('historySales').value);
    const days = Math.round(num(document.getElementById('historyDays').value));
    if (!db.branch.trim()) { alert('Informe a filial antes de registrar o histórico.'); return; }
    if (!seller || !month || !sales || !days) { alert('Informe vendedor, competência, venda mercantil e dias trabalhados.'); return; }
    const branch = db.branch.trim();
    if (!Array.isArray(vault.historyEntries)) vault.historyEntries = [];
    const existing = vault.historyEntries.find((entry) => String(entry.branch).toLocaleUpperCase('pt-BR') === branch.toLocaleUpperCase('pt-BR') && sellerKey(entry.seller) === sellerKey(seller) && entry.month === month);
    if (existing) Object.assign(existing, { sales, days, updatedAt: new Date().toISOString() });
    else vault.historyEntries.push({ id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, branch, seller, month, sales, days, createdAt: new Date().toISOString() });
    document.getElementById('historySales').value = ''; document.getElementById('historyDays').value = '';
    persist(false); renderGoalsHistory();
  }

  function fillSettings() {
    const plain = { branch: db.branch, month: db.month, businessDays: db.businessDays, weeks: db.weeks, sellerCount: db.sellerCount, efficiencyGoalInput: num(db.efficiencyGoal) * 100, auditOwner: db.auditOwner || '', auditSource: db.auditSource || '', auditNote: '' };
    const money = { mercantileGoal: db.mercantileGoal, grossProfitGoal: db.grossProfitGoal, servicesGoalInput: db.servicesGoal, warrantyGoalInput: db.warrantyGoal, warrantyWeekly: db.warrantyWeekly };
    Object.entries(plain).forEach(([id, value]) => { document.getElementById(id).value = value; });
    Object.entries(money).forEach(([id, value]) => { const input = document.getElementById(id); input.value = brl.format(num(value)); bindMoneyBehavior(input); });
    document.getElementById('weekEndsInput').value = (db.weekEnds?.length ? db.weekEnds : automaticWeekEnds(db.month)).join(', ');
    document.getElementById('monthQuick').value = db.month;
    document.getElementById('grossProfitRateInput').value = pct2.format(grossProfitRate());
    const ecommerceInput = document.getElementById('ecommerce');
    ecommerceInput.value = brl.format(num(db.ecommerce)); bindMoneyBehavior(ecommerceInput);
    const grossProfitActualInput = document.getElementById('grossProfitActual');
    grossProfitActualInput.value = brl.format(num(db.grossProfitActual)); bindMoneyBehavior(grossProfitActualInput);
    renderTierPreview(); renderAuditList();
  }
  function renderTierPreview(source = db) {
    document.getElementById('tierPreview').innerHTML = tierGoals(source).map((tier) => `<article class="rule-card"><h3>${tier.name}</h3><dl><dt>Regra mercantil</dt><dd>${pct.format(tier.mercPct)}</dd><dt>Meta mercantil</dt><dd>${brl.format(tier.mercantile)}</dd><dt>Regra lucro bruto</dt><dd>${pct.format(tier.grossPct)}</dd><dt>Meta lucro bruto</dt><dd>${brl.format(tier.grossProfit)}</dd></dl></article>`).join('');
  }
  function renderAuditList() {
    const list = document.getElementById('auditList'), history = [...db.configAudit].reverse().slice(0, 12);
    const toggle = document.getElementById('auditHistoryToggle');
    const summary = document.getElementById('auditHistorySummary');
    list.innerHTML = history.length ? history.map((entry, index) => `<article class="audit-item"><strong>${new Date(entry.at).toLocaleString('pt-BR')} • ${esc(entry.owner || 'Responsável não informado')}</strong><div>${esc(entry.source || 'Sem referência')} ${entry.note ? `• ${esc(entry.note)}` : ''}</div><div class="muted">Mercantil ${brl.format(num(entry.values?.mercantileGoal))} • Lucro bruto ${brl.format(num(entry.values?.grossProfitGoal))} • Serviços ${brl.format(num(entry.values?.servicesGoal))} • Eficiência ${pct2.format(num(entry.values?.efficiencyGoal))}</div>${index === 0 ? '<span class="goal-hit-badge">Configuração vigente</span>' : ''}</article>`).join('') : '<div class="empty">A primeira alteração desta competência criará o registro de auditoria.</div>';
    if(summary){
      if(history.length){
        const latest=history[0];
        summary.textContent=`${history.length} registro(s) • última alteração ${new Date(latest.at).toLocaleDateString('pt-BR')} • ${latest.owner||'responsável não informado'}`;
      }else summary.textContent='Nenhuma alteração registrada';
    }
    if(toggle){
      toggle.onclick=()=>{
        const open=toggle.getAttribute('aria-expanded')==='true';
        toggle.setAttribute('aria-expanded',String(!open));
        list.hidden=open;
      };
      toggle.onkeydown=(event)=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle.click();}
      };
    }
  }
  function readSettings() {
    const selectedMonth = document.getElementById('month').value || monthDefault;
    const weekEnds = normalizeWeekEnds(selectedMonth, document.getElementById('weekEndsInput').value);
    const next = {
      branch: document.getElementById('branch').value.trim(), month: selectedMonth,
      businessDays: num(document.getElementById('businessDays').value) || 25, weeks: weekEnds.length || automaticWeeks(selectedMonth), weekEnds,
      mercantileGoal: num(document.getElementById('mercantileGoal').value), grossProfitGoal: num(document.getElementById('grossProfitGoal').value),
      eligibleGoal: 0, eligibleGoalConfirmed: false, servicesGoal: num(document.getElementById('servicesGoalInput').value),
      efficiencyGoal: num(document.getElementById('efficiencyGoalInput').value) / 100,
      warrantyGoal: num(document.getElementById('warrantyGoalInput').value), warrantyWeekly: num(document.getElementById('warrantyWeekly').value),
      sellerCount: Math.round(num(document.getElementById('sellerCount').value)),
      auditOwner: document.getElementById('auditOwner').value.trim(), auditSource: document.getElementById('auditSource').value.trim()
    };
    if (!next.branch) { document.getElementById('branch').classList.add('field-error'); alert('Informe a filial para salvar a configuração.'); return; }
    if ([next.mercantileGoal, next.grossProfitGoal, next.servicesGoal, next.efficiencyGoal].some((goal) => goal <= 0)) { alert('Informe as metas-base obrigatórias enviadas pela empresa.'); return; }
    if (!next.auditOwner) { document.getElementById('auditOwner').classList.add('field-error'); alert('Informe o responsável pela configuração para manter a auditoria.'); return; }
    const contextChanged = next.branch !== db.branch || next.month !== db.month;
    if (contextChanged) {
      persist(false); const key = recordKey(next.branch, next.month);
      db = vault.records[key] ? normalizeRecord(vault.records[key]) : carryRecord(next.branch, next.month);
    }
    const before = configSnapshot(db), note = document.getElementById('auditNote').value.trim();
    Object.assign(db, next);
    db.goals = tierGoals(db).map((tier) => tier.mercantile);
    const after = configSnapshot(db), changed = JSON.stringify(before) !== JSON.stringify(after) || contextChanged;
    if (changed || !db.configAudit.length) db.configAudit.push({ at: new Date().toISOString(), owner: next.auditOwner, source: next.auditSource, note, values: after });
    persist(); renderAll(); showView('overview');
  }

  function printHeader(title) {
    return `<header class="print-header"><div><h1>${esc(title)}</h1><p>Central Inteligente de Vendas • Filial: <strong>${esc(db.branch || 'Não informada')}</strong> • Competência: <strong>${esc(monthLabel(db.month))}</strong></p></div><p>Emitido em ${new Date().toLocaleString('pt-BR')}</p></header>`;
  }
  function renderPrint() {
    const result = calculate(), weeks = weekBuckets();
    const grossAvailable = hasCompleteGrossProfit();
    const goals = tierGoals().map((tier) => {
      const rates = tierRate(tier, result.revenue, result.grossProfit, grossAvailable);
      return `<article class="print-goal"><h3>${tier.name} — ${rates.passed ? 'ATINGIDA' : pct.format(rates.overall)}</h3><dl><dt>Mercantil (${pct.format(tier.mercPct)})</dt><dd>${brl.format(tier.mercantile)}</dd><dt>Mercantil realizado</dt><dd>${brl.format(result.revenue)} · ${pct.format(rates.mercRate)}</dd><dt>Lucro bruto (${pct.format(tier.grossPct)})</dt><dd>${brl.format(tier.grossProfit)}</dd><dt>Lucro bruto realizado</dt><dd>${grossAvailable ? `${brl.format(result.grossProfit)} · ${pct.format(rates.grossRate)}` : 'Não informado — percentual baseado no mercantil'}</dd></dl></article>`;
    }).join('');
    const weeklyRows = weeks.map((items, index) => {
      const stat = weekStats(items), targetContext = weekTargetContext(items), weekCount = Math.max(1, num(db.weeks));
      stat.grossProfit = result.general ? result.grossProfit * stat.general / result.general : 0;
      const weekGrossAvailable = hasCompleteGrossProfit(items);
      const goalCells = tierGoals().map((tier) => { const target = weeklyTierTarget(tier, targetContext, weekCount); const rate = tierRate(target, stat.general, stat.grossProfit, weekGrossAvailable); return `<td>${pct.format(rate.overall)}</td>`; }).join('');
      return `<tr><td>${index + 1}ª<br>${items[0].date.toLocaleDateString('pt-BR')}–${items.at(-1).date.toLocaleDateString('pt-BR')}</td><td>${brl.format(stat.general)}</td><td>${weekGrossAvailable ? brl.format(stat.grossProfit) : 'Não informado'}</td>${goalCells}<td>${brl.format(stat.services)}</td><td>${efficiencyPct.format(stat.efficiency)}</td><td>${stat.warrantyQty}</td><td>${stat.nfs ? efficiencyPct.format(stat.warrantyQty / stat.nfs) : '—'}</td><td>${stat.worked}</td></tr>`;
    }).join('');
    const dailyRows = allDays().map(({ date, data }) => {
      const services = num(data.warranty) + num(data.other) + num(data.mixed), efficiency = num(data.eligible) ? services / num(data.eligible) : 0, conversion = num(data.nfs) ? num(data.warrantyQty) / num(data.nfs) : 0, ticket = num(data.invoiceCount) ? num(data.general) / num(data.invoiceCount) : 0;
      return `<tr><td>${date.toLocaleDateString('pt-BR')}<br>${date.toLocaleDateString('pt-BR', { weekday: 'short' })}</td><td>${data.status === 'done' ? '✓ Lançado' : data.status === 'off' ? 'Não trabalha' : 'Pendente'}${dayReachedPrimaryGoal(data) ? '<br>Meta dia ✓' : ''}</td><td>${brl.format(num(data.general))}</td><td>${brl.format(num(data.eligible))}</td><td>${num(data.invoiceCount)}</td><td>${brl.format(ticket)}</td><td>${num(data.nfs)}</td><td>${brl.format(num(data.warranty))}</td><td>${brl.format(num(data.other))}</td><td>${brl.format(num(data.mixed))}</td><td>${brl.format(services)}</td><td>${num(data.warrantyQty)}</td><td>${num(data.nfs) ? efficiencyPct.format(conversion) : '—'}</td><td>${efficiencyPct.format(efficiency)}</td></tr>`;
    }).join('');
    const sellerPages = db.sellers.filter((seller, index) => !printSellerOnlyId || sellerIdentity(seller, index) === printSellerOnlyId).map((seller) => {
      const metrics = sellerMetrics(seller);
      return `<section class="print-page">${printHeader(`Resultado individual — ${seller.name || 'Vendedor'}`)}<div class="print-kpis"><div class="print-kpi"><span>Venda mercantil</span><strong>${brl.format(num(seller.general))}</strong></div><div class="print-kpi"><span>Meta individual</span><strong>${brl.format(metrics.individualGoal)}</strong></div><div class="print-kpi"><span>Atingimento</span><strong>${pct.format(metrics.rate)}</strong></div><div class="print-kpi"><span>Projeção</span><strong>${brl.format(metrics.projection)}</strong></div><div class="print-kpi"><span>Média diária</span><strong>${brl.format(metrics.dailyAverage)}</strong></div><div class="print-kpi"><span>Eficiência</span><strong>${efficiencyPct.format(metrics.efficiency)}</strong></div></div><table class="print-table"><thead><tr><th>Elegível</th><th>Garantia</th><th>Outros</th><th>Presta-mista</th><th>Serviços</th><th>NFs</th><th>Dias</th></tr></thead><tbody><tr><td>${brl.format(num(seller.eligible))}</td><td>${brl.format(num(seller.warranty))}</td><td>${brl.format(num(seller.other))}</td><td>${brl.format(num(seller.mixed))}</td><td>${brl.format(metrics.services)}</td><td>${num(seller.nfs)}</td><td>${num(seller.days)}</td></tr></tbody></table><h2 class="print-section-title">Direcionamento</h2><p>${esc(seller.notes || 'Sem registro.')}</p><h2 class="print-section-title">Compromisso</h2><p>${esc(seller.commitment || 'Sem registro.')} ${seller.deadline ? `Prazo: ${new Date(`${seller.deadline}T12:00:00`).toLocaleDateString('pt-BR')}.` : ''}</p><div class="print-signatures"><div>Gestor</div><div>Vendedor</div></div></section>`;
    }).join('');
    const sellerFinancialPages = db.sellers.filter((seller, index) => !printSellerOnlyId || sellerIdentity(seller, index) === printSellerOnlyId).map((seller) => {
      const metrics = sellerMetrics(seller), financial = sellerFinancials(seller);
      return `<section class="print-page">${printHeader(`Ganhos financeiros — ${seller.name || 'Vendedor'}`)}<div class="print-kpis"><div class="print-kpi"><span>Comissão mercantil</span><strong>${brl.format(financial.mercantileCommission)}</strong></div><div class="print-kpi"><span>Comissão serviços</span><strong>${brl.format(financial.serviceCommission)}</strong></div><div class="print-kpi"><span>Subtotal</span><strong>${brl.format(financial.commissionSubtotal)}</strong></div><div class="print-kpi"><span>Repousos + atestados</span><strong>${brl.format(financial.dsr)}</strong></div><div class="print-kpi"><span>Projeção no ritmo</span><strong>${brl.format(financial.projectedTotal)}</strong></div><div class="print-kpi"><span>Ganho se bater metas</span><strong>${brl.format(financial.targetTotal)}</strong></div></div><table class="print-table"><thead><tr><th>Venda</th><th>Meta</th><th>Projeção venda</th><th>Dias trabalhados</th><th>Dias úteis</th><th>Repousos</th><th>Atestados</th><th>Comissão mercantil</th><th>Comissão serviços</th></tr></thead><tbody><tr><td>${brl.format(num(seller.general))}</td><td>${brl.format(metrics.individualGoal)}</td><td>${brl.format(metrics.projection)}</td><td>${num(seller.days)}</td><td>${financial.plannedDays}</td><td>${financial.restDays}</td><td>${financial.justifiedDays}</td><td>${brl.format(financial.mercantileCommission)}</td><td>${brl.format(financial.serviceCommission)}</td></tr></tbody></table><div class="print-signatures"><div>Gestor</div><div>Vendedor</div></div></section>`;
    }).join('');
    const historyData = goalSuggestions();
    const historyRows = historyData.rows.map((row) => `<tr><td>${esc(row.name)}</td><td>${row.months}</td><td>${brl.format(row.monthlyAverage)}</td><td>${brl.format(row.weeklyAverage)}</td><td>${brl.format(row.dailyAverage)}</td><td>${pct.format(row.share)}</td><td>${brl.format(row.suggested)}</td><td>${brl.format(row.grossReference)}</td></tr>`).join('');
    const historyPage = `<section class="print-page">${printHeader('Metas e médias por vendedor')}<p>Período: ${historyData.period === 'previousYear' ? 'ano anterior completo' : `últimos ${historyData.analyzedMonths} meses`} • Método: ${historyData.method === 'share' ? 'participação histórica' : historyData.method === 'average' ? 'média histórica' : 'divisão igual'}.</p><table class="print-table"><thead><tr><th>Vendedor</th><th>Meses</th><th>Média/mês</th><th>Média/semana</th><th>Média/dia</th><th>Participação</th><th>Meta sugerida</th><th>Lucro referência</th></tr></thead><tbody>${historyRows || '<tr><td colspan="8">Sem histórico cadastrado.</td></tr>'}</tbody></table><div class="print-signatures"><div>Gestor responsável</div><div>Gerência da filial</div></div></section>`;
    const compiled = compiledAnalysis();
    const compiledRows = compiled.rows.map((row) => `<tr><td>${esc(row.name)}</td><td>${brl.format(row.currentProjection)}</td><td>${row.historicalAverage ? brl.format(row.historicalAverage) : 'Sem histórico'}</td><td>${signedPct(row.sellerTrend)}</td><td>${signedPct(row.branchTrend)}</td><td>${pct.format(row.goalRate)}</td><td>${efficiencyPct.format(row.metrics.efficiency)}</td><td>${esc(row.diagnosis)}</td></tr>`).join('');
    const compiledPage = `<section class="print-page">${printHeader('Compilado inteligente — Filial × Vendedores')}<div class="print-kpis"><div class="print-kpi"><span>Projeção da filial</span><strong>${brl.format(compiled.branchProjection)}</strong></div><div class="print-kpi"><span>Base histórica</span><strong>${brl.format(compiled.branchBaseline)}</strong></div><div class="print-kpi"><span>Tendência filial</span><strong>${signedPct(compiled.branchTrend)}</strong></div><div class="print-kpi"><span>Período analisado</span><strong>${compiled.period} meses</strong></div></div><table class="print-table"><thead><tr><th>Vendedor</th><th>Projeção</th><th>Média histórica</th><th>Tendência vendedor</th><th>Tendência filial</th><th>Meta</th><th>Eficiência</th><th>Diagnóstico</th></tr></thead><tbody>${compiledRows || '<tr><td colspan="8">Sem vendedores cadastrados.</td></tr>'}</tbody></table><div class="print-signatures"><div>Gestor responsável</div><div>Gerência da filial</div></div></section>`;
    const audit = db.configAudit.at(-1);
    document.getElementById('printReport').innerHTML = `<section class="print-page">${printHeader('Gestão de Resultados — Resumo Executivo')}<div class="print-kpis"><div class="print-kpi"><span>Venda mercantil</span><strong>${brl.format(result.revenue)}</strong></div><div class="print-kpi"><span>Lucro bruto</span><strong>${grossAvailable ? brl.format(result.grossProfit) : 'Não informado'}</strong></div><div class="print-kpi"><span>Venda elegível (base da eficiência)</span><strong>${brl.format(result.eligible)}</strong></div><div class="print-kpi"><span>Serviços</span><strong>${brl.format(result.services)}</strong></div><div class="print-kpi"><span>Eficiência</span><strong>${efficiencyPct.format(result.efficiency)}</strong></div><div class="print-kpi"><span>Projeção mercantil</span><strong>${brl.format(result.projection)}</strong></div></div><div class="print-goals">${goals}</div><h2 class="print-section-title">Metas-base e auditoria</h2><div class="print-kpis"><div class="print-kpi"><span>Meta serviços</span><strong>${brl.format(num(db.servicesGoal))}</strong></div><div class="print-kpi"><span>Meta eficiência</span><strong>${efficiencyPct.format(num(db.efficiencyGoal))}</strong></div><div class="print-kpi"><span>Dias úteis</span><strong>${num(db.businessDays)}</strong></div><div class="print-kpi"><span>Responsável</span><strong>${esc(audit?.owner || db.auditOwner || 'Não informado')}</strong></div><div class="print-kpi"><span>Atualização</span><strong>${audit ? new Date(audit.at).toLocaleString('pt-BR') : 'Sem registro'}</strong></div></div><h2 class="print-section-title">Resultado semanal</h2><table class="print-table"><thead><tr><th>Semana</th><th>Mercantil</th><th>Lucro bruto</th><th>M1</th><th>M2</th><th>M3</th><th>Serviços</th><th>Eficiência</th><th>Dias</th></tr></thead><tbody>${weeklyRows}</tbody></table><div class="print-signatures"><div>Gestor responsável</div><div>Gerência da filial</div></div></section><section class="print-page">${printHeader('Lançamentos Diários')}<table class="print-table"><thead><tr><th>Dia</th><th>Situação</th><th>Venda mercantil</th><th>Lucro bruto</th><th>Elegível</th><th>Garantia</th><th>Outros</th><th>Presta-mista</th><th>Serviços</th><th>Eficiência</th><th>NFs</th><th>Ticket</th></tr></thead><tbody>${dailyRows}</tbody></table></section>${historyPage}${sellerPages}`;
    const reportPages = document.querySelectorAll('#printReport > .print-page');
    const weeklyTable = reportPages[0]?.querySelector('.print-table');
    if (weeklyTable) weeklyTable.querySelector('thead tr').innerHTML = '<th>Semana</th><th>Mercantil</th><th>Lucro bruto</th><th>M1</th><th>M2</th><th>M3</th><th>Serviços</th><th>Eficiência</th><th>Qtd. garantias</th><th>Conversão</th><th>Dias</th>';
    const dailyTable = reportPages[1]?.querySelector('.print-table');
    if (dailyTable) dailyTable.querySelector('thead tr').innerHTML = '<th>Dia</th><th>Situação</th><th>Venda mercantil</th><th>Venda elegível</th><th>NFs</th><th>Ticket</th><th>Qtd. elegível</th><th>Garantia (R$)</th><th>Outros</th><th>Presta-mista</th><th>Serviços</th><th>Qtd. garantias</th><th>Conversão</th><th>Eficiência</th>';
    if (printSellerOnlyId) document.getElementById('printReport').innerHTML = sellerPages + sellerFinancialPages;
    else document.getElementById('printReport').insertAdjacentHTML('beforeend', compiledPage + sellerFinancialPages);
  }

  function renderAll() { if (dailyExportGesture) { dailyRenderDeferred=true; return; } if (document.getElementById("biCharts")) renderBI(); fillSettings(); renderScopeSelector(); renderOverview(); renderDaily(); renderWeekly(); renderSellers(); renderGoalsHistory(); renderCompiled(); renderBranchDashboard(); renderSellerProfile(); renderPrint(); }

  function shouldUseLandscapeChartModal() {
    return window.matchMedia('(max-width: 1024px), (pointer: coarse)').matches;
  }
  function ensureManagerLandscapeFallbackCss() {
    if (document.getElementById('managerLandscapeFallbackCss')) return;
    const st = document.createElement('style');
    st.id = 'managerLandscapeFallbackCss';
    st.textContent = `@media (max-width:1024px),(pointer:coarse){.dashboard-chart-modal.mobile-landscape.virtual-landscape{position:fixed!important;inset:0!important;display:block!important;padding:0!important;overflow:hidden!important;background:rgba(15,23,42,.72)!important}.dashboard-chart-modal.mobile-landscape.virtual-landscape .dashboard-chart-modal-dialog{position:absolute!important;left:50%!important;top:50%!important;width:100dvh!important;height:100vw!important;max-width:none!important;max-height:none!important;transform:translate(-50%,-50%) rotate(90deg)!important;transform-origin:center center!important;border-radius:0!important;overflow:auto!important;padding:10px!important}.dashboard-chart-modal.mobile-landscape.virtual-landscape .dashboard-chart-modal-head{position:sticky!important;top:0!important;z-index:8!important;background:rgba(255,255,255,.97)!important}.dashboard-chart-modal.mobile-landscape.virtual-landscape .dashboard-chart-modal-body{overflow:auto!important;max-width:100%!important}.dashboard-chart-modal.mobile-landscape.virtual-landscape .dashboard-card-expanded{min-width:680px!important}}`;
    document.head.appendChild(st);
  }
  async function requestLandscapePresentation(dialog) {
    const orientation = screen?.orientation;
    if (!shouldUseLandscapeChartModal()) return { mobile: false, locked: false, fullscreen: false };
    const state = { mobile: true, locked: false, fullscreen: false };
    /* Não usa Fullscreen API no mobile: evita a faixa/aviso nativo do navegador com o domínio. */
    if (orientation?.lock) {
      try {
        await orientation.lock('landscape');
        state.locked = true;
      } catch {}
    }
    return state;
  }
  async function releaseLandscapePresentation(state) {
    if (state?.locked && screen?.orientation?.unlock) {
      try { screen.orientation.unlock(); } catch {}
    }
  }
  function ensureDashboardChartModal() {
    let modal = document.getElementById('dashboardChartModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'dashboardChartModal';
    modal.className = 'dashboard-chart-modal';
    modal.hidden = true;
    modal.dataset.landscapeLock = '0';
    modal.dataset.landscapeFullscreen = '0';
    modal.innerHTML = '<div class="dashboard-chart-modal-dialog" role="dialog" aria-modal="true" aria-label="Gráfico ampliado"><div class="dashboard-chart-modal-head"><strong id="dashboardChartModalTitle">Gráfico</strong><button type="button" class="dashboard-chart-modal-close" aria-label="Fechar">×</button></div><div class="dashboard-chart-modal-body"></div></div>';
    document.body.appendChild(modal);
    const close = async () => {
      const state = { locked: modal.dataset.landscapeLock === '1', fullscreen: modal.dataset.landscapeFullscreen === '1' };
      modal.hidden = true;
      modal.classList.remove('mobile-landscape', 'virtual-landscape');
      document.body.classList.remove('dashboard-chart-modal-open');
      modal.dataset.landscapeLock = '0';
      modal.dataset.landscapeFullscreen = '0';
      await releaseLandscapePresentation(state);
    };
    modal.querySelector('.dashboard-chart-modal-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
    return modal;
  }
  function openDashboardChartModal(card) {
    if (!card) return;
    const modal = ensureDashboardChartModal();
    const title = card.querySelector('h4')?.textContent?.trim() || 'Gráfico';
    modal.querySelector('#dashboardChartModalTitle').textContent = title;
    const body = modal.querySelector('.dashboard-chart-modal-body');
    body.innerHTML = '';
    const clone = card.cloneNode(true);
    clone.querySelectorAll('[data-chart-expand]').forEach(el => el.remove());
    clone.classList.add('dashboard-card-expanded');
    let values = String(card.dataset.chartValues || '').split(',').filter(Boolean).map(Number);
    let labels = String(card.dataset.chartLabels || '').split(',').filter(Boolean);
    const metric = card.dataset.chartMetric || 'merc';
    const type = card.dataset.chartType || 'bar';
    let statusFlags = String(card.dataset.chartStatus || '').split(',');
    // Preserve exatamente os dias já filtrados pelo dashboard. Não preencher lacunas
    // do calendário com zero ao expandir (ex.: domingos/feriados sem operação).
    if (values.length && labels.length) {
      const size = Math.min(values.length, labels.length);
      values = values.slice(0, size);
      labels = labels.slice(0, size);
      statusFlags = statusFlags.slice(0, size);
    }
    const oldSvg = clone.querySelector('.svg-chart');
    if (oldSvg && values.length && labels.length) {
      const wrap = document.createElement('div');
      wrap.innerHTML = dashboardSvg(values, labels, metric, type, true, statusFlags);
      const newSvg = wrap.firstElementChild;
      if (newSvg) oldSvg.replaceWith(newSvg);
    }
    body.appendChild(clone);
    const isLandscapeModal = shouldUseLandscapeChartModal();
    ensureManagerLandscapeFallbackCss();
    modal.classList.toggle('mobile-landscape', isLandscapeModal);
    modal.classList.remove('virtual-landscape');
    modal.hidden = false;
    document.body.classList.add('dashboard-chart-modal-open');
    requestAnimationFrame(async () => {
      const dialog = modal.querySelector('.dashboard-chart-modal-dialog');
      if (dialog) { dialog.scrollTop = 0; dialog.scrollLeft = 0; }
      const state = await requestLandscapePresentation(dialog);
      modal.dataset.landscapeLock = state.locked ? '1' : '0';
      modal.dataset.landscapeFullscreen = '0';
      modal.classList.toggle('virtual-landscape', isLandscapeModal && !state.locked);
    });
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-chart-expand]');
    if (!trigger) return;
    event.preventDefault(); event.stopPropagation();
    openDashboardChartModal(trigger.closest('.dashboard-card'));
  });
  window.addEventListener('results-cloud-updated', event => {
    try {
      const incoming = event.detail?.vault || JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!incoming?.records) return;
      const activeId = document.querySelector('.view.active')?.id || 'overview';
      const scrollY = window.scrollY || 0;
      vault = incoming;
      if (!Array.isArray(vault.historyEntries)) vault.historyEntries = [];
      const key = recordKey(db.branch, db.month);
      db = normalizeRecord(vault.records[key] || vault.records[vault.currentKey] || Object.values(vault.records)[0] || db);
      renderAll();
      if (document.getElementById(activeId)) showView(activeId, { keepScroll: true });
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'auto' }));
    } catch (_) { /* sincronização nunca deve interromper a tela */ }
  });
  function showView(id, options = {}) {
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === id));
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === id));
    try { sessionStorage.setItem('fs_resultados_active_view', id); } catch (_) {}
    if (id === 'goalsHistory') renderGoalsHistory();
    if (id === 'compiled') { renderCompiled(); renderBI(); }
    if (id === 'branchDashboard') renderBranchDashboard();
    if (!options.keepScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.go)));
  document.getElementById('scopeQuick').addEventListener('change', (event) => {
    activeScope = event.target.value;
    if (activeScope.startsWith('seller:')) {
      const index = Number(activeScope.split(':')[1]), seller = db.sellers[index];
      activeSellerProfileId = seller ? sellerIdentity(seller, index) : null; renderSellerProfile();
      openSellerManagerProfile(index);
    } else { activeSellerProfileId = null; renderOverview(); showView('overview'); }
    renderPrint();
  });
  document.getElementById('monthQuick').addEventListener('change', (event) => switchContext(db.branch, event.target.value || monthDefault));
  document.getElementById('dailyGoalDate').addEventListener('change', renderDailyGoalPlanner);
  document.getElementById('dailyGoalPercent').addEventListener('input', previewDailyGoalFromPlanner);
  document.getElementById('dailyGoalPercent').addEventListener('change', saveDailyGoalFromPlanner);
  document.getElementById('downloadDailyGoal').addEventListener('click', () => exportDailyGoalImage(selectedDailyGoalDate(), false));
  document.getElementById('saveMonthlyGoalProgram')?.addEventListener('click', saveMonthlyGoalProgram);
  document.getElementById('saveSettings').addEventListener('click', readSettings);
  const saveEcommerce = (event) => {
    const value = num(event.target.value); if (value === num(db.ecommerce)) return;
    db.ecommerce = value; persist(); renderAll();
  };
  document.getElementById('ecommerce').addEventListener('change', saveEcommerce);
  document.getElementById('ecommerce').addEventListener('blur', saveEcommerce);
  const saveGrossProfitActual = (event) => {
    const value = num(event.target.value); if (value === num(db.grossProfitActual)) return;
    db.grossProfitActual = value; persist(); renderAll();
  };
  document.getElementById('grossProfitActual').addEventListener('change', saveGrossProfitActual);
  document.getElementById('grossProfitActual').addEventListener('blur', saveGrossProfitActual);
  document.getElementById('month').addEventListener('change', (event) => {
    const month = event.target.value || monthDefault, ends = automaticWeekEnds(month);
    document.getElementById('weekEndsInput').value = ends.join(', '); document.getElementById('weeks').value = ends.length;
  });
  document.getElementById('weekEndsInput').addEventListener('input', (event) => {
    const month = document.getElementById('month').value || monthDefault, ends = normalizeWeekEnds(month, event.target.value);
    document.getElementById('weeks').value = ends.length || automaticWeeks(month);
  });
  ['mercantileGoal', 'grossProfitGoal'].forEach((id) => document.getElementById(id).addEventListener('change', () => {
    const source = { ...db, mercantileGoal: num(document.getElementById('mercantileGoal').value), grossProfitGoal: num(document.getElementById('grossProfitGoal').value) };
    renderTierPreview(source);
    document.getElementById('grossProfitRateInput').value = pct2.format(source.mercantileGoal ? source.grossProfitGoal / source.mercantileGoal : 0);
  }));
  ['historyPeriod', 'goalMethod'].forEach((id) => document.getElementById(id).addEventListener('change', () => {
    vault.goalPreferences = { period: document.getElementById('historyPeriod').value, method: document.getElementById('goalMethod').value };
    persist(false); renderGoalsHistory();
  }));
  document.getElementById('refreshGoals').addEventListener('click', renderGoalsHistory);
  ['compiledMode', 'compiledPeriod', 'compiledReference'].forEach((id) => document.getElementById(id).addEventListener('change', () => {
    vault.compiledPreferences = { mode: document.getElementById('compiledMode').value, period: document.getElementById('compiledPeriod').value, reference: document.getElementById('compiledReference').value || db.month };
    persist(false); renderCompiled();
  }));
  document.getElementById('refreshCompiled').addEventListener('click', renderCompiled);
  function closeSellerManagerModal(){
    document.body.classList.remove('seller-modal-open');
    const modal=document.getElementById('sellerProfile'); if(modal){ modal.classList.remove('seller-modal-active'); modal.classList.remove('active'); modal.setAttribute('aria-hidden','true'); modal.style.display=''; }
    activeScope='branch'; activeSellerProfileId=null; renderScopeSelector(); renderSellers();
  }
  document.getElementById('sellerProfileBack').addEventListener('click', closeSellerManagerModal);
  window.ResultsInternalBack = function(){
    if (document.body.classList.contains('seller-modal-open')) { closeSellerManagerModal(); return; }
    const active = document.querySelector('.view.active');
    if (active && active.id !== 'overview') { activeScope='branch'; showView('overview'); renderScopeSelector(); return; }
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const topBack=document.getElementById('resultsInternalBack'); if(topBack) topBack.addEventListener('click',()=>window.ResultsInternalBack());
  const sellerEditLayer=document.getElementById('sellerEditLayer');
  document.getElementById('sellerEditClose')?.addEventListener('click',closeSellerEditor);
  document.getElementById('sellerEditCancel')?.addEventListener('click',closeSellerEditor);
  document.getElementById('sellerEditSave')?.addEventListener('click',saveSellerEditor);
  sellerEditLayer?.addEventListener('click',(event)=>{if(event.target===sellerEditLayer)closeSellerEditor();});
  document.getElementById('sellerProfile')?.addEventListener('click',(event)=>{ if(event.target?.id==='sellerProfile') closeSellerManagerModal(); });
  document.addEventListener('keydown',(event)=>{ if(event.key!=='Escape')return; if(document.getElementById('sellerEditLayer')?.classList.contains('open')){closeSellerEditor();return;} if(document.body.classList.contains('seller-modal-open')) closeSellerManagerModal(); });
  document.getElementById('sellerMissionDate').addEventListener('change', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (seller) renderSellerMission(seller);
  });
  document.querySelectorAll('[data-mission-tone]').forEach((button) => button.addEventListener('click', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (!seller) return;
    const key = selectedSellerMissionDate(); seller.missionTones = { ...(seller.missionTones || {}), [key]: button.dataset.missionTone };
    seller.updatedAt = new Date().toISOString(); persist(false); renderSellerMission(seller);
  }));
  document.getElementById('sellerMissionImage').addEventListener('click', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (seller) exportSellerMissionImage(seller);
  });
  document.getElementById('saveSellerFinance').addEventListener('click', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (!seller) return;
    // Comissões são informadas diariamente em valor (R$); não há percentual configurável aqui.
    seller.restDays = Math.round(num(document.getElementById('profileRestDays').value));
    seller.justifiedDays = Math.round(num(document.getElementById('profileJustifiedDays').value)); seller.updatedAt = new Date().toISOString();
    persist(); renderSellers(); renderSellerProfile(); renderCompiled(); renderPrint();
  });
  document.getElementById('sellerProfilePrint').addEventListener('click', () => {
    const seller = db.sellers.find((item, index) => sellerIdentity(item, index) === activeSellerProfileId); if (seller) exportSellerMissionImage(seller);
  });
  document.getElementById('saveHistoryEntry').addEventListener('click', saveHistoryEntry);
  document.getElementById('applySuggestedGoals').addEventListener('click', () => {
    const suggestions = goalSuggestions();
    if (!db.sellers.some((seller) => seller.name?.trim())) { alert('Cadastre os vendedores antes de aplicar as metas.'); return; }
    db.sellers.forEach((seller) => {
      const match = suggestions.rows.find((row) => row.key === sellerKey(seller.name));
      if (match) seller.assignedGoal = match.suggested;
    });
    persist(); renderAll(); showView('sellers');
  });
  const currentRole = String(localStorage.getItem('fs_cargo')||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_');
  if (currentRole === 'CONSULTOR') {
    document.body.classList.add('fs-consultor-readonly');
    const context=document.querySelector('.context');
    if(context){const notice=document.createElement('div');notice.className='readonly-banner';notice.style.gridColumn='1/-1';notice.textContent='👁️ Acesso de consultor: acompanhamento em modo somente leitura.';context.appendChild(notice);}
  }
  document.getElementById('addSeller').addEventListener('click', () => {
    const nextIndex = db.sellers.length;
    db.sellers.push({ id: `seller-${Date.now()}-${nextIndex + 1}`, name: '', assignedGoal: 0, plannedDays: num(db.businessDays), commissionMercantileRate: 0, commissionServiceRate: 5, general: 0, eligible: 0, warranty: 0, warrantyQty: 0, other: 0, mixed: 0, nfs: 0, invoiceCount: 0, days: 0, justifiedDays: 0, notes: '', commitment: '', deadline: '', updatedAt: new Date().toISOString() });
    openSellerIndex = nextIndex; persist(); renderSellers(); renderGoalsHistory(); renderScopeSelector(); renderCompiled();
  });
  document.getElementById('exportSellerBackup').addEventListener('click', () => {
    const seller = selectedBackupSeller(); if (!seller) return;
    const payload = sellerBackupPayload(seller);
    const safeName = String(seller.name || 'vendedor').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    downloadJson(payload, `backup-vendedor-${safeName || 'sem-nome'}-${db.month}.json`);
    renderSellerBackupPanel(`✓ Backup de <strong>${esc(seller.name || 'Vendedor')}</strong> gerado com ${payload.records.length} competência(s).`);
  });
  document.getElementById('importSellerBackup').addEventListener('click', () => document.getElementById('sellerBackupFiles').click());
  document.getElementById('sellerBackupFiles').addEventListener('change', async (event) => {
    const files = [...event.target.files]; if (!files.length) return;
    const selectedValue = document.getElementById('sellerBackupTarget').value;
    if (files.length > 1 && selectedValue !== 'auto') {
      alert('Para importar vários vendedores de uma vez, selecione “Identificar automaticamente pelo arquivo”.'); event.target.value = ''; return;
    }
    const forcedSeller = selectedValue === 'auto' ? null : selectedBackupSeller(false);
    const successes = [], errors = [];
    for (const file of files) {
      try { successes.push(importSellerPayload(await readJsonFile(file), forcedSeller, file.name)); }
      catch (error) { errors.push(error.message); }
    }
    const currentKey = recordKey(db.branch, db.month);
    db = normalizeRecord(vault.records[currentKey] || db); activeScope = 'branch'; persist(false); renderAll();
    const updated = successes.reduce((sum, item) => sum + item.months, 0);
    const unchanged = successes.reduce((sum, item) => sum + item.unchangedMonths, 0);
    const protectedCount = successes.reduce((sum, item) => sum + item.protectedMonths, 0);
    const people = [...new Set(successes.map((item) => item.seller))];
    const okText = successes.length ? `✓ ${people.length} vendedor(es): ${updated} competência(s) atualizadas por substituição, ${unchanged} já estavam iguais${protectedCount ? ` e ${protectedCount} foram preservadas por serem mais recentes` : ''}. Nenhum valor foi somado em duplicidade.` : '';
    const errorText = errors.length ? `<div class="backup-errors"><strong>${errors.length} arquivo(s) não importado(s):</strong><br>${errors.map(esc).join('<br>')}</div>` : '';
    renderSellerBackupPanel(`${okText}${errorText}`); event.target.value = '';
  });
  document.getElementById('resetSellerData').addEventListener('click', () => {
    const seller = selectedBackupSeller(); if (!seller) return;
    if (!confirm(`Zerar somente os resultados de ${seller.name || 'Vendedor'} em ${monthLabel(db.month)}? O cadastro, a meta e os outros meses serão mantidos.`)) return;
    sellerResultFields.forEach((field) => { seller[field] = 0; });
    seller.resultPeriod = 'none'; seller.resultStart = ''; seller.resultEnd = '';
    seller.notes = ''; seller.commitment = ''; seller.deadline = ''; seller.updatedAt = new Date().toISOString();
    persist(false); renderAll(); renderSellerBackupPanel(`✓ Resultados de <strong>${esc(seller.name || 'Vendedor')}</strong> zerados somente em ${esc(monthLabel(db.month))}.`);
  });
  document.getElementById('deleteSellerAll').addEventListener('click', () => {
    const seller = selectedBackupSeller(); if (!seller) return;
    const id = sellerIdentity(seller, db.sellers.indexOf(seller)), name = seller.name || 'Vendedor';
    if (!confirm(`Excluir ${name} de TODAS as competências desta filial, incluindo o histórico? Esta ação não pode ser desfeita.`)) return;
    const branch = String(db.branch || '').trim().toLocaleUpperCase('pt-BR'); let removed = 0;
    Object.entries(vault.records || {}).forEach(([key, rawRecord]) => {
      if (String(rawRecord.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch) return;
      const record = normalizeRecord(rawRecord), before = record.sellers.length;
      record.sellers = record.sellers.filter((item, index) => sellerIdentity(item, index) !== id && sellerKey(item.name) !== sellerKey(name));
      removed += before - record.sellers.length; vault.records[key] = record;
    });
    vault.historyEntries = (vault.historyEntries || []).filter((entry) => String(entry.branch || '').trim().toLocaleUpperCase('pt-BR') !== branch || sellerKey(entry.seller) !== sellerKey(name));
    db = normalizeRecord(vault.records[recordKey(db.branch, db.month)] || db); activeScope = 'branch'; persist(false); renderAll();
    renderSellerBackupPanel(`✓ <strong>${esc(name)}</strong> foi excluído de ${removed} competência(s), junto com seu histórico.`);
  });
  document.getElementById('todayBtn').addEventListener('click', () => {
    const key = isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
    if (window.matchMedia('(max-width:760px)').matches && key.startsWith(`${db.month}-`)) { openDailyKey = key; renderDaily(); }
    const selector = window.matchMedia('(max-width:760px)').matches ? `.day-card[data-date="${key}"]` : `#dailyBody [data-date="${key}"]`;
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('printBtn').addEventListener('click', () => { printSellerOnlyId = null; renderPrint(); setTimeout(() => window.print(), 50); });
  window.addEventListener('beforeprint', renderPrint);
  window.addEventListener('afterprint', () => { printSellerOnlyId = null; renderPrint(); });
  document.getElementById('exportBtn').addEventListener('click', async () => {
    persist(false);
    const content = JSON.stringify(vault, null, 2), filename = `gestao-resultados-${(db.branch || 'filial').replace(/\s+/g, '-')}-${db.month}.json`;
    const file = new File([content], filename, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Backup da Gestão de Resultados' }); return; }
    } catch (error) { if (error.name === 'AbortError') return; }
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(file); anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
  });
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (imported.records) vault = imported;
        else { const record = normalizeRecord(imported); const key = recordKey(record.branch, record.month); vault = { version: 2, currentKey: key, records: { [key]: record } }; }
        db = normalizeRecord(vault.records[vault.currentKey] || Object.values(vault.records)[0]); persist(); renderAll(); alert('Backup importado com sucesso.');
      } catch (error) { alert('Não foi possível importar este arquivo.'); }
    };
    reader.readAsText(file);
  });
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!confirm(`Limpar os resultados de ${monthLabel(db.month)}? As metas e os nomes dos vendedores serão mantidos.`)) return;
    db.daily = {};
    db.ecommerce = 0;
    db.grossProfitActual = 0;
    db.sellers = db.sellers.map((seller) => ({ ...seller, general: 0, grossProfit: 0, eligible: 0, warranty: 0, warrantyQty: 0, other: 0, mixed: 0, nfs: 0, invoiceCount: 0, days: 0, notes: '', commitment: '', deadline: '' }));
    persist(); renderAll();
  });

  // BI history is kept in the existing vault and therefore included in its backup.
  const biDepartments = ['Eletrodomésticos','Móveis','Eletroportáteis','Telefonia celular','Colchões','TVs e áudio','Bicicletas','Sofás','Utilidades do lar','Cama e mesa'];
  const biPayments = ['Carnê','Cartão de crédito','PIX','Dinheiro','Cartão de débito','Crédito de devolução'];
  const biTypes = {
    revenue:'Faturamento mensal',
    department:'Vendas por departamento',
    payment:'Formas de pagamento',
    serviceEfficiencyDepartment:'Eficiência de serviços por departamento',
    serviceEfficiencyPayment:'Eficiência de serviços por modalidade de pagamento'
  };
  const biImportedTypes=['department','payment','serviceEfficiencyDepartment','serviceEfficiencyPayment'];
  const biIsDepartmentType=type=>['department','serviceEfficiencyDepartment'].includes(type);
  const biIsPaymentType=type=>['payment','serviceEfficiencyPayment'].includes(type);
  const biIsEfficiencyType=type=>['serviceEfficiencyDepartment','serviceEfficiencyPayment'].includes(type);
  const biImportLabel=type=>type==='department'?'departamentos':type==='payment'?'formas de pagamento':type==='serviceEfficiencyDepartment'?'eficiência por departamento':type==='serviceEfficiencyPayment'?'eficiência por modalidade':'dados';
  let biImageUrl = null, biDraft = [], biSourceName = '', biBusy = false;
  const biBranch = () => String(db.branch || '').trim().toLocaleUpperCase('pt-BR');
  function biStrictNumber(value) {
    const raw=String(value ?? '').trim().replace(/R\$|%|\s/g,'');
    if (!raw || !/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(raw) && !/^\d+(?:\.\d+)?$/.test(raw)) return null;
    const result=Number(raw.includes(',') ? raw.replace(/\./g,'').replace(',','.') : /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g,'') : raw);
    return Number.isFinite(result) && result>=0 ? result : null;
  }
  function biNumber(value) {return Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function biRecords() {return Array.isArray(vault.biRecords) ? vault.biRecords : [];}
  function biDailyRevenueRecords() {
    const branch=biKey(biBranch());
    if(!branch)return [];
    return Object.values(vault.records||{}).map(raw=>normalizeRecord(raw)).filter(record=>biKey(record.branch)===branch).map(record=>{
      const days=Object.values(record.daily||{});
      const hasOperation=days.some(day=>day?.status==='done'||['general','eligible','invoiceCount','warranty','warrantyQty','other','mixed','nfs'].some(field=>num(day?.[field])>0));
      const revenue=days.reduce((sum,day)=>sum+num(day?.general),0)+num(record.ecommerce);
      if(!hasOperation&&revenue<=0)return null;
      const worked=days.filter(day=>day?.status==='done').length;
      const closed=record.month<monthDefault||(record.month===monthDefault&&num(record.businessDays)>0&&worked>=num(record.businessDays));
      return {branch:biBranch(),month:record.month,type:'revenue',unit:'brl',base:null,completeness:closed?'closed':'partial',rows:[{label:'Faturamento',value:revenue}],source:'Sincronizado dos lançamentos diários',updatedAt:record.updatedAt||new Date().toISOString(),syncedDaily:true,workedDays:worked};
    }).filter(Boolean);
  }
  function biRecordSignature(record) {
    const rows=(record?.rows||[]).map(row=>[biKey(row.label),Number(row.value||0)]).sort((a,b)=>a[0].localeCompare(b[0]));
    return JSON.stringify({type:record?.type,unit:record?.unit||'',base:Number(record?.base||0),rows});
  }
  function biImportedIntegrity() {
    const branch=biKey(biBranch()),records=biRecords().filter(record=>biKey(record.branch)===branch);
    const groups=new Map();
    records.filter(record=>biImportedTypes.includes(record.type)).forEach(record=>{
      // A mesma imagem/conjunto não pode alimentar mais de uma competência.
      // Meses diferentes com mesma origem + mesma assinatura são tratados como cópia acidental.
      const key=`${record.type}|${biKey(record.source||'')}|${biRecordSignature(record)}`;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(record);
    });
    const quarantined=new Set();
    groups.forEach(group=>{
      const sorted=[...group].sort((a,b)=>String(a.month).localeCompare(String(b.month)));
      if(sorted.length<2)return;
      // Mantém a competência mais antiga e isola somente as repetições posteriores.
      sorted.slice(1).forEach(record=>quarantined.add(record));
    });
    return {records,quarantined};
  }
  function biMergedRecords() {
    const branch=biKey(biBranch()),map=new Map(),integrity=biImportedIntegrity();
    integrity.records.filter(record=>!integrity.quarantined.has(record)).forEach(record=>map.set(`${record.type}|${record.month}`,record));
    // O faturamento diário é a fonte operacional mais atual. Só substitui o registro de faturamento do mesmo mês; departamentos e pagamentos permanecem intactos.
    biDailyRevenueRecords().forEach(record=>map.set(`revenue|${record.month}`,record));
    return [...map.values()];
  }
  function deleteBIRecord(month,type) {
    const branch=biBranch(), label=biTypes[type]||type;
    if(!biImportedTypes.includes(type)){biStatus('O faturamento mensal sincronizado com os lançamentos diários é protegido e não pode ser apagado por esta área do BI.');return;}
    const exists=biRecords().some(record=>biKey(record.branch)===biKey(branch)&&record.month===month&&record.type===type);
    if(!exists){biStatus(`Não há dados importados de ${label} em ${monthLabel(month)}.`);return;}
    if(!confirm(`Excluir somente ${label} de ${monthLabel(month)} da filial ${db.branch}?\n\nEsta ação NÃO apaga faturamento, lançamentos diários, metas, vendedores nem outros dados do BI.`))return;
    const previous=clone(biRecords());
    try{
      vault.biRecords=biRecords().filter(record=>!(biKey(record.branch)===biKey(branch)&&record.month===month&&record.type===type));
      persist(false);
      renderBI();
      biStatus(`${label} de ${monthLabel(month)} excluído. Os demais dados do mês foram preservados.`);
    }catch(error){vault.biRecords=previous;biStatus('Não foi possível excluir os dados selecionados. Nenhuma informação foi alterada.');}
  }
  function biStatus(message) {document.getElementById('biStatus').textContent=message;}
  function initBI() {
    document.getElementById('settings').insertAdjacentHTML('beforeend',`<article class="panel bi-panel" id="biImportPanel">
      <h2>Importar gráficos do BI</h2><p>Envie uma imagem, confira os números e salve o histórico da filial. Os dados ficam neste aparelho e entram no backup geral.</p>
      <div class="bi-form">
        <label>Tipo de gráfico<select id="biType"><option value="department">Vendas por departamento</option><option value="payment">Formas de pagamento</option><option value="serviceEfficiencyDepartment">Eficiência de serviços por departamento</option><option value="serviceEfficiencyPayment">Eficiência de serviços por modalidade de pagamento</option><option value="revenue">Faturamento mensal / ano a ano</option></select></label>
        <label>Mês do gráfico<input id="biMonth" type="month" value="${esc(db.month)}"></label>
        <label id="biUnitLabel">Unidade<select id="biUnit"><option value="brl">Reais (R$)</option><option value="percent">Percentual (%)</option></select></label>
        <label>Fechamento<select id="biCompleteness"><option value="closed">Mês fechado</option><option value="partial" selected>Mês parcial</option></select></label>
        <label id="biYearOneLabel" hidden>Ano das barras azuis<input id="biYearOne" type="number" min="2000" max="2100" value="${Number(db.month.slice(0,4))-1}"></label>
        <label id="biYearTwoLabel" hidden>Ano das barras verdes<input id="biYearTwo" type="number" min="2000" max="2100" value="${Number(db.month.slice(0,4))}"></label>
        <label id="biBaseLabel" hidden>Faturamento base dos percentuais (R$; opcional)<input id="biBase" inputmode="decimal" placeholder="Total do BI no mesmo mês"></label>
      </div>
      <p class="hint">Para imagens de dois anos, confira os anos das cores. Classifique meses ainda em andamento como parciais na tabela de revisão. Em gráficos com categorias diferentes, corrija os nomes sugeridos.</p>
      <div class="bi-actions"><input id="biFile" type="file" accept="image/png,image/jpeg,image/webp"><button id="biRead" class="btn primary">Ler imagem</button><button id="biManual" class="btn">Preencher manualmente</button><button id="biReset" class="btn">Limpar / nova importação</button></div>
      <p id="biStatus" role="status" aria-live="polite">A leitura acontece no navegador. Na primeira utilização é necessário internet para carregar o leitor.</p>
      <img id="biPreview" class="bi-preview" alt="Imagem do BI em conferência" hidden>
      <details id="biRawWrap" hidden><summary>Texto reconhecido na imagem</summary><pre id="biRaw"></pre></details>
      <div id="biReview" hidden><h3>Confira antes de registrar</h3><p>A leitura pode trocar valores, categorias ou anos. Revise cada linha usando a imagem acima. Um novo envio substitui somente o mesmo tipo e mês desta filial.</p><div class="bi-review-scroll"><table class="bi-review-table"><thead><tr><th>Mês</th><th>Categoria</th><th>Valor</th><th>Fechamento</th><th>Ação</th></tr></thead><tbody id="biDraftBody"></tbody></table></div>
        <div class="bi-actions"><button class="btn" id="biAddRow">Adicionar linha</button><button class="btn primary" id="biSave">Conferi os dados: salvar no histórico</button></div>
      </div><div id="biSaved"></div>
    </article>`);
    document.getElementById('compiled').insertAdjacentHTML('beforeend',`<article class="panel bi-panel bi-ios-shell" id="biDashboard"><div class="bi-ios-hero"><div><span class="bi-ios-kicker">▦ INTELIGÊNCIA COMERCIAL</span><h2>BI · Comparativos e evolução</h2><p>Leitura consolidada da filial com dados separados por origem, competência e indicador.</p></div><div class="bi-ios-hero-badge">Filial ${esc(db.branch||'—')}</div></div>
      <div class="bi-sync-strip"><div><span>↻ FATURAMENTO</span><strong>Sincronizado com os lançamentos diários da filial</strong></div><small>Departamentos, formas de pagamento e eficiências de serviços só entram quando houver importação específica para aquela competência. O BI não replica valores de um mês para outro.</small></div>
      <div id="biDataHealth" class="bi-data-health"></div>
      <div class="bi-form bi-master-filter">
        <label>Análise<select id="biMode"><option value="years" selected>Comparar anos</option><option value="evolution">Evolução mês a mês</option></select></label>
        <label>Período<select id="biPeriod"><option value="month">Mês</option><option value="last3" selected>Últimos 3 meses</option><option value="quarter">Trimestre</option><option value="last6">Últimos 6 meses</option><option value="semester">Semestre</option><option value="year">Ano completo</option><option value="custom">Personalizado</option></select></label>
        <label id="biReferenceLabel">Mês de referência<input type="month" id="biReference" value="${esc(db.month)}"></label>
        <label id="biCompareYearLabel">Ano de comparação<input id="biCompareYear" type="number" min="2000" max="2099" value="${Number(db.month.slice(0,4))-1}"></label>
        <label id="biStartLabel" hidden>Início<input id="biStart" type="month" value="${esc(relativeMonth(db.month,-2))}"></label>
        <label id="biEndLabel" hidden>Fim<input id="biEnd" type="month" value="${esc(db.month)}"></label>
        <label id="biPartialLabel" class="bi-check bi-partial-toggle"><input type="checkbox" id="biIncludePartial"> <span>Incluir meses parciais</span></label>
      </div>
      <p id="biPeriodNote" class="method-note"></p><div id="biCharts"></div></article>`);
    const type=document.getElementById('biType'),unit=document.getElementById('biUnit');
    function updateType() {
      const revenue=type.value==='revenue';
      const efficiency=biIsEfficiencyType(type.value);
      document.getElementById('biYearOneLabel').hidden=!revenue;document.getElementById('biYearTwoLabel').hidden=!revenue;
      if(efficiency) unit.value='percent';
      unit.disabled=type.value!=='payment';
      document.getElementById('biBaseLabel').hidden=type.value!=='payment'||unit.value!=='percent';
      document.getElementById('biUnitLabel').querySelector('span')?.remove();
      if(efficiency) document.getElementById('biUnitLabel').insertAdjacentHTML('beforeend','<span class="bi-standby-note">Eficiência (%)</span>');
    }
    type.addEventListener('change',()=>{unit.value=(type.value==='payment'||biIsEfficiencyType(type.value))?'percent':'brl';biDraft=[];renderBIDraft();updateType();});
    unit.addEventListener('change',()=>{biDraft=[];renderBIDraft();updateType();});
    document.getElementById('biFile').addEventListener('change',event=>{
      const file=event.target.files[0]; if(!file)return;
      if(biImageUrl)URL.revokeObjectURL(biImageUrl);
      biImageUrl=URL.createObjectURL(file);biSourceName=file.name;
      const img=document.getElementById('biPreview');img.src=biImageUrl;img.hidden=false;
      biDraft=[];renderBIDraft();biStatus('Imagem selecionada. Clique em Ler imagem.');
    });
    document.getElementById('biRead').addEventListener('click',readBIImage);
    document.getElementById('biReset').addEventListener('click',()=>resetBIImport('Importação limpa. Selecione outra imagem ou preencha novos dados. Os registros salvos foram mantidos.'));
    document.getElementById('biManual').addEventListener('click',()=>{
      biDraft=(biIsPaymentType(type.value)?biPayments:biIsDepartmentType(type.value)?biDepartments:['Faturamento']).map(label=>({month:document.getElementById('biMonth').value,label,value:'',completeness:document.getElementById('biCompleteness').value}));renderBIDraft();biStatus('Preencha os valores. Campos vazios não serão convertidos em zero.');
    });
    document.getElementById('biAddRow').addEventListener('click',()=>{readBIDraft();biDraft.push({month:document.getElementById('biMonth').value,label:type.value==='revenue'?'Faturamento':'',value:'',completeness:document.getElementById('biCompleteness').value});renderBIDraft();});
    document.getElementById('biDraftBody').addEventListener('click',e=>{const button=e.target.closest('[data-bi-remove]');if(!button)return;readBIDraft();biDraft.splice(Number(button.dataset.biRemove),1);renderBIDraft();});
    document.getElementById('biSave').addEventListener('click',saveBI);
    document.getElementById('biSaved').addEventListener('click',event=>{const button=event.target.closest('[data-bi-delete-type]');if(button)deleteBIRecord(button.dataset.biMonth,button.dataset.biDeleteType);});
    document.getElementById('biReference').dataset.contextMonth=db.month;
    ['biMode','biPeriod','biReference','biCompareYear','biIncludePartial','biStart','biEnd'].forEach(id=>document.getElementById(id).addEventListener('change',renderBI));
    document.getElementById('biCharts').addEventListener('change',event=>{
      const control=event.target.closest('[data-bi-control]');if(!control)return;
      biViews[control.dataset.biType]||={mode:'years',period:'global',focus:''};
      biViews[control.dataset.biType][control.dataset.biControl]=control.value;renderBI();
    });
    updateType();renderBI();
  }
  function resetBIImport(message='') {
    if(biBusy)return;
    if(biImageUrl)URL.revokeObjectURL(biImageUrl);
    biImageUrl=null;biSourceName='';biDraft=[];
    const preview=document.getElementById('biPreview');preview.hidden=true;preview.removeAttribute('src');
    document.getElementById('biFile').value='';document.getElementById('biBase').value='';
    document.getElementById('biRaw').textContent='';
    const raw=document.getElementById('biRawWrap');raw.hidden=true;raw.open=false;
    renderBIDraft();if(message)biStatus(message);
  }
  function renderBIDraft() {
    document.getElementById('biReview').hidden=!biDraft.length;
    document.getElementById('biDraftBody').innerHTML=biDraft.map((row,index)=>`<tr><td data-label="Mês"><input aria-label="Mês da linha ${index+1}" type="month" data-bi-field="month" value="${esc(row.month)}"></td><td data-label="Categoria"><input aria-label="Categoria da linha ${index+1}" data-bi-field="label" value="${esc(row.label)}" placeholder="Informe a modalidade/categoria"></td><td data-label="Valor"><input aria-label="Valor da linha ${index+1}" data-bi-field="value" inputmode="decimal" value="${esc(row.value)}"></td><td data-label="Fechamento"><select aria-label="Fechamento da linha ${index+1}" data-bi-field="completeness"><option value="closed" ${row.completeness==='closed'?'selected':''}>Fechado</option><option value="partial" ${row.completeness==='partial'?'selected':''}>Parcial</option></select></td><td data-label="Ação"><button class="btn" data-bi-remove="${index}">Remover</button></td></tr>`).join('');
  }
  function readBIDraft(){biDraft=[...document.querySelectorAll('#biDraftBody tr')].map(tr=>Object.fromEntries([...tr.querySelectorAll('[data-bi-field]')].map(input=>[input.dataset.biField,input.value])));}
  let biReaderPromise;
  function loadBIReader() {
    if(window.Tesseract)return Promise.resolve(window.Tesseract);
    if(!biReaderPromise)biReaderPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{script.remove();biReaderPromise=null;reject(new Error('Não foi possível carregar o leitor. Verifique a internet ou use o preenchimento manual.'));};document.head.appendChild(script);
    });return biReaderPromise;
  }
  function biWords(data){return(data.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>(paragraph.lines||[]).flatMap(line=>line.words||[])));}
  function biCategoryName(text,names) {
    const clean=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const key=clean(text);if(!key)return '';
    const exact=names.find(name=>clean(name)===key);if(exact)return exact;
    const contained=names.filter(name=>{const n=clean(name);return n.length>=3&&(key.includes(n)||n.includes(key));});
    if(contained.length===1)return contained[0];
    const prefix=names.filter(name=>key.length>=4&&(clean(name).startsWith(key)||key.startsWith(clean(name))));
    if(prefix.length===1)return prefix[0];
    const tokens=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const tokenMatch=names.filter(name=>{const n=clean(name);return tokens.some(token=>token.length>=3&&n.includes(token));});
    return tokenMatch.length===1?tokenMatch[0]:text.trim();
  }
  function biKnownLabelsFromOCR(text,names){
    const clean=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const source=clean(text);if(!source)return [];
    return names.map(name=>({name,index:source.indexOf(clean(name))})).filter(item=>item.index>=0).sort((a,b)=>a.index-b.index).map(item=>item.name);
  }
  function biExtractDraft(data,width,height,pixels,departmentLabels=[],paymentLabels=[]) {
    const type=document.getElementById('biType').value,unit=document.getElementById('biUnit').value;
    const month=document.getElementById('biMonth').value,completeness=document.getElementById('biCompleteness').value;
    const words=biWords(data),amounts=[];
    words.forEach(word=>{
      const match=String(word.text).match(/(?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2}(?!\d)\s*%?/);
      if(!match||!word.bbox)return;
      const numberText=match[0].replace(/\.(\d{2})(%?\s*)$/,',$1$2');
      const value=biStrictNumber(numberText);if(value===null)return;
      if(unit==='percent' && value>100)return;
      const b=word.bbox; if((b.y0+b.y1)/2>height*.89)return;
      amounts.push({value,x:(b.x0+b.x1)/2,y:b.y1});
    });
    (data.biUncertain||[]).forEach(b=>amounts.push({value:null,x:(b.x0+b.x1)/2,y:b.y1}));
    amounts.sort((a,b)=>a.x-b.x);
    if(type!=='revenue'){
      return amounts.map((a,index)=>{
        let label='';
        if(biIsPaymentType(type)){
          // 1) Prefer labels read from the legend at the right side of the BI image.
          // 2) Fall back to labels immediately below each bar.
          // 3) If the image only exposed the five principal bars and OCR could not read labels,
          //    use the fixed order shown by the corporate BI as a reviewable suggestion.
          if(paymentLabels[index]) label=biCategoryName(paymentLabels[index],biPayments);
          if(!label){
            const left=index?(amounts[index-1].x+a.x)/2:0,right=index<amounts.length-1?(a.x+amounts[index+1].x)/2:width;
            const labelWords=words.filter(w=>/[a-zA-ZÀ-ÿ]/.test(w.text)&&w.bbox&&w.bbox.y0>height*.68&&w.bbox.y0<height*.94&&(w.bbox.x0+w.bbox.x1)/2>=left&&(w.bbox.x0+w.bbox.x1)/2<right).sort((a,b)=>a.bbox.x0-b.bbox.x0);
            label=biCategoryName(labelWords.map(w=>w.text).join(' '),biPayments);
          }
          if(!label && amounts.length<=biPayments.length){
            // Corporate BI keeps these payment bars in a stable left-to-right order.
            // This is only a reviewable fallback when OCR cannot read the x-axis labels.
            label=biPayments[index]||'';
          }
        }else if(departmentLabels.length===amounts.length)label=biCategoryName(departmentLabels[index],biDepartments);
        else if(biIsDepartmentType(type)&&amounts.length===biDepartments.length)label=biDepartments[index]||'';
        return {month,label,value:biNumber(a.value),completeness};
      });
    }
    const monthNames=['jan','fev','mar','abr','maio','jun','jul','ago','set','out','nov','dez'];
    const anchors=words.filter(w=>w.bbox&&w.bbox.y0>height*.65).map(w=>({name:String(w.text).toLowerCase().replace(/[^a-z]/g,''),x:(w.bbox.x0+w.bbox.x1)/2})).map(w=>({...w,index:monthNames.findIndex(n=>w.name===n||w.name===n+'.'||(n==='jun'&&w.name==='junho')||(n==='jul'&&w.name==='julho'))})).filter(w=>w.index>=0);
    if(anchors.length<2)throw new Error('Os meses do gráfico não ficaram legíveis. Use uma imagem mais nítida ou preencha manualmente.');
    const years=[document.getElementById('biYearOne').value,document.getElementById('biYearTwo').value];
    const groups=new Map();
    amounts.forEach(a=>{const closest=[...anchors].sort((b,c)=>Math.abs(b.x-a.x)-Math.abs(c.x-a.x))[0];if(!groups.has(closest.index))groups.set(closest.index,[]);groups.get(closest.index).push(a);});
    const result=[];
    groups.forEach((values,index)=>values.forEach((a,position)=>{
      // Use the actual bar color below the label; all inferred years remain reviewable.
      let blue=0,green=0;
      if(pixels) for(let y=Math.round(a.y+4);y<height*.84;y+=3){
        const x=Math.max(0,Math.min(width-1,Math.round(a.x))),offset=(y*width+x)*4;
        const r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2];
        if(b-r>50&&b-g>30&&b>130)blue++;
        if(g-r>45&&g>140&&b>100&&Math.abs(g-b)<70)green++;
      }
      const year=years[blue+green>3?(green>blue?1:0):Math.min(position,1)];
      const foundMonth=`${year}-${String(index+1).padStart(2,'0')}`;
      result.push({month:foundMonth,label:'Faturamento',value:a.value===null?'':biNumber(a.value),completeness:foundMonth>=monthDefault?'partial':'closed'});
    }));return result.sort((a,b)=>a.month.localeCompare(b.month));
  }
  async function readBIImage() {
    if(biBusy)return;
    if(!biImageUrl){biStatus('Selecione uma imagem do BI primeiro.');return;}
    const frozenBranch=biBranch(); biBusy=true;
    const controls=[...document.querySelectorAll('#biImportPanel input,#biImportPanel select,#biImportPanel button')];
    controls.forEach(control=>control.disabled=true);
    let worker;
    try{
      biStatus('Carregando leitor de imagens…');const reader=await loadBIReader();
      worker=await reader.createWorker('por',1,{logger:message=>{if(message.status==='recognizing text')biStatus(`Lendo imagem: ${Math.round(message.progress*100)}%. Aguarde…`);}});
      await worker.setParameters({tessedit_pageseg_mode:'11'});
      const img=document.getElementById('biPreview');await img.decode();
      const scale=Math.min(2,3600/img.naturalWidth),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const original=ctx.getImageData(0,0,canvas.width,canvas.height),processed=ctx.getImageData(0,0,canvas.width,canvas.height);
      // Light text on dark BI panels becomes dark text on white for OCR.
      for(let i=0;i<processed.data.length;i+=4){const r=processed.data[i],g=processed.data[i+1],b=processed.data[i+2];const white=Math.min(r,g,b)>155&&Math.max(r,g,b)-Math.min(r,g,b)<65;const v=white?0:255;processed.data[i]=processed.data[i+1]=processed.data[i+2]=v;}
      ctx.putImageData(processed,0,0);
      const response=await worker.recognize(canvas,{}, {text:true,blocks:true});
      if(document.getElementById('biType').value==='revenue'){
        const lines=(response.data.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(p=>p.lines||[]));
        const uncertain=lines.filter(line=>/R\$/.test(line.text)&&/\d/.test(line.text)&&line.bbox.x0>canvas.width*.09&&line.bbox.y0<canvas.height*.86&&!/(?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2}(?!\d)/.test(line.text));
        if(uncertain.length){
          biStatus('Conferindo os valores menos legíveis…');
          await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,'});
          for(const line of uncertain){
            const box=line.bbox,left=Math.max(0,box.x0-8),top=Math.max(0,box.y0-6),width=Math.min(canvas.width-left,box.x1-box.x0+16),height=Math.min(canvas.height-top,box.y1-box.y0+12);
            const retry=await worker.recognize(canvas,{rectangle:{left,top,width,height}},{text:true});
            const text=String(retry.data.text||'').trim();
            if(/(?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2}(?!\d)/.test(text)){line.words=[{text,bbox:box}];line.text=text;}
            else {response.data.biUncertain||=[];response.data.biUncertain.push(box);}
          }
          await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''});
        }
      }
      if(frozenBranch!==biBranch())throw new Error('A filial foi alterada durante a leitura. Selecione a filial correta e repita a importação.');
      document.getElementById('biRaw').textContent=response.data.text;document.getElementById('biRawWrap').hidden=false;
      let departmentLabels=[],paymentLabels=[];
      const selectedBIType=document.getElementById('biType').value;
      if(biIsDepartmentType(selectedBIType)){
        biStatus('Lendo os nomes dos departamentos…');
        const top=Math.round(canvas.height*.67),cropHeight=Math.round(canvas.height*.27),size=Math.ceil((canvas.width+cropHeight)/Math.sqrt(2));
        const rotated=document.createElement('canvas');rotated.width=size;rotated.height=size;
        const rc=rotated.getContext('2d');rc.fillStyle='#fff';rc.fillRect(0,0,size,size);rc.translate(size/2,size/2);rc.rotate(Math.PI/4);rc.drawImage(canvas,0,top,canvas.width,cropHeight,-canvas.width/2,-cropHeight/2,canvas.width,cropHeight);
        const labelsResult=await worker.recognize(rotated,{}, {text:true,blocks:true});
        departmentLabels=(labelsResult.data.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(p=>p.lines||[])).sort((a,b)=>a.bbox.y0-b.bbox.y0).map(line=>line.text.trim()).filter(text=>text.replace(/[^a-zA-ZÀ-ÿ]/g,'').length>=3);
      }
      if(biIsPaymentType(selectedBIType)){
        biStatus('Conferindo as modalidades de pagamento…');
        const lines=(response.data.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(p=>p.lines||[]));
        const legendLines=lines.filter(line=>{
          if(!line?.bbox)return false;
          const cx=(line.bbox.x0+line.bbox.x1)/2, cy=(line.bbox.y0+line.bbox.y1)/2;
          const text=String(line.text||'').trim();
          return cx>canvas.width*.58 && cy>canvas.height*.10 && cy<canvas.height*.62 && /[a-zA-ZÀ-ÿ]/.test(text) && !/forma\s*pagamento/i.test(text);
        }).sort((a,b)=>a.bbox.y0-b.bbox.y0);
        paymentLabels=legendLines.map(line=>String(line.text||'').replace(/^[^a-zA-ZÀ-ÿ]+/,'').trim()).filter(text=>text.replace(/[^a-zA-ZÀ-ÿ]/g,'').length>=2);
        // Some BI screenshots do not show a right-side legend; the names are printed below the bars.
        // Reuse any known modalities recognized anywhere in the OCR before falling back to the corporate order.
        const knownInText=biKnownLabelsFromOCR(response.data.text,biPayments);
        if(knownInText.length>paymentLabels.length)paymentLabels=knownInText;
      }
      if(biIsDepartmentType(selectedBIType)){
        const knownDepartments=biKnownLabelsFromOCR(response.data.text,biDepartments);
        if(knownDepartments.length>departmentLabels.length)departmentLabels=knownDepartments;
      }
      biDraft=biExtractDraft(response.data,canvas.width,canvas.height,original.data,departmentLabels,paymentLabels);renderBIDraft();
      const unread=biDraft.filter(row=>!row.label||row.value==='').length;
      biStatus(biDraft.length?`${biDraft.length} linha(s) identificada(s). ${unread?`${unread} linha(s) com campo não reconhecido: preencha os campos vazios usando a imagem. `:''}Confira os nomes, meses, anos, valores e meses parciais antes de salvar.`:'Nenhum valor legível. Tente uma imagem mais nítida ou use o preenchimento manual.');
    }catch(error){biStatus(error.message||'Falha na leitura. Use o preenchimento manual.');}
    finally{if(worker)await worker.terminate().catch(()=>{});biBusy=false;controls.forEach(control=>control.disabled=false);document.getElementById('biUnit').disabled=document.getElementById('biType').value!=='payment';}
  }
  function saveBI() {
    readBIDraft();
    if(!biBranch()){biStatus('Salve a identificação da filial em Configuração antes de importar.');return;}
    const type=document.getElementById('biType').value,unit=document.getElementById('biUnit').value,groups=new Map();
    const baseRaw=document.getElementById('biBase').value.trim(),base=baseRaw?biStrictNumber(baseRaw):null;
    if(type==='payment'&&unit==='percent'&&baseRaw&&(base===null||base<=0)){biStatus('Informe um faturamento base maior que zero ou deixe-o vazio.');return;}
    for(const row of biDraft){
      const value=biStrictNumber(row.value),label=row.label.trim();
      if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.month)||!label||value===null||(unit==='percent'&&value>100)){biStatus('Revise a tabela: mês, categoria e valor válido são obrigatórios em todas as linhas.');return;}
      if(!groups.has(row.month))groups.set(row.month,[]);
      const rows=groups.get(row.month);
      if(rows.some(other=>other.label.toLocaleLowerCase('pt-BR')===label.toLocaleLowerCase('pt-BR'))){biStatus(`Categoria repetida em ${row.month}: ${label}. Corrija o mês, ano ou remova a duplicata.`);return;}
      rows.push({label,value,completeness:row.completeness});
    }
    if(!groups.size){biStatus('Adicione pelo menos uma linha.');return;}
    if(type!=='revenue'){
      const selectedMonth=document.getElementById('biMonth').value;
      const months=[...groups.keys()];
      if(months.length!==1||months[0]!==selectedMonth){
        biStatus(`Para ${biTypes[type]}, registre somente o mês selecionado (${monthLabel(selectedMonth)}). Isso evita que uma imagem seja replicada por engano em outras competências.`);return;
      }
    }
    for(const [month,rows] of groups){
      if(type==='revenue'&&rows.length!==1){biStatus(`Faturamento deve ter uma linha por mês (${month}).`);return;}
      if(new Set(rows.map(row=>row.completeness)).size>1){biStatus(`Use o mesmo fechamento para todas as categorias de ${month}.`);return;}
      const total=rows.reduce((sum,row)=>sum+row.value,0);
      if(type==='payment'&&unit==='percent'&&Math.abs(total-100)>1){biStatus(`Os percentuais de ${month} somam ${biNumber(total)}%. Confira se alguma modalidade pequena ficou fora da leitura. O sistema aceita diferença de até 1 ponto percentual para arredondamentos/leitura.`);return;}
    }
    const duplicates=biRecords().filter(record=>record.branch===biBranch()&&record.type===type&&groups.has(record.month));
    if(duplicates.length&&!confirm(`Substituir ${duplicates.length} registro(s) de ${biTypes[type]} da filial ${db.branch}? Os outros tipos e meses serão mantidos.`))return;
    const previous=clone(biRecords());
    const next=biRecords().filter(record=>!(record.branch===biBranch()&&record.type===type&&groups.has(record.month)));
    groups.forEach((rows,month)=>next.push({branch:biBranch(),month,type,unit,base:unit==='percent'?base:null,completeness:rows[0].completeness,rows:rows.map(({label,value})=>({label,value})),source:biSourceName||'Preenchimento manual',updatedAt:new Date().toISOString()}));
    try{
      vault.biRecords=next;persist(false);
      const stored=JSON.parse(localStorage.getItem(STORE));
      if(JSON.stringify(stored?.biRecords)!==JSON.stringify(next))throw new Error('Gravação não confirmada');
    }catch(error){vault.biRecords=previous;biStatus('Não foi possível salvar os dados. Exporte um backup e verifique o espaço do navegador antes de tentar novamente.');return;}
    resetBIImport(`${groups.size} mês(es) salvo(s) em ${biTypes[type]}. Conferência limpa: pode inserir a próxima imagem. O registro já aparece abaixo e o Compilado foi atualizado.`);renderBI();
  }
  function biPeriodMonths(reference,period){
    const [year,month]=reference.split('-').map(Number);
    let start=month,length=1;
    if(period==='quarter'){start=Math.floor((month-1)/3)*3+1;length=3;}
    if(period==='semester'){start=month<=6?1:7;length=6;}
    if(period==='year'||period==='yoy'){start=1;length=12;}
    return Array.from({length},(_,i)=>`${year}-${String(start+i).padStart(2,'0')}`);
  }
  function biAggregate(records,type){
    const categories=new Map();
    const percentOnly=(type==='payment'||biIsEfficiencyType(type))&&records.some(record=>record.unit==='percent'&&!record.base);
    records.forEach(record=>{
      const total=record.rows.reduce((sum,row)=>sum+row.value,0);
      record.rows.forEach(row=>{
        const key=row.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
        const value=percentOnly ? record.unit==='percent'?row.value:(total?row.value/total*100:0) : record.unit==='percent'?row.value*record.base/100:row.value;
        if(!categories.has(key))categories.set(key,{label:row.label,value:0});categories.get(key).value+=value;
      });
    });
    if(percentOnly&&records.length)categories.forEach(row=>row.value/=records.length);
    return {rows:[...categories.values()].sort((a,b)=>b.value-a.value),percentOnly,total:[...categories.values()].reduce((sum,row)=>sum+row.value,0),months:records.length};
  }
  function biChange(current,previous,percentage=false){
    if(previous===null||current===null)return 'Sem base comparável';
    if(percentage){const difference=current-previous;return `${difference>=0?'+':''}${biNumber(difference)} p.p.`;}
    if(previous===0)return current===0?'Sem variação':'Base anterior zero';
    const difference=(current/previous-1)*100;return `${difference>=0?'+':''}${biNumber(difference)}%`;
  }
  const biViews={};
  const biKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
  const biShortMonth=month=>new Date(`${month}-15T12:00:00`).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
  const biSigned=value=>`${value>=0?'+':''}${biNumber(value)}`;
  const biTone=value=>value===null?'neutral':value>0?'up':value<0?'down':'neutral';
  function biGrowth(current,base) {return current===null||base===null||base===0?null:(current/base-1)*100;}
  function biRange(reference,period,start='',end='') {
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(reference))return [];
    if(period==='last3'||period==='last6')return Array.from({length:period==='last3'?3:6},(_,i)=>relativeMonth(reference,i-(period==='last3'?2:5)));
    if(period==='custom'){
      if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(start)||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(end)||end<start)return [];
      const count=(Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5))-Number(start.slice(5))+1;
      if(count>24)return [];
      return Array.from({length:count},(_,i)=>relativeMonth(start,i));
    }
    return biPeriodMonths(reference,period);
  }
  function biPoint(record,focus,type) {
    if(!record||!Array.isArray(record.rows))return null;
    const total=record.rows.reduce((sum,row)=>sum+Number(row.value||0),0);
    const row=type==='revenue'?{value:total}:record.rows.find(row=>biKey(row.label)===focus);
    if(!row)return null; // An absent category is not a zero result.
    const value=Number(row.value),percent=record.unit==='percent';
    if(biIsEfficiencyType(type)) return {month:record.month,money:null,totalMoney:null,share:value,partial:record.completeness!=='closed'};
    const money=percent?(Number(record.base)>0?value*Number(record.base)/100:null):value;
    const totalMoney=percent?(Number(record.base)>0?Number(record.base):null):total;
    return {month:record.month,money,totalMoney,share:percent?value:total>0?value/total*100:null,partial:record.completeness!=='closed'};
  }
  function biSummary(points,simple=false) {
    points=points.filter(Boolean);
    const hasMoney=points.length>0&&points.every(point=>point.money!==null&&point.totalMoney!==null);
    const money=hasMoney?points.reduce((sum,p)=>sum+p.money,0):null;
    const total=hasMoney?points.reduce((sum,p)=>sum+p.totalMoney,0):null;
    const shares=points.filter(p=>p.share!==null);
    const share=!shares.length?null:hasMoney&&!simple&&total>0?money/total*100:shares.reduce((sum,p)=>sum+p.share,0)/shares.length;
    return {money,share,count:points.length,simple:!hasMoney||simple,partial:points.some(p=>p.partial)};
  }
  function biComparison(current,base,type) {
    const simple=current.concat(base).filter(Boolean).some(p=>p.money===null||p.totalMoney===null);
    const a=biSummary(current,simple),b=biSummary(base,simple);
    const growth=biGrowth(a.money,b.money);
    const shareChange=a.share===null||b.share===null?null:a.share-b.share;
    return {a,b,growth,shareChange,relativeShare:biGrowth(a.share,b.share),
      primary:(type==='payment'||biIsEfficiencyType(type))?shareChange:growth,unit:(type==='payment'||biIsEfficiencyType(type))?'p.p.':'%',
      comparable:a.count>0&&b.count>0,partial:a.partial||b.partial};
  }
  function biAnalysis(records,months,mode,offset,focus,type) {
    const find=month=>records.find(record=>record.month===month);
    const current=months.map(month=>biPoint(find(month),focus,type));
    const base=months.map((month,index)=>mode==='years'?biPoint(find(relativeMonth(month,-offset*12)),focus,type):index?current[index-1]:null);
    const pairs=current.map((point,index)=>point&&base[index]?{point,base:base[index],month:months[index]}:null).filter(Boolean);
    const present=current.filter(Boolean);
    const comparison=mode==='years'?biComparison(pairs.map(p=>p.point),pairs.map(p=>p.base),type):biComparison(present.length>1?[present.at(-1)]:[],present.length>1?[present[0]]:[],type);
    const changes=months.map((month,index)=>{
      const a=current[index],b=base[index];
      if(!a||!b)return {month,value:null};
      const compare=biComparison([a],[b],type);return {month,value:compare.primary,comparison:compare};
    });
    const ranked=changes.filter(row=>row.value!==null).sort((a,b)=>b.value-a.value);
    return {months,current,base,pairs,present,comparison,changes,best:ranked[0]||null,worst:ranked.at(-1)||null};
  }
  function biProjection(points,type) {
    const present=points.filter(Boolean);if(present.length<3||present.at(-1).partial)return null;
    const last=present.at(-1),tail=[];
    for(let i=present.length-1;i>=0&&tail.length<6;i--){
      const point=present[i];
      if(point.partial||tail.length&&relativeMonth(point.month,1)!==tail[0].month)break;
      const value=type==='revenue'?point.money:point.share;if(value===null)break;
      tail.unshift({...point,value});
    }
    if(tail.length<3)return null;
    const n=tail.length,meanX=(n-1)/2,meanY=tail.reduce((sum,p)=>sum+p.value,0)/n;
    const denominator=tail.reduce((sum,p,i)=>sum+(i-meanX)**2,0);
    const slope=tail.reduce((sum,p,i)=>sum+(i-meanX)*(p.value-meanY),0)/denominator;
    const raw=meanY+slope*(n-meanX),value=Math.max(0,type==='revenue'?raw:Math.min(100,raw));
    return {month:relativeMonth(last.month,1),value,from:tail.at(-1),count:n};
  }
  function biLineChart(analysis,type,mode,projection) {
    const months=[...analysis.months];
    if(projection&&!months.includes(projection.month))months.push(projection.month);
    const value=point=>point?(type==='revenue'?point.money:point.share):null;
    const a=months.map(month=>value(analysis.current.find(p=>p?.month===month)));
    const b=months.map((month,i)=>mode==='years'?value(analysis.base[i]):null);
    const max=type==='revenue'?Math.max(1,...a.concat(b).filter(v=>v!==null),projection?.value||0)*1.12:100;
    const width=Math.max(640,months.length*72),height=300,left=76,right=25,top=30,bottom=48;
    const x=i=>left+i*(width-left-right)/Math.max(1,months.length-1),y=v=>height-bottom-v/max*(height-top-bottom);
    const moneyAxis=v=>v>=1000000?`${biNumber(v/1000000)} mi`:v>=1000?`${biNumber(v/1000)} mil`:biNumber(v);
    const format=v=>type==='revenue'?brl.format(v):`${biNumber(v)}%`;
    const paths=(values,color)=>{
      let parts=[],points=[];const finish=()=>{if(points.length)parts.push(`<polyline fill="none" stroke="${color}" stroke-width="3" points="${points.join(' ')}"/>`);points=[];};
      values.forEach((v,i)=>{if(v===null){finish();return;}points.push(`${x(i)},${y(v)}`);});finish();
      values.forEach((v,i)=>{if(v!==null)parts.push(`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${color}"><title>${esc(biShortMonth(months[i]))}: ${esc(format(v))}</title></circle>`);});return parts.join('');
    };
    let svg=`<svg role="img" aria-label="Evolução mensal ${type==='revenue'?'do faturamento':biIsEfficiencyType(type)?'da eficiência percentual':'da participação percentual'}" viewBox="0 0 ${width} ${height}" style="min-width:${width}px"><title>Evolução mensal. Valores ausentes interrompem a linha.</title>`;
    for(let i=0;i<=4;i++){const v=max*i/4;svg+=`<line x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}" stroke="#dde6f1"/><text x="${left-10}" y="${y(v)+4}" text-anchor="end">${type==='revenue'?moneyAxis(v):`${Math.round(v)}%`}</text>`;}
    months.forEach((month,i)=>svg+=`<text x="${x(i)}" y="${height-17}" text-anchor="middle">${esc(biShortMonth(month))}</text>`);
    svg+=paths(b,'#8696b6')+paths(a,'#1675dc');
    if(projection){const i=months.indexOf(projection.from.month),j=months.indexOf(projection.month);if(i>=0&&j>=0)svg+=`<line x1="${x(i)}" y1="${y(projection.from.value)}" x2="${x(j)}" y2="${y(projection.value)}" stroke="#b06b00" stroke-width="3" stroke-dasharray="7 6"/><circle cx="${x(j)}" cy="${y(projection.value)}" r="5" fill="#b06b00"><title>Estimativa: ${esc(format(projection.value))}</title></circle>`;}
    return `<div class="bi-line-scroll">${svg}</svg></div>`;
  }
  function biBars(analysis,type,mode) {
    const value=point=>point?(type==='revenue'?point.money:point.share):null;
    const max=type==='revenue'?Math.max(1,...analysis.current.concat(analysis.base).map(value).filter(v=>v!==null)):100;
    return `<div class="bi-bars-scroll"><div class="bi-paired-bars" style="grid-template-columns:repeat(${analysis.months.length},minmax(120px,1fr))">${analysis.months.map((month,index)=>{
      const change=analysis.changes[index],a=analysis.current[index],b=analysis.base[index];
      return `<article class="bi-bar-month"><strong>${esc(biShortMonth(month))}</strong><b class="bi-change ${biTone(change.value)}">${change.value===null?'Sem comparação':`${biSigned(change.value)} ${(type==='payment'||biIsEfficiencyType(type))?'p.p.':'%'}`}</b><div class="bi-pair">${[b,a].map((point,j)=>{const v=value(point);return `<div class="bi-column"><div class="bi-column-track"><span class="${j?'current':'base'}" style="height:${v===null?0:Math.max(0,v/max*100)}%"></span></div><strong>${v===null?'—':type==='revenue'?brl.format(v):`${biNumber(v)}%`}</strong><small>${point?esc(biShortMonth(point.month))+(point.partial?' · parcial':''):'Sem dados'}</small>${type!=='revenue'&&point?.money!==null&&point?`<small>${brl.format(point.money)}</small>`:''}</div>`;}).join('')}</div></article>`;
    }).join('')}</div></div>`;
  }
  function biCategoryCards(records,months,mode,offset,type,categories) {
    return `<div class="bi-share-cards">${categories.map(category=>{
      const data=biAnalysis(records,months,mode,offset,category.key,type),snapshot=biSummary(data.current),c=data.comparison;
      const change=c.primary;
      return `<article class="bi-share-card"><h5>${esc(category.label)}</h5><div class="bi-share-value">${snapshot.share===null?'—':`${biNumber(snapshot.share)}%`}</div><span class="bi-muted">${biIsEfficiencyType(type)?'Eficiência média no período':snapshot.simple?'Participação média mensal':'Participação no total do período'}</span><small>${biIsEfficiencyType(type)?`${snapshot.count} competência(s) com dado`:snapshot.money===null?'Valor em reais sem base informada':`${brl.format(snapshot.money)} · média/mês: ${brl.format(snapshot.money/Math.max(1,snapshot.count))}`}</small><div class="bi-category-change ${biTone(change)}"><strong>${change===null?'Sem base comparável':`${biSigned(change)} ${c.unit}`}</strong><span>${(type==='payment'||biIsEfficiencyType(type))?'Variação em pontos percentuais':'Crescimento das vendas'}</span></div>${type==='department'?`<small>Participação: ${c.shareChange===null?'sem comparação':`${biSigned(c.shareChange)} p.p.`}</small>`:''}<small>${mode==='years'?`${data.pairs.length} mês(es) comparável(is)`:'Primeiro × último mês com dados'}${c.partial?' · provisório':''}</small>${data.best?`<small>Melhor variação: ${esc(biShortMonth(data.best.month))} · ${biSigned(data.best.value)} ${c.unit}</small>`:''}</article>`;
    }).join('')}</div>`;
  }
  function biAllCategoryRows(records,months,mode,offset,type,categories) {
    return categories.map(category=>{
      const data=biAnalysis(records,months,mode,offset,category.key,type);
      const snapshot=biSummary(data.current);
      const projection=biProjection(data.current,type);
      return {category,data,snapshot,projection,comparison:data.comparison};
    }).filter(item=>item.snapshot.count>0)
      .sort((a,b)=>(b.snapshot.share??-1)-(a.snapshot.share??-1));
  }
  function biAllCategoriesOverview(records,months,view,settings,type,categories) {
    const rows=biAllCategoryRows(records,months,view.mode,settings.offset,type,categories);
    const currentMonthCount=new Set(records.filter(r=>months.includes(r.month)).map(r=>r.month)).size;
    const leader=rows[0];
    const moneyRows=rows.filter(row=>row.snapshot.money!==null);
    const totalMoney=moneyRows.length?moneyRows.reduce((sum,row)=>sum+row.snapshot.money,0):null;
    const projections=rows.filter(row=>row.projection).slice(0,5);
    const labelAll=biIsDepartmentType(type)?'Todos os departamentos':'Todas as modalidades';
    const itemName=biIsDepartmentType(type)?'departamento(s)':'modalidade(s)';
    const maxShare=Math.max(1,...rows.map(row=>row.snapshot.share||0));
    const summary=`<div class="bi-kpis bi-kpis-compact">
      <div class="bi-kpi neutral"><span>Visão consolidada</span><strong>${rows.length}</strong><small>${itemName} com dados no período</small></div>
      <div class="bi-kpi neutral"><span>Competências válidas</span><strong>${currentMonthCount}/${months.length}</strong><small>Meses realmente importados nesta seção</small></div>
      <div class="bi-kpi neutral"><span>${biIsEfficiencyType(type)?'Maior eficiência':'Maior participação'}</span><strong>${leader?.snapshot.share===null||!leader?'Sem dados':`${biNumber(leader.snapshot.share)}%`}</strong><small>${leader?esc(leader.category.label):'Nenhuma categoria disponível'}</small></div>
      <div class="bi-kpi neutral"><span>${biIsEfficiencyType(type)?'Leitura':'Valor consolidado'}</span><strong>${biIsEfficiencyType(type)?'Percentual':totalMoney===null?'Sem base em R$':brl.format(totalMoney)}</strong><small>${biIsEfficiencyType(type)?'Eficiência por competência':type==='payment'?'Somente quando a base monetária está informada':'Soma dos departamentos com dados'}</small></div>
    </div>`;
    if(!rows.length)return `<p class="bi-empty-state"><strong>Nenhum dado importado para o período selecionado.</strong><span>Importe os dados desta seção para a competência correta; meses ausentes não são preenchidos automaticamente.</span></p>`;
    const ranking=`<div class="bi-all-ranking">${rows.map((row,index)=>{
      const share=row.snapshot.share;
      const change=row.comparison.primary;
      return `<article class="bi-all-row"><div class="bi-all-rank">${index+1}</div><div class="bi-all-main"><div class="bi-all-name"><strong>${esc(row.category.label)}</strong><span>${share===null?'—':`${biNumber(share)}%`}</span></div><div class="bi-all-track"><span style="width:${share===null?0:Math.max(2,share/maxShare*100)}%"></span></div><div class="bi-all-meta"><span>${row.snapshot.money===null?'Sem base em R$':brl.format(row.snapshot.money)}</span><span class="${biTone(change)}">${change===null?'Sem comparação':`${biSigned(change)} ${row.comparison.unit}`}</span></div></div></article>`;
    }).join('')}</div>`;
    const projectionBlock=projections.length?`<details class="bi-projection-summary"><summary>Projeções futuras com base no histórico (${projections.length})</summary><div class="bi-projection-grid">${projections.map(row=>`<div><strong>${esc(row.category.label)}</strong><span>${esc(monthLabel(row.projection.month))}</span><b>${(type==='payment'||biIsEfficiencyType(type))?`${biNumber(row.projection.value)}%`:row.snapshot.money===null?`${biNumber(row.projection.value)}%`:type==='department'?`${biNumber(row.projection.value)}%`:brl.format(row.projection.value)}</b><small>Estimativa linear com ${row.projection.count} meses fechados e consecutivos.</small></div>`).join('')}</div></details>`:'';
    return `${summary}<div class="bi-chart-heading bi-heading-compact"><h4>${labelAll}</h4><span>Ranking consolidado do período</span></div>${ranking}${projectionBlock}<details class="bi-method-toggle"><summary>Como esta visão é calculada</summary><p>O ranking usa somente competências que possuem dados realmente importados para esta seção. Meses sem importação não são considerados como zero. Comparações seguem o tipo de análise selecionado e projeções só aparecem quando existem pelo menos 3 meses fechados e consecutivos.</p></details>`;
  }
  function biSection(type,title,records,settings) {
    const view=biViews[type]||{focus:''};
    const mode=settings.mode;
    const months=biRange(settings.reference,settings.period,settings.start,settings.end);
    const relevant=records.filter(r=>months.includes(r.month)||months.some(m=>relativeMonth(m,-settings.offset*12)===r.month));
    const categories=[];
    relevant.forEach(r=>r.rows.forEach(row=>{const key=biKey(row.label);if(!categories.some(c=>c.key===key))categories.push({key,label:row.label});}));
    const currentRecords=records.filter(r=>months.includes(r.month));
    categories.sort((a,b)=>(biSummary(currentRecords.map(r=>biPoint(r,b.key,type))).share||0)-(biSummary(currentRecords.map(r=>biPoint(r,a.key,type))).share||0));
    const requested=view.focus||'__all__';
    const focus=type==='revenue'?'':requested==='__all__'?'__all__':categories.some(c=>c.key===requested)?requested:'__all__';
    const focusName=type==='revenue'?'Faturamento':focus==='__all__'?(biIsDepartmentType(type)?'Todos os departamentos':'Todas as modalidades'):categories.find(c=>c.key===focus)?.label||'Categoria';
    const select=(key,label,options,current)=>`<label>${label}<select id="bi-${type}-${key}" data-bi-type="${type}" data-bi-control="${key}">${options.map(([value,text])=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
    const focusOptions=biIsDepartmentType(type)?[['__all__','Todos os departamentos'],...categories.map(c=>[c.key,c.label])]:biIsPaymentType(type)?[['__all__','Todas as modalidades'],...categories.map(c=>[c.key,c.label])]:[];
    const controls=type==='revenue'?'':`<div class="bi-section-controls bi-focus-only">${select('focus',biIsDepartmentType(type)?'Departamento nos gráficos':'Modalidade nos gráficos',focusOptions,focus)}</div>`;
    const syncedCount=type==='revenue'?records.filter(record=>record.syncedDaily&&months.includes(record.month)).length:0;
    const icon=type==='revenue'?'💰':type==='department'?'▦':type==='payment'?'💳':type==='serviceEfficiencyDepartment'?'⚡':'📈';
    const subtitle=type==='revenue'?'Resultado mensal vindo do lançamento diário':type==='department'?'Participação real por departamento, somente quando importada':type==='payment'?'Distribuição por modalidade de pagamento, somente quando importada':type==='serviceEfficiencyDepartment'?'Eficiência de serviços por departamento · preparado para futuras importações':'Eficiência de serviços por modalidade de pagamento · preparado para futuras importações';
    const header=`<section class="bi-chart-section bi-v27 bi-kind-${type}" id="bi-section-${type}"><div class="bi-section-head"><div class="bi-section-title-wrap"><span class="bi-section-icon">${icon}</span><div><h3>${esc(title)}</h3><small>${esc(subtitle)}</small></div></div>${type==='revenue'?`<span class="bi-sync-badge">↻ ${syncedCount}/${months.length} sincronizado(s)</span>`:''}</div>${controls}`;
    if(!months.length)return header+'<p class="bi-empty-state"><strong>Período inválido.</strong><span>Escolha um intervalo de até 24 meses.</span></p></section>';
    if(mode==='years'&&(!Number.isInteger(settings.compare)||settings.compare<2000||settings.compare>2099||settings.offset===0))return header+'<p class="bi-empty-state"><strong>Comparação indisponível.</strong><span>Escolha um ano diferente do ano de referência ou alterne para evolução mensal.</span></p></section>';
    if(type!=='revenue'&&focus==='__all__'){
      return header+`<p class="bi-coverage"><strong>${esc(focusName)}</strong> · ${esc(monthLabel(months[0]))} a ${esc(monthLabel(months.at(-1)))}.</p>`+biAllCategoriesOverview(records,months,{...view,mode},settings,type,categories)+'</section>';
    }
    const analysis=biAnalysis(records,months,mode,settings.offset,focus,type),c=analysis.comparison;
    const projection=biProjection(analysis.current,type);
    const snapshot=biSummary(analysis.current);
    const metric=(label,value,note,tone='neutral')=>`<div class="bi-kpi ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
    const compareDates=mode==='years'?`${monthLabel(relativeMonth(months[0],-settings.offset*12))} a ${monthLabel(relativeMonth(months.at(-1),-settings.offset*12))}`:analysis.present.length>1?`${biShortMonth(analysis.present[0].month)} → ${biShortMonth(analysis.present.at(-1).month)}`:'É necessário mais de um mês com dados';
    const mainLabel=(type==='payment'||biIsEfficiencyType(type))?'Variação em pontos percentuais':'Crescimento das vendas';
    const main=c.primary===null?c.a.count&&c.b.count&&type!=='payment'&&c.b.money===0?'Base anterior zero':'Sem base comparável':`${biSigned(c.primary)} ${c.unit}`;
    let html=header+`<p class="bi-coverage"><strong>${esc(focusName)}</strong> · ${esc(monthLabel(months[0]))} a ${esc(monthLabel(months.at(-1)))} · ${analysis.present.length}/${months.length} mês(es) com dados${mode==='years'?` · ${analysis.pairs.length} mês(es) em comum`:''}.</p>`;
    if(analysis.present.some(p=>p.partial)||c.partial)html+='<p class="bi-partial">Comparação provisória: inclui mês parcial.</p>';
    html+=`<div class="bi-kpis">${metric(mainLabel,main,mode==='years'?`Mesmo período: ${compareDates}`:`Primeiro × último: ${compareDates}`,biTone(c.primary))}${metric(type==='revenue'?'Faturamento no período':'Participação no período',type==='revenue'?snapshot.money===null?'Sem dados':brl.format(snapshot.money):snapshot.share===null?'Sem dados':`${biNumber(snapshot.share)}%`,type==='revenue'?snapshot.count?`Média/mês: ${brl.format(snapshot.money/snapshot.count)}`:'Meses ausentes não valem zero':snapshot.money===null?'Sem base monetária':`${brl.format(snapshot.money)} em vendas`)}${metric('Melhor variação mensal',analysis.best?`${biSigned(analysis.best.value)} ${c.unit}`:'Sem comparação',analysis.best?biShortMonth(analysis.best.month):'Sem mês comparável',biTone(analysis.best?.value??null))}${metric('Menor variação mensal',analysis.worst?`${biSigned(analysis.worst.value)} ${c.unit}`:'Sem comparação',analysis.worst?biShortMonth(analysis.worst.month):'Sem mês comparável',biTone(analysis.worst?.value??null))}</div>`;
    const currentName=mode==='years'?'Período analisado':'Mês analisado',baseName=mode==='years'?'Mesmo mês do ano comparado':'Mês imediatamente anterior';
    html+=`<div class="bi-chart-heading"><h4>Comparativo mensal · ${esc(focusName)}</h4><span>${type==='revenue'?'Valores em reais':'Participação em %'}</span></div><div class="bi-legend"><span class="bi-blue">■ ${currentName}</span><span class="bi-base-label">■ ${baseName}</span></div>${biBars(analysis,type,mode)}`;
    html+=`<div class="bi-chart-heading"><h4>Evolução e projeção · ${esc(focusName)}</h4><span>${type==='revenue'?'Faturamento (R$)':biIsEfficiencyType(type)?'Eficiência (%)':'Participação (%)'}</span></div>${biLineChart(analysis,type,mode,projection)}<p class="bi-projection-note">${projection?`Estimativa para ${esc(monthLabel(projection.month))}: <strong>${type==='revenue'?brl.format(projection.value):`${biNumber(projection.value)}%`}</strong> · baseada em ${projection.count} meses fechados e consecutivos.`:'Projeção indisponível: são necessários pelo menos 3 meses fechados e consecutivos com dados desta mesma categoria.'}</p>`;
    if(type!=='revenue')html+=`<div class="bi-chart-heading"><h4>${biIsEfficiencyType(type)?(biIsDepartmentType(type)?'Eficiência de serviços por departamento':'Eficiência de serviços por modalidade de pagamento'):type==='department'?'Participação e crescimento por departamento':'Participação e evolução por pagamento'}</h4><span>Resumo de todas as categorias</span></div>${biCategoryCards(records,months,mode,settings.offset,type,categories)}`;
    const dataRows=months.map((month,index)=>{const a=analysis.current[index],b=analysis.base[index],change=analysis.changes[index];const val=p=>!p?'Sem dados':type==='revenue'?brl.format(p.money):`${p.share===null?'—':`${biNumber(p.share)}%`}${p.money===null?'':` · ${brl.format(p.money)}`}`;return `<tr><td>${esc(biShortMonth(month))}</td><td>${esc(val(a))}${a?.partial?' · parcial':''}</td><td>${esc(val(b))}${b?.partial?' · parcial':''}</td><td>${change.value===null?'Sem base comparável':`${biSigned(change.value)} ${c.unit}`}</td></tr>`;}).join('');
    html+=`<details class="bi-data-details"><summary>Conferir números mês a mês</summary><div class="bi-review-scroll"><table><thead><tr><th>Mês</th><th>Analisado</th><th>Comparação</th><th>Variação</th></tr></thead><tbody>${dataRows}</tbody></table></div></details>`;
    html+=`<details class="bi-method-toggle"><summary>Como esta análise é calculada</summary><p>${mode==='years'?'O crescimento considera somente meses em comum com a categoria informada nos dois anos.':'A evolução compara meses com dados reais e não preenche lacunas.'} ${snapshot.simple&&type!=='revenue'?'Sem base monetária completa, a participação usa média simples dos percentuais mensais.':'A participação consolidada é ponderada pelos totais realmente informados.'} Categoria ausente não é tratada como zero.</p></details></section>`;
    return html;
  }
  function renderBI() {
    if(!document.getElementById('biCharts'))return;
    const referenceInput=document.getElementById('biReference'),compareInput=document.getElementById('biCompareYear');
    if(referenceInput.dataset.contextMonth!==db.month){
      referenceInput.value=db.month;referenceInput.dataset.contextMonth=db.month;
      compareInput.value=String(Number(db.month.slice(0,4))-1);
      document.getElementById('biStart').value=relativeMonth(db.month,-2);document.getElementById('biEnd').value=db.month;
      const importMonth=document.getElementById('biMonth');if(importMonth)importMonth.value=db.month;
    }
    const reference=referenceInput.value||db.month,period=document.getElementById('biPeriod').value,mode=document.getElementById('biMode').value;
    const compare=Number(compareInput.value),year=Number(reference.slice(0,4));
    const settings={reference,period,mode,compare,offset:year-compare,start:document.getElementById('biStart').value,end:document.getElementById('biEnd').value};
    const custom=period==='custom';
    const compareYears=mode==='years';
    // O filtro mestre deve mostrar somente os campos necessários ao contexto atual.
    // Períodos prontos usam o mês de referência; início/fim só aparecem no Personalizado.
    document.getElementById('biStartLabel').hidden=!custom;
    document.getElementById('biEndLabel').hidden=!custom;
    document.getElementById('biReferenceLabel').hidden=custom;
    document.getElementById('biCompareYearLabel').hidden=!compareYears;
    const partialLabel=document.getElementById('biPartialLabel');
    if(partialLabel) partialLabel.hidden=false;
    const includePartial=document.getElementById('biIncludePartial').checked;
    const integrity=biImportedIntegrity();
    const imported=integrity.records;
    const synced=biDailyRevenueRecords();
    const merged=biMergedRecords();
    const records=merged.filter(record=>includePartial||record.completeness==='closed');
    const excluded=merged.length-records.length;
    const syncMonths=synced.length;
    document.getElementById('biPeriodNote').textContent=`Filtro central aplicado a todo o BI · ${mode==='years'?'comparação com '+compare:'evolução mês a mês'} · ${includePartial?'inclui meses parciais':'somente meses fechados'}. Cada seção mantém seus próprios dados, mas todas obedecem ao mesmo período.`;
    const health=document.getElementById('biDataHealth');
    if(health){
      const dep=imported.filter(r=>r.type==='department'&&!integrity.quarantined.has(r)).length;
      const pay=imported.filter(r=>r.type==='payment'&&!integrity.quarantined.has(r)).length;
      const effDep=imported.filter(r=>r.type==='serviceEfficiencyDepartment'&&!integrity.quarantined.has(r)).length;
      const effPay=imported.filter(r=>r.type==='serviceEfficiencyPayment'&&!integrity.quarantined.has(r)).length;
      const quarantine=integrity.quarantined.size;
      health.innerHTML=`<div class="bi-health-card ok"><span>↻</span><div><strong>${syncMonths}</strong><small>competência(s) com faturamento sincronizado</small></div></div><div class="bi-health-card"><span>▦</span><div><strong>${dep}</strong><small>mês(es) com departamentos importados</small></div></div><div class="bi-health-card"><span>💳</span><div><strong>${pay}</strong><small>mês(es) com pagamentos importados</small></div></div><div class="bi-health-card"><span>⚡</span><div><strong>${effDep}</strong><small>mês(es) com eficiência por departamento</small></div></div><div class="bi-health-card"><span>📈</span><div><strong>${effPay}</strong><small>mês(es) com eficiência por modalidade</small></div></div><div class="bi-health-card ${quarantine?'warn':''}"><span>${quarantine?'⚠':'✓'}</span><div><strong>${quarantine}</strong><small>${quarantine?'registro(s) repetido(s) isolado(s) da análise':'nenhuma inconsistência automática detectada'}</small></div></div>`;
    }
    document.getElementById('biCharts').innerHTML=[
      biSection('revenue',biTypes.revenue,records.filter(record=>record.type==='revenue'),settings),
      biSection('department',biTypes.department,records.filter(record=>record.type==='department'),settings),
      biSection('payment',biTypes.payment,records.filter(record=>record.type==='payment'),settings),
      `<div class="bi-service-group-title"><div><span>⚡ SERVIÇOS</span><h3>Eficiência de serviços</h3><p>Estrutura pronta para futuras importações, mantendo os dados separados por departamento e modalidade de pagamento.</p></div><span class="bi-standby-badge">STANDBY · FUNCIONAL</span></div>`,
      biSection('serviceEfficiencyDepartment',biTypes.serviceEfficiencyDepartment,records.filter(record=>record.type==='serviceEfficiencyDepartment'),settings),
      biSection('serviceEfficiencyPayment',biTypes.serviceEfficiencyPayment,records.filter(record=>record.type==='serviceEfficiencyPayment'),settings)
    ].join('');

    const months=[...new Set(imported.map(record=>record.month).concat(synced.map(record=>record.month)))].sort((a,b)=>b.localeCompare(a));
    const saved=months.map(month=>{
      const items=imported.filter(record=>record.month===month).sort((a,b)=>String(a.type).localeCompare(String(b.type)));
      const daily=synced.find(record=>record.month===month);
      const rows=[];
      if(daily)rows.push(`<div class="bi-saved-row is-synced"><span><b>Faturamento mensal</b><small>↻ Sincronizado automaticamente com o lançamento diário · protegido nesta área</small></span><strong>${brl.format(daily.rows[0]?.value||0)}</strong></div>`);
      const importedRevenue=items.find(record=>record.type==='revenue');
      if(importedRevenue&&!daily)rows.push(`<div class="bi-saved-row is-overridden"><span><b>Faturamento mensal</b><small>Registro histórico importado · ${importedRevenue.completeness==='partial'?'Parcial':'Fechado'} · ${esc(importedRevenue.source||'Importação')}</small></span><strong>${new Date(importedRevenue.updatedAt).toLocaleDateString('pt-BR')}</strong></div>`);
      biImportedTypes.forEach(type=>{
        const record=items.find(item=>item.type===type);
        if(record){
          const suspect=integrity.quarantined.has(record);
          rows.push(`<div class="bi-saved-row ${suspect?'is-quarantined':''}"><span><b>${esc(biTypes[type])}${suspect?' · Revisar':''}</b><small>${record.rows.length} categoria(s) · ${record.completeness==='partial'?'Parcial':'Fechado'} · ${esc(record.source||'Importação')} · atualizado em ${new Date(record.updatedAt).toLocaleDateString('pt-BR')}${suspect?' · cópia idêntica detectada em outra competência; fora das análises até ser corrigida':''}</small></span><div class="bi-saved-actions"><button type="button" class="btn danger small" data-bi-delete-type="${esc(type)}" data-bi-month="${esc(month)}">Excluir ${esc(biImportLabel(type))}</button></div></div>`);
        }else{
          rows.push(`<div class="bi-saved-row is-empty"><span><b>${esc(biTypes[type])}</b><small>Nenhum dado importado para este mês.</small></span><strong>—</strong></div>`);
        }
      });
      const importedCount=items.filter(record=>biImportedTypes.includes(record.type)).length;
      const totalFilled=(daily||importedRevenue?1:0)+importedCount;
      const status=`${totalFilled}/5 indicador(es) disponível(is)`;
      const chip=(label,state)=>`<span class="bi-status-chip ${state}"><span class="dot">${state==='done'?'✓':state==='review'?'!':'—'}</span>${esc(label)}</span>`;
      const chips=[
        chip('Faturamento',(daily||importedRevenue)?'done':'empty'),
        ...biImportedTypes.map(type=>{const record=items.find(item=>item.type===type);return chip(type==='department'?'Departamentos':type==='payment'?'Pagamentos':type==='serviceEfficiencyDepartment'?'Ef. depto':'Ef. modalidade',record?(integrity.quarantined.has(record)?'review':'done'):'empty');})
      ].join('');
      return `<article class="bi-saved-month"><header><button type="button" class="bi-saved-month-toggle" aria-expanded="false"><span class="bi-saved-month-headline"><span class="bi-saved-month-title"><strong>${esc(monthLabel(month))}</strong><small>${status}</small></span><span class="bi-saved-statuses">${chips}</span><span class="bi-saved-chevron" aria-hidden="true">⌄</span></span></button></header><div class="bi-saved-month-body">${rows.join('')}</div></article>`;
    }).join('');
    const savedRoot=document.getElementById('biSaved');
    savedRoot.innerHTML=`<div class="bi-saved-title"><div><h3>Registros do BI · ${esc(db.branch||'filial não informada')}</h3><p>Gerencie separadamente os dados importados de departamentos, formas de pagamento e eficiências de serviços. O faturamento sincronizado com os lançamentos diários não é apagado aqui.</p></div></div>${months.length?`<div class="bi-saved-list">${saved}</div>`:'<p>Nenhum registro de BI ou faturamento diário disponível para esta filial.</p>'}`;
    savedRoot.querySelectorAll('.bi-saved-month-toggle').forEach(button=>{
      button.addEventListener('click',()=>{
        const card=button.closest('.bi-saved-month');
        const open=card.classList.toggle('is-open');
        button.setAttribute('aria-expanded',String(open));
      });
    });
  }

  function applyV56TabletPolish() {
    if (document.getElementById('fs-v56-tablet-polish')) return;
    const st = document.createElement('style');
    st.id = 'fs-v56-tablet-polish';
    st.textContent = `
      .seller-card-rank{display:none!important}
      .seller-directory-card .seller-card-head{gap:10px!important}
      #overview .overview-kpi-organized{display:flex!important;flex-direction:column!important;gap:12px!important;margin:16px 0!important}
      .overview-kpi-group,.week-indicator-group,.seller-week-indicator-group,.monthly-gap-group{border:1px solid #e0e8f1;border-radius:18px;background:#fff;padding:12px}
      .overview-kpi-group>header,.week-indicator-group>header,.seller-week-indicator-group>header,.monthly-gap-group>header{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}
      .overview-kpi-group>header strong,.week-indicator-group>header strong,.seller-week-indicator-group>header strong,.monthly-gap-group>header strong{font-size:14px;color:#17324d}
      .overview-kpi-group>header small,.week-indicator-group>header small,.seller-week-indicator-group>header small,.monthly-gap-group>header small{font-size:11px;color:#7b8796}
      .overview-kpi-group.merc,.week-indicator-group.merc,.seller-week-indicator-group.merc{background:linear-gradient(180deg,#fbfdff,#fff)}
      .overview-kpi-group.indicators,.week-indicator-group.indicators,.seller-week-indicator-group.indicators{background:linear-gradient(180deg,#f8fbff,#fff)}
      .overview-kpi-group.services,.week-indicator-group.services,.seller-week-indicator-group.services{background:linear-gradient(180deg,#f7fcf9,#fff)}
      .overview-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .overview-kpi-group.merc .overview-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .overview-kpi-group.services .overview-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .overview-service-note{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;margin-top:10px;padding:10px 12px;border-radius:12px;background:#eef8f2;border:1px solid #d8eadf;color:#486b58}
      .overview-service-note strong{color:#176c45}.overview-service-note small{grid-column:1/-1;color:#75847a;font-size:11px}
      .monthly-gap-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}
      .monthly-gap-group{min-width:0}.monthly-gap-group.services{background:#fbfaff}
      .monthly-gap-group-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .week-indicator-groups,.seller-week-indicator-groups{display:flex;flex-direction:column;gap:12px;margin-top:12px}
      .week-indicator-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .week-indicator-grid .metric{min-width:0;position:relative;display:flex;flex-direction:column;min-height:116px;padding:13px 14px 12px!important;border-radius:15px!important}
      .week-indicator-grid .metric>span:first-child{font-size:10.5px!important;line-height:1.18!important;font-weight:900!important;letter-spacing:.015em;color:#5b6d82!important}
      .week-indicator-grid .metric>strong{font-size:clamp(22px,2.15vw,30px)!important;line-height:1.08!important;font-weight:900!important;margin-top:8px!important;color:#17324d}
      .week-indicator-grid .metric>small{margin-top:auto!important;padding-top:8px!important;font-size:9.5px!important;line-height:1.25!important;color:#7f8b99!important;text-align:right!important}
      .week-indicator-grid .metric.result-status.passed>strong,.week-indicator-grid .metric .positive{color:#178b5b!important}
      .week-indicator-grid .metric.result-status.failed>strong,.week-indicator-grid .metric .negative{color:#c83f54!important}
      .week-indicator-grid .metric.result-status.attention{background:#fff9ea!important;border-color:#ead79a!important}
      .week-indicator-grid .metric.result-status.attention>strong{color:#9a6b00!important}
      .week-indicator-grid .metric.result-status.passed{background:#effaf4!important;border-color:#bfe3cf!important}
      .week-indicator-grid .metric.result-status.failed{background:#fff2f4!important;border-color:#efc3cb!important}
      .week-indicator-grid .metric{background:#fff!important;border:1px solid #e2e9f1!important;box-shadow:0 4px 12px rgba(20,50,80,.035)!important}
      .week-indicator-grid .metric>strong>span{font-size:inherit!important;font-weight:inherit!important;line-height:inherit!important}
      .week-indicator-grid .metric>small{background:#f4f8fc!important;border-radius:8px!important;padding:6px 8px!important;color:#557394!important;text-align:right!important}
      .week-indicator-grid .metric.result-status.passed>small{background:#e8f6ee!important;color:#327355!important}
      .week-indicator-grid .metric.result-status.attention>small{background:#fff4d8!important;color:#896a1b!important}
      .week-indicator-grid .metric.result-status.failed>small{background:#fdebed!important;color:#a04d5b!important}
      .overview-kpi-grid .kpi.status-positive{background:#effaf4!important;border-color:#bfe3cf!important}
      .overview-kpi-grid .kpi.status-warning{background:#fff9ea!important;border-color:#ead79a!important}
      .overview-kpi-grid .kpi.status-negative{background:#fff2f4!important;border-color:#efc3cb!important}
      .overview-kpi-grid .kpi.status-positive .value{color:#178b5b!important}
      .overview-kpi-grid .kpi.status-warning .value{color:#9a6b00!important}
      .overview-kpi-grid .kpi.status-negative .value{color:#c83f54!important}
      .overview-kpi-grid .kpi.status-positive .sub{color:#327355!important}
      .overview-kpi-grid .kpi.status-warning .sub{color:#896a1b!important}
      .overview-kpi-grid .kpi.status-negative .sub{color:#a04d5b!important}
      .overview-kpi-grid .kpi{min-height:128px!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important}
      .overview-kpi-grid .kpi .label{font-size:11px!important;font-weight:850!important;color:#687789!important}
      .overview-kpi-grid .kpi .value{font-size:clamp(22px,2vw,30px)!important;line-height:1.08!important;font-weight:850!important;margin-top:7px!important}
      .overview-kpi-grid .kpi .sub{font-size:10px!important;line-height:1.25!important;margin-top:auto!important;padding-top:8px!important;color:#7f8b99!important}
      .seller-week-indicator-group .seller-week-grid{margin:0!important}
      .seller-week-aux{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
      .seller-week-aux>div{border:1px solid #e3e9f0;border-radius:14px;padding:12px;background:#fafcff;display:flex;flex-direction:column;min-width:0}
      .seller-week-aux span{font-size:11px;font-weight:800;color:#6d7b8d}.seller-week-aux strong{font-size:18px;color:#17324d;margin:5px 0}.seller-week-aux small{font-size:11px;color:#8190a2}
      @media (min-width:761px) and (max-width:1180px){
        .goal-grid{grid-template-columns:1fr!important}
        .goal dl.goal-dual{grid-template-columns:minmax(110px,1fr) minmax(128px,auto) minmax(128px,auto)!important;column-gap:16px!important}
        .goal dl.goal-dual dd{min-width:0!important;white-space:nowrap!important;font-size:clamp(11px,1.25vw,13px)!important}
        .goal-col-head{font-size:8px!important}
        .overview-kpi-grid,.week-indicator-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .overview-kpi-group.services .overview-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .monthly-gap-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .monthly-gap-group-grid{grid-template-columns:1fr!important}
        .seller-week-aux{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
      @media (max-width:760px){
        .overview-kpi-group,.week-indicator-group,.seller-week-indicator-group,.monthly-gap-group{padding:10px;border-radius:16px}
        .overview-kpi-grid,.week-indicator-grid,.seller-week-indicator-group .seller-week-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .overview-kpi-group.services .overview-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .monthly-gap-grid{grid-template-columns:1fr!important}
        .monthly-gap-group-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        .seller-week-aux{grid-template-columns:1fr!important}
        .overview-service-note{grid-template-columns:1fr!important}
        .overview-service-note small{grid-column:auto}
      }
      .seller-dashboard-shell .dashboard-section .dashboard-card{position:relative;overflow:hidden}
      .dashboard-section .dashboard-card{position:relative!important;overflow:hidden}
      .dashboard-section .dashboard-chart-expand{display:inline-flex!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
      .week-indicator-grid .metric>strong{white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important;font-size:clamp(1.08rem,3.7vw,1.58rem)!important}
      .week-indicator-grid .metric>small{color:#667b91!important;opacity:1!important;background:rgba(239,246,255,.58);border-radius:9px;padding:5px 7px!important;margin-top:auto!important;text-align:right!important}
      .week-indicator-grid .metric>span:first-child{color:#5d7085!important;opacity:1!important}
      .seller-dashboard-shell .dashboard-section .dashboard-card h4{padding-right:44px}
      .seller-dashboard-shell .dashboard-section .dashboard-chart-expand{position:absolute;top:14px;right:14px;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:12px;border:1px solid rgba(100,93,255,.18);background:rgba(255,255,255,.92);box-shadow:0 10px 24px rgba(17,24,39,.10);color:#4f46e5;font-size:16px;font-weight:800;cursor:pointer;z-index:2}
      .seller-dashboard-shell .dashboard-section .dashboard-chart-expand:hover{transform:translateY(-1px);box-shadow:0 14px 28px rgba(17,24,39,.14)}
      .seller-dashboard-shell .dashboard-kpis{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
      .seller-dashboard-shell .dashboard-kpi,.seller-dashboard-shell .dashboard-section-total,.week-indicator-grid .metric,.week-goals .week-goal{min-width:0}
      .seller-dashboard-shell .dashboard-kpi strong{display:block;font-size:clamp(1.18rem,2.6vw,2.1rem);line-height:1.06;letter-spacing:-.03em;overflow-wrap:anywhere;word-break:break-word}
      .seller-dashboard-shell .dashboard-section-total{display:block;max-width:100%;font-size:clamp(1.1rem,2.8vw,2rem);line-height:1.06;letter-spacing:-.03em;overflow-wrap:anywhere;word-break:break-word;text-align:right}
      .week-indicator-grid .metric strong,.week-goals .week-goal dd{display:block;font-size:clamp(1.02rem,4.1vw,1.85rem);line-height:1.08;letter-spacing:-.03em;overflow-wrap:anywhere;word-break:break-word}
      .week-indicator-grid .metric.emphasized strong,.week-indicator-grid .metric.result-status strong{font-size:clamp(1.14rem,4.5vw,2.2rem)}
      .week-status-toggle{max-width:100%}
      .week-status-toggle>span:first-child{display:block;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
      .dashboard-chart-modal{position:fixed;inset:0;background:rgba(15,23,42,.58);backdrop-filter:blur(6px);display:grid;place-items:center;padding:16px;z-index:9999}
      .dashboard-chart-modal[hidden]{display:none!important}
      .dashboard-chart-modal-dialog{width:min(1180px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:24px;box-shadow:0 28px 64px rgba(15,23,42,.28);padding:18px}
      .dashboard-chart-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
      .dashboard-chart-modal-head strong{font-size:clamp(1.05rem,2.4vw,1.45rem);color:#17324d}
      .dashboard-chart-modal-close{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:12px;border:1px solid rgba(100,93,255,.18);background:#fff;color:#4f46e5;font-size:24px;line-height:1;cursor:pointer}
      .dashboard-chart-modal-body .dashboard-card-expanded{border:0;box-shadow:none;padding:0}
      .dashboard-chart-modal-body .dashboard-card-expanded .dashboard-chart-expand{display:none!important}
      .dashboard-chart-modal-open{overflow:hidden}
      /* V71 — composição de serviços padronizada: filial e vendedor, sem valores duplicados */
      .dashboard-service-composition{grid-template-columns:170px minmax(0,1fr)!important;align-items:center!important;gap:30px!important}
      .dashboard-composition-bars{display:grid;gap:16px;min-width:0;padding:4px 0;width:100%}
      .dashboard-composition-bar{min-width:0}
      .dashboard-composition-bar-head{display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-bottom:7px;color:#53677b;font-size:.8rem;font-weight:800}
      .dashboard-composition-bar-head strong{color:#17324d;font-size:.82rem;white-space:nowrap}
      .dashboard-composition-track{height:13px;border-radius:999px;background:#edf2f7;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(100,116,139,.08)}
      .dashboard-composition-track i{display:block;height:100%;border-radius:999px;min-width:0;transition:width .25s ease}
      @media (max-width:900px){.dashboard-service-composition{grid-template-columns:135px minmax(0,1fr)!important;gap:20px!important}}
      @media (max-width:560px){.dashboard-service-composition{grid-template-columns:1fr!important;gap:14px!important}.dashboard-service-composition .dashboard-pie{margin-inline:auto}.dashboard-composition-bar-head{font-size:.72rem;gap:8px}.dashboard-composition-bar-head strong{font-size:.72rem}.dashboard-composition-track{height:11px}}
      /* V65 — acabamento executivo: visão geral, semanal e dashboard */
      .overview-hero-stat-shift{transform:translateY(7px)}
      #projectionText.projection-executive-status{display:flex!important;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px!important;color:inherit!important}
      #projectionText .projection-status-chip{display:inline-flex;align-items:baseline;gap:6px;padding:6px 10px;border-radius:999px;background:#f4f7fb;border:1px solid #e4eaf1;white-space:nowrap}
      #projectionText .projection-status-chip b{font-size:.92rem;line-height:1;font-weight:850;color:#17324d}
      #projectionText .projection-status-chip small{font-size:.66rem;line-height:1;color:#6f7f91;font-weight:750}
      #projectionText .projection-status-chip.merc{background:#eef5ff;border-color:#d9e8fb}
      #projectionText .projection-status-chip.gross{background:#eefaf3;border-color:#d8eee2}
      #projectionText .projection-status-chip.neutral{background:#f6f7f9;border-color:#e8ebef}
      .overview-kpi-group.merc{background:linear-gradient(180deg,#f6faff 0%,#fff 100%)!important;border-color:#dfeaf6!important}
      .overview-kpi-group.indicators{background:linear-gradient(180deg,#f8fbfe 0%,#fff 100%)!important;border-color:#e1e8ef!important}
      .overview-kpi-group.services{background:linear-gradient(180deg,#f5fbf7 0%,#fff 100%)!important;border-color:#dceee3!important}
      .week-indicator-grid .metric{min-height:142px!important;padding:14px 14px 12px!important}
      .week-indicator-grid .metric>span:first-child{font-size:.69rem!important;line-height:1.16!important;letter-spacing:.012em!important}
      .week-indicator-grid .metric>strong{white-space:nowrap!important;overflow:visible!important;overflow-wrap:normal!important;word-break:normal!important;font-size:clamp(1.22rem,3.1vw,1.72rem)!important;line-height:1.04!important;margin-top:9px!important;letter-spacing:-.025em!important}
      .week-indicator-grid .metric.emphasized>strong,.week-indicator-grid .metric.result-status>strong{font-size:clamp(1.28rem,3.35vw,1.82rem)!important}
      .week-indicator-grid .metric>small{font-size:.63rem!important;line-height:1.2!important;padding:5px 7px!important;margin-top:auto!important;max-width:100%!important}
      .seller-dashboard-shell .dashboard-section-head{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:12px!important;align-items:start!important}
      .seller-dashboard-shell .dashboard-section-head>div{min-width:0!important}
      .seller-dashboard-shell .dashboard-section-head h3{margin:0!important;line-height:1.08!important}
      .seller-dashboard-shell .dashboard-section-total{align-self:start!important;white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important;font-size:clamp(1.05rem,2.25vw,1.7rem)!important;line-height:1.02!important;padding-top:2px!important;max-width:none!important}
      .dashboard-chart-modal{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      .dashboard-chart-modal-dialog{overscroll-behavior:contain;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch}
      .dashboard-chart-modal-body{overflow:auto;max-width:100%;-webkit-overflow-scrolling:touch}
      @media (max-width:760px){
        .overview-hero-stat-shift{transform:translateY(6px)}
        #projectionText.projection-executive-status{gap:6px;margin-top:8px!important}
        #projectionText .projection-status-chip{padding:5px 8px}
        #projectionText .projection-status-chip b{font-size:.82rem}
        #projectionText .projection-status-chip small{font-size:.6rem}
        .week-indicator-grid .metric{min-height:146px!important;padding:13px 12px 11px!important}
        .week-indicator-grid .metric>strong{font-size:clamp(1.18rem,5.15vw,1.5rem)!important}
        .week-indicator-grid .metric.emphasized>strong,.week-indicator-grid .metric.result-status>strong{font-size:clamp(1.22rem,5.45vw,1.58rem)!important}
        .week-indicator-grid .metric>small{font-size:.59rem!important;line-height:1.18!important}
        .seller-dashboard-shell .dashboard-section-head{grid-template-columns:minmax(0,1fr) minmax(112px,42%)!important;gap:8px!important}
        .seller-dashboard-shell .dashboard-section-total{font-size:clamp(1.02rem,5vw,1.38rem)!important;text-align:right!important;justify-self:end!important}
        .dashboard-chart-modal.mobile-landscape{display:flex!important;align-items:stretch!important;justify-content:stretch!important;padding:0!important;background:rgba(15,23,42,.72)!important}
        .dashboard-chart-modal.mobile-landscape .dashboard-chart-modal-dialog{width:100vw!important;height:100dvh!important;max-height:none!important;border-radius:0!important;padding:10px!important;overflow:auto!important}
        .dashboard-chart-modal.mobile-landscape .dashboard-chart-modal-head{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.96);padding:6px 2px 8px;margin-bottom:8px}
        .dashboard-chart-modal.mobile-landscape .dashboard-chart-modal-body{overflow:auto!important;max-width:100%!important}
        .dashboard-chart-modal.mobile-landscape .dashboard-card-expanded{min-width:680px!important}
        .seller-dashboard-shell .dashboard-section .dashboard-card h4{padding-right:48px}
        .seller-dashboard-shell .dashboard-kpi strong{font-size:clamp(1.08rem,5vw,1.55rem)}
        .seller-dashboard-shell .dashboard-section-total{font-size:clamp(1rem,4.6vw,1.45rem);text-align:left}
        .week-indicator-grid .metric strong,.week-goals .week-goal dd{font-size:clamp(1rem,5vw,1.5rem)}
        .week-indicator-grid .metric.emphasized strong,.week-indicator-grid .metric.result-status strong{font-size:clamp(1.08rem,5.8vw,1.8rem)}
        .dashboard-chart-modal{padding:10px}
        .dashboard-chart-modal-dialog{padding:14px;border-radius:18px;max-height:calc(100vh - 20px)}
        .dashboard-chart-modal-body .svg-chart{min-width:720px}
      }
    `;
    document.head.appendChild(st);
  }
  applyV56TabletPolish();

  initBI();

  renderAll();
  let restoredView = '';
  try { restoredView = sessionStorage.getItem('fs_resultados_active_view') || ''; } catch (_) {}
  const validViews = new Set([...document.querySelectorAll('.view')].map(v => v.id));
  if (location.hash === '#sellers') restoredView = 'sellers';
  if (restoredView && validViews.has(restoredView)) {
    setTimeout(() => {
      try {
        showView(restoredView, { keepScroll: true });
        const y = Number(sessionStorage.getItem('fs_resultados_scroll_y') || 0);
        if (Number.isFinite(y) && y > 0) window.scrollTo({ top: y, behavior: 'auto' });
        sessionStorage.removeItem('fs_resultados_scroll_y');
      } catch (e) { console.warn('Não foi possível restaurar a visualização:', e); }
    }, 0);
  }
document.addEventListener('DOMContentLoaded',()=>{const b=document.getElementById('resultsInternalBack');if(b)b.hidden=true;});
})();


/* V69 — acabamento executivo: rodapé, projeção de serviços e tipografia semanal */
(function applyV69ExecutiveFinish(){
  if (document.getElementById('v69ExecutiveFinishCss')) return;
  const st=document.createElement('style');
  st.id='v69ExecutiveFinishCss';
  st.textContent=`
    .services-projection-executive{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px!important;margin-top:12px!important;color:inherit!important;font-size:inherit!important}
    .services-projection-chip{display:flex;flex-direction:column;gap:3px;min-width:0;padding:10px 12px;border:1px solid #dce7f2;border-radius:13px;background:#f7fbff}
    .services-projection-chip.rate{background:#f8f7ff;border-color:#e3ddfb}
    .services-projection-chip small{font-size:.64rem;line-height:1.1;font-weight:850;text-transform:uppercase;letter-spacing:.025em;color:#718096}
    .services-projection-chip b{font-size:clamp(1rem,2vw,1.25rem);line-height:1.08;font-weight:900;color:#17324d;white-space:nowrap}
    .week-indicator-grid .metric{min-width:0!important;overflow:hidden!important}
    .week-indicator-grid .metric>strong{font-size:clamp(1.12rem,2.45vw,1.55rem)!important;line-height:1.06!important;letter-spacing:-.025em!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:clip!important;max-width:100%!important}
    .week-indicator-grid .metric.emphasized>strong,.week-indicator-grid .metric.result-status>strong{font-size:clamp(1.16rem,2.6vw,1.62rem)!important}
    .week-indicator-grid .metric>small{font-size:.61rem!important;line-height:1.18!important;color:#607a96!important;opacity:1!important;padding:5px 7px!important;margin-top:auto!important}
    .week-goals{align-items:stretch!important}
    .week-goal{min-width:0!important;padding:12px 13px!important;overflow:hidden!important}
    .week-goal header{font-size:.92rem!important;line-height:1.1!important;align-items:center!important}
    .week-goal dl{grid-template-columns:minmax(0,1fr) auto!important;column-gap:10px!important;row-gap:6px!important;font-size:.72rem!important;line-height:1.15!important}
    .week-goal dt{min-width:0!important;color:#34495e!important}
    .week-goal dd{font-size:.78rem!important;line-height:1.12!important;letter-spacing:-.012em!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:clip!important;max-width:100%!important}
    .footer-note{font-size:.76rem!important;letter-spacing:.01em!important}
    @media(max-width:760px){
      .services-projection-executive{gap:8px!important}
      .services-projection-chip{padding:9px 10px!important}
      .services-projection-chip b{font-size:clamp(.92rem,4.2vw,1.08rem)!important}
      .week-indicator-grid .metric>strong{font-size:clamp(1.02rem,4.15vw,1.34rem)!important}
      .week-indicator-grid .metric.emphasized>strong,.week-indicator-grid .metric.result-status>strong{font-size:clamp(1.06rem,4.35vw,1.4rem)!important}
      .week-indicator-grid .metric>small{font-size:.57rem!important}
      .week-goal header{font-size:.9rem!important}
      .week-goal dl{font-size:.69rem!important}
      .week-goal dd{font-size:.74rem!important}
    }
  `;
  document.head.appendChild(st);
  const syncFooter=()=>document.querySelectorAll('.footer-note').forEach(el=>{el.textContent='Developed by Fildo Sobral • FS Soluções'});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',syncFooter,{once:true});else syncFooter();
})();


/* V70 — expansão de indicadores por duplo clique, sem alterar cálculos */
(function setupIndicatorSectionExpansionV70(){
  if(window.__fsIndicatorSectionExpansionV70)return;window.__fsIndicatorSectionExpansionV70=true;
  const selectors=['.dashboard-section-head','.week-indicator-group>header','.seller-week-indicator-group>header','.overview-kpi-group>header'];
  const style=document.createElement('style');style.id='indicatorSectionModalCssV70';style.textContent=`
    ${selectors.join(',')}{cursor:zoom-in}
    .indicator-section-modal[hidden]{display:none!important}.indicator-section-modal{position:fixed;inset:0;z-index:99990;background:rgba(9,24,42,.58);display:grid;place-items:center;padding:28px}
    .indicator-section-dialog{width:min(1280px,95vw);max-height:92vh;background:#f8fbff;border-radius:24px;box-shadow:0 28px 90px rgba(8,24,42,.35);overflow:hidden;display:flex;flex-direction:column}
    .indicator-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 20px;border-bottom:1px solid #e4ebf3;background:linear-gradient(135deg,#f7fbff,#f5f3ff);position:sticky;top:0;z-index:5}
    .indicator-section-head strong{font-size:21px;color:#17324d}.indicator-section-close{width:40px;height:40px;border:0;border-radius:12px;background:#eef3f8;color:#17324d;font-size:25px;cursor:pointer}
    .indicator-section-body{padding:18px 20px 24px;overflow:auto}.indicator-section-body>.dashboard-section,.indicator-section-body>.week-indicator-group,.indicator-section-body>.seller-week-indicator-group,.indicator-section-body>.overview-kpi-group{margin:0!important;max-width:none!important;width:100%!important}
    .indicator-section-body .dashboard-chart-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.indicator-section-body .dashboard-card{min-width:0!important}
    .indicator-section-modal-open{overflow:hidden!important}
    @media(max-width:1024px),(pointer:coarse){
      .indicator-section-modal.mobile-landscape{display:flex!important;align-items:stretch!important;justify-content:stretch!important;padding:0!important}
      .indicator-section-modal.mobile-landscape .indicator-section-dialog{width:100vw!important;height:100dvh!important;max-height:none!important;border-radius:0!important;overflow:auto!important}
      .indicator-section-modal.mobile-landscape.virtual-landscape{display:block!important;overflow:hidden!important}
      .indicator-section-modal.mobile-landscape.virtual-landscape .indicator-section-dialog{position:absolute!important;left:50%!important;top:50%!important;width:100dvh!important;height:100vw!important;transform:translate(-50%,-50%) rotate(90deg)!important;transform-origin:center center!important;overflow:auto!important}
      .indicator-section-modal.mobile-landscape .indicator-section-body{min-width:720px!important;overflow:auto!important}.indicator-section-modal.mobile-landscape .dashboard-chart-grid{grid-template-columns:1fr 1fr!important}
    }
  `;document.head.appendChild(style);
  function useLandscape(){return window.matchMedia('(max-width:1024px),(pointer:coarse)').matches}
  let modal=null,locked=false;
  function ensure(){if(modal)return modal;modal=document.createElement('div');modal.className='indicator-section-modal';modal.hidden=true;modal.innerHTML='<div class="indicator-section-dialog" role="dialog" aria-modal="true"><div class="indicator-section-head"><strong>Indicador</strong><button type="button" class="indicator-section-close" aria-label="Fechar">×</button></div><div class="indicator-section-body"></div></div>';document.body.appendChild(modal);modal.querySelector('.indicator-section-close').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});return modal}
  async function close(){if(!modal)return;modal.hidden=true;modal.classList.remove('mobile-landscape','virtual-landscape');document.body.classList.remove('indicator-section-modal-open');if(locked&&screen?.orientation?.unlock){try{screen.orientation.unlock()}catch{}}locked=false}
  async function open(section,header){const m=ensure(),body=m.querySelector('.indicator-section-body'),title=header.querySelector('h3,strong')?.textContent?.trim()||'Indicador';m.querySelector('.indicator-section-head strong').textContent=title;body.innerHTML='';const clone=section.cloneNode(true);clone.removeAttribute('id');body.appendChild(clone);const landscape=useLandscape();m.classList.toggle('mobile-landscape',landscape);m.classList.remove('virtual-landscape');m.hidden=false;document.body.classList.add('indicator-section-modal-open');if(landscape){let ok=false;if(screen?.orientation?.lock){try{await screen.orientation.lock('landscape');locked=true;ok=true}catch{}}m.classList.toggle('virtual-landscape',!ok)}}
  document.addEventListener('dblclick',e=>{const header=e.target.closest(selectors.join(','));if(!header)return;const section=header.closest('.dashboard-section,.week-indicator-group,.seller-week-indicator-group,.overview-kpi-group');if(!section)return;e.preventDefault();e.stopPropagation();open(section,header)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal&&!modal.hidden)close()});
})();

/* V82 — cards comparativos Mercantil × Serviços/Eficiência */
(function applyV82DualChartsManager(){if(document.getElementById('v82DualChartsManagerCss'))return;const st=document.createElement('style');st.id='v82DualChartsManagerCss';st.textContent=`
.branch-theme-mercservices>.dashboard-section-head{background:linear-gradient(135deg,#edf6ff,#fff8ea)!important}
.dual-chart-legend{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:8px 0 2px;color:#53677b;font-size:.76rem;font-weight:800}.dual-chart-legend span{display:inline-flex;align-items:center;gap:6px}.dual-chart-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}.dual-chart-legend i.merc{background:#1688ec}.dual-chart-legend i.serv{background:#16a085}.dual-chart-legend i.eff{background:#f59e0b}.dual-chart-card{min-width:0}.dual-chart-card .svg-chart{min-height:250px}.dual-chart-card .dual-x-compact{display:none}.dashboard-card-expanded.dual-chart-card .dual-x-compact{display:block}.dashboard-card-expanded.dual-chart-card .svg-chart{min-width:1100px}.dashboard-card-expanded.dual-chart-card .svg-chart text{font-size:10px!important}.dashboard-card-expanded.dual-chart-card{overflow:auto!important}
@media(max-width:760px){.dual-chart-legend{font-size:.68rem;gap:10px}.dual-chart-card .svg-chart{min-width:720px}.dual-chart-card{overflow-x:auto!important}}
`;document.head.appendChild(st)})();

