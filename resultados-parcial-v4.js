(() => {
  'use strict';

  const MAIN_STORE = 'fs_gestao_resultados_v2';
  const LEGACY_MAIN_STORE = 'fs_gestao_resultados_v1';
  const PARTIAL_STORE = 'fs_resultado_parcial_equipe_v1';
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const num = v => Number(String(v ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase();

  const weekdayEmoji = {
    0: { hit:['🏆','🎉','🚀','✅'], progress:['💪','📈','⚡','🔥'], zero:['🌤️','🙂','⏳','🤝'] },
    1: { hit:['🚀','🥇','🎯','👏'], progress:['🏃','💪','📊','⚡'], zero:['☕','🌱','🙂','⏱️'] },
    2: { hit:['🎉','🏆','🔥','⭐'], progress:['📈','💪','🚴','🎯'], zero:['🌤️','🙂','🤝','⏳'] },
    3: { hit:['🥳','✅','🚀','🏅'], progress:['🏃‍♂️','🏃‍♀️','⚡','📈'], zero:['☀️','🙂','🌱','💭'] },
    4: { hit:['🏆','🎊','💥','👏'], progress:['🔥','💪','🎯','📈'], zero:['☕','🌤️','🙂','⏳'] },
    5: { hit:['🎉','🚀','🥇','✅'], progress:['⚡','🏃','💪','🔥'], zero:['🌞','🙂','🤝','⏰'] },
    6: { hit:['🏅','🎯','👏','⭐'], progress:['📈','💪','🔥','⚡'], zero:['🌤️','🙂','🌱','🤝'] }
  };

  const messages = {
    hit: [
      'Meta alcançada! Excelente ritmo — continue ampliando o resultado.',
      'Missão cumprida! Mantenha a energia e siga construindo um dia forte.',
      'Parabéns pelo resultado! Agora é manter a consistência até o fechamento.',
      'Objetivo do dia alcançado. Excelente execução — continue avançando.',
      'Meta batida! Seu ritmo está fazendo diferença no resultado da equipe.',
      'Excelente entrega! Aproveite o embalo e siga em busca do próximo resultado.',
      'Você chegou à meta do dia. Continue firme para ampliar a superação.',
      'Resultado conquistado! Consistência e foco para fechar ainda melhor.',
      'Muito bem! Meta do dia alcançada e espaço aberto para superar ainda mais.',
      'Ótimo trabalho! Continue no mesmo ritmo e ajude a equipe a crescer.'
    ],
    progress: [
      'Bom avanço até aqui. Mantenha o ritmo que a meta está ao alcance.',
      'Você já entrou no jogo. Continue firme e transforme o progresso em meta batida.',
      'O resultado está caminhando. Mais alguns bons atendimentos podem virar o dia.',
      'Siga no ritmo. Cada atendimento conta para aproximar você do objetivo.',
      'Boa evolução! Mantenha foco, abordagem e constância até o fechamento.',
      'Você está avançando. Continue construindo resultado venda por venda.',
      'O caminho está aberto. Mantenha energia e atenção às oportunidades.',
      'Continue acelerando. Ainda há espaço para buscar e superar a meta.',
      'O progresso já apareceu. Agora é manter constância para chegar ao objetivo.',
      'Bom trabalho até aqui. Foque nas próximas oportunidades e siga avançando.'
    ],
    zero: [
      'O dia ainda está aberto. Uma boa oportunidade pode mudar o cenário rapidamente.',
      'Ainda dá tempo. Mantenha presença, abordagem e confiança nas próximas oportunidades.',
      'Comece pela próxima oportunidade. O primeiro resultado pode destravar o restante do dia.',
      'O placar ainda pode mudar. Foco no atendimento e confiança no processo.',
      'Cada novo cliente é uma nova chance. Siga atento e preparado.',
      'O dia está em construção. Concentre-se na próxima oportunidade e avance.',
      'Resultado zerado até agora, mas ainda há tempo para virar o jogo.',
      'Mantenha a energia. Um bom atendimento pode ser o começo da recuperação.',
      'A próxima oportunidade pode fazer diferença. Continue firme.',
      'Ainda há caminho pela frente. Foque no que pode ser feito a partir de agora.'
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
  function goalForSeller(s, kind){
    const all=roster();
    const base=branchGoals();
    if(kind==='merc') return Number(s.assignedGoal || s.mercantileGoal || s.goalMerc || s.goal || 0) || (all.length ? base.merc/all.length : 0);
    return Number(s.serviceGoal || s.assignedServiceGoal || s.servicesGoal || s.goalServices || 0) || (all.length ? base.services/all.length : 0);
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
  function statusOf(s,r){
    const mercTarget=goalForSeller(s,'merc')*dayPercent();
    const merc=Number(r.mercantil||0);
    if(mercTarget>0 && merc>=mercTarget) return 'hit';
    if(merc>0 || Number(r.services||0)>0) return 'progress';
    return 'zero';
  }
  function deterministicIndex(seed,len){ let h=0; for(const c of seed) h=(h*31+c.charCodeAt(0))>>>0; return len ? h%len : 0; }
  function motivationFor(s,status,date){
    const store=loadPartial(); store.history ||= {}; const key=sellerKey(s.name); store.history[key] ||= [];
    const history=store.history[key]; const cutoff=Date.now()-90*24*60*60*1000;
    const recent=history.filter(x=>x.ts>=cutoff);
    const pool=messages[status];
    const unused=pool.filter(m=>!recent.some(x=>x.message===m));
    const chosenPool=unused.length?unused:pool;
    const idx=deterministicIndex(`${date}|${key}|${status}|${recent.length}`, chosenPool.length);
    const message=chosenPool[idx];
    const weekday=new Date(date+'T12:00:00').getDay(); const emotes=weekdayEmoji[weekday]?.[status] || ['🙂'];
    const emoji=emotes[deterministicIndex(`${key}|${date}|emoji`,emotes.length)];
    const already=history.find(x=>x.date===date && x.status===status);
    if(already) return {message:already.message,emoji:already.emoji};
    history.push({date,status,message,emoji,ts:Date.now()});
    store.history[key]=history.slice(-240); savePartial(store);
    return {message,emoji};
  }
  function ratio(value,target){ return target>0 ? value/target : 0; }
  function clamp(v){ return Math.max(0,Math.min(100,v*100)); }
  function pctText(v, digits=0){
    const n = Number(v || 0);
    return `${n.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits})}%`;
  }
  function metricRate(actual, target){ return target > 0 ? Number(actual || 0) / target : 0; }
  function metricCard(label, actualPct, targetPct, tone){
    const target = Number(targetPct || 0);
    const actual = Number(actualPct || 0);
    const neg = actual < 0;
    const rate = target > 0 ? actual / target : 0;
    const baseFill = neg ? 0 : Math.max(0, Math.min(100, rate * 100));
    const excessPct = !neg && target > 0 ? Math.max(0, ((actual - target) / target) * 100) : 0;
    const excessFill = Math.max(0, Math.min(100, excessPct));
    const deficitPct = neg && target > 0 ? Math.abs(actual / target) * 100 : 0;
    const displayDigits = Math.abs(actual) < 10 && actual !== 0 ? 1 : 0;
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

  function render(){
    const host=document.getElementById('teamPartialResult'); if(!host) return;
    const date=selectedDate(); const sellers=roster(); const dPct=dayPercent();
    const empty=document.getElementById('teamPartialEmpty');
    const panel=document.querySelector('.team-partial-panel');
    if(panel){ panel.dataset.date=date; }
    if(!sellers.length){
      host.innerHTML=''; if(empty){empty.hidden=false; empty.innerHTML='<strong>Nenhum vendedor ativo localizado.</strong><span>Cadastre os vendedores na aba Metas. Este bloco usa automaticamente essa mesma base.</span>';}
      updateSummary([]); return;
    }
    if(empty) empty.hidden=true;
    const rows=sellers.map(s=>{
      const r=resultFor(s.name,date); const merc=Number(r.mercantil||0); const services=Number(r.services||0);
      const mercTarget=goalForSeller(s,'merc')*dPct; const servTarget=goalForSeller(s,'services')*dPct;
      const mRate=ratio(merc,mercTarget), sRate=ratio(services,servTarget);
      const conversion=Number(r.conversao||0), efficiency=Number(r.eficiencia||0);
      const cRate=metricRate(conversion,35), eRate=metricRate(efficiency,7);
      const status=statusOf(s,r); const mot=motivationFor(s,status,date);
      return {s,r,merc,services,mercTarget,servTarget,mRate,sRate,conversion,efficiency,cRate,eRate,status,mot};
    }).sort((a,b)=>b.mRate-a.mRate || b.sRate-a.sRate || b.cRate-a.cRate || b.eRate-a.eRate || b.merc-a.merc);

    host.innerHTML=rows.map((x,i)=>{
      const first=esc(x.s.name.split(' ')[0]);
      const statusText=x.status==='hit'?'Meta do dia alcançada':x.status==='progress'?'Em andamento':'Ainda sem venda registrada';
      return `<article class="team-partial-row status-${x.status}" data-seller="${esc(x.s.name)}">
        <div class="team-partial-rank"><strong>${i+1}º</strong><span>${x.mot.emoji}</span></div>
        <div class="team-partial-person"><strong>${esc(x.s.name)}</strong><small>${statusText}</small><p>${first}, ${esc(x.mot.message.charAt(0).toLowerCase()+x.mot.message.slice(1))}</p></div>
        <div class="team-partial-kpis">
          ${metricCard('Mercantil',x.mRate*100,100,'mercantil')}
          ${metricCard('Serviços',x.sRate*100,100,'servicos')}
          ${metricCard('Conversão',x.conversion,35,'conversao')}
          ${metricCard('Eficiência',x.efficiency,7,'eficiencia')}
        </div>

      </article>`;
    }).join('');
    updateSummary(rows);
  }

  function updateSummary(rows){
    const hit=rows.filter(x=>x.status==='hit').length, progress=rows.filter(x=>x.status==='progress').length, zero=rows.filter(x=>x.status==='zero').length;
    const el=document.getElementById('teamPartialSummary'); if(!el) return;
    el.innerHTML=`<div class="sum-team"><i>👥</i><span>Equipe</span><strong>${rows.length}</strong></div><div class="sum-hit"><i>🎯</i><span>Meta batida</span><strong>${hit}</strong></div><div class="sum-progress"><i>◔</i><span>Em andamento</span><strong>${progress}</strong></div><div class="sum-zero"><i>✕</i><span>Zerados</span><strong>${zero}</strong></div>`;
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
    // Ordem oficial do relatório:
    // mercantil | elegível | qtd elegível | garantia | seguro | presta-mista | qtd garantias | conversão | eficiência
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
    // 1) tenta linha por linha — formato de Ctrl+C/Ctrl+V do relatório.
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
    // 2) fallback OCR: agrupa o trecho entre um vendedor identificado e o seguinte.
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
    }catch(e){ status.textContent='Não foi possível concluir a leitura automática. Você ainda pode preencher manualmente.'; }
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
      wrap.className='team-export-stage team-export-ranking';
      wrap.style.cssText='position:fixed;left:-12000px;top:0;width:1800px;background:#edf5ff;padding:30px;z-index:-1;box-sizing:border-box';
      const clone=partial.cloneNode(true);
      wrap.appendChild(clone); document.body.appendChild(wrap);
      clone.querySelectorAll('button,.team-partial-actions,.team-partial-detail,.team-partial-empty').forEach(x=>x.remove());
      const head=clone.querySelector('.team-partial-head');
      if(head){
        head.innerHTML=`<div class="export-title-copy"><span class="team-partial-eyebrow">ACOMPANHAMENTO PARCIAL</span><h3>Resultado parcial da equipe</h3></div><span class="team-export-date">📅 ${date.split('-').reverse().join('/')}</span><span class="team-export-trophy">🏆</span>`;
      }
      const sub=document.createElement('div'); sub.className='team-export-ranking-head'; sub.innerHTML='<div><h4>Ranking parcial</h4><p>Ordem decrescente pelo desempenho do dia.</p></div><span>Atualização durante o dia</span>';
      const summary=clone.querySelector('.team-partial-summary'); if(summary) summary.before(sub);
      const canvas=await html2canvas(wrap,{scale:4.25,backgroundColor:'#edf5ff',useCORS:true,logging:false,windowWidth:1800,imageTimeout:20000});
      wrap.remove();
      const a=document.createElement('a'); a.download=`resultado-parcial-equipe-${date}.png`; a.href=canvas.toDataURL('image/png',1); a.click();
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
