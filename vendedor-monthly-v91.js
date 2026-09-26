(function(){
'use strict';
if(window.__FS_MONTHLY_CYCLE_V91__)return;
window.__FS_MONTHLY_CYCLE_V91__=true;

var STORE='fs_gestao_resultados_v2';
var ENDPOINT='https://script.google.com/macros/s/AKfycbx9pLFWtpngXQemQLORPiY16pGlxKTU7Hw10cSZSzieoiMmn-CStDKfo5oUENimSwzv/exec';
var TOKEN='2c97791424feb4029ae889e3ab094596b158d2f4c680172b';
var brl=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
var pct=new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2});
var norm=function(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ')};
var digits=function(v){return String(v||'').replace(/\D/g,'')};
var branchMatch=function(a,b){var da=digits(a),db=digits(b);return da&&db?Number(da)===Number(db):norm(a)===norm(b)};
var num=function(v){if(typeof v==='number')return Number.isFinite(v)?Math.max(0,v):0;var s=String(v==null?'':v).replace(/R\$|\s/g,'');if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.');var n=Number(s);return Number.isFinite(n)?Math.max(0,n):0};
var esc=function(v){return String(v==null?'':v).replace(/[&<>'"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]})};
var now=new Date();
var currentMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
var branchText=String(localStorage.getItem('fs_filial')||'').trim();
var sellerName=String(localStorage.getItem('fs_nome')||'VENDEDOR').trim();
var qs=new URLSearchParams(location.search);
var managerView=qs.get('managerView')==='1';
var requestedSellerId=String(qs.get('sellerId')||'').trim();
var requestedSellerName=String(qs.get('seller')||'').trim();
if(managerView)return;

function localVault(){try{return JSON.parse(localStorage.getItem(STORE)||'null')}catch(e){return null}}
function exactRecord(v,key){return Object.values(v&&v.records||{}).find(function(r){return branchMatch(r.branch,branchText)&&r.month===key})||null}
function sellerInRecord(r){if(!r)return null;var wanted=norm(requestedSellerName||sellerName);return (r.sellers||[]).find(function(s){return(requestedSellerId&&String(s.id||'')===requestedSellerId)||norm(s.name)===wanted})||null}
function sellerKey(s){return s&&s.id?String(s.id):'seller-'+norm(s&&s.name||sellerName).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function previousMonth(key){var p=String(key).split('-').map(Number),d=new Date(p[0],p[1]-2,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function monthLabel(key){var p=String(key).split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(p[0],p[1]-1,1))}
function aggregate(s){
  var a={general:0,eligible:0,invoiceCount:0,nfs:0,warranty:0,warrantyQty:0,other:0,mixed:0,workedEntries:0};
  Object.values(s&&s.daily||{}).forEach(function(d){
    var row=num(d.general)+num(d.eligible)+num(d.invoiceCount)+num(d.nfs)+num(d.warranty)+num(d.warrantyQty)+num(d.other)+num(d.mixed);
    if(row>0)a.workedEntries++;
    a.general+=num(d.general);a.eligible+=num(d.eligible);a.invoiceCount+=num(d.invoiceCount);a.nfs+=num(d.nfs);
    a.warranty+=num(d.warranty);a.warrantyQty+=num(d.warrantyQty);a.other+=num(d.other);a.mixed+=num(d.mixed);
  });
  a.services=a.warranty+a.other+a.mixed;
  a.efficiency=a.eligible?a.services/a.eligible:0;
  a.conversion=a.nfs?a.warrantyQty/a.nfs:0;
  a.ticket=a.invoiceCount?a.general/a.invoiceCount:0;
  return a;
}
function meaningfulActivity(s){
  if(!s)return false;
  var a=aggregate(s);
  var legacy=num(s.general)+num(s.eligible)+num(s.invoiceCount)+num(s.nfs)+num(s.warranty)+num(s.warrantyQty)+num(s.other)+num(s.mixed);
  return a.workedEntries>0 || (a.general+a.eligible+a.invoiceCount+a.nfs+a.services+a.warrantyQty+legacy)>0;
}
function inferNoActivityReason(s){
  var days=Object.values(s&&s.daily||{});
  var medical=days.filter(function(d){return d&&d.status==='medical'}).length;
  var justified=days.filter(function(d){return d&&d.status==='justified'}).length;
  var off=days.filter(function(d){return d&&d.status==='off'}).length;
  if(medical>0&&medical>=Math.max(justified,off))return 'Afastamento/ausência médica registrada';
  if(justified>0)return 'Ausência justificada registrada';
  return 'Sem lançamentos suficientes no período';
}
function jsonpLoad(){return new Promise(function(resolve,reject){
  var cb='__monthlyV91_'+Date.now(),sc=document.createElement('script'),timer;
  function done(){if(timer)clearTimeout(timer);try{delete window[cb]}catch(e){}sc.remove()}
  window[cb]=function(res){done();res&&res.ok?resolve(res.vault):reject(new Error(res&&res.error||'Falha'))};
  sc.onerror=function(){done();reject(new Error('Conexão'))};
  timer=setTimeout(function(){done();reject(new Error('Tempo esgotado'))},10000);
  sc.src=ENDPOINT+'?action=load&token='+encodeURIComponent(TOKEN)+'&callback='+cb+'&_='+Date.now();
  document.head.appendChild(sc);
})}
async function postVault(v){await fetch(ENDPOINT,{method:'POST',mode:'no-cors',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'save',token:TOKEN,vault:v})})}
function saveLocal(v){v._cloudUpdatedAt=new Date().toISOString();localStorage.setItem(STORE,JSON.stringify(v));try{window.dispatchEvent(new CustomEvent('results-cloud-updated',{detail:{vault:v}}))}catch(e){}}

var banks={
 good:[
  'Resultado acima da referência. Identifique o comportamento que mais contribuiu e transforme-o em rotina.',
  'O indicador fechou em nível positivo. Preserve as práticas que funcionaram e procure repetir o padrão com consistência.',
  'Bom fechamento neste indicador. Use o resultado como base para elevar a regularidade no próximo ciclo.',
  'A referência foi alcançada. Registre o que funcionou melhor para que a execução forte não dependa de um único dia.'
 ],
 stable:[
  'O resultado ficou em uma faixa intermediária. Pequenos ajustes de rotina podem transformar proximidade em atingimento.',
  'Há base para evolução. Observe os dias de melhor desempenho e replique o padrão com maior frequência.',
  'O indicador mostra potencial, mas ainda pede consistência. Escolha uma ação simples para acompanhar semanalmente.',
  'O resultado é um bom ponto de partida. Defina uma prática objetiva para melhorar a regularidade no próximo mês.'
 ],
 attention:[
  'O indicador pede atenção. Revise abordagem, rotina e oportunidades perdidas e escolha uma ação concreta para o próximo mês.',
  'O resultado ficou abaixo da referência. Use o fechamento para identificar a principal causa e transformar a análise em ação.',
  'Há espaço claro para evolução. Priorize constância, acompanhamento diário e correção rápida quando o ritmo cair.',
  'O fechamento mostra uma oportunidade importante. Reforce preparação, execução e acompanhamento dos resultados durante o mês.'
 ]
};
function status(value,target,neutral){if(neutral)return value>0?'stable':'attention';if(!target)return value>0?'stable':'attention';var rate=value/target;return rate>=1?'good':rate>=.85?'stable':'attention'}
function systemFeedback(metric,tone,key){var bank=banks[tone]||banks.stable,p=String(key).split('-').map(Number),monthIndex=p[0]*12+p[1],seed=Array.from(norm(sellerName+metric)).reduce(function(a,ch){return a+ch.charCodeAt(0)},0);return bank[(seed+monthIndex)%bank.length]}
function metrics(prevSeller){var a=aggregate(prevSeller),mg=num(prevSeller.assignedGoal),sg=num(prevSeller.serviceGoal);return[
 {id:'mercantil',icon:'💰',title:'Venda mercantil',value:a.general,display:brl.format(a.general),target:mg,targetText:mg?'Meta: '+brl.format(mg):'Meta não registrada',tone:status(a.general,mg,false)},
 {id:'elegivel',icon:'🛒',title:'Venda elegível',value:a.eligible,display:brl.format(a.eligible),target:0,targetText:'Base utilizada para eficiência',tone:status(a.eligible,0,true)},
 {id:'notas',icon:'🧾',title:'Notas fiscais',value:a.invoiceCount,display:String(Math.round(a.invoiceCount)),target:0,targetText:'Quantidade emitida no período',tone:status(a.invoiceCount,0,true)},
 {id:'ticket',icon:'🎟️',title:'Ticket médio',value:a.ticket,display:brl.format(a.ticket),target:0,targetText:'Venda mercantil ÷ notas fiscais',tone:status(a.ticket,0,true)},
 {id:'servicos',icon:'🛡️',title:'Serviços',value:a.services,display:brl.format(a.services),target:sg,targetText:sg?'Meta: '+brl.format(sg):'Meta não registrada',tone:status(a.services,sg,false)},
 {id:'garantias',icon:'✅',title:'Garantias',value:a.warrantyQty,display:String(Math.round(a.warrantyQty)),target:0,targetText:'Quantidade vendida no período',tone:status(a.warrantyQty,0,true)},
 {id:'conversao',icon:'🎯',title:'Conversão',value:a.conversion,display:pct.format(a.conversion),target:.35,targetText:'Referência: 35,00%',tone:status(a.conversion,.35,false)},
 {id:'eficiencia',icon:'⚡',title:'Eficiência',value:a.efficiency,display:pct.format(a.efficiency),target:.07,targetText:'Referência: 7,00%',tone:status(a.efficiency,.07,false)}
]}

function css(){
  if(document.getElementById('monthlyCycleV91Css'))return;
  var st=document.createElement('style');st.id='monthlyCycleV91Css';
  st.textContent=`
  .monthly-cycle-v91[hidden]{display:none!important}.monthly-cycle-v91{position:fixed;inset:0;z-index:100500;background:rgba(8,24,43,.62);backdrop-filter:blur(8px);display:grid;place-items:center;padding:18px}
  .monthly-cycle-dialog{width:min(980px,96vw);max-height:94dvh;overflow:auto;background:#f8fbff;border:1px solid rgba(183,202,224,.72);border-radius:28px;box-shadow:0 34px 100px rgba(8,24,43,.32)}
  .monthly-cycle-head{position:sticky;top:0;z-index:5;padding:22px 24px;background:linear-gradient(135deg,#0879e8,#6049e8);color:#fff;border-radius:28px 28px 0 0}
  .monthly-cycle-head small{display:block;font-size:.72rem;font-weight:850;letter-spacing:.12em;text-transform:uppercase;opacity:.8;margin-bottom:5px}.monthly-cycle-head h2{margin:0;font-size:clamp(1.45rem,3vw,2rem)}.monthly-cycle-head p{margin:7px 0 0;opacity:.88}
  .monthly-cycle-body{padding:20px 22px 24px}.monthly-summary{display:grid;gap:14px}.monthly-metric{border:1px solid #dfe8f2;border-left:5px solid #3988dd;border-radius:18px;background:#fff;padding:15px}
  .monthly-metric.good{border-left-color:#1f9d6a}.monthly-metric.stable{border-left-color:#e6a21a}.monthly-metric.attention{border-left-color:#d84b60}.monthly-metric-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
  .monthly-metric-title{font-weight:850;color:#17324d;font-size:1rem}.monthly-metric-value{text-align:right}.monthly-metric-value strong{display:block;font-size:1.3rem;color:#102a43}.monthly-metric-value small{color:#7c8998}
  .monthly-metric label{display:block;margin-top:12px;font-size:.78rem;font-weight:850;color:#53677b}.monthly-metric textarea{box-sizing:border-box;width:100%;min-height:84px;margin-top:6px;border:1px solid #d5dfeb;border-radius:14px;padding:11px 12px;font:inherit;resize:vertical;background:#fbfdff;color:#17324d}
  .platform-feedback{margin-top:9px;padding:10px 12px;border-radius:13px;background:#f2f7fc;color:#53677b;font-size:.78rem;line-height:1.45}.platform-feedback b{color:#17324d}
  .monthly-commitment{margin-top:16px;border:1px solid #dfe8f2;border-left:5px solid #6a55e8;border-radius:18px;background:#fff;padding:15px}.monthly-commitment textarea{box-sizing:border-box;width:100%;min-height:90px;margin-top:7px;border:1px solid #d5dfeb;border-radius:14px;padding:11px 12px;font:inherit}
  .monthly-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}.monthly-primary{border:0;border-radius:14px;padding:13px 18px;background:linear-gradient(135deg,#0879e8,#6049e8);color:#fff;font-weight:850;font-size:.95rem}.monthly-primary:disabled{opacity:.55}
  .monthly-note{margin-top:10px;color:#7a8798;font-size:.75rem}.monthly-goals-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.monthly-goal-field{border:1px solid #dfe8f2;border-radius:18px;background:#fff;padding:14px}.monthly-goal-field span{display:block;font-size:.75rem;font-weight:850;color:#687789;margin-bottom:7px}.monthly-goal-field input{box-sizing:border-box;width:100%;border:0;outline:0;background:transparent;font-size:1.45rem;font-weight:850;color:#17324d}
  .monthly-success{padding:22px;border-radius:18px;background:#eef9f3;color:#226b4b;text-align:center;font-weight:750}
  @media(max-width:700px){.monthly-cycle-v91{padding:0}.monthly-cycle-dialog{width:100vw;max-height:100dvh;height:100dvh;border-radius:0}.monthly-cycle-head{border-radius:0;padding:18px}.monthly-cycle-body{padding:14px}.monthly-goals-grid{grid-template-columns:1fr}.monthly-metric-top{align-items:center}.monthly-metric-value strong{font-size:1.08rem}}
  `;
  document.head.appendChild(st);
}
function modal(){
  css();var el=document.getElementById('monthlyCycleV91');if(el)return el;
  el=document.createElement('div');el.id='monthlyCycleV91';el.className='monthly-cycle-v91';el.hidden=true;
  el.innerHTML='<div class="monthly-cycle-dialog" role="dialog" aria-modal="true"><div class="monthly-cycle-head"><small>Fechamento inteligente</small><h2 id="monthlyCycleTitleV91">Resumo mensal</h2><p id="monthlyCycleSubtitleV91"></p></div><div class="monthly-cycle-body" id="monthlyCycleBodyV91"></div></div>';
  document.body.appendChild(el);return el;
}
async function persistReview(prevKey,review){
  var remote=await jsonpLoad().catch(function(){return localVault()||{version:2,currentKey:'',records:{}}});
  remote=remote||{version:2,currentKey:'',records:{}};remote.records=remote.records||{};
  var prev=exactRecord(remote,prevKey);if(!prev)throw new Error('Competência anterior não encontrada');
  var ps=sellerInRecord(prev);if(!ps)throw new Error('Vendedor não encontrado');
  ps.monthlyCloseouts=ps.monthlyCloseouts&&typeof ps.monthlyCloseouts==='object'?ps.monthlyCloseouts:{};
  ps.monthlyCloseouts[prevKey]=review;ps.updatedAt=new Date().toISOString();prev.updatedAt=new Date().toISOString();
  var curr=exactRecord(remote,currentMonth),cs=sellerInRecord(curr);
  if(cs){cs.closedMonths=cs.closedMonths&&typeof cs.closedMonths==='object'?cs.closedMonths:{};cs.closedMonths[prevKey]=review.savedAt;cs.updatedAt=new Date().toISOString();curr.updatedAt=new Date().toISOString()}
  saveLocal(remote);await postVault(remote);return remote;
}
async function persistNoActivity(prevKey,prevRecord,prevSeller){
  var reason=inferNoActivityReason(prevSeller);
  var review={version:2,month:prevKey,sellerId:sellerKey(prevSeller),sellerName:prevSeller.name||sellerName,branch:prevRecord.branch||branchText,savedAt:new Date().toISOString(),status:'sem_movimento',automatic:true,reason:reason,metrics:{},commitment:''};
  return persistReview(prevKey,review);
}
function openCloseout(vault,prevKey,prevRecord,prevSeller){
  var m=modal(),body=m.querySelector('#monthlyCycleBodyV91'),list=metrics(prevSeller);
  m.querySelector('#monthlyCycleTitleV91').textContent='Fechamento de '+monthLabel(prevKey);
  m.querySelector('#monthlyCycleSubtitleV91').textContent='Antes de iniciar o novo ciclo, revise seus indicadores e registre sua leitura do mês.';
  body.innerHTML='<div class="monthly-summary">'+list.map(function(x){return '<section class="monthly-metric '+x.tone+'" data-metric="'+x.id+'"><div class="monthly-metric-top"><div class="monthly-metric-title">'+x.icon+' '+x.title+'</div><div class="monthly-metric-value"><strong>'+x.display+'</strong><small>'+x.targetText+'</small></div></div><label>Minha análise do resultado *</label><textarea maxlength="700" placeholder="O que contribuiu para este resultado? O que você faria diferente no próximo mês?"></textarea><div class="platform-feedback"><b>Feedback da plataforma:</b> '+esc(systemFeedback(x.id,x.tone,prevKey))+'</div></section>'}).join('')+'</div><section class="monthly-commitment"><strong>🎯 Meu compromisso para o próximo mês *</strong><div class="monthly-note">Registre uma ação objetiva que você pretende praticar no novo ciclo.</div><textarea id="monthlyCommitmentV91" maxlength="700" placeholder="Ex.: acompanhar diariamente minha conversão e reforçar a oferta de garantia em todos os atendimentos."></textarea></section><div class="monthly-actions"><button class="monthly-primary" id="saveMonthlyCloseoutV91">Salvar fechamento do mês</button></div><div class="monthly-note" id="monthlyFeedbackV91">Todos os campos de autorreflexão são obrigatórios.</div>';
  m.hidden=false;document.body.style.overflow='hidden';
  body.querySelector('#saveMonthlyCloseoutV91').onclick=async function(){
    var notes=Array.from(body.querySelectorAll('.monthly-metric textarea')).map(function(t){return t.value.trim()}),commit=body.querySelector('#monthlyCommitmentV91').value.trim(),fb=body.querySelector('#monthlyFeedbackV91'),btn=this;
    if(notes.some(function(t){return t.length<8})||commit.length<8){fb.textContent='Preencha cada análise e o compromisso do próximo mês antes de continuar.';fb.style.color='#b83249';return}
    btn.disabled=true;btn.textContent='Salvando…';
    var review={version:2,month:prevKey,sellerId:sellerKey(prevSeller),sellerName:prevSeller.name||sellerName,branch:prevRecord.branch||branchText,savedAt:new Date().toISOString(),status:'avaliado',automatic:false,metrics:{},commitment:commit};
    list.forEach(function(x,i){review.metrics[x.id]={title:x.title,value:x.value,display:x.display,target:x.target||0,status:x.tone,selfFeedback:notes[i],systemFeedback:systemFeedback(x.id,x.tone,prevKey)}});
    try{await persistReview(prevKey,review);body.innerHTML='<div class="monthly-success">✅ Fechamento salvo. Sua análise ficou registrada junto à competência encerrada.</div>';setTimeout(function(){m.hidden=true;document.body.style.overflow='';start()},900)}
    catch(e){btn.disabled=false;btn.textContent='Salvar fechamento do mês';fb.textContent='Não foi possível sincronizar agora. Tente novamente antes de iniciar o novo ciclo.';fb.style.color='#b83249'}
  };
}
async function persistGoals(mg,sg){
  var remote=await jsonpLoad().catch(function(){return localVault()||{version:2,currentKey:'',records:{}}}),curr=exactRecord(remote,currentMonth);
  if(!curr)throw new Error('A competência atual ainda não foi criada pelo gestor');
  curr.sellers=Array.isArray(curr.sellers)?curr.sellers:[];
  var s=sellerInRecord(curr);if(!s){s={id:sellerKey({name:sellerName}),name:sellerName,daily:{},updatedAt:new Date().toISOString()};curr.sellers.push(s)}
  s.assignedGoal=mg;s.serviceGoal=sg;s.goalSetupByMonth=s.goalSetupByMonth&&typeof s.goalSetupByMonth==='object'?s.goalSetupByMonth:{};
  s.goalSetupByMonth[currentMonth]={mercantile:mg,services:sg,savedAt:new Date().toISOString()};
  s.updatedAt=new Date().toISOString();curr.updatedAt=new Date().toISOString();saveLocal(remote);await postVault(remote);
}
function openGoals(vault){
  var curr=exactRecord(vault,currentMonth);if(!curr)return;
  var s=sellerInRecord(curr);if(s&&num(s.assignedGoal)>0&&num(s.serviceGoal)>0)return;
  var m=modal(),body=m.querySelector('#monthlyCycleBodyV91');
  m.querySelector('#monthlyCycleTitleV91').textContent='🚀 Novo mês, novas metas';
  m.querySelector('#monthlyCycleSubtitleV91').textContent='Defina suas metas para '+monthLabel(currentMonth)+'. Elas alimentarão acompanhamento diário, projeções e análises.';
  body.innerHTML='<div class="monthly-goals-grid"><label class="monthly-goal-field"><span>💰 META MERCANTIL</span><input id="monthlyMercGoalV91" inputmode="decimal" placeholder="R$ 0,00"></label><label class="monthly-goal-field"><span>🛡️ META DE SERVIÇOS</span><input id="monthlyServGoalV91" inputmode="decimal" placeholder="R$ 0,00"></label></div><div class="monthly-actions"><button class="monthly-primary" id="saveMonthlyGoalsV91">Salvar e iniciar mês</button></div><div class="monthly-note" id="monthlyGoalFeedbackV91">As duas metas são obrigatórias para iniciar o novo ciclo.</div>';
  m.hidden=false;document.body.style.overflow='hidden';
  body.querySelector('#saveMonthlyGoalsV91').onclick=async function(){
    var mg=num(body.querySelector('#monthlyMercGoalV91').value),sg=num(body.querySelector('#monthlyServGoalV91').value),fb=body.querySelector('#monthlyGoalFeedbackV91'),btn=this;
    if(!(mg>0)||!(sg>0)){fb.textContent='Informe a Meta Mercantil e a Meta de Serviços.';fb.style.color='#b83249';return}
    btn.disabled=true;btn.textContent='Salvando…';
    try{await persistGoals(mg,sg);m.hidden=true;document.body.style.overflow='';setTimeout(function(){location.reload()},250)}
    catch(e){btn.disabled=false;btn.textContent='Salvar e iniciar mês';fb.textContent=e.message||'Não foi possível salvar as novas metas.';fb.style.color='#b83249'}
  };
}
async function start(){
  try{
    var vault=await jsonpLoad().catch(function(){return localVault()});if(!vault)return;saveLocal(vault);
    var prevKey=previousMonth(currentMonth),prev=exactRecord(vault,prevKey),ps=sellerInRecord(prev);
    if(prev&&ps&&!(ps.monthlyCloseouts&&ps.monthlyCloseouts[prevKey])){
      if(!meaningfulActivity(ps)){
        vault=await persistNoActivity(prevKey,prev,ps);
        openGoals(vault);
        return;
      }
      openCloseout(vault,prevKey,prev,ps);return;
    }
    openGoals(vault);
  }catch(e){}
}
function boot(){setTimeout(start,900)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
