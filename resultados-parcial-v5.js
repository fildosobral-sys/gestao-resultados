(() => {
  'use strict';

  const MAIN_STORE = 'fs_gestao_resultados_v2';
  const LEGACY_MAIN_STORE = 'fs_gestao_resultados_v1';
  const PARTIAL_STORE = 'fs_resultado_parcial_equipe_v1';

  const num = v => Number(String(v ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase();

  const tierEmoji = {
    perfect:['👑','🏆','🥇','⭐'],
    strong:['🚀','🎯','🏅','🥈'],
    good:['👏','✅','💪','🎉'],
    one:['📈','🔥','⚡','👍'],
    regular:['🙂','🧭','🤝','⏳'],
    zero:['🌱','☕','🙂','⏱️']
  };

  const tierMeta = {
    perfect:{tier:'perfect', rowClass:'perfect', label:'Excelência total', badge:'4/4 metas batidas', short:'Todas as metas batidas'},
    strong:{tier:'strong', rowClass:'strong', label:'Ótimo desempenho', badge:'3/4 metas batidas', short:'Três metas batidas'},
    good:{tier:'good', rowClass:'good', label:'Bom desempenho', badge:'2/4 metas batidas', short:'Duas metas batidas'},
    one:{tier:'one', rowClass:'one', label:'Bom início', badge:'1/4 meta batida', short:'Uma meta batida'},
    regular:{tier:'regular', rowClass:'regular', label:'Regular', badge:'0/4 metas batidas', short:'Ainda sem bater meta'},
    zero:{tier:'zero', rowClass:'zero', label:'Ainda sem venda registrada', badge:'0/4 metas batidas', short:'Sem indicadores lançados'}
  };

  const messages = {
    perfect:[
      'Parabéns! Você bateu os 4 indicadores do dia. Resultado completo e excelente.',
      'Excelência total! Os 4 indicadores foram batidos. Mantenha esse nível até o fechamento.',
      'Resultado fora da curva! Mercantil, serviços, conversão e eficiência foram batidos.',
      'Desempenho completo! Você entregou os 4 indicadores do dia com muita consistência.'
    ],
    strong:[
      'Excelente resultado! Você bateu 3 dos 4 indicadores e ficou muito perto do fechamento perfeito.',
      'Ótimo desempenho! Três metas batidas mostram consistência e força comercial.',
      'Muito bem! Você entregou 3 dos 4 indicadores do dia. Continue firme para buscar o pacote completo.',
      'Parabéns! Três indicadores já foram batidos. Seu desempenho está muito forte hoje.'
    ],
    good:[
      'Bom resultado! Você já bateu 2 dos 4 indicadores do dia. Continue avançando.',
      'Boa entrega! Dois indicadores batidos mostram um dia produtivo e com boa consistência.',
      'Muito bom! Você bateu 2 metas e segue em bom ritmo para ampliar o resultado.',
      'Resultado positivo! Dois indicadores já foram conquistados. Agora é buscar os próximos.'
    ],
    one:[
      'Bom começo! Você já bateu 1 dos 4 indicadores do dia. Continue evoluindo.',
      'Primeira meta batida! Agora é manter o foco para crescer nos demais indicadores.',
      'Boa arrancada! Um indicador já foi conquistado e o restante segue ao alcance.',
      'Você já marcou presença no dia. Continue firme para transformar uma meta em mais metas batidas.'
    ],
    regular:[
      'O resultado já começou, mas ainda falta bater meta. Continue insistindo nas próximas oportunidades.',
      'Você está no jogo. Agora é manter presença e foco para transformar movimento em meta batida.',
      'Há produção acontecendo. Continue ajustando o ritmo para converter em metas batidas.',
      'O caminho está aberto. Falta transformar o avanço em indicadores efetivamente batidos.'
    ],
    zero:[
      'Ainda há tempo para virar o jogo. Foque na próxima oportunidade.',
      'O dia está começando. Mantenha presença, energia e confiança no processo.',
      'Ainda sem resultado registrado, mas uma boa oportunidade pode mudar o cenário rapidamente.',
      'Siga firme. O primeiro resultado do dia pode destravar todo o restante.'
    ]
  };

  function loadMain(){
    try {
      const vault = JSON.parse(localStorage.getItem(MAIN_STORE) || '{}') || {};
      if (vault && vault.records && typeof vault.records === 'object') {
        const current = vault.records[vault.currentKey] || Object.values(vault.records)[0];
        if (current) return current;
      }
      if (Array.isArray(vault.sellers)) return vault;
    } catch (_) {}
    try { return JSON.parse(localStorage.getItem(LEGACY_MAIN_STORE) || '{}') || {}; }
    catch { return {}; }
  }
  function loadPartial(){
    try { return JSON.parse(localStorage.getItem(PARTIAL_STORE) || '{}') || {}; }
    catch { return {}; }
  }
  function savePartial(data){ localStorage.setItem(PARTIAL_STORE, JSON.stringify(data)); }
  function todayISO(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function selectedDate(){ return document.getElementById('dailyGoalDate')?.value || todayISO(); }
  function sellerKey(name){ return norm(name).replace(/\s+/g,'-') || 'vendedor'; }
  function roster(){
    const db = loadMain();
    return (Array.isArray(db.sellers) ? db.sellers : [])
      .filter(s => s && s.name && s.active !== false && s.status !== 'inactive')
      .map((s,i) => ({...s, _id:s.id || s.uuid || sellerKey(s.name) || `seller-${i}`}));
  }
  function dayPercent(){
    const el = document.getElementById('dailyGoalPercent');
    return Math.max(0, Number(el?.value || 0) || 0) / 100;
  }
  function branchGoals(){
    const db=loadMain();
    return {merc: Number(db.goals?.[0] || db.mercantileGoal || 0), services: Number(db.servicesGoal || db.warrantyGoal || 0)};
  }
  function dailyTargetPerSeller(kind){
    const sellers = roster();
    const count = sellers.length || 1;
    const base = branchGoals();
    const pct = dayPercent();
    const dayMerc = (Number(base.merc || 0) * pct) / count;
    const dayServ = (Number(base.services || 0) * pct) / count;
    return kind === 'merc' ? dayMerc : dayServ;
  }
  function resultFor(name, date){
    const store=loadPartial();
    return store.days?.[date]?.[sellerKey(name)] || {};
  }
  function setResult(name,date,patch){
    const store=loadPartial(); store.days ||= {}; store.days[date] ||= {};
    store.days[date][sellerKey(name)]={...(store.days[date][sellerKey(name)]||{}),...patch,updatedAt:Date.now()};
    savePartial(store);
  }
  function deterministicIndex(seed,len){ let h=0; for(const c of seed) h=(h*31+c.charCodeAt(0))>>>0; return len ? h%len : 0; }
  function motivationFor(s,tier,date){
    const store=loadPartial(); store.history ||= {}; const key=sellerKey(s.name); store.history[key] ||= [];
    const history=store.history[key]; const cutoff=Date.now()-90*24*60*60*1000;
    const recent=history.filter(x=>x.ts>=cutoff);
    const pool=messages[tier] || messages.zero;
    const unused=pool.filter(m=>!recent.some(x=>x.message===m));
    const chosenPool=unused.length?unused:pool;
    const idx=deterministicIndex(`${date}|${key}|${tier}|${recent.length}`, chosenPool.length);
    const message=chosenPool[idx];
    const emotes=tierEmoji[tier] || ['🙂'];
    const emoji=emotes[deterministicIndex(`${key}|${date}|emoji|${tier}`,emotes.length)];
    const already=history.find(x=>x.date===date && x.tier===tier);
    if(already) return {message:already.message,emoji:already.emoji};
    history.push({date,tier,message,emoji,ts:Date.now()});
    store.history[key]=history.slice(-240); savePartial(store);
    return {message,emoji};
  }

  function evaluateTier(metrics){
    const indicatorsPositive = metrics.filter(m => Number(m.actual) > 0.0001).length;
    const indicatorsMet = metrics.filter(m => Number(m.actual) >= Number(m.target)).length;
    if(indicatorsMet >= 4) return {...tierMeta.perfect, indicatorsPositive, indicatorsMet};
    if(indicatorsMet === 3) return {...tierMeta.strong, indicatorsPositive, indicatorsMet};
    if(indicatorsMet === 2) return {...tierMeta.good, indicatorsPositive, indicatorsMet};
    if(indicatorsMet === 1) return {...tierMeta.one, indicatorsPositive, indicatorsMet};
    if(indicatorsPositive > 0) return {...tierMeta.regular, indicatorsPositive, indicatorsMet};
    return {...tierMeta.zero, indicatorsPositive, indicatorsMet};
  }

  function pctText(v, digits=0){
    const n = Number(v || 0);
    return `${n.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits})}%`;
  }
  function metricDisplayDigits(actual, tone){
    const n = Number(actual || 0);
    if(!Number.isFinite(n) || n === 0) return 0;
    const hasDecimals = Math.abs(n - Math.round(n)) > 0.0001;
    if(tone === 'conversao' || tone === 'eficiencia') return hasDecimals ? 2 : 0;
    if(hasDecimals) return Math.abs(n) < 10 ? 2 : 1;
    return 0;
  }
  function metricCard(label, actualPct, targetPct, tone){
    const target = Number(targetPct || 0);
    const actual = Number(actualPct || 0);
    const neg = actual < 0;
    const rate = target > 0 ? actual / target : 0;
    const baseFill = neg ? 0 : Math.max(0, Math.min(100, rate * 100));
    const excessPct = !neg && target > 0 ? Math.max(0, ((actual - target) / target) * 100) : 0;
    const excessFill = Math.max(0, Math.min(100, excessPct));
    const deficitPct = neg && target > 0 ? Math.abs(actual / target) * 100 : 0;
    const displayDigits = metricDisplayDigits(actual, tone);
    return `<div class="team-metric team-metric-${tone}${neg?' is-negative':''}">
      <div class="team-metric-topline"><span>${label}</span>${excessPct>0?`<em>+${pctText(excessPct,0)} acima</em>`:neg?`<em class="negative">-${pctText(deficitPct,0)}</em>`:''}</div>
      <strong>${pctText(actual, displayDigits)}</strong>
      <div class="team-metric-scale">
        <div class="team-metric-track"><i style="width:${baseFill}%"></i><b style="left:100%"></b></div>
        <div class="team-metric-excess${excessPct>0?' active':''}${neg?' negative':''}"><i style="width:${neg?Math.min(100,deficitPct):excessFill}%"></i></div>
      </div>
      <small>Meta: ${pctText(target,0)}</small>
    </div>`;
  }

  function buildRowData(){
    const date = selectedDate();
    const sellers = roster();
    const mercTarget = dailyTargetPerSeller('merc');
    const servTarget = dailyTargetPerSeller('services');

    return sellers.map(s => {
      const r = resultFor(s.name, date);
      const merc = Number(r.mercantil || 0);
      const services = Number(r.services || 0);
      const conversion = Number(r.conversao || 0);
      const efficiency = Number(r.eficiencia || 0);

      const mercPct = mercTarget > 0 ? (merc / mercTarget) * 100 : 0;
      const servicesPct = servTarget > 0 ? (services / servTarget) * 100 : 0;

      const metrics = [
        { key:'mercantil', label:'Mercantil', actual:mercPct, target:100, raw:merc },
        { key:'servicos', label:'Serviços', actual:servicesPct, target:100, raw:services },
        { key:'conversao', label:'Conversão', actual:conversion, target:35, raw:conversion },
        { key:'eficiencia', label:'Eficiência', actual:efficiency, target:7, raw:efficiency }
      ];

      const indicatorsPositive = metrics.filter(m => Number(m.actual) > 0.0001).length;
      const indicatorsMet = metrics.filter(m => Number(m.actual) >= Number(m.target)).length;
      const cappedAverage = metrics.reduce((sum,m)=>sum + Math.min(Math.max(m.actual / (m.target || 1),0),2),0) / metrics.length;
      const excessTotal = metrics.reduce((sum,m)=>sum + Math.max((m.actual / (m.target || 1)) - 1, 0),0);
      const totalActualPct = metrics.reduce((sum,m)=>sum + Math.max(m.actual,0),0);
      const completionScore = metrics.reduce((sum,m)=>sum + Math.min(Math.max(m.actual / (m.target || 1),0),1.6),0);
      const tierInfo = evaluateTier(metrics);

      const mot = motivationFor(s,tierInfo.tier,date);
      return {
        s, r, date, merc, services, conversion, efficiency,
        mercTarget, servTarget,
        mercPct, servicesPct,
        indicatorsPositive, indicatorsMet, cappedAverage, excessTotal, totalActualPct, completionScore,
        tierInfo, mot, metrics
      };
    });
  }

  function sortOverall(rows){
    return [...rows].sort((a,b) =>
      (b.indicatorsMet - a.indicatorsMet) ||
      (b.completionScore - a.completionScore) ||
      (b.cappedAverage - a.cappedAverage) ||
      (b.indicatorsPositive - a.indicatorsPositive) ||
      (b.excessTotal - a.excessTotal) ||
      (b.totalActualPct - a.totalActualPct) ||
      (b.mercPct - a.mercPct) ||
      (b.servicesPct - a.servicesPct) ||
      (b.conversion - a.conversion) ||
      (b.efficiency - a.efficiency) ||
      a.s.name.localeCompare(b.s.name,'pt-BR')
    );
  }

  function sortByMetric(rows,key){
    const map = {
      mercantil: r => r.mercPct,
      servicos: r => r.servicesPct,
      conversao: r => r.conversion,
      eficiencia: r => r.efficiency
    };
    const getter = map[key];
    return [...rows].sort((a,b) =>
      (getter(b) - getter(a)) ||
      (b.indicatorsPositive - a.indicatorsPositive) ||
      (b.indicatorsMet - a.indicatorsMet) ||
      (b.totalActualPct - a.totalActualPct) ||
      a.s.name.localeCompare(b.s.name,'pt-BR')
    );
  }

  function renderMiniRankings(rows){
    const host = document.getElementById('teamPartialMiniRankings');
    if(!host) return;
    const configs = [
      { key:'mercantil', title:'Ranking mercantil', target:'Meta 100%', tone:'mercantil', getter:r=>r.mercPct },
      { key:'servicos', title:'Ranking serviços', target:'Meta 100%', tone:'servicos', getter:r=>r.servicesPct },
      { key:'conversao', title:'Ranking conversão', target:'Meta 35%', tone:'conversao', getter:r=>r.conversion },
      { key:'eficiencia', title:'Ranking eficiência', target:'Meta 7%', tone:'eficiencia', getter:r=>r.efficiency }
    ];

    host.innerHTML = configs.map(cfg => {
      const ordered = sortByMetric(rows,cfg.key);
      return `<section class="mini-rank-card mini-${cfg.tone}">
        <header><h4>${cfg.title}</h4><span>${cfg.target}</span></header>
        <div class="mini-rank-list">
          ${ordered.map((row,idx)=>{
            const value = Number(cfg.getter(row) || 0);
            const fill = Math.max(0,Math.min(100, cfg.key === 'conversao' ? (value/35)*100 : cfg.key === 'eficiencia' ? (value/7)*100 : value));
            return `<div class="mini-rank-item">
              <b>${idx+1}º</b>
              <strong>${esc(row.s.name)}</strong>
              <span>${pctText(value, value !== 0 && Math.abs(value) < 10 ? 1 : 0)}</span>
              <i><u style="width:${fill}%"></u></i>
            </div>`;
          }).join('')}
        </div>
      </section>`;
    }).join('');
  }

  function render(){
    const host=document.getElementById('teamPartialResult'); if(!host) return;
    const sellers=roster();
    const empty=document.getElementById('teamPartialEmpty');
    const panel=document.querySelector('.team-partial-panel');
    if(panel){ panel.dataset.date=selectedDate(); }
    if(!sellers.length){
      host.innerHTML=''; if(empty){empty.hidden=false; empty.innerHTML='<strong>Nenhum vendedor ativo localizado.</strong><span>Cadastre os vendedores na aba Metas. Este bloco usa automaticamente essa mesma base.</span>';}
      updateSummary([]); renderMiniRankings([]); return;
    }
    if(empty) empty.hidden=true;

    const rows = sortOverall(buildRowData());

    host.innerHTML=rows.map((x,i)=>{
      const first=esc(x.s.name.split(' ')[0]);
      return `<article class="team-partial-row status-${x.tierInfo.rowClass}" data-seller="${esc(x.s.name)}">
        <div class="team-partial-rank"><strong>${i+1}º</strong><span>${x.mot.emoji}</span></div>
        <div class="team-partial-person">
          <strong>${esc(x.s.name)}</strong>
          <div class="team-partial-badges">
            <small class="team-main-badge">${x.tierInfo.label}</small>
            <small class="team-count-badge">${x.tierInfo.badge}</small>
          </div>
          <p>${first}, ${esc(x.mot.message.charAt(0).toLowerCase()+x.mot.message.slice(1))}</p>
        </div>
        <div class="team-partial-kpis">
          ${metricCard('Mercantil',x.mercPct,100,'mercantil')}
          ${metricCard('Serviços',x.servicesPct,100,'servicos')}
          ${metricCard('Conversão',x.conversion,35,'conversao')}
          ${metricCard('Eficiência',x.efficiency,7,'eficiencia')}
        </div>
      </article>`;
    }).join('');

    updateSummary(rows);
    renderMiniRankings(rows);
  }

  function updateSummary(rows){
    const perfect = rows.filter(x=>x.tierInfo.tier==='perfect').length;
    const strong = rows.filter(x=>x.tierInfo.tier==='strong' || x.tierInfo.tier==='good').length;
    const developing = rows.filter(x=>x.tierInfo.tier==='one' || x.tierInfo.tier==='regular').length;
    const zero = rows.filter(x=>x.tierInfo.tier==='zero').length;
    const el=document.getElementById('teamPartialSummary'); if(!el) return;
    el.innerHTML=`<div class="sum-team"><i>👥</i><span>Equipe</span><strong>${rows.length}</strong></div><div class="sum-hit"><i>👑</i><span>4 de 4 metas</span><strong>${perfect}</strong></div><div class="sum-progress"><i>🚀</i><span>2 a 3 metas</span><strong>${strong}</strong></div><div class="sum-zero"><i>📈</i><span>0 a 1 meta</span><strong>${developing + zero}</strong></div>`;
  }

  function buildManualRows(){
    const host=document.getElementById('teamPartialManualRows'); if(!host) return;
    const date=selectedDate();
    host.innerHTML=roster().map(s=>{ const r=resultFor(s.name,date); return `<div class="team-manual-row" data-name="${esc(s.name)}"><strong>${esc(s.name)}</strong><label>Mercantil<input data-f="mercantil" inputmode="decimal" value="${Number(r.mercantil||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"></label><label>Serviços<input data-f="services" inputmode="decimal" value="${Number(r.services||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"></label><label>Conversão %<input data-f="conversao" inputmode="decimal" value="${Number(r.conversao||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"></label><label>Eficiência %<input data-f="eficiencia" inputmode="decimal" value="${Number(r.eficiencia||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"></label></div>`; }).join('');
  }
  function saveManual(){
    const date=selectedDate(); document.querySelectorAll('.team-manual-row').forEach(row=>{
      const p={}; row.querySelectorAll('input[data-f]').forEach(i=>p[i.dataset.f]=num(i.value)); setResult(row.dataset.name,date,p);
    }); render(); closeModal('teamPartialManualModal');
  }

  function closeModal(id){ const el=document.getElementById(id); if(el) el.hidden=true; }
  function openManual(){ buildManualRows(); const el=document.getElementById('teamPartialManualModal'); if(el) el.hidden=false; }
  function openImport(){ const el=document.getElementById('teamPartialImportModal'); if(el) el.hidden=false; }

  function loadScript(src,id){ return new Promise((resolve,reject)=>{ if(window[id]) return resolve(); const old=document.querySelector(`script[data-dynamic="${id}"]`); if(old){ old.addEventListener('load',resolve,{once:true}); return; } const s=document.createElement('script'); s.src=src; s.async=true; s.dataset.dynamic=id; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); }); }

  function moneyTokens(line){
    return [...String(line||'').matchAll(/R\$?\s*([\d.]+,\d{2})/gi)].map(m=>num(m[1]));
  }
  function percentTokens(line){ return [...String(line||'').matchAll(/(-?\d{1,4}(?:[\.,]\d{1,2})?)\s*%/g)].map(m=>num(m[1])); }
  function bestSellerForLine(line,sellers){
    const ln=norm(line); let best=null, score=0;
    for(const s of sellers){
      const parts=norm(s.name).split(' ').filter(x=>x.length>2);
      const found=parts.filter(p=>ln.includes(p)).length;
      const sc=parts.length?found/parts.length:0;
      if(sc>score){score=sc;best=s;}
    }
    return score>=0.45?best:null;
  }
  function normalizeReportText(text){
    return String(text||'')
      .replace(/[\u00a0\u202f]/g,' ')
      .replace(/[–—]/g,'-')
      .replace(/\r/g,'')
      .replace(/[ \t]+/g,' ')
      .trim();
  }
  function emptyResult(seller){
    return {seller,mercantil:0,services:0,conversao:0,eficiencia:0,elegivel:0,garantias:0,seguros:0,prestamista:0,qtdElegivel:0,qtdGarantias:0};
  }
  function parseStructuredLine(line,sellers){
    const seller=bestSellerForLine(line,sellers); if(!seller) return null;
    const money=moneyTokens(line);
    const perc=percentTokens(line);
    if(money.length < 5) return null;
    const nameNorm=norm(seller.name);
    const lineNorm=norm(line);
    const tailStart=Math.max(0,lineNorm.indexOf(nameNorm)+nameNorm.length);
    const rawTail=String(line||'').slice(Math.max(0,Math.floor(String(line||'').length * (tailStart/Math.max(1,lineNorm.length)))));
    const afterMoney5 = rawTail.replace(/R\$?\s*[\d.]+,\d{2}/gi,' §M ').replace(/\s+/g,' ');
    const ints=[...afterMoney5.matchAll(/(?:^|\s)(\d{1,4})(?=\s|$)/g)].map(m=>Number(m[1]));
    const qtdElegivel=ints[0]||0, qtdGarantias=ints[1]||0;
    const mercantil=money[0]||0, elegivel=money[1]||0, garantias=money[2]||0, seguros=money[3]||0, prestamista=money[4]||0;
    const services=garantias+seguros+prestamista;
    const conversao=perc.length?perc[0]:(qtdElegivel>0?(qtdGarantias/qtdElegivel*100):0);
    let eficiencia=perc.length>1?perc[1]:0;
    if(!eficiencia){
      const tailNums=[...String(line||'').matchAll(/(?:^|\s)(-?\d{1,3}[\.,]\d{1,2})(?=\s*$)/g)].map(m=>num(m[1]));
      eficiencia=tailNums.length?tailNums.at(-1):(elegivel?services/elegivel*100:0);
    }
    return {seller,mercantil,elegivel,qtdElegivel,garantias,seguros,prestamista,qtdGarantias,services,conversao,eficiencia};
  }
  function parseReportText(text){
    const sellers=roster();
    const clean=normalizeReportText(text);
    if(!clean) return sellers.map(emptyResult);
    const lines=clean.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    const found={};
    for(let i=0;i<lines.length;i++){
      let candidate=lines[i];
      let parsed=parseStructuredLine(candidate,sellers);
      if(!parsed){
        for(let take=2;take<=4 && i+take<=lines.length;take++){
          candidate=lines.slice(i,i+take).join(' ');
          parsed=parseStructuredLine(candidate,sellers);
          if(parsed) break;
        }
      }
      if(parsed) found[sellerKey(parsed.seller.name)]=parsed;
    }
    if(Object.keys(found).length < Math.min(2,sellers.length)){
      const markers=[];
      lines.forEach((line,i)=>{const s=bestSellerForLine(line,sellers); if(s) markers.push({i,s});});
      markers.forEach((m,idx)=>{
        const end=idx+1<markers.length?markers[idx+1].i:Math.min(lines.length,m.i+5);
        const parsed=parseStructuredLine(lines.slice(m.i,end).join(' '),sellers);
        if(parsed) found[sellerKey(parsed.seller.name)]=parsed;
      });
    }
    return sellers.map(s=>found[sellerKey(s.name)]||emptyResult(s));
  }
  function parseOCR(text){ return parseReportText(text); }
  function renderOCRReview(rows){
    const host=document.getElementById('teamPartialOcrReview'); if(!host) return;
    host.innerHTML=rows.map((r,i)=>`<div class="ocr-review-row compact" data-i="${i}" data-name="${esc(r.seller.name)}">
      <strong>${esc(r.seller.name)}</strong>
      <label>Mercantil<input data-f="mercantil" inputmode="decimal" value="${Number(r.mercantil||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"></label>
      <label>Serviços<input data-f="services" inputmode="decimal" value="${Number(r.services||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"></label>
      <label>Conversão %<input data-f="conversao" inputmode="decimal" value="${Number(r.conversao||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"></label>
      <label>Eficiência %<input data-f="eficiencia" inputmode="decimal" value="${Number(r.eficiencia||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}"></label>
    </div>`).join('');
    host.hidden=false; document.getElementById('teamPartialSaveOcr').hidden=false;
  }
  function readPastedText(){
    const input=document.getElementById('teamPartialTextPaste');
    const status=document.getElementById('teamPartialTextStatus');
    const text=String(input?.value||'').trim();
    if(!text){ if(status) status.textContent='Cole as linhas do relatório antes de processar.'; return; }
    const rows=parseReportText(text);
    renderOCRReview(rows);
    const identified=rows.filter(r=>Number(r.mercantil)||Number(r.services)||Number(r.conversao)||Number(r.eficiencia)).length;
    if(status) status.textContent=`${identified} vendedor(es) identificado(s). Confira os 4 indicadores antes de salvar.`;
  }
  async function readImage(){
    const file=document.getElementById('teamPartialImage')?.files?.[0]; if(!file){ alert('Escolha uma imagem do relatório.'); return; }
    const status=document.getElementById('teamPartialOcrStatus'); status.textContent='Carregando leitor…';
    try{
      if(!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js','Tesseract');
      status.textContent='Lendo imagem. Aguarde…';
      const result=await Tesseract.recognize(file,'por',{logger:m=>{ if(m.status==='recognizing text') status.textContent=`Lendo imagem… ${Math.round((m.progress||0)*100)}%`; }});
      const rows=parseOCR(result?.data?.text||''); renderOCRReview(rows); status.textContent='Leitura concluída. Confira Mercantil, Serviços, Conversão e Eficiência antes de salvar.';
    }catch(e){ status.textContent='Não foi possível concluir a leitura automática. Você ainda pode preencher manualmente ou colar o texto.'; }
  }
  function saveOCR(){
    const date=selectedDate(); document.querySelectorAll('.ocr-review-row').forEach(row=>{
      const p={}; row.querySelectorAll('input[data-f]').forEach(i=>p[i.dataset.f]=num(i.value)); setResult(row.dataset.name,date,p);
    }); render(); closeModal('teamPartialImportModal');
  }

  async function downloadComposite(){
    const partial=document.querySelector('.team-partial-panel'); if(!partial) return;
    try{
      if(!window.html2canvas) await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','html2canvas');
      const date=selectedDate();
      const wrap=document.createElement('div');
      wrap.className='team-export-stage team-export-ranking export-cards-only';
      wrap.style.cssText='position:fixed;left:-12000px;top:0;width:1440px;background:#edf5ff;padding:26px;z-index:-1;box-sizing:border-box';
      const clone=partial.cloneNode(true);
      wrap.appendChild(clone); document.body.appendChild(wrap);
      clone.querySelectorAll('button,.team-partial-actions,.team-partial-empty,.team-partial-summary,.team-partial-miniranks').forEach(x=>x.remove());
      const head=clone.querySelector('.team-partial-head');
      if(head){
        head.innerHTML=`<div class="export-title-copy"><span class="team-partial-eyebrow">ACOMPANHAMENTO PARCIAL</span><h3>Resultado parcial da equipe</h3><p>Cards em ordem de classificação geral do dia.</p></div><span class="team-export-date">📅 ${date.split('-').reverse().join('/')}</span><span class="team-export-trophy">🏆</span>`;
      }

      if(document.fonts?.ready){ try { await document.fonts.ready; } catch(_) {} }
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const canvas=await html2canvas(wrap,{scale:2.2,backgroundColor:'#edf5ff',useCORS:true,logging:false,windowWidth:1440,imageTimeout:30000,scrollX:0,scrollY:0});
      wrap.remove();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));
      if(!blob) throw new Error('Falha ao gerar PNG');
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.download=`resultado-parcial-equipe-${date}.png`; a.href=url; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e){ alert('Não foi possível gerar o acompanhamento neste aparelho. Tente novamente com internet ativa.'); }
  }

  function bind(){
    const date=document.getElementById('dailyGoalDate'), per=document.getElementById('dailyGoalPercent');
    date?.addEventListener('change',render); per?.addEventListener('input',render);
    document.getElementById('teamPartialManual')?.addEventListener('click',openManual);
    document.getElementById('teamPartialImport')?.addEventListener('click',openImport);
    document.getElementById('teamPartialSaveManual')?.addEventListener('click',saveManual);
    document.getElementById('teamPartialReadImage')?.addEventListener('click',readImage);
    document.getElementById('teamPartialReadText')?.addEventListener('click',readPastedText);
    document.getElementById('teamPartialSaveOcr')?.addEventListener('click',saveOCR);
    document.getElementById('teamPartialDownload')?.addEventListener('click',downloadComposite);
    document.querySelectorAll('[data-close-team-modal]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.closeTeamModal)));
    window.addEventListener('storage',render);
    let lastMainSnapshot = localStorage.getItem(MAIN_STORE) || '';
    setInterval(()=>{
      const next = localStorage.getItem(MAIN_STORE) || '';
      if(next !== lastMainSnapshot){ lastMainSnapshot = next; render(); }
    }, 1200);
    const goalsCards=document.getElementById('goalSuggestionCards');
    if(goalsCards){ const goalsObserver=new MutationObserver(()=>render()); goalsObserver.observe(goalsCards,{childList:true,subtree:true}); }
    const observer=new MutationObserver(()=>render());
    const team=document.getElementById('dailyGoalTeam'); if(team) observer.observe(team,{childList:true,subtree:true});
  }

  function init(){ bind(); render(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
