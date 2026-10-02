(() => {
  'use strict';
  if (window.__fsHistoricalReportV2) return;
  window.__fsHistoricalReportV2 = true;

  const STORE = 'fs_gestao_resultados_v2';
  const CONTEXT_STORE = 'fs_historical_report_context_v2';
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const MONEY = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const DEC = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  const parseNum = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let s = String(value ?? '').trim().replace(/R\$|%|\s/g,'');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
    const n = Number(s); return Number.isFinite(n) ? Math.max(0,n) : 0;
  };
  const moneyInputValue = v => v ? Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '';
  const pctInputValue = v => v || v === 0 ? Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '';
  const sellerKey = s => String(s?.id || norm(s?.name));
  const sellerIdentity = s => norm(s?.name) || String(s?.id||'');
  const reportKey = (branch,seller) => `${norm(branch)}|NAME:${sellerIdentity(seller)}`;
  const nowYear = new Date().getFullYear();

  function loadVault(){
    try { const v=JSON.parse(localStorage.getItem(STORE)||'null'); return v?.records ? v : {version:2,records:{}}; }
    catch { return {version:2,records:{}}; }
  }
  function currentRecord(vault){
    return vault.records?.[vault.currentKey] || Object.values(vault.records||{}).sort((a,b)=>String(b?.month||'').localeCompare(String(a?.month||'')))[0] || null;
  }
  function currentBranch(vault){ return currentRecord(vault)?.branch || Object.values(vault.records||{}).find(r=>r?.branch)?.branch || ''; }
  function allSellers(vault,branch){
    const map=new Map();
    Object.values(vault.records||{}).filter(r=>norm(r?.branch)===norm(branch)).forEach(r=>(r.sellers||[]).forEach((s,i)=>{
      // O mesmo vendedor pode ter IDs diferentes em competências antigas. Para a lista
      // de relatórios, o nome normalizado é a identidade principal e elimina duplicações
      // como Eduardo/EDUARDO ou Darlan/DARLAN.
      const key=sellerIdentity(s)||`seller-${i}`;
      const prior=map.get(key);
      const priorTs=Date.parse(prior?.updatedAt||0)||0, currentTs=Date.parse(s?.updatedAt||0)||0;
      if(!prior || currentTs>=priorTs) map.set(key,{...s,__identity:key});
    }));
    return [...map.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR',{sensitivity:'base'}));
  }
  function findSellerInRecord(record,target){
    if(!record||!target)return null;
    const key=sellerKey(target), name=norm(target.name);
    return (record.sellers||[]).find(s=>sellerKey(s)===key) || (record.sellers||[]).find(s=>norm(s.name)===name) || null;
  }
  function monthRecord(vault,branch,year,monthIndex){
    const mk=`${year}-${String(monthIndex+1).padStart(2,'0')}`;
    return Object.values(vault.records||{}).find(r=>norm(r?.branch)===norm(branch)&&String(r?.month)===mk) || null;
  }
  function aggregateSeller(seller){
    if(!seller)return {merc:0,services:0,conversion:0,efficiency:0};
    const daily=seller.daily&&typeof seller.daily==='object'?Object.values(seller.daily):[];
    if(daily.length){
      let merc=0,eligible=0,services=0,nfs=0,warrantyQty=0;
      daily.forEach(d=>{merc+=parseNum(d.general);eligible+=parseNum(d.eligible);services+=parseNum(d.warranty)+parseNum(d.other)+parseNum(d.mixed);nfs+=parseNum(d.nfs);warrantyQty+=parseNum(d.warrantyQty)});
      merc += parseNum(seller.ecommerce);
      return {merc,services,conversion:nfs?warrantyQty/nfs*100:0,efficiency:eligible?services/eligible*100:0};
    }
    const services=parseNum(seller.warranty)+parseNum(seller.other)+parseNum(seller.mixed);
    return {merc:parseNum(seller.general)+parseNum(seller.ecommerce),services,conversion:parseNum(seller.nfs)?parseNum(seller.warrantyQty)/parseNum(seller.nfs)*100:0,efficiency:parseNum(seller.eligible)?services/parseNum(seller.eligible)*100:0};
  }
  function emptyMonth(){return {merc:0,mercGoal:0,services:0,serviceGoal:0,conversion:0,efficiency:0};}
  function ensureYear(report,year){
    report.years=report.years||{};
    report.years[year]=report.years[year]||{};
    for(let i=0;i<12;i++) report.years[year][i]=Object.assign(emptyMonth(),report.years[year][i]||{});
  }
  function getReport(vault,branch,seller,yearA,yearB){
    vault.historicalReports=vault.historicalReports||{};
    const key=reportKey(branch,seller), identity=sellerIdentity(seller), id=sellerKey(seller);
    let report=vault.historicalReports[key];
    // Migra automaticamente relatórios que tenham sido salvos na V151 com chave por ID.
    if(!report){
      const priorEntry=Object.entries(vault.historicalReports).find(([,r])=>norm(r?.branch)===norm(branch)&&(sellerIdentity({name:r?.sellerName})===identity||String(r?.sellerId||'')===id));
      if(priorEntry){ report=priorEntry[1]; if(priorEntry[0]!==key) delete vault.historicalReports[priorEntry[0]]; }
    }
    report=report||{branch,sellerId:id,sellerName:seller.name||'',updatedAt:new Date(0).toISOString(),years:{}};
    report.branch=branch;report.sellerId=id;report.sellerName=seller.name||report.sellerName;
    ensureYear(report,yearA);ensureYear(report,yearB);
    vault.historicalReports[key]=report;
    return {key,report};
  }
  function storedMonthlyGoals(s,monthKey){
    const g=s?.goalSetupByMonth?.[monthKey]||s?.goalsByMonth?.[monthKey]||null;
    const merc=parseNum(g?.mercantile ?? g?.mercantil ?? g?.merc ?? s?.assignedGoal);
    const services=parseNum(g?.services ?? g?.servicos ?? g?.service ?? s?.serviceGoal);
    return {merc,services};
  }
  function hydrateAvailableFromPlatform(vault,report,branch,seller,years){
    let imported=0;
    years.forEach(year=>{
      ensureYear(report,year);
      for(let i=0;i<12;i++){
        const mk=`${year}-${String(i+1).padStart(2,'0')}`;
        const rec=monthRecord(vault,branch,year,i), s=findSellerInRecord(rec,seller), row=report.years[year][i];
        if(!s)continue;
        const a=aggregateSeller(s), goals=storedMonthlyGoals(s,mk);
        let touched=false;
        if(!parseNum(row.merc)&&a.merc){row.merc=a.merc;touched=true}
        if(!parseNum(row.services)&&a.services){row.services=a.services;touched=true}
        if(!parseNum(row.conversion)&&a.conversion){row.conversion=a.conversion;touched=true}
        if(!parseNum(row.efficiency)&&a.efficiency){row.efficiency=a.efficiency;touched=true}
        if(!parseNum(row.mercGoal)&&goals.merc){row.mercGoal=goals.merc;touched=true}
        if(!parseNum(row.serviceGoal)&&goals.services){row.serviceGoal=goals.services;touched=true}
        if(touched)imported++;
      }
    });
    return imported;
  }
  function loadContext(){try{return JSON.parse(localStorage.getItem(CONTEXT_STORE)||'{}')||{}}catch{return {}}}
  function saveContext(){
    try{localStorage.setItem(CONTEXT_STORE,JSON.stringify({branch:state.branch,sellerIdentity:sellerIdentity(state.seller),sellerId:sellerKey(state.seller),yearA:state.yearA,yearB:state.yearB,tab:state.tab,updatedAt:new Date().toISOString()}))}catch{}
  }
  function hydrateGoalsFromPlatform(vault,report,branch,seller,years){
    years.forEach(year=>{
      ensureYear(report,year);
      for(let i=0;i<12;i++){
        const rec=monthRecord(vault,branch,year,i), s=findSellerInRecord(rec,seller), row=report.years[year][i];
        if(!s)continue;
        const mk=`${year}-${String(i+1).padStart(2,'0')}`,g=storedMonthlyGoals(s,mk);
        if(!parseNum(row.mercGoal)&&g.merc)row.mercGoal=g.merc;
        if(!parseNum(row.serviceGoal)&&g.services)row.serviceGoal=g.services;
      }
    });
  }
  function saveVault(vault,reportKeyValue,report){
    vault.historicalReports=vault.historicalReports||{};
    report.updatedAt=new Date().toISOString();
    vault.historicalReports[reportKeyValue]=report;
    localStorage.setItem(STORE,JSON.stringify(vault));
    try{window.ResultsCloudSync?.queue?.(vault)}catch{}
  }

  function addStyles(){
    if(document.getElementById('historicalReportCssV2'))return;
    const st=document.createElement('style');st.id='historicalReportCssV2';st.textContent=`
    .historical-report-launch{white-space:nowrap}
    .hr-modal[hidden]{display:none!important}.hr-modal{position:fixed;inset:0;z-index:100200;background:rgba(8,24,42,.62);display:grid;place-items:center;padding:18px}
    .hr-dialog{width:min(1720px,97vw);height:min(94vh,980px);background:#f7faff;border-radius:24px;box-shadow:0 30px 100px rgba(5,20,40,.38);overflow:hidden;display:flex;flex-direction:column}
    .hr-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 20px;background:linear-gradient(135deg,#0879e8,#6049e8);color:#fff}.hr-head h2{margin:0;font-size:23px}.hr-head p{margin:3px 0 0;font-size:11px;opacity:.88}.hr-close{width:40px;height:40px;border:0;border-radius:12px;background:rgba(255,255,255,.16);color:#fff;font-size:25px;cursor:pointer}
    .hr-toolbar{display:grid;grid-template-columns:minmax(220px,1.6fr) 160px 160px auto auto;gap:9px;align-items:end;padding:12px 18px;border-bottom:1px solid #dde6f0;background:#fff}.hr-toolbar label,.hr-field label{display:block;font-size:9px;font-weight:900;color:#66778b;text-transform:uppercase;margin-bottom:4px}.hr-toolbar select,.hr-toolbar input,.hr-field input{width:100%;border:1px solid #d6e0eb;border-radius:11px;padding:10px 11px;background:#fff;color:#17324d;font:inherit;font-weight:800}.hr-toolbar button{min-height:42px}
    .hr-tabs{display:flex;gap:7px;padding:10px 18px;background:#fff;border-bottom:1px solid #e3eaf2}.hr-tab{border:1px solid #d7e2ed;border-radius:999px;padding:9px 15px;background:#fff;color:#435a73;font-weight:900;cursor:pointer}.hr-tab.active{background:linear-gradient(135deg,#0879e8,#5362e7);color:#fff;border-color:transparent}
    .hr-body{flex:1;min-height:0;overflow:auto;padding:16px 18px 22px}.hr-pane{display:none}.hr-pane.active{display:block}.hr-note{padding:10px 12px;border-radius:13px;background:#eef6ff;color:#426a90;font-size:11px;line-height:1.45;margin-bottom:12px}
    .hr-entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hr-year-panel{background:#fff;border:1px solid #dfe7f0;border-radius:18px;overflow:hidden}.hr-year-title{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#f5f8fc;border-bottom:1px solid #e1e8f0}.hr-year-title strong{font-size:18px}.hr-year-title small{color:#708197}.hr-entry-table{width:100%;border-collapse:collapse}.hr-entry-table th{position:sticky;top:0;background:#f8fbff;z-index:1;font-size:8px;text-transform:uppercase;color:#64758a;padding:7px 5px;border-bottom:1px solid #e1e8f0}.hr-entry-table td{padding:5px;border-bottom:1px solid #edf1f5}.hr-entry-table td:first-child{font-weight:900;color:#17324d;width:64px}.hr-entry-table input{width:100%;min-width:76px;border:1px solid #dbe4ed;border-radius:8px;padding:7px 7px;font-size:10px;font-weight:750;color:#18334e;background:#fff}.hr-entry-table input.hr-goal{background:#fffaf0;border-color:#f0dfb0}.hr-year-actions{display:flex;gap:8px;padding:10px 12px;background:#fbfcfe}.hr-year-actions button{font-size:10px}
    .hr-dashboard{display:grid;gap:14px}.hr-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.hr-overview-card{background:#fff;border:1px solid #dfe7f0;border-radius:16px;padding:12px}.hr-overview-card span{display:block;font-size:9px;font-weight:900;color:#718096;text-transform:uppercase}.hr-overview-card strong{display:block;margin-top:5px;font-size:20px;color:#17324d}.hr-overview-card small{display:block;margin-top:4px;color:#687a8f}
    .hr-indicator{background:#fff;border:1px solid #dfe7f0;border-radius:20px;padding:14px;break-inside:avoid}.hr-indicator-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:11px 13px;border-radius:14px;background:#f7fbff;margin-bottom:10px}.hr-indicator-head h3{margin:0;font-size:19px}.hr-indicator-head p{margin:3px 0 0;color:#718096;font-size:10px}.hr-indicator-summary{display:flex;gap:10px;flex-wrap:wrap}.hr-summary-chip{padding:7px 9px;border:1px solid #dfe6ef;border-radius:10px;background:#fff;min-width:125px}.hr-summary-chip span{display:block;font-size:8px;color:#718096;font-weight:900;text-transform:uppercase}.hr-summary-chip strong{display:block;margin-top:3px;font-size:14px}.hr-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hr-chart-card{border:1px solid #e1e8f0;border-radius:14px;padding:10px;overflow:auto}.hr-chart-card h4{margin:0 0 3px;font-size:14px}.hr-chart-card p{margin:0 0 6px;color:#718096;font-size:9px}.hr-chart-svg{display:block;width:100%;min-width:720px;height:auto}.hr-goal-hit-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.hr-goal-badge{padding:5px 8px;border-radius:999px;background:#e9f8ef;color:#138450;font-size:9px;font-weight:900}.hr-goal-none{font-size:9px;color:#8996a5}
    .hr-empty{padding:30px;text-align:center;color:#75869a;background:#fff;border:1px dashed #ccd7e3;border-radius:16px}
    .hr-print-only{display:none}
    @media(max-width:1100px){.hr-toolbar{grid-template-columns:1fr 1fr 1fr}.hr-toolbar .btn{width:100%}.hr-entry-grid{grid-template-columns:1fr}.hr-chart-grid{grid-template-columns:1fr}.hr-overview{grid-template-columns:1fr 1fr}}
    @media(max-width:700px){.hr-modal{padding:0}.hr-dialog{width:100vw;height:100dvh;border-radius:0}.hr-toolbar{grid-template-columns:1fr 1fr}.hr-toolbar>div:first-child{grid-column:1/-1}.hr-tabs{overflow-x:auto}.hr-body{padding:12px}.hr-overview{grid-template-columns:1fr}.hr-entry-table{min-width:760px}.hr-year-panel{overflow:auto}.hr-head h2{font-size:19px}}
    `;document.head.appendChild(st);
  }

  function createModal(){
    let modal=document.getElementById('historicalReportModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='historicalReportModal';modal.className='hr-modal';modal.hidden=true;modal.innerHTML=`<div class="hr-dialog" role="dialog" aria-modal="true" aria-label="Relatório histórico comparativo"><div class="hr-head"><div><h2>📑 Relatório Histórico por Colaborador</h2><p>Totais mensais consolidados para comparação entre dois anos, sem interferir nos lançamentos diários.</p></div><button class="hr-close" type="button" aria-label="Fechar">×</button></div><div class="hr-toolbar"><div><label>Colaborador</label><select id="hrSeller"></select></div><div><label>Ano base</label><input id="hrYearA" type="number" min="2000" max="2100"></div><div><label>Ano comparado</label><input id="hrYearB" type="number" min="2000" max="2100"></div><button class="btn soft" id="hrSave" type="button">💾 Salvar</button><button class="btn primary" id="hrPrint" type="button">🧾 Relatório A4</button></div><div class="hr-tabs"><button class="hr-tab active" data-hr-tab="entry">✍️ Dados mensais</button><button class="hr-tab" data-hr-tab="dashboard">📊 Dashboard comparativo</button></div><div class="hr-body"><section class="hr-pane active" data-hr-pane="entry"><div class="hr-note">Informe somente os totais de cada mês. As metas mercantis e de serviços são preenchidas automaticamente quando já existirem na plataforma e podem ser corrigidas manualmente para meses antigos. Conversão usa referência de <b>35%</b> e Eficiência de <b>7%</b>.</div><div id="hrEntry"></div></section><section class="hr-pane" data-hr-pane="dashboard"><div id="hrDashboard" class="hr-dashboard"></div></section></div></div>`;
    document.body.appendChild(modal);return modal;
  }

  let state={vault:null,branch:'',sellers:[],seller:null,yearA:nowYear-1,yearB:nowYear,key:'',report:null,tab:'entry'};
  function formatField(field,v){return field==='conversion'||field==='efficiency'?pctInputValue(v):moneyInputValue(v)}
  function inputFor(year,month,field,row){
    const goal=field==='mercGoal'||field==='serviceGoal';
    return `<input class="${goal?'hr-goal':''}" data-hr-year="${year}" data-hr-month="${month}" data-hr-field="${field}" inputmode="decimal" value="${esc(formatField(field,row[field]))}" placeholder="${field==='conversion'||field==='efficiency'?'0,00':'0,00'}">`;
  }
  function yearTable(year){
    ensureYear(state.report,year);
    const rows=MONTHS.map((m,i)=>{const r=state.report.years[year][i];return `<tr><td>${m}</td><td>${inputFor(year,i,'merc',r)}</td><td>${inputFor(year,i,'mercGoal',r)}</td><td>${inputFor(year,i,'services',r)}</td><td>${inputFor(year,i,'serviceGoal',r)}</td><td>${inputFor(year,i,'conversion',r)}</td><td>${inputFor(year,i,'efficiency',r)}</td></tr>`}).join('');
    return `<article class="hr-year-panel"><div class="hr-year-title"><strong>${year}</strong><small>12 meses • valores consolidados</small></div><div style="overflow:auto"><table class="hr-entry-table"><thead><tr><th>Mês</th><th>Mercantil</th><th>Meta Merc.</th><th>Serviços</th><th>Meta Serv.</th><th>Conversão %</th><th>Eficiência %</th></tr></thead><tbody>${rows}</tbody></table></div><div class="hr-year-actions"><button class="btn soft" type="button" data-hr-import="${year}">↙ Puxar meses já existentes</button><button class="btn soft" type="button" data-hr-goals="${year}">🎯 Atualizar metas salvas</button></div></article>`;
  }
  function renderEntry(){const host=document.getElementById('hrEntry');if(!host)return;host.innerHTML=`<div class="hr-entry-grid">${yearTable(state.yearA)}${yearTable(state.yearB)}</div>`}
  function syncInputsToReport(){
    document.querySelectorAll('#historicalReportModal [data-hr-year][data-hr-month][data-hr-field]').forEach(input=>{
      const y=String(input.dataset.hrYear),m=Number(input.dataset.hrMonth),f=input.dataset.hrField;ensureYear(state.report,y);state.report.years[y][m][f]=parseNum(input.value);
    });
  }
  function importYear(year,includeValues=true,includeGoals=true){
    const vault=state.vault;ensureYear(state.report,year);let count=0;
    for(let i=0;i<12;i++){
      const rec=monthRecord(vault,state.branch,year,i),s=findSellerInRecord(rec,state.seller);if(!s)continue;
      const row=state.report.years[year][i],a=aggregateSeller(s);
      if(includeValues){ if(!parseNum(row.merc)&&a.merc)row.merc=a.merc;if(!parseNum(row.services)&&a.services)row.services=a.services;if(!parseNum(row.conversion)&&a.conversion)row.conversion=a.conversion;if(!parseNum(row.efficiency)&&a.efficiency)row.efficiency=a.efficiency; }
      if(includeGoals){ const mk=`${year}-${String(i+1).padStart(2,'0')}`,g=storedMonthlyGoals(s,mk);if(!parseNum(row.mercGoal)&&g.merc)row.mercGoal=g.merc;if(!parseNum(row.serviceGoal)&&g.services)row.serviceGoal=g.services; }
      count++;
    }
    renderEntry();return count;
  }

  function metricConfig(metric){
    if(metric==='merc')return {title:'💰 Venda mercantil',desc:'Total mensal consolidado do vendedor.',money:true,goal:r=>parseNum(r.mercGoal),value:r=>parseNum(r.merc)};
    if(metric==='services')return {title:'🛡️ Serviços',desc:'Garantias, presta-mista e demais serviços do mês.',money:true,goal:r=>parseNum(r.serviceGoal),value:r=>parseNum(r.services)};
    if(metric==='conversion')return {title:'🎯 Conversão',desc:'Comparativo mensal da taxa de conversão. Meta 35%.',percent:true,goal:()=>35,value:r=>parseNum(r.conversion)};
    return {title:'⚡ Eficiência',desc:'Comparativo mensal da eficiência. Meta 7%.',percent:true,goal:()=>7,value:r=>parseNum(r.efficiency)};
  }
  function hasData(row,metric){const c=metricConfig(metric);return c.value(row)>0 || (metric==='merc'&&c.goal(row)>0)||(metric==='services'&&c.goal(row)>0)}
  function fmtMetric(v,c,compact=false){
    if(c.money){if(compact){const a=Math.abs(v);return a>=1e6?`R$ ${(v/1e6).toFixed(1).replace('.',',')} mi`:a>=1e3?`R$ ${(v/1e3).toFixed(0).replace('.',',')} mil`:MONEY.format(v)}return MONEY.format(v)}
    return `${DEC.format(v)}%`;
  }
  function yearSeries(year,metric){ensureYear(state.report,year);const c=metricConfig(metric);return MONTHS.map((m,i)=>{const row=state.report.years[year][i];return {month:m,value:c.value(row),goal:c.goal(row),has:hasData(row,metric),hit:c.goal(row)>0&&c.value(row)>=c.goal(row)}})}
  function summaryFor(series,c){const rows=series.filter(x=>x.has);if(!rows.length)return 0;return c.money?rows.reduce((s,x)=>s+x.value,0):rows.reduce((s,x)=>s+x.value,0)/rows.length}
  function chartSvg(metric,type){
    const c=metricConfig(metric),a=yearSeries(state.yearA,metric),b=yearSeries(state.yearB,metric),all=[...a,...b].filter(x=>x.has).map(x=>Math.max(x.value,x.goal||0));let max=Math.max(1,...all);if(c.percent){max=Math.max(max,metric==='conversion'?40:10)}max*=1.12;
    const W=1100,H=330,L=62,R=24,T=24,B=46,plotW=W-L-R,plotH=H-T-B,step=plotW/12;
    const y=v=>T+plotH-(Math.max(0,v)/max*plotH), fmt=v=>fmtMetric(v,c,true);
    let grid='';for(let i=0;i<=4;i++){const val=max*(4-i)/4,yy=T+plotH*i/4;grid+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e6edf5"/><text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="10" fill="#7a899a">${esc(fmt(val))}</text>`}
    const labels=MONTHS.map((m,i)=>`<text x="${L+step*(i+.5)}" y="${H-16}" text-anchor="middle" font-size="11" fill="#63758b">${m}</text>`).join('');
    let marks='';
    const colors=['#1688ec','#6a55d8'];
    if(type==='bar'){
      const bw=Math.min(26,step*.28);
      [a,b].forEach((s,si)=>s.forEach((p,i)=>{if(!p.has)return;const cx=L+step*(i+.5)+(si===0?-bw*.58:bw*.58),yy=y(p.value),h=T+plotH-yy;marks+=`<rect x="${cx-bw/2}" y="${yy}" width="${bw}" height="${Math.max(1,h)}" rx="5" fill="${colors[si]}" opacity=".92"/><text x="${cx}" y="${Math.max(T+9,yy-5)}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#41556d">${esc(fmtMetric(p.value,c,true))}</text>${p.hit?`<circle cx="${cx}" cy="${Math.max(T+12,yy-18)}" r="7" fill="#16a36b"/><text x="${cx}" y="${Math.max(T+15,yy-15)}" text-anchor="middle" font-size="9" font-weight="900" fill="#fff">✓</text>`:''}`;}));
    }else{
      [a,b].forEach((s,si)=>{let seg=[];const flush=()=>{if(seg.length>1)marks+=`<path d="${seg.map((p,j)=>`${j?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${colors[si]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;seg=[]};s.forEach((p,i)=>{if(!p.has){flush();return}const pt={x:L+step*(i+.5),y:y(p.value),p};seg.push(pt);marks+=`<circle cx="${pt.x}" cy="${pt.y}" r="4.5" fill="${colors[si]}" stroke="${p.hit?'#16a36b':'#fff'}" stroke-width="${p.hit?4:2}"/><text x="${pt.x}" y="${Math.max(T+10,pt.y-9)}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#41556d">${esc(fmtMetric(p.value,c,true))}</text>`});flush();});
    }
    const legend=`<g><circle cx="${L+8}" cy="10" r="5" fill="${colors[0]}"/><text x="${L+18}" y="14" font-size="11" font-weight="800" fill="#41556d">${state.yearA}</text><circle cx="${L+92}" cy="10" r="5" fill="${colors[1]}"/><text x="${L+102}" y="14" font-size="11" font-weight="800" fill="#41556d">${state.yearB}</text><circle cx="${L+185}" cy="10" r="5" fill="#16a36b"/><text x="${L+195}" y="14" font-size="10" fill="#587086">meta batida</text></g>`;
    return `<svg class="hr-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)} ${type==='bar'?'barras':'tendência'}">${legend}${grid}${labels}${marks}</svg>`;
  }
  function hitBadges(metric){
    const a=yearSeries(state.yearA,metric).filter(x=>x.hit).map(x=>`${x.month}/${String(state.yearA).slice(-2)}`),b=yearSeries(state.yearB,metric).filter(x=>x.hit).map(x=>`${x.month}/${String(state.yearB).slice(-2)}`),all=[...a,...b];
    return all.length?`<div class="hr-goal-hit-list"><span class="hr-goal-none">Meta batida:</span>${all.map(x=>`<span class="hr-goal-badge">✓ ${x}</span>`).join('')}</div>`:`<div class="hr-goal-hit-list"><span class="hr-goal-none">Nenhum mês com meta identificada/batida nos dados informados.</span></div>`;
  }
  function indicatorHtml(metric){
    const c=metricConfig(metric),a=yearSeries(state.yearA,metric),b=yearSeries(state.yearB,metric),sa=summaryFor(a,c),sb=summaryFor(b,c),delta=c.money?(sa?((sb-sa)/sa*100):0):(sb-sa),countA=a.filter(x=>x.has).length,countB=b.filter(x=>x.has).length;
    const deltaText=c.money?`${delta>=0?'▲':'▼'} ${DEC.format(Math.abs(delta))}%`:`${delta>=0?'▲':'▼'} ${DEC.format(Math.abs(delta))} p.p.`;
    return `<section class="hr-indicator" data-hr-metric="${metric}"><div class="hr-indicator-head"><div><h3>${c.title}</h3><p>${c.desc}</p></div><div class="hr-indicator-summary"><div class="hr-summary-chip"><span>${state.yearA}</span><strong>${fmtMetric(sa,c)}</strong><small>${countA} mês(es)</small></div><div class="hr-summary-chip"><span>${state.yearB}</span><strong>${fmtMetric(sb,c)}</strong><small>${countB} mês(es)</small></div><div class="hr-summary-chip"><span>Variação</span><strong class="${delta>=0?'positive':'negative'}">${deltaText}</strong></div></div></div><div class="hr-chart-grid"><div class="hr-chart-card"><h4>Comparativo mês a mês</h4><p>Barras lado a lado: ${state.yearA} × ${state.yearB}.</p>${chartSvg(metric,'bar')}</div><div class="hr-chart-card"><h4>Linha de tendência</h4><p>Evolução mensal de cada ano.</p>${chartSvg(metric,'line')}</div></div>${hitBadges(metric)}</section>`;
  }
  function renderDashboard(){
    const host=document.getElementById('hrDashboard');if(!host)return;
    syncInputsToReport();
    const metrics=['merc','services','conversion','efficiency'];
    const any=metrics.some(m=>yearSeries(state.yearA,m).some(x=>x.has)||yearSeries(state.yearB,m).some(x=>x.has));
    if(!any){host.innerHTML='<div class="hr-empty">Preencha ao menos um mês na aba <b>Dados mensais</b> para gerar o dashboard histórico.</div>';return}
    host.innerHTML=`<div class="hr-overview"><div class="hr-overview-card"><span>Colaborador</span><strong>${esc(state.seller?.name||'—')}</strong><small>${esc(state.branch||'—')}</small></div><div class="hr-overview-card"><span>Comparação</span><strong>${state.yearA} × ${state.yearB}</strong><small>Totais mensais consolidados</small></div><div class="hr-overview-card"><span>Conversão</span><strong>Meta 35%</strong><small>Referência fixa</small></div><div class="hr-overview-card"><span>Eficiência</span><strong>Meta 7%</strong><small>Referência fixa</small></div></div>${metrics.map(indicatorHtml).join('')}`;
  }

  function printReport(){
    syncInputsToReport();renderDashboard();saveCurrent(false);
    const host=document.getElementById('hrDashboard');if(!host||host.querySelector('.hr-empty')){alert('Preencha os dados do relatório antes de gerar o PDF.');return}
    const frame=document.createElement('iframe');frame.style.position='fixed';frame.style.width='1px';frame.style.height='1px';frame.style.opacity='0';frame.style.pointerEvents='none';frame.style.border='0';document.body.appendChild(frame);const w=frame.contentWindow;if(!w){frame.remove();return}
    const generated=new Date().toLocaleString('pt-BR');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório histórico - ${esc(state.seller?.name||'')}</title><style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17324d;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.phead{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:12px 16px;border-radius:14px;background:linear-gradient(135deg,#0879e8,#6049e8);color:white;margin-bottom:8px}.phead h1{margin:0;font-size:22px}.phead p{margin:3px 0 0;font-size:10px;opacity:.9}.pmeta{text-align:right;font-size:9px;line-height:1.45}.hr-overview{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px}.hr-overview-card{border:1px solid #dfe7f0;border-radius:10px;padding:8px}.hr-overview-card span{display:block;font-size:7px;font-weight:900;color:#718096;text-transform:uppercase}.hr-overview-card strong{display:block;margin-top:3px;font-size:13px}.hr-overview-card small{font-size:7px;color:#718096}.hr-indicator{border:1px solid #dfe7f0;border-radius:12px;padding:8px;margin:0;break-inside:avoid;page-break-inside:avoid}.hr-indicator+.hr-indicator{break-before:page;page-break-before:always}.hr-indicator-head{display:flex;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:9px;background:#f7fbff;margin-bottom:6px}.hr-indicator-head h3{margin:0;font-size:14px}.hr-indicator-head p{margin:2px 0 0;font-size:7px;color:#718096}.hr-indicator-summary{display:flex;gap:6px}.hr-summary-chip{border:1px solid #dfe6ef;border-radius:8px;padding:5px 7px;min-width:105px}.hr-summary-chip span{display:block;font-size:6px;color:#718096;font-weight:900;text-transform:uppercase}.hr-summary-chip strong{display:block;font-size:10px;margin-top:2px}.hr-summary-chip small{font-size:6px;color:#718096}.hr-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.hr-chart-card{border:1px solid #e1e8f0;border-radius:9px;padding:6px;overflow:hidden}.hr-chart-card h4{margin:0;font-size:9px}.hr-chart-card p{margin:1px 0 3px;font-size:6px;color:#718096}.hr-chart-svg{display:block;width:100%;height:auto}.hr-goal-hit-list{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}.hr-goal-badge{padding:3px 5px;border-radius:999px;background:#e9f8ef;color:#138450;font-size:6px;font-weight:900}.hr-goal-none{font-size:6px;color:#8290a1}.positive{color:#138450}.negative{color:#c53850}</style></head><body><div class="phead"><div><h1>Relatório Histórico Comparativo</h1><p>${esc(state.seller?.name||'')} • ${esc(state.branch)} • ${state.yearA} × ${state.yearB}</p></div><div class="pmeta">Dados mensais consolidados<br>Gerado em ${esc(generated)}</div></div>${host.innerHTML}</body></html>`);w.document.close();setTimeout(()=>{try{w.focus();w.print()}catch{}},350);
  }

  function saveCurrent(notify=true){
    if(!state.report||!state.key)return;syncInputsToReport();saveVault(state.vault,state.key,state.report);saveContext();if(notify){const b=document.getElementById('hrSave');if(b){const old=b.textContent;b.textContent='✓ Salvo';setTimeout(()=>b.textContent=old,1200)}}
  }
  function loadSelection(){
    const sellerSel=document.getElementById('hrSeller'),yA=document.getElementById('hrYearA'),yB=document.getElementById('hrYearB'),ctx=loadContext();
    state.vault=loadVault();state.branch=currentBranch(state.vault);state.sellers=allSellers(state.vault,state.branch);
    const selectedIdentity=sellerSel?.value||sellerIdentity(state.seller)||ctx.sellerIdentity||sellerIdentity(state.sellers[0]);
    state.seller=state.sellers.find(s=>sellerIdentity(s)===selectedIdentity)||state.sellers.find(s=>String(sellerKey(s))===String(ctx.sellerId||''))||state.sellers[0]||null;
    state.yearA=Math.max(2000,Number(yA?.value)||Number(ctx.yearA)||state.yearA||nowYear-1);state.yearB=Math.max(2000,Number(yB?.value)||Number(ctx.yearB)||state.yearB||nowYear);
    if(!state.seller){state.report=null;state.key='';return}
    const got=getReport(state.vault,state.branch,state.seller,String(state.yearA),String(state.yearB));state.key=got.key;state.report=got.report;
    // Tudo que já existir na plataforma entra automaticamente, sem sobrescrever valores manuais.
    hydrateAvailableFromPlatform(state.vault,state.report,state.branch,state.seller,[String(state.yearA),String(state.yearB)]);
    saveContext();
  }
  function renderSetupOptions(){
    const sel=document.getElementById('hrSeller');if(!sel)return;const chosen=sellerIdentity(state.seller);sel.innerHTML=state.sellers.map(s=>`<option value="${esc(sellerIdentity(s))}" ${sellerIdentity(s)===chosen?'selected':''}>${esc(s.name||'Sem nome')}</option>`).join('');document.getElementById('hrYearA').value=state.yearA;document.getElementById('hrYearB').value=state.yearB;
  }
  function rerenderAll(){loadSelection();renderSetupOptions();if(!state.seller){document.getElementById('hrEntry').innerHTML='<div class="hr-empty">Nenhum vendedor encontrado nesta filial.</div>';document.getElementById('hrDashboard').innerHTML='';return}renderEntry();renderDashboard()}
  function setTab(tab){state.tab=tab;saveContext();document.querySelectorAll('#historicalReportModal .hr-tab').forEach(b=>b.classList.toggle('active',b.dataset.hrTab===tab));document.querySelectorAll('#historicalReportModal .hr-pane').forEach(p=>p.classList.toggle('active',p.dataset.hrPane===tab));if(tab==='dashboard')renderDashboard()}
  function open(){addStyles();const modal=createModal(),ctx=loadContext();state.vault=loadVault();state.branch=currentBranch(state.vault);state.sellers=allSellers(state.vault,state.branch);state.seller=state.sellers.find(s=>sellerIdentity(s)===ctx.sellerIdentity)||state.sellers[0]||null;state.yearA=Number(ctx.yearA)||nowYear-1;state.yearB=Number(ctx.yearB)||nowYear;state.tab=ctx.tab==='dashboard'?'dashboard':'entry';renderSetupOptions();rerenderAll();setTab(state.tab);modal.hidden=false;document.body.style.overflow='hidden'}
  function close(){const m=document.getElementById('historicalReportModal');if(m)m.hidden=true;document.body.style.overflow=''}
  function wire(){
    addStyles();const nav=document.querySelector('nav.tabs');if(nav&&!document.getElementById('historicalReportLaunch')){const btn=document.createElement('button');btn.id='historicalReportLaunch';btn.type='button';btn.className='tab historical-report-launch';btn.textContent='📑 Relatórios';nav.appendChild(btn);btn.addEventListener('click',open)}
    const m=createModal();m.querySelector('.hr-close').addEventListener('click',close);m.addEventListener('click',e=>{if(e.target===m)close()});
    m.querySelectorAll('.hr-tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.hrTab)));
    document.getElementById('hrSeller').addEventListener('change',()=>{saveCurrent(false);rerenderAll()});
    ['hrYearA','hrYearB'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{saveCurrent(false);rerenderAll()}));
    document.getElementById('hrSave').addEventListener('click',()=>saveCurrent(true));document.getElementById('hrPrint').addEventListener('click',printReport);
    m.addEventListener('change',e=>{if(e.target.matches('[data-hr-year][data-hr-month][data-hr-field]'))syncInputsToReport()});
    m.addEventListener('click',e=>{const imp=e.target.closest('[data-hr-import]');if(imp){syncInputsToReport();const c=importYear(String(imp.dataset.hrImport),true,true);alert(c?`${c} mês(es) encontrados na plataforma foram aproveitados sem sobrescrever valores já digitados.`:'Nenhum mês existente foi encontrado para este vendedor nesse ano.');return}const goals=e.target.closest('[data-hr-goals]');if(goals){syncInputsToReport();const c=importYear(String(goals.dataset.hrGoals),false,true);alert(c?`Metas localizadas em ${c} competência(s).`:'Nenhuma meta salva foi localizada nesse ano.')}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.hidden)close()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();
