(() => {
  'use strict';
  if (window.__fsHistoricalReportV13) return;
  window.__fsHistoricalReportV13 = true;

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
  function hasRecordedDay(d){return !!d&&!['off','medical','justified'].includes(String(d.status||''))&&(d.status==='done'||d.status==='partial'||['general','eligible','invoiceCount','nfs','warranty','warrantyQty','other','mixed','commissionMercantile','commissionService'].some(f=>parseNum(d[f])>0));}
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
  function emptyMonth(){return {merc:0,mercGoal:0,services:0,serviceGoal:0,conversion:0,efficiency:0,workedDays:0,dsrDays:0,mercCommissionManual:0,serviceCommissionManual:0,salaryFloor:0,_entered:{}};}
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
  function sellerFinanceForMonth(seller,year,monthIndex){
    if(!seller)return null;
    const daily=seller.daily&&typeof seller.daily==='object'?Object.values(seller.daily):[];
    let mercSales=0,services=0,mercCommission=0,serviceCommission=0,worked=0,justified=0;
    daily.forEach(d=>{
      mercSales+=parseNum(d.general);
      const serv=parseNum(d.warranty)+parseNum(d.other)+parseNum(d.mixed);services+=serv;
      const fallbackMerc=parseNum(d.general)*parseNum(d.commissionMercantileRate)/100;
      mercCommission+=Object.prototype.hasOwnProperty.call(d||{},'commissionMercantile')?parseNum(d.commissionMercantile):fallbackMerc;
      serviceCommission+=Object.prototype.hasOwnProperty.call(d||{},'commissionService')?parseNum(d.commissionService):serv*.05;
      if(hasRecordedDay(d))worked++;
      if(d&&['medical','justified'].includes(String(d.status||'')))justified++;
    });
    const ecommerce=parseNum(seller.ecommerce),ecommerceCommission=parseNum(seller.ecommerceCommission);
    const daysInMonth=new Date(Number(year),Number(monthIndex)+1,0).getDate();
    const sundays=Array.from({length:daysInMonth},(_,i)=>new Date(Number(year),Number(monthIndex),i+1).getDay()===0?1:0).reduce((a,b)=>a+b,0);
    const dsrDays=sundays+justified;
    const dailySubtotal=mercCommission+serviceCommission;
    const dsr=worked?dailySubtotal/worked*dsrDays:0;
    const subtotal=dailySubtotal+ecommerceCommission;
    return {mercSales:mercSales+ecommerce,services,mercCommission:mercCommission+ecommerceCommission,serviceCommission,worked,justified,sundays,dsrDays,subtotal,dsr,total:subtotal+dsr,hasDaily:daily.length>0};
  }
  function financeReferenceRates(vault,branch,seller){
    let mercBase=0,servBase=0,mercCommission=0,servCommission=0,months=0;
    Object.values(vault.records||{}).filter(r=>norm(r?.branch)===norm(branch)).forEach(r=>{
      const s=findSellerInRecord(r,seller);if(!s)return;
      const [y,m]=String(r.month||'').split('-').map(Number);if(!y||!m)return;
      const f=sellerFinanceForMonth(s,y,m-1);if(!f)return;
      if(f.mercSales>0&&f.mercCommission>=0){mercBase+=f.mercSales;mercCommission+=f.mercCommission}
      if(f.services>0&&f.serviceCommission>=0){servBase+=f.services;servCommission+=f.serviceCommission}
      if(f.mercSales>0||f.services>0)months++;
    });
    return {mercRate:mercBase?mercCommission/mercBase:0,serviceRate:servBase?servCommission/servBase:.05,months};
  }
  function rowFinance(year,monthIndex,row){
    const rec=monthRecord(state.vault,state.branch,year,monthIndex),s=findSellerInRecord(rec,state.seller);
    const actual=sellerFinanceForMonth(s,year,monthIndex);
    const manualMerc=!!row?._entered?.mercCommissionManual,manualServ=!!row?._entered?.serviceCommissionManual;
    if(manualMerc||manualServ){
      const worked=parseNum(row.workedDays)||(actual?.worked)||0,dsrDays=parseNum(row.dsrDays)||(actual?.dsrDays)||0;
      const mercCommission=manualMerc?parseNum(row.mercCommissionManual):(actual?.mercCommission||0);
      const serviceCommission=manualServ?parseNum(row.serviceCommissionManual):(actual?.serviceCommission||0);
      const subtotal=mercCommission+serviceCommission,dsr=worked?subtotal/worked*dsrDays:0;
      return {mercCommission,serviceCommission,worked,dsrDays,subtotal,dsr,total:subtotal+dsr,source:'manual'};
    }
    if(actual&&actual.hasDaily&&(actual.mercSales>0||actual.services>0||actual.worked>0)) return {...actual,source:'real'};
    const rates=financeReferenceRates(state.vault,state.branch,state.seller),worked=parseNum(row.workedDays),dsrDays=parseNum(row.dsrDays);
    const mercCommission=parseNum(row.merc)*rates.mercRate,serviceCommission=parseNum(row.services)*rates.serviceRate,subtotal=mercCommission+serviceCommission,dsr=worked?subtotal/worked*dsrDays:0;
    return {mercCommission,serviceCommission,worked,dsrDays,subtotal,dsr,total:subtotal+dsr,mercRate:rates.mercRate,serviceRate:rates.serviceRate,referenceMonths:rates.months,source:'estimated'};
  }

  function sameYearMode(){ return String(state.yearA)===String(state.yearB); }
  function isMonthClosed(year,monthIndex){const now=new Date(),y=Number(year),m=Number(monthIndex);return y<now.getFullYear()||(y===now.getFullYear()&&m<now.getMonth());}
  function goalRowFinance(year,monthIndex,row){
    const rec=monthRecord(state.vault,state.branch,year,monthIndex),s=findSellerInRecord(rec,state.seller);
    const actual=sellerFinanceForMonth(s,year,monthIndex);
    const rates=financeReferenceRates(state.vault,state.branch,state.seller);
    const worked=parseNum(row.workedDays)||(actual?.worked)||0,dsrDays=parseNum(row.dsrDays)||(actual?.dsrDays)||0;
    const mercCommission=parseNum(row.mercGoal)*rates.mercRate,serviceCommission=parseNum(row.serviceGoal)*rates.serviceRate,subtotal=mercCommission+serviceCommission,dsr=worked?subtotal/worked*dsrDays:0;
    return {mercCommission,serviceCommission,worked,dsrDays,subtotal,dsr,total:subtotal+dsr,mercRate:rates.mercRate,serviceRate:rates.serviceRate,referenceMonths:rates.months,source:'goal'};
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
        row._entered=row._entered||{};let touched=false;
        if(!parseNum(row.merc)&&a.merc){row.merc=a.merc;row._entered.merc=true;touched=true}
        if(!parseNum(row.services)&&a.services){row.services=a.services;row._entered.services=true;touched=true}
        if(!parseNum(row.conversion)&&a.conversion){row.conversion=a.conversion;row._entered.conversion=true;touched=true}
        if(!parseNum(row.efficiency)&&a.efficiency){row.efficiency=a.efficiency;row._entered.efficiency=true;touched=true}
        if(!parseNum(row.mercGoal)&&goals.merc){row.mercGoal=goals.merc;row._entered.mercGoal=true;touched=true}
        if(!parseNum(row.serviceGoal)&&goals.services){row.serviceGoal=goals.services;row._entered.serviceGoal=true;touched=true}
        const fin=sellerFinanceForMonth(s,year,i);
        if(fin){if(!parseNum(row.workedDays)&&fin.worked){row.workedDays=fin.worked;row._entered.workedDays=true;touched=true}if(!parseNum(row.dsrDays)&&fin.dsrDays){row.dsrDays=fin.dsrDays;row._entered.dsrDays=true;touched=true}}
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
        row._entered=row._entered||{};if(!parseNum(row.mercGoal)&&g.merc){row.mercGoal=g.merc;row._entered.mercGoal=true}
        if(!parseNum(row.serviceGoal)&&g.services){row.serviceGoal=g.services;row._entered.serviceGoal=true}
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
    if(document.getElementById('historicalReportCssV13'))return;
    const st=document.createElement('style');st.id='historicalReportCssV13';st.textContent=`
    .historical-report-launch{white-space:nowrap}
    .hr-modal[hidden]{display:none!important}.hr-modal{position:fixed;inset:0;z-index:100200;background:rgba(8,24,42,.62);display:grid;place-items:center;padding:18px}
    .hr-dialog{width:min(1720px,97vw);height:min(94vh,980px);background:#f7faff;border-radius:24px;box-shadow:0 30px 100px rgba(5,20,40,.38);overflow:hidden;display:flex;flex-direction:column}
    .hr-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:18px;padding:12px 18px;background:linear-gradient(135deg,#0879e8,#6049e8);color:#fff}.hr-head-title{min-width:max-content}.hr-head h2{margin:0;font-size:22px;line-height:1.1}.hr-head p{display:none}.hr-close{width:40px;height:40px;border:0;border-radius:12px;background:rgba(255,255,255,.16);color:#fff;font-size:25px;cursor:pointer}
    .hr-toolbar{display:grid;grid-template-columns:minmax(230px,1.7fr) 125px 125px auto auto;gap:8px;align-items:end;min-width:0}.hr-toolbar label,.hr-field label{display:block;font-size:8px;font-weight:900;color:rgba(255,255,255,.86);text-transform:uppercase;margin-bottom:3px}.hr-toolbar select,.hr-toolbar input{width:100%;border:1px solid rgba(255,255,255,.34);border-radius:10px;padding:8px 10px;background:rgba(255,255,255,.97);color:#17324d;font:inherit;font-weight:800;min-height:38px}.hr-field input{width:100%;border:1px solid #d6e0eb;border-radius:11px;padding:10px 11px;background:#fff;color:#17324d;font:inherit;font-weight:800}.hr-toolbar button{min-height:38px;white-space:nowrap;padding:8px 12px}.hr-toolbar .btn.soft{background:rgba(255,255,255,.90)}.hr-toolbar .btn.primary{background:#fff;color:#156fca;border-color:#fff}
    .hr-tabs{display:flex;gap:7px;padding:10px 18px;background:#fff;border-bottom:1px solid #e3eaf2}.hr-tab{border:1px solid #d7e2ed;border-radius:999px;padding:9px 15px;background:#fff;color:#435a73;font-weight:900;cursor:pointer}.hr-tab.active{background:linear-gradient(135deg,#0879e8,#5362e7);color:#fff;border-color:transparent}
    .hr-body{flex:1;min-height:0;overflow:auto;padding:10px 18px 22px}.hr-pane{display:none}.hr-pane.active{display:block}.hr-note{display:none!important}
    .hr-entry-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:start}.hr-year-panel{min-width:0;background:#fff;border:1px solid #dfe7f0;border-radius:18px;overflow:hidden;box-shadow:0 8px 22px rgba(15,42,67,.05)}.hr-year-title{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.3);position:relative;z-index:7}.hr-year-title strong{font-size:17px}.hr-year-title small{font-size:10px}.hr-entry-grid>.hr-year-panel:nth-child(1) .hr-year-title{background:linear-gradient(135deg,#0f76d8,#2f9af3);color:#fff}.hr-entry-grid>.hr-year-panel:nth-child(1) .hr-year-title small{color:rgba(255,255,255,.88)}.hr-entry-grid>.hr-year-panel:nth-child(2) .hr-year-title{background:linear-gradient(135deg,#5a49d8,#7a63ea);color:#fff}.hr-entry-grid>.hr-year-panel:nth-child(2) .hr-year-title small{color:rgba(255,255,255,.88)}.hr-table-scroll{overflow:auto;max-height:56vh;scrollbar-width:thin;position:relative}.hr-entry-table{width:1168px;min-width:1168px;border-collapse:separate;border-spacing:0;table-layout:fixed}.hr-entry-table col:nth-child(1){width:48px}.hr-entry-table col:nth-child(2),.hr-entry-table col:nth-child(3){width:130px}.hr-entry-table col:nth-child(4),.hr-entry-table col:nth-child(5){width:112px}.hr-entry-table col:nth-child(6),.hr-entry-table col:nth-child(7){width:88px}.hr-entry-table col:nth-child(8),.hr-entry-table col:nth-child(9){width:125px}.hr-entry-table col:nth-child(10),.hr-entry-table col:nth-child(11){width:90px}.hr-entry-table thead{position:sticky;top:0;z-index:6}.hr-entry-table th{position:sticky;top:0;z-index:6;font-size:8.2px;font-weight:900;text-transform:uppercase;padding:7px 3px;white-space:nowrap;text-align:center;vertical-align:middle;box-shadow:0 2px 0 rgba(15,42,67,.08)}.hr-entry-grid>.hr-year-panel:nth-child(1) .hr-entry-table th{background:#eaf4ff;color:#245a88;border-bottom:1px solid #bfd9f3}.hr-entry-grid>.hr-year-panel:nth-child(2) .hr-entry-table th{background:#f0edff;color:#5546a6;border-bottom:1px solid #d2cafa}.hr-entry-table td{padding:3px;border-bottom:1px solid #edf1f5;text-align:center;vertical-align:middle}.hr-entry-table td:first-child,.hr-entry-table th:first-child{font-weight:900;color:#17324d;text-align:center}.hr-entry-table td:first-child{font-size:13px}.hr-entry-table input{display:block;width:100%;min-width:0;border:1px solid #dbe4ed;border-radius:7px;padding:5px 5px;font-size:10.5px;font-weight:800;color:#18334e;background:#fff;text-align:right;line-height:1.1;height:31px;box-shadow:none}.hr-entry-table input:focus{outline:none;border-color:#6fa7ea;box-shadow:0 0 0 2px rgba(8,121,232,.10)}.hr-entry-table input[data-hr-kind=percent],.hr-entry-table input[data-hr-kind=days]{width:100%;max-width:none;margin:0;padding-left:4px;padding-right:4px;font-size:10.2px;text-align:center}.hr-entry-table input.hr-goal{background:#fffaf0;border-color:#f0dfb0;color:#18334e}.hr-entry-table input.hr-auto-source{background:#f1f7ff;border-color:#cfe2f7}.hr-year-actions{display:flex;gap:8px;padding:9px 10px;background:#fbfcfe}.hr-year-actions button{font-size:9.5px}
    .hr-dashboard{display:grid;gap:14px}.hr-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.hr-overview-card{background:#fff;border:1px solid #dfe7f0;border-radius:16px;padding:12px}.hr-overview-card span{display:block;font-size:9px;font-weight:900;color:#718096;text-transform:uppercase}.hr-overview-card strong{display:block;margin-top:5px;font-size:20px;color:#17324d}.hr-overview-card small{display:block;margin-top:4px;color:#687a8f}
    .hr-indicator{background:#fff;border:1px solid #dfe7f0;border-radius:20px;padding:14px;break-inside:avoid}.hr-indicator-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(390px,auto);gap:14px;align-items:start;padding:11px 13px;border-radius:14px;background:#f7fbff;margin-bottom:10px}.hr-indicator-head h3{margin:0;font-size:19px}.hr-indicator-head p{margin:3px 0 0;color:#718096;font-size:10px;line-height:1.35}.hr-indicator-summary{display:grid;grid-template-columns:repeat(3,minmax(125px,1fr));gap:8px;align-items:stretch}.hr-summary-chip{padding:7px 9px;border:1px solid #dfe6ef;border-radius:10px;background:#fff;min-width:0}.hr-summary-chip span{display:block;font-size:8px;color:#718096;font-weight:900;text-transform:uppercase}.hr-summary-chip strong{display:block;margin-top:3px;font-size:14px}.hr-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hr-chart-card{position:relative;border:1px solid #e1e8f0;border-radius:14px;padding:10px;overflow:auto;background:#fff}.hr-chart-card h4{margin:0 0 3px;font-size:14px;padding-right:44px}.hr-chart-card p{margin:0 0 6px;color:#718096;font-size:9px;padding-right:44px}.hr-chart-svg{display:block;width:100%;min-width:720px;height:auto}.hr-goal-hit-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.hr-goal-badge{padding:5px 8px;border-radius:999px;background:#e9f8ef;color:#138450;font-size:9px;font-weight:900}.hr-goal-none{font-size:9px;color:#8996a5}
    .hr-vacation-note{padding:9px 11px;border-radius:12px;background:#fff8e7;border:1px solid #f1dfad;color:#715a17;font-size:10px;line-height:1.35}.hr-finance-note{margin-top:8px;padding:9px 11px;border-radius:12px;background:#eef7ff;border:1px solid #cfe3f6;color:#365f83;font-size:10px;line-height:1.4}.hr-empty{padding:30px;text-align:center;color:#75869a;background:#fff;border:1px dashed #ccd7e3;border-radius:16px}
    .hr-auto-finance{background:#f1f7ff!important;border-color:#cfe2f7!important;color:#355d82!important}.hr-finance-manual{background:#fffdf5!important;border-color:#eadcae!important}.hr-coverage-controls{display:grid;grid-template-columns:150px 170px 190px 220px auto;gap:10px;align-items:end;padding:12px;background:#fff;border:1px solid #dfe7f0;border-radius:16px}.hr-coverage-controls label{display:block;font-size:9px;font-weight:900;color:#66778b;text-transform:uppercase;margin-bottom:4px}.hr-coverage-controls select,.hr-coverage-controls input{width:100%;border:1px solid #d6e0eb;border-radius:10px;padding:9px 10px;background:#fff;font:inherit;font-weight:800;color:#17324d}.hr-coverage-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin-top:10px}.hr-coverage-kpi{background:#fff;border:1px solid #dfe7f0;border-radius:14px;padding:10px}.hr-coverage-kpi span{display:block;font-size:8px;font-weight:900;color:#718096;text-transform:uppercase}.hr-coverage-kpi strong{display:block;margin-top:4px;font-size:16px;color:#17324d}.hr-coverage-kpi.negative strong{color:#c53850}.hr-coverage-kpi.positive strong{color:#138450}.hr-coverage-grid{display:grid;grid-template-columns:1.35fr .65fr;gap:10px;margin-top:10px}.hr-coverage-card{position:relative;background:#fff;border:1px solid #dfe7f0;border-radius:16px;padding:10px;overflow:auto}.hr-coverage-card h4{margin:0 0 3px;padding-right:42px}.hr-coverage-card p{margin:0 0 6px;color:#718096;font-size:9px}.hr-coverage-table{margin-top:10px;overflow:auto;border:1px solid #dfe7f0;border-radius:14px;background:#fff}.hr-coverage-table table{width:100%;border-collapse:collapse;min-width:760px}.hr-coverage-table th,.hr-coverage-table td{padding:8px;border-bottom:1px solid #edf1f5;text-align:right;font-size:10px}.hr-coverage-table th{background:#f7fbff;color:#61758a;text-transform:uppercase;font-size:8px}.hr-coverage-table th:first-child,.hr-coverage-table td:first-child{text-align:left;font-weight:900}.hr-coverage-status-deficit{color:#c53850;font-weight:900}.hr-coverage-status-ok{color:#138450;font-weight:900}@media(max-width:1100px){.hr-coverage-kpis{grid-template-columns:repeat(3,1fr)}.hr-coverage-grid{grid-template-columns:1fr}.hr-coverage-controls{grid-template-columns:1fr 1fr}}@media(max-width:700px){.hr-coverage-kpis{grid-template-columns:1fr 1fr}.hr-coverage-controls{grid-template-columns:1fr}}
    .hr-print-only{display:none}
    @media(max-width:1250px){.hr-head{grid-template-columns:1fr auto;gap:10px}.hr-head-title{grid-column:1}.hr-toolbar{grid-column:1/-1;grid-row:2;grid-template-columns:minmax(200px,1.7fr) 110px 110px auto auto}.hr-close{grid-column:2;grid-row:1}.hr-entry-grid{grid-template-columns:1fr}.hr-chart-grid{grid-template-columns:1fr}.hr-overview{grid-template-columns:1fr 1fr}.hr-indicator-head{grid-template-columns:1fr}.hr-indicator-summary{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media(max-width:700px){.hr-indicator-summary{grid-template-columns:1fr}.hr-modal{padding:0}.hr-dialog{width:100vw;height:100dvh;border-radius:0}.hr-head{padding:10px 12px}.hr-head h2{font-size:18px}.hr-toolbar{grid-template-columns:1fr 1fr;gap:6px}.hr-toolbar>div:first-child{grid-column:1/-1}.hr-toolbar button{width:100%;min-height:36px}.hr-tabs{overflow-x:auto;padding-top:8px;padding-bottom:8px}.hr-body{padding:8px 12px 14px}.hr-overview{grid-template-columns:1fr}.hr-entry-table{min-width:1168px}.hr-year-panel{overflow:hidden}.hr-table-scroll{max-height:62dvh}}
    `;document.head.appendChild(st);
  }

  function createModal(){
    let modal=document.getElementById('historicalReportModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='historicalReportModal';modal.className='hr-modal';modal.hidden=true;modal.innerHTML=`<div class="hr-dialog" role="dialog" aria-modal="true" aria-label="Relatório histórico comparativo"><div class="hr-head"><div class="hr-head-title"><h2>📑 Relatório Histórico por Colaborador</h2></div><div class="hr-toolbar"><div><label>Colaborador</label><select id="hrSeller"></select></div><div><label>Ano base</label><input id="hrYearA" type="number" min="2000" max="2100"></div><div><label>Ano comparado</label><input id="hrYearB" type="number" min="2000" max="2100"></div><button class="btn soft" id="hrSave" type="button">💾 Salvar</button><button class="btn primary" id="hrPrint" type="button">🧾 Relatório A4</button></div><button class="hr-close" type="button" aria-label="Fechar">×</button></div><div class="hr-tabs"><button class="hr-tab active" data-hr-tab="entry">✍️ Dados mensais</button><button class="hr-tab" data-hr-tab="dashboard">📊 Dashboard comparativo</button><button class="hr-tab" data-hr-tab="coverage">🧾 Cobertura salarial</button></div><div class="hr-body"><section class="hr-pane active" data-hr-pane="entry"><div id="hrEntry"></div></section><section class="hr-pane" data-hr-pane="dashboard"><div id="hrDashboard" class="hr-dashboard"></div></section><section class="hr-pane" data-hr-pane="coverage"><div id="hrCoverage"></div></section></div></div>`;
    document.body.appendChild(modal);return modal;
  }

  let state={vault:null,branch:'',sellers:[],seller:null,yearA:nowYear-1,yearB:nowYear,key:'',report:null,tab:'entry'};
  function fieldPresent(row,field){return !!row?._entered?.[field] || parseNum(row?.[field])>0}
  function formatField(field,v,present=true){const n=parseNum(v);if(!present||n===0)return '';if(field==='conversion'||field==='efficiency')return `${DEC.format(n)}%`;if(field==='workedDays'||field==='dsrDays')return String(Math.round(n));return MONEY.format(n)}
  function editFieldValue(field,v){return field==='workedDays'||field==='dsrDays'?String(Math.round(parseNum(v))):DEC.format(parseNum(v))}
  function inputFor(year,month,field,row){
    const goal=field==='mercGoal'||field==='serviceGoal',present=fieldPresent(row,field);
    const kind=field==='conversion'||field==='efficiency'?'percent':field==='workedDays'||field==='dsrDays'?'days':'money';
    return `<input class="${goal?'hr-goal':''}" data-hr-year="${year}" data-hr-month="${month}" data-hr-field="${field}" data-hr-kind="${kind}" inputmode="decimal" value="${esc(formatField(field,row[field],present))}" placeholder="">`;
  }
  function financeInputFor(year,month,field,row){
    const rec=monthRecord(state.vault,state.branch,year,month),s=findSellerInRecord(rec,state.seller),actual=sellerFinanceForMonth(s,year,month);
    const isLive=Number(year)>new Date().getFullYear()||(Number(year)===new Date().getFullYear()&&Number(month)>=new Date().getMonth());
    if(isLive&&actual&&actual.hasDaily){const v=field==='mercCommissionManual'?actual.mercCommission:actual.serviceCommission;return `<input class="hr-auto-finance" readonly value="${esc(MONEY.format(v))}" title="Automático pela plataforma">`}
    const present=fieldPresent(row,field);return `<input class="hr-finance-manual" data-hr-year="${year}" data-hr-month="${month}" data-hr-field="${field}" data-hr-kind="money" inputmode="decimal" value="${esc(formatField(field,row[field],present))}" placeholder="Manual">`;
  }
  function yearTable(year){
    ensureYear(state.report,year);
    const rows=MONTHS.map((m,i)=>{const r=state.report.years[year][i];return `<tr><td>${m}</td><td>${inputFor(year,i,'merc',r)}</td><td>${inputFor(year,i,'mercGoal',r)}</td><td>${inputFor(year,i,'services',r)}</td><td>${inputFor(year,i,'serviceGoal',r)}</td><td>${inputFor(year,i,'conversion',r)}</td><td>${inputFor(year,i,'efficiency',r)}</td><td>${financeInputFor(year,i,'mercCommissionManual',r)}</td><td>${financeInputFor(year,i,'serviceCommissionManual',r)}</td><td>${inputFor(year,i,'workedDays',r)}</td><td>${inputFor(year,i,'dsrDays',r)}</td></tr>`}).join('');
    return `<article class="hr-year-panel"><div class="hr-year-title"><strong>${year}</strong><small>Histórico: comissão manual • atual: automática</small></div><div class="hr-table-scroll"><table class="hr-entry-table"><colgroup><col><col><col><col><col><col><col><col><col><col><col></colgroup><thead><tr><th>Mês</th><th>Mercantil</th><th>Meta Merc.</th><th>Serviços</th><th>Meta Serv.</th><th>Conversão %</th><th>Eficiência %</th><th>Com. Merc.</th><th>Com. Serv.</th><th>Dias trab.</th><th>Dias DSR</th></tr></thead><tbody>${rows}</tbody></table></div><div class="hr-year-actions"><button class="btn soft" type="button" data-hr-import="${year}">↙ Puxar meses já existentes</button><button class="btn soft" type="button" data-hr-goals="${year}">🎯 Atualizar metas salvas</button></div></article>`;
  }
  function renderEntry(){const host=document.getElementById('hrEntry');if(!host)return;host.innerHTML=`<div class="hr-entry-grid">${yearTable(state.yearA)}${yearTable(state.yearB)}</div>`}
  function syncInputsToReport(){
    document.querySelectorAll('#historicalReportModal [data-hr-year][data-hr-month][data-hr-field]').forEach(input=>{
      const y=String(input.dataset.hrYear),m=Number(input.dataset.hrMonth),f=input.dataset.hrField;ensureYear(state.report,y);const row=state.report.years[y][m];row._entered=row._entered||{};const raw=String(input.value||'').trim();const parsed=parseNum(raw);const present=raw!==''&&parsed>0;row._entered[f]=present;row[f]=present?parsed:0;if(!present&&raw)input.value='';
    });
  }
  function importYear(year,includeValues=true,includeGoals=true){
    const vault=state.vault;ensureYear(state.report,year);let count=0;
    for(let i=0;i<12;i++){
      const rec=monthRecord(vault,state.branch,year,i),s=findSellerInRecord(rec,state.seller);if(!s)continue;
      const row=state.report.years[year][i],a=aggregateSeller(s);row._entered=row._entered||{};
      if(includeValues){ if(!parseNum(row.merc)&&a.merc){row.merc=a.merc;row._entered.merc=true}if(!parseNum(row.services)&&a.services){row.services=a.services;row._entered.services=true}if(!parseNum(row.conversion)&&a.conversion){row.conversion=a.conversion;row._entered.conversion=true}if(!parseNum(row.efficiency)&&a.efficiency){row.efficiency=a.efficiency;row._entered.efficiency=true}const fin=sellerFinanceForMonth(s,year,i);if(fin){if(!parseNum(row.workedDays)&&fin.worked){row.workedDays=fin.worked;row._entered.workedDays=true}if(!parseNum(row.dsrDays)&&fin.dsrDays){row.dsrDays=fin.dsrDays;row._entered.dsrDays=true}} }
      if(includeGoals){ const mk=`${year}-${String(i+1).padStart(2,'0')}`,g=storedMonthlyGoals(s,mk);if(!parseNum(row.mercGoal)&&g.merc){row.mercGoal=g.merc;row._entered.mercGoal=true}if(!parseNum(row.serviceGoal)&&g.services){row.serviceGoal=g.services;row._entered.serviceGoal=true} }
      count++;
    }
    renderEntry();return count;
  }

  function metricConfig(metric){
    if(metric==='merc')return {title:'💰 Venda mercantil',desc:'Total mensal consolidado do vendedor.',money:true,goal:r=>parseNum(r.mercGoal),value:r=>parseNum(r.merc)};
    if(metric==='services')return {title:'🛡️ Serviços',desc:'Garantias, presta-mista e demais serviços do mês.',money:true,goal:r=>parseNum(r.serviceGoal),value:r=>parseNum(r.services)};
    if(metric==='conversion')return {title:'🎯 Conversão',desc:'Comparativo mensal da taxa de conversão. Meta 35%.',percent:true,goal:()=>35,value:r=>parseNum(r.conversion)};
    if(metric==='efficiency')return {title:'⚡ Eficiência',desc:'Comparativo mensal da eficiência. Meta 7%.',percent:true,goal:()=>7,value:r=>parseNum(r.efficiency)};
    return {title:'💵 Evolução de ganhos',desc:'Cada valor mensal representa o ganho total fechado do mês: comissão mercantil + comissão de serviços + DSR. Meses ainda em andamento ficam fora até o fechamento; históricos são estimados pelas taxas médias do próprio colaborador.',money:true,goal:()=>0,value:()=>0};
  }
  function hasData(row,metric){if(metric==='gain')return !!(row?._entered?.merc||row?._entered?.services||row?._entered?.workedDays||row?._entered?.mercGoal||row?._entered?.serviceGoal||parseNum(row?.merc)||parseNum(row?.services)||parseNum(row?.mercGoal)||parseNum(row?.serviceGoal));const c=metricConfig(metric),field=metric==='merc'?'merc':metric==='services'?'services':metric;return !!row?._entered?.[field] || c.value(row)>0}
  function fmtMetric(v,c,compact=false){
    if(c.money) return MONEY.format(v);
    return `${DEC.format(v)}%`;
  }
  function yearSeries(year,metric){ensureYear(state.report,year);const c=metricConfig(metric);return MONTHS.map((m,i)=>{const row=state.report.years[year][i];if(metric==='gain'){const f=rowFinance(year,i,row),closed=isMonthClosed(year,i);return {month:m,value:f.total,goal:0,has:closed&&hasData(row,metric),hit:false,finance:f,closed}}const value=c.value(row),goal=c.goal(row);return {month:m,value,goal,has:hasData(row,metric),hit:goal>0&&value>=goal}})}
  function goalSeries(year,metric){ensureYear(state.report,year);return MONTHS.map((m,i)=>{const row=state.report.years[year][i];let value=0,has=false;if(metric==='merc'){value=parseNum(row.mercGoal);has=!!row?._entered?.mercGoal||value>0||hasData(row,'merc')}else if(metric==='services'){value=parseNum(row.serviceGoal);has=!!row?._entered?.serviceGoal||value>0||hasData(row,'services')}else if(metric==='conversion'){value=35;has=hasData(row,'conversion')}else if(metric==='efficiency'){value=7;has=hasData(row,'efficiency')}else if(metric==='gain'){value=goalRowFinance(year,i,row).total;has=isMonthClosed(year,i)&&(hasData(row,'gain')||!!row?._entered?.mercGoal||!!row?._entered?.serviceGoal||parseNum(row.mercGoal)>0||parseNum(row.serviceGoal)>0)}return {month:m,value,goal:value,has,hit:false,isGoal:true}})}
  function summaryFor(series,c){const rows=series.filter(x=>x.has);if(!rows.length)return 0;return c.money?rows.reduce((s,x)=>s+x.value,0):rows.reduce((s,x)=>s+x.value,0)/rows.length}
  function chartSvg(metric,type){
    const c=metricConfig(metric),same=sameYearMode(),actualA=yearSeries(state.yearA,metric),actualB=yearSeries(state.yearB,metric),goalA=goalSeries(state.yearA,metric);
    const a=same?goalA:actualA,b=same?actualA:actualB;
    const labelA=same?`Meta ${state.yearA}`:String(state.yearA),labelB=same?`Realizado ${state.yearB}`:String(state.yearB);
    const all=[...a,...b].filter(x=>x.has).map(x=>Math.max(x.value,x.goal||0));let max=Math.max(1,...all);if(c.percent){max=Math.max(max,metric==='conversion'?40:10)}max*=1.12;
    const W=1100,H=330,L=62,R=24,T=24,B=46,plotW=W-L-R,plotH=H-T-B,step=plotW/12;
    const y=v=>T+plotH-(Math.max(0,v)/max*plotH), fmt=v=>fmtMetric(v,c,true);
    let grid='';for(let i=0;i<=4;i++){const val=max*(4-i)/4,yy=T+plotH*i/4;grid+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e6edf5"/><text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="10" fill="#7a899a">${esc(fmt(val))}</text>`}
    const labels=MONTHS.map((m,i)=>`<text x="${L+step*(i+.5)}" y="${H-16}" text-anchor="middle" font-size="11" fill="#63758b">${m}</text>`).join('');
    let marks='';
    const seriesDefs=same
      ? [{rows:a,label:labelA,color:'#94aeea',text:'#5c7195',opacity:.45,dashed:true,goalSeries:true},{rows:b,label:labelB,color:'#5e4fd6',text:'#334b66',opacity:.96,dashed:false,goalSeries:false}]
      : [{rows:a,label:labelA,color:'#1688ec',text:'#41556d',opacity:.92,dashed:false,goalSeries:false},{rows:b,label:labelB,color:'#f08a24',text:'#6b4e2e',opacity:.92,dashed:false,goalSeries:false}];
    if(type==='bar'){
      const bw=Math.min(26,step*.28);
      seriesDefs.forEach((cfg,si)=>cfg.rows.forEach((p,i)=>{if(!p.has)return;const cx=L+step*(i+.5)+(si===0?-bw*.58:bw*.58),yy=y(p.value),h=Math.max(1,T+plotH-yy),cy=yy+(h/2),fontSize=Math.max(5.2,Math.min(9.8,h/7.2));marks+=`<rect x="${cx-bw/2}" y="${yy}" width="${bw}" height="${h}" rx="5" fill="${cfg.color}" opacity="${cfg.opacity}"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${cx} ${cy})" font-size="${fontSize.toFixed(1)}" font-weight="900" fill="#172b45" style="paint-order:stroke;stroke:rgba(255,255,255,.68);stroke-width:1.2px">${esc(fmtMetric(p.value,c,true))}</text>${(!cfg.goalSeries&&p.hit)?`<circle cx="${cx}" cy="${Math.max(T+12,yy-18)}" r="7" fill="#16a36b"/><text x="${cx}" y="${Math.max(T+15,yy-15)}" text-anchor="middle" font-size="9" font-weight="900" fill="#fff">✓</text>`:''}`;}));
    }else{
      seriesDefs.forEach((cfg)=>{let seg=[];const flush=()=>{if(seg.length>1)marks+=`<path d="${seg.map((p,j)=>`${j?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${cfg.color}" stroke-opacity="${cfg.opacity}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${cfg.dashed?'stroke-dasharray="8 7"':''}/>`;seg=[]};cfg.rows.forEach((p,i)=>{if(!p.has){flush();return}const pt={x:L+step*(i+.5),y:y(p.value),p};seg.push(pt);marks+=`<circle cx="${pt.x}" cy="${pt.y}" r="4.5" fill="${cfg.color}" fill-opacity="${cfg.opacity}" stroke="${(!cfg.goalSeries&&p.hit)?'#16a36b':'#fff'}" stroke-width="${(!cfg.goalSeries&&p.hit)?4:2}"/><text x="${pt.x}" y="${Math.max(T+10,pt.y-9)}" text-anchor="middle" font-size="8.5" font-weight="800" fill="${cfg.text}">${esc(fmtMetric(p.value,c,true))}</text>`});flush();});
    }
    const legendItems=seriesDefs.map((cfg,idx)=>`<circle cx="${L+8+(idx*140)}" cy="10" r="5" fill="${cfg.color}" fill-opacity="${cfg.opacity}"/><text x="${L+18+(idx*140)}" y="14" font-size="11" font-weight="800" fill="#41556d">${esc(cfg.label)}</text>`).join('');
    const hitLegend=!same?`<circle cx="${L+8+(seriesDefs.length*140)}" cy="10" r="5" fill="#16a36b"/><text x="${L+18+(seriesDefs.length*140)}" y="14" font-size="10" fill="#587086">meta batida</text>`:`<circle cx="${L+8+(seriesDefs.length*140)}" cy="10" r="5" fill="#16a36b"/><text x="${L+18+(seriesDefs.length*140)}" y="14" font-size="10" fill="#587086">meta batida</text>`;
    const legend=`<g>${legendItems}${hitLegend}</g>`;
    return `<svg class="hr-chart-svg svg-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)} ${type==='bar'?'barras':'tendência'}">${legend}${grid}${labels}${marks}</svg>`;
  }
  function hitBadges(metric){
    if(metric==='gain')return '';
    const same=sameYearMode();
    const a=yearSeries(state.yearA,metric).filter(x=>x.hit).map(x=>`${x.month}/${String(state.yearA).slice(-2)}`),b=same?[]:yearSeries(state.yearB,metric).filter(x=>x.hit).map(x=>`${x.month}/${String(state.yearB).slice(-2)}`),all=[...a,...b];
    return all.length?`<div class="hr-goal-hit-list"><span class="hr-goal-none">Meta batida:</span>${all.map(x=>`<span class="hr-goal-badge">✓ ${x}</span>`).join('')}</div>`:`<div class="hr-goal-hit-list"><span class="hr-goal-none">Nenhum mês com meta identificada/batida nos dados informados.</span></div>`;
  }
  function indicatorHtml(metric){
    const c=metricConfig(metric),same=sameYearMode(),a=yearSeries(state.yearA,metric),b=yearSeries(state.yearB,metric),goalA=goalSeries(state.yearA,metric),countA=a.filter(x=>x.has).length,countB=b.filter(x=>x.has).length,goalCount=goalA.filter(x=>x.has).length;
    const totalA=summaryFor(a,c),totalB=summaryFor(b,c),goalTotal=summaryFor(goalA,c);
    const leftValue=metric==='gain'?(same?(goalCount?goalTotal/goalCount:0):(countA?totalA/countA:0)):(same?goalTotal:totalA),rightValue=metric==='gain'?(countB?totalB/countB:0):totalB,leftCount=same?goalCount:countA,rightCount=countB;
    const delta=c.money?(leftValue?((rightValue-leftValue)/leftValue*100):0):(rightValue-leftValue);
    const deltaText=c.money?`${delta>=0?'▲':'▼'} ${DEC.format(Math.abs(delta))}%`:`${delta>=0?'▲':'▼'} ${DEC.format(Math.abs(delta))} p.p.`;
    const financeNote=metric==='gain'?(()=>{const rates=financeReferenceRates(state.vault,state.branch,state.seller);return `<div class="hr-finance-note"><b>Critério financeiro:</b> meses que possuem lançamentos diários usam as comissões registradas e o DSR calculado pela mesma lógica de “Meus ganhos”. Nos meses históricos sem diário, a estimativa usa a taxa média do colaborador: <b>mercantil ${DEC.format(rates.mercRate*100)}%</b> e <b>serviços ${DEC.format(rates.serviceRate*100)}%</b>, aplicada aos dias trabalhados e dias considerados no DSR informados. ${same?`No modo de mesmo ano, o gráfico compara <b>meta × realizado</b> dentro de ${state.yearA}. Para evitar distorção de DSR em competência ainda aberta, <b>ganhos só entram após o fechamento do mês</b>.`:'Os valores em destaque abaixo representam a <b>média mensal de ganho</b> de cada ano. Competências ainda abertas não entram no gráfico financeiro.'}</div>`})():'';
    const leftLabel=same?`Meta ${state.yearA}`:`${metric==='gain'?'Média ':''}${state.yearA}`;
    const rightLabel=same?`Realizado ${state.yearB}`:`${metric==='gain'?'Média ':''}${state.yearB}`;
    const barHint=same?(metric==='gain'?'Meta financeira estimada × ganho realizado do mês, já com DSR.':'Meta × realizado no mesmo ano.'):(metric==='gain'?'Cada barra mostra o ganho total do mês, já com DSR.':`Barras lado a lado: ${state.yearA} × ${state.yearB}.`);
    const lineHint=same?(metric==='gain'?'Meta financeira estimada × ganho realizado no mesmo ano.':'Evolução mensal de meta × realizado.'):(metric==='gain'?'Cada ponto mostra o ganho total do mês, já com DSR.':'Evolução mensal de cada ano.');
    return `<section class="hr-indicator" data-hr-metric="${metric}"><div class="hr-indicator-head"><div><h3>${c.title}</h3><p>${c.desc}${same?' Comparação interna de meta × realizado.':''}</p></div><div class="hr-indicator-summary"><div class="hr-summary-chip"><span>${leftLabel}</span><strong>${fmtMetric(leftValue,c)}</strong><small>${leftCount} mês(es)</small></div><div class="hr-summary-chip"><span>${rightLabel}</span><strong>${fmtMetric(rightValue,c)}</strong><small>${rightCount} mês(es)</small></div><div class="hr-summary-chip"><span>${same?'Desvio':'Variação'}</span><strong class="${delta>=0?'positive':'negative'}">${deltaText}</strong></div></div></div>${financeNote}<div class="hr-chart-grid"><div class="hr-chart-card dashboard-card" data-chart-metric="hr-${metric}" data-chart-type="historical-bar"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>Comparativo mês a mês</h4><p>${barHint}</p>${chartSvg(metric,'bar')}</div><div class="hr-chart-card dashboard-card" data-chart-metric="hr-${metric}" data-chart-type="historical-line"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>Linha de tendência</h4><p>${lineHint}</p>${chartSvg(metric,'line')}</div></div>${hitBadges(metric)}</section>`;
  }
  function coverageDashboardHtml(){
    if(!state.report)return '';
    const ctx=state.report.coverageContext||{},year=Number(ctx.year)||Number(state.yearB)||Number(state.yearA),period=ctx.period||'year',startMonth=Number.isFinite(Number(ctx.startMonth))?Number(ctx.startMonth):0,endMonth=Number.isFinite(Number(ctx.endMonth))?Number(ctx.endMonth):11;
    const rows=coverageRows(year,period,startMonth,endMonth),deficit=rows.filter(r=>r.complement>0),above=rows.filter(r=>r.surplus>0),totalComplement=deficit.reduce((s,r)=>s+r.complement,0),avgComplement=deficit.length?totalComplement/deficit.length:0,avgCoverage=rows.length?rows.reduce((s,r)=>s+r.coverage,0)/rows.length:0,totalSurplus=above.reduce((s,r)=>s+r.surplus,0);
    if(!rows.length)return `<section class="hr-indicator" data-hr-metric="coverage"><div class="hr-indicator-head"><div><h3>🧾 Cobertura salarial</h3><p>Análise de quanto o ganho gerado cobriu do piso salarial configurado.</p></div></div><div class="hr-empty">Nenhuma competência fechada com volume financeiro está disponível para a cobertura salarial no período selecionado.</div></section>`;
    return `<section class="hr-indicator" data-hr-metric="coverage"><div class="hr-indicator-head"><div><h3>🧾 Cobertura salarial</h3><p>Leitura de ganho gerado, complemento necessário e excedente sobre o piso salarial. ${year} • ${period==='year'?'Ano completo':period.toUpperCase()}</p></div><div class="hr-indicator-summary"><div class="hr-summary-chip"><span>Meses analisados</span><strong>${rows.length}</strong><small>com volume financeiro</small></div><div class="hr-summary-chip"><span>Com complemento</span><strong class="negative">${deficit.length}</strong><small>${MONEY.format(totalComplement)} acumulado</small></div><div class="hr-summary-chip"><span>Média complemento</span><strong>${MONEY.format(avgComplement)}</strong><small>meses deficitários</small></div><div class="hr-summary-chip"><span>Média cobertura</span><strong class="${avgCoverage>=100?'positive':'negative'}">${DEC.format(avgCoverage)}%</strong><small>${above.length} mês(es) acima do piso</small></div></div></div><div class="hr-finance-note"><b>Objetivo:</b> identificar em quais competências a remuneração gerada pelo vendedor não alcançou o piso salarial e quanto a empresa precisou complementar. Meses sem venda mercantil/e-commerce ficam fora da análise.</div><div class="hr-chart-grid"><div class="hr-chart-card dashboard-card" data-chart-metric="hr-coverage" data-chart-type="coverage-bar"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>Ganho gerado × piso salarial</h4><p>Azul = ganho gerado; vermelho = complemento necessário; verde = excedente acima do piso.</p>${coverageBarSvg(rows)}</div><div class="hr-chart-card dashboard-card" data-chart-metric="hr-coverage" data-chart-type="coverage-line"><button class="dashboard-chart-expand" type="button" data-chart-expand aria-label="Ampliar gráfico">⛶</button><h4>Tendência do complemento</h4><p>Quanto a empresa precisou complementar em cada competência.</p>${coverageTrendSvg(rows)}</div></div><div class="hr-goal-hit-list"><span class="hr-goal-none">Excedente acumulado no período:</span><span class="hr-goal-badge">${MONEY.format(totalSurplus)}</span></div></section>`;
  }
  function renderDashboard(){
    const host=document.getElementById('hrDashboard');if(!host)return;
    syncInputsToReport();
    const metrics=['merc','services','conversion','efficiency','gain'];
    const any=metrics.some(m=>yearSeries(state.yearA,m).some(x=>x.has)||yearSeries(state.yearB,m).some(x=>x.has));
    if(!any){host.innerHTML='<div class="hr-empty">Preencha ao menos um mês na aba <b>Dados mensais</b> para gerar o dashboard histórico.</div>';return}
    host.innerHTML=`<div class="hr-vacation-note">ℹ️ Mês sem resultado informado é tratado como <b>férias/fora do período</b> e não entra nos gráficos nem nas médias.</div><div class="hr-overview"><div class="hr-overview-card"><span>Colaborador</span><strong>${esc(state.seller?.name||'—')}</strong><small>${esc(state.branch||'—')}</small></div><div class="hr-overview-card"><span>Comparação</span><strong>${sameYearMode()?`${state.yearA} • Meta × Realizado`:`${state.yearA} × ${state.yearB}`}</strong><small>${sameYearMode()?'Leitura interna do mesmo ano':'Totais mensais consolidados'}</small></div><div class="hr-overview-card"><span>Conversão</span><strong>Meta 35%</strong><small>Referência fixa</small></div><div class="hr-overview-card"><span>Eficiência</span><strong>Meta 7%</strong><small>Referência fixa</small></div></div>${metrics.map(indicatorHtml).join('')}${coverageDashboardHtml()}`;
  }


  function coverageYear(){const sel=document.getElementById('hrCoverageYear');return Number(sel?.value)||Number(state.yearB)||Number(state.yearA)}
  function coverageMonths(period,startMonth=0,endMonth=11){if(period==='h1')return [0,1,2,3,4,5];if(period==='h2')return [6,7,8,9,10,11];if(/^q[1-4]$/.test(period)){const q=Number(period[1])-1;return [q*3,q*3+1,q*3+2]}if(period==='custom'){const a=Math.max(0,Math.min(11,Number(startMonth)||0)),b=Math.max(a,Math.min(11,Number(endMonth)||11));return Array.from({length:b-a+1},(_,i)=>a+i)}return [...Array(12).keys()]}
  function coverageRows(year,period,startMonth=0,endMonth=11){ensureYear(state.report,String(year));const indexes=coverageMonths(period,startMonth,endMonth);return indexes.map(i=>{const row=state.report.years[String(year)][i],floor=parseNum(row.salaryFloor)||parseNum(state.report.salaryFloorByYear?.[String(year)]),fin=rowFinance(String(year),i,row),closed=isMonthClosed(year,i),rec=monthRecord(state.vault,state.branch,year,i),seller=findSellerInRecord(rec,state.seller),actual=aggregateSeller(seller),financialVolume=Math.max(parseNum(row.merc),parseNum(actual.merc)),hasFinancialVolume=financialVolume>0,has=closed&&hasFinancialVolume,gain=has?fin.total:0,complement=has?Math.max(0,floor-gain):0,surplus=has?Math.max(0,gain-floor):0,coverage=has&&floor?gain/floor*100:0;return {i,month:MONTHS[i],row,floor,gain,complement,surplus,coverage,has,closed,financialVolume,source:fin.source}}).filter(x=>x.has)}
  function coverageBarSvg(rows){const W=1100,H=340,L=66,R=24,T=28,B=48,plotW=W-L-R,plotH=H-T-B,step=plotW/Math.max(1,rows.length),max=Math.max(1,...rows.map(r=>Math.max(r.floor,r.gain)))*1.14,y=v=>T+plotH-(v/max*plotH);let grid='';for(let k=0;k<=4;k++){const val=max*(4-k)/4,yy=T+plotH*k/4;grid+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e6edf5"/><text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="10" fill="#7a899a">${esc(MONEY.format(val))}</text>`}let marks='';rows.forEach((r,idx)=>{const cx=L+step*(idx+.5),bw=Math.min(48,step*.42),baseY=y(r.gain),baseH=T+plotH-baseY;marks+=`<rect x="${cx-bw/2}" y="${baseY}" width="${bw}" height="${Math.max(1,baseH)}" rx="6" fill="#268be8" opacity=".94"/>`;if(r.complement>0){const top=y(r.floor),h=baseY-top;marks+=`<rect x="${cx-bw/2}" y="${top}" width="${bw}" height="${Math.max(1,h)}" rx="6" fill="#d84c5f" opacity=".9"/><text x="${cx}" y="${top-7}" text-anchor="middle" font-size="9" font-weight="900" fill="#b12d40">+ ${esc(MONEY.format(r.complement))}</text>`}else if(r.surplus>0){marks+=`<circle cx="${cx}" cy="${Math.max(T+10,baseY-14)}" r="7" fill="#16a36b"/><text x="${cx}" y="${Math.max(T+13,baseY-11)}" text-anchor="middle" font-size="9" font-weight="900" fill="#fff">✓</text><text x="${cx}" y="${Math.max(T+9,baseY-27)}" text-anchor="middle" font-size="8.5" font-weight="900" fill="#138450">+ ${esc(MONEY.format(r.surplus))}</text>`}marks+=`<text x="${cx}" y="${H-17}" text-anchor="middle" font-size="11" fill="#63758b">${r.month}</text>`});return `<svg class="hr-chart-svg svg-chart" viewBox="0 0 ${W} ${H}">${grid}${marks}</svg>`}
  function coverageTrendSvg(rows){const W=720,H=340,L=66,R=24,T=28,B=48,plotW=W-L-R,plotH=H-T-B,max=Math.max(1,...rows.map(r=>r.complement))*1.15,y=v=>T+plotH-(v/max*plotH),step=rows.length>1?plotW/(rows.length-1):plotW;let grid='';for(let k=0;k<=4;k++){const val=max*(4-k)/4,yy=T+plotH*k/4;grid+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e6edf5"/><text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="10" fill="#7a899a">${esc(MONEY.format(val))}</text>`}const pts=rows.map((r,i)=>({x:L+(rows.length===1?plotW/2:step*i),y:y(r.complement),r}));let path=pts.length>1?`<path d="${pts.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')}" fill="none" stroke="#d84c5f" stroke-width="3"/>`:'';let marks=pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#d84c5f"/><text x="${p.x}" y="${Math.max(T+10,p.y-10)}" text-anchor="middle" font-size="8.5" font-weight="900" fill="#a62f41">${esc(MONEY.format(p.r.complement))}</text><text x="${p.x}" y="${H-17}" text-anchor="middle" font-size="11" fill="#63758b">${p.r.month}</text>`).join('');return `<svg class="hr-chart-svg svg-chart" viewBox="0 0 ${W} ${H}">${grid}${path}${marks}</svg>`}
  function renderCoverage(){const host=document.getElementById('hrCoverage');if(!host||!state.report)return;const ctx=state.report.coverageContext||{},year=Number(ctx.year)||Number(state.yearB)||Number(state.yearA),period=ctx.period||'year',startMonth=Number.isFinite(Number(ctx.startMonth))?Number(ctx.startMonth):0,endMonth=Number.isFinite(Number(ctx.endMonth))?Number(ctx.endMonth):11;state.report.salaryFloorByYear=state.report.salaryFloorByYear||{};const floorDefault=parseNum(state.report.salaryFloorByYear[String(year)]),rows=coverageRows(year,period,startMonth,endMonth),deficit=rows.filter(r=>r.complement>0),above=rows.filter(r=>r.surplus>0),totalComplement=deficit.reduce((s,r)=>s+r.complement,0),avgComplement=deficit.length?totalComplement/deficit.length:0,avgCoverage=rows.length?rows.reduce((s,r)=>s+r.coverage,0)/rows.length:0,totalSurplus=above.reduce((s,r)=>s+r.surplus,0);host.innerHTML=`<div class="hr-coverage-controls"><div><label>Ano analisado</label><select id="hrCoverageYear">${[...new Set([Number(state.yearA),Number(state.yearB)])].map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select></div><div><label>Período</label><select id="hrCoveragePeriod"><option value="year" ${period==='year'?'selected':''}>Ano completo</option><option value="h1" ${period==='h1'?'selected':''}>1º semestre</option><option value="h2" ${period==='h2'?'selected':''}>2º semestre</option><option value="q1" ${period==='q1'?'selected':''}>1º trimestre</option><option value="q2" ${period==='q2'?'selected':''}>2º trimestre</option><option value="q3" ${period==='q3'?'selected':''}>3º trimestre</option><option value="q4" ${period==='q4'?'selected':''}>4º trimestre</option><option value="custom" ${period==='custom'?'selected':''}>Personalizado</option></select></div><div><label>De / até</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:5px"><select id="hrCoverageStart">${MONTHS.map((m,i)=>`<option value="${i}" ${i===startMonth?'selected':''}>${m}</option>`).join('')}</select><select id="hrCoverageEnd">${MONTHS.map((m,i)=>`<option value="${i}" ${i===endMonth?'selected':''}>${m}</option>`).join('')}</select></div></div><div><label>Piso salarial padrão do ano</label><input id="hrCoverageFloor" inputmode="decimal" value="${floorDefault?esc(MONEY.format(floorDefault)):''}" placeholder="Ex.: R$ 1.612,00"></div><button type="button" class="btn soft" id="hrCoverageApply">Aplicar aos meses sem piso</button></div><div class="hr-coverage-kpis"><div class="hr-coverage-kpi"><span>Meses analisados</span><strong>${rows.length}</strong></div><div class="hr-coverage-kpi negative"><span>Meses com complemento</span><strong>${deficit.length}</strong></div><div class="hr-coverage-kpi negative"><span>Total complementado</span><strong>${MONEY.format(totalComplement)}</strong></div><div class="hr-coverage-kpi"><span>Média complemento</span><strong>${MONEY.format(avgComplement)}</strong></div><div class="hr-coverage-kpi positive"><span>Meses acima do piso</span><strong>${above.length}</strong></div><div class="hr-coverage-kpi positive"><span>Média de cobertura</span><strong>${DEC.format(avgCoverage)}%</strong></div></div><div class="hr-finance-note" style="margin-top:10px"><b>Visualização:</b> os gráficos de cobertura salarial agora aparecem no <b>Dashboard comparativo</b>, logo abaixo de Evolução de ganhos. Esta aba fica dedicada à configuração do piso e conferência detalhada mês a mês.</div><div class="hr-coverage-table"><table><thead><tr><th>Mês</th><th>Piso</th><th>Ganho gerado</th><th>Complemento</th><th>Acima do piso</th><th>Cobertura</th><th>Origem</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.month}</td><td><input style="width:110px" class="hr-finance-manual" data-coverage-floor-month="${r.i}" inputmode="decimal" value="${r.row.salaryFloor?esc(MONEY.format(r.row.salaryFloor)):''}" placeholder="${floorDefault?esc(MONEY.format(floorDefault)):'Piso'}"></td><td>${MONEY.format(r.gain)}</td><td class="${r.complement>0?'hr-coverage-status-deficit':''}">${MONEY.format(r.complement)}</td><td class="${r.surplus>0?'hr-coverage-status-ok':''}">${MONEY.format(r.surplus)}</td><td>${DEC.format(r.coverage)}%</td><td>${r.source==='manual'?'Manual':r.source==='real'?'Plataforma':'Estimado'}</td></tr>`).join('')}</tbody></table></div><div style="margin-top:8px;font-size:10px;color:#718096">Excedente acumulado no período: <b>${MONEY.format(totalSurplus)}</b>. Meses sem venda mercantil/e-commerce não entram na análise, pois podem representar férias, desligamento ou ausência de vínculo no período. O objetivo principal desta visão é identificar frequência e volume de complemento salarial.</div>`;wireCoverageControls()}
  function wireCoverageControls(){const year=document.getElementById('hrCoverageYear'),period=document.getElementById('hrCoveragePeriod'),start=document.getElementById('hrCoverageStart'),end=document.getElementById('hrCoverageEnd'),floor=document.getElementById('hrCoverageFloor'),apply=document.getElementById('hrCoverageApply');const saveCtx=()=>{state.report.coverageContext={year:Number(year?.value)||state.yearB,period:period?.value||'year',startMonth:Number(start?.value)||0,endMonth:Number(end?.value)||11};saveCurrent(false);renderCoverage()};year&&(year.onchange=saveCtx);period&&(period.onchange=saveCtx);start&&(start.onchange=saveCtx);end&&(end.onchange=saveCtx);floor&&(floor.onfocus=()=>{if(floor.value)floor.value=editFieldValue('salaryFloor',floor.value)},floor.onblur=()=>{const y=String(Number(year?.value)||state.yearB),v=parseNum(floor.value);state.report.salaryFloorByYear=state.report.salaryFloorByYear||{};state.report.salaryFloorByYear[y]=v;saveCurrent(false);renderCoverage()});apply&&(apply.onclick=()=>{const y=String(Number(year?.value)||state.yearB),v=parseNum(state.report.salaryFloorByYear?.[y]);ensureYear(state.report,y);coverageMonths(period?.value||'year',Number(start?.value)||0,Number(end?.value)||11).forEach(i=>{const r=state.report.years[y][i];if(!parseNum(r.salaryFloor)){r.salaryFloor=v;r._entered=r._entered||{};r._entered.salaryFloor=!!v}});saveCurrent(false);renderCoverage()});document.querySelectorAll('#hrCoverage [data-coverage-floor-month]').forEach(inp=>{inp.onfocus=()=>{if(inp.value)inp.value=editFieldValue('salaryFloor',inp.value)};inp.onblur=()=>{const y=String(Number(year?.value)||state.yearB),i=Number(inp.dataset.coverageFloorMonth);ensureYear(state.report,y);const v=parseNum(inp.value),r=state.report.years[y][i];r.salaryFloor=v;r._entered=r._entered||{};r._entered.salaryFloor=!!v;saveCurrent(false);renderCoverage()}})}

  function printReport(){
    syncInputsToReport();renderDashboard();saveCurrent(false);
    const host=document.getElementById('hrDashboard');if(!host||host.querySelector('.hr-empty')){alert('Preencha os dados do relatório antes de gerar o PDF.');return}
    const frame=document.createElement('iframe');frame.style.position='fixed';frame.style.width='1px';frame.style.height='1px';frame.style.opacity='0';frame.style.pointerEvents='none';frame.style.border='0';document.body.appendChild(frame);const w=frame.contentWindow;if(!w){frame.remove();return}
    const generated=new Date().toLocaleString('pt-BR');
    const overview=host.querySelector('.hr-overview')?.outerHTML||'';
    const indicators=[...host.querySelectorAll('.hr-indicator')].map(sec=>{const clone=sec.cloneNode(true);clone.querySelectorAll('[data-chart-expand],.dashboard-chart-expand').forEach(el=>el.remove());return clone;});
    const headHtml=`<div class="phead"><div><h1>Relatório Histórico Comparativo</h1><p>${esc(state.seller?.name||'')} • ${esc(state.branch)} • ${state.yearA} × ${state.yearB}</p></div><div class="pmeta">Dados mensais consolidados<br>Gerado em ${esc(generated)}</div></div>`;
    const miniHeadHtml=`<div class="phead phead-mini"><div><h2>Dashboard histórico comparativo</h2><p>${esc(state.seller?.name||'')} • ${state.yearA} × ${state.yearB}</p></div><div class="pmeta">${esc(state.branch)}<br>${esc(generated)}</div></div>`;
    const footHtml=`<div class="hr-page-foot"><span>Developed by Fildo Sobral • FS Soluções</span><span>${esc(state.seller?.name||'')} • ${esc(state.branch)}</span></div>`;
    const pages=indicators.map((sec,idx)=>`<section class="hr-print-page">${idx===0?headHtml+overview:miniHeadHtml}${sec.outerHTML}${footHtml}</section>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório histórico - ${esc(state.seller?.name||'')}</title><style>@page{size:A4 landscape;margin:7mm}@page{size:297mm 210mm;margin:7mm}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,sans-serif;color:#17324d;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.hr-print-page{display:block;min-height:0;page-break-after:always}.hr-print-page:last-child{page-break-after:auto}.hr-print-page>*+*{margin-top:7px}.phead{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:12px 16px;border-radius:14px;background:linear-gradient(135deg,#0879e8,#6049e8);color:white}.phead h1{margin:0;font-size:22px}.phead h2{margin:0;font-size:15px}.phead p{margin:3px 0 0;font-size:10px;opacity:.9}.pmeta{text-align:right;font-size:9px;line-height:1.45}.phead-mini{padding:7px 10px;border-radius:12px}.phead-mini h2{font-size:14px}.phead-mini p,.phead-mini .pmeta{font-size:8px}.hr-overview{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.hr-overview-card{border:1px solid #dfe7f0;border-radius:10px;padding:8px}.hr-overview-card span{display:block;font-size:7px;font-weight:900;color:#718096;text-transform:uppercase}.hr-overview-card strong{display:block;margin-top:3px;font-size:13px}.hr-overview-card small{font-size:7px;color:#718096}.hr-indicator{border:1px solid #dfe7f0;border-radius:12px;padding:7px;margin:0;break-inside:avoid;page-break-inside:avoid;display:block}.hr-indicator-head{display:flex;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:9px;background:#f7fbff}.hr-indicator-head h3{margin:0;font-size:14px}.hr-indicator-head p{margin:2px 0 0;font-size:7px;color:#718096}.hr-indicator-summary{display:flex;gap:6px}.hr-summary-chip{border:1px solid #dfe6ef;border-radius:8px;padding:5px 7px;min-width:110px}.hr-summary-chip span{display:block;font-size:6px;color:#718096;font-weight:900;text-transform:uppercase}.hr-summary-chip strong{display:block;font-size:10px;margin-top:2px}.hr-summary-chip small{font-size:6px;color:#718096}.hr-chart-grid{display:grid;grid-template-columns:1fr;gap:6px;margin-top:6px}.hr-chart-card{border:1px solid #e1e8f0;border-radius:9px;padding:6px;overflow:hidden}.hr-chart-card h4{margin:0;font-size:10px}.hr-chart-card p{margin:2px 0 4px;font-size:6.5px;color:#718096}.hr-chart-svg{display:block;width:100%;height:160px}.hr-goal-hit-list{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}.hr-goal-badge{padding:3px 5px;border-radius:999px;background:#e9f8ef;color:#138450;font-size:6px;font-weight:900}.hr-goal-none{font-size:6px;color:#8290a1}.hr-finance-note{padding:5px 7px;border-radius:8px;background:#eef7ff;border:1px solid #cfe3f6;color:#365f83;font-size:6.5px;line-height:1.35}.positive{color:#138450}.negative{color:#c53850}.hr-page-foot{margin-top:6px;display:flex;justify-content:space-between;gap:12px;padding-top:4px;border-top:1px solid #dce5f0;color:#7b8794;font-size:6.4px;background:#fff}.dashboard-chart-expand,[data-chart-expand]{display:none!important;visibility:hidden!important}</style></head><body>${pages}</body></html>`);w.document.close();setTimeout(()=>{try{w.focus();w.print()}catch{}},350);
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
  function rerenderAll(){loadSelection();renderSetupOptions();if(!state.seller){document.getElementById('hrEntry').innerHTML='<div class="hr-empty">Nenhum vendedor encontrado nesta filial.</div>';document.getElementById('hrDashboard').innerHTML='';return}renderEntry();renderDashboard();renderCoverage()}
  function setTab(tab){state.tab=tab;saveContext();document.querySelectorAll('#historicalReportModal .hr-tab').forEach(b=>b.classList.toggle('active',b.dataset.hrTab===tab));document.querySelectorAll('#historicalReportModal .hr-pane').forEach(p=>p.classList.toggle('active',p.dataset.hrPane===tab));if(tab==='dashboard')renderDashboard();if(tab==='coverage')renderCoverage()}
  function open(){addStyles();const modal=createModal(),ctx=loadContext();state.vault=loadVault();state.branch=currentBranch(state.vault);state.sellers=allSellers(state.vault,state.branch);state.seller=state.sellers.find(s=>sellerIdentity(s)===ctx.sellerIdentity)||state.sellers[0]||null;state.yearA=Number(ctx.yearA)||nowYear-1;state.yearB=Number(ctx.yearB)||nowYear;state.tab=['dashboard','coverage'].includes(ctx.tab)?ctx.tab:'entry';renderSetupOptions();rerenderAll();setTab(state.tab);modal.hidden=false;document.body.style.overflow='hidden'}
  function close(){const m=document.getElementById('historicalReportModal');if(m)m.hidden=true;document.body.style.overflow=''}
  function wire(){
    addStyles();const nav=document.querySelector('nav.tabs');if(nav&&!document.getElementById('historicalReportLaunch')){const btn=document.createElement('button');btn.id='historicalReportLaunch';btn.type='button';btn.className='tab historical-report-launch';btn.textContent='📑 Relatórios';nav.appendChild(btn);btn.addEventListener('click',open)}
    const m=createModal();m.querySelector('.hr-close').addEventListener('click',close);m.addEventListener('click',e=>{if(e.target===m)close()});
    m.querySelectorAll('.hr-tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.hrTab)));
    document.getElementById('hrSeller').addEventListener('change',()=>{saveCurrent(false);rerenderAll()});
    ['hrYearA','hrYearB'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{saveCurrent(false);rerenderAll()}));
    document.getElementById('hrSave').addEventListener('click',()=>saveCurrent(true));document.getElementById('hrPrint').addEventListener('click',printReport);
    m.addEventListener('change',e=>{if(e.target.matches('[data-hr-year][data-hr-month][data-hr-field]'))syncInputsToReport()});
    m.addEventListener('focusin',e=>{const input=e.target.closest?.('[data-hr-year][data-hr-month][data-hr-field]');if(!input||!String(input.value||'').trim())return;const f=input.dataset.hrField;input.value=editFieldValue(f,input.value);setTimeout(()=>{try{input.select()}catch{}},0)});
    m.addEventListener('focusout',e=>{const input=e.target.closest?.('[data-hr-year][data-hr-month][data-hr-field]');if(!input)return;syncInputsToReport();const y=String(input.dataset.hrYear),mo=Number(input.dataset.hrMonth),f=input.dataset.hrField,row=state.report?.years?.[y]?.[mo];input.value=formatField(f,row?.[f],fieldPresent(row,f));});
    m.addEventListener('click',e=>{const imp=e.target.closest('[data-hr-import]');if(imp){syncInputsToReport();const c=importYear(String(imp.dataset.hrImport),true,true);alert(c?`${c} mês(es) encontrados na plataforma foram aproveitados sem sobrescrever valores já digitados.`:'Nenhum mês existente foi encontrado para este vendedor nesse ano.');return}const goals=e.target.closest('[data-hr-goals]');if(goals){syncInputsToReport();const c=importYear(String(goals.dataset.hrGoals),false,true);alert(c?`Metas localizadas em ${c} competência(s).`:'Nenhuma meta salva foi localizada nesse ano.')}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.hidden)close()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();
