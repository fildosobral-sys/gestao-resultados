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
var moneyNum=function(v){if(typeof v==='number')return Number.isFinite(v)?Math.max(0,v):0;var s=String(v==null?'':v).trim().replace(/R\$|\s|\u00a0/g,'');if(!s)return 0;var c=s.lastIndexOf(','),d=s.lastIndexOf('.');if(c>=0&&d>=0){if(c>d)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'')}else if(c>=0){var tail=s.length-c-1;if(tail===3&&/^\d{1,3}(,\d{3})+$/.test(s))s=s.replace(/,/g,'');else s=s.replace(/\./g,'').replace(',','.')}else if(d>=0){var a=s.split('.');if(a.length>2&&a.slice(1).every(function(x){return x.length===3}))s=a.join('');else if(a.length===2&&a[1].length===3&&/^\d{1,3}\.\d{3}$/.test(s))s=a.join('');else if(a.length>2){var dec=a.pop();s=a.join('')+'.'+dec}}var n=Number(s);return Number.isFinite(n)?Math.max(0,n):0};
var esc=function(v){return String(v==null?'':v).replace(/[&<>'"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]})};
var now=new Date();
var currentMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
var branchText=String(localStorage.getItem('fs_filial')||'').trim();
var sellerName=String(localStorage.getItem('fs_nome')||'VENDEDOR').trim();
var qs=new URLSearchParams(location.search);
var managerView=qs.get('managerView')==='1';
var requestedSellerId=String(qs.get('sellerId')||'').trim();
var requestedSellerName=String(qs.get('seller')||'').trim();
var requestedViewMonth=String(qs.get('month')||'').trim();
if(managerView)return;
/* Ao consultar uma competência histórica, não abrir novamente o fechamento/novo ciclo. */
if(/^\d{4}-\d{2}$/.test(requestedViewMonth)&&requestedViewMonth!==currentMonth)return;

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
  'Parabéns pela entrega. Preserve o que gerou resultado e transforme as melhores práticas em rotina.',
  'Meta ou referência alcançada. Identifique o comportamento decisivo e repita-o com consistência no próximo ciclo.',
  'Fechamento positivo. Mantenha o padrão que funcionou e escolha um ponto para elevar ainda mais a qualidade da execução.',
  'Bom resultado no mês. Registre o que funcionou para que a performance forte seja reproduzível, e não ocasional.'
 ],
 stable:[
  'Você ficou próximo da referência. Pequenos ajustes de rotina podem transformar proximidade em atingimento.',
  'Há uma base consistente. Observe os dias de melhor desempenho e replique esse padrão com maior frequência.',
  'O indicador mostra potencial. Escolha uma ação simples e mensurável para acompanhar ao longo do próximo mês.',
  'O resultado está em uma faixa de construção. Identifique o que funcionou melhor e reduza as oscilações durante o ciclo.'
 ],
 attention:[
  'O indicador ficou abaixo da referência. Identifique a principal causa e transforme a análise em uma ação prática.',
  'Há espaço importante para evolução. Separe fatores internos e externos e defina o que está sob seu controle para o próximo mês.',
  'O fechamento pede correção de rota. Priorize uma mudança objetiva de comportamento e acompanhe-a durante o mês.',
  'Use este resultado como diagnóstico. Escolha uma causa principal e uma ação concreta para melhorar a execução no próximo ciclo.'
 ]
};
var questionBanks={
 mercantil:{
  good:[
   'Parabéns pela meta mercantil. O que mais contribuiu para essa entrega?',
   'Qual atitude ou estratégia sua fez maior diferença no resultado?',
   'Mesmo com a meta batida, o que você quer melhorar no próximo mês?'
  ],
  stable:[
   'O que mais ajudou você a chegar perto da meta mercantil?',
   'O que mais limitou a entrega completa neste mês?',
   'Qual ajuste prático pode fazer a diferença no próximo ciclo?'
  ],
  attention:[
   'Quais fatores internos e externos mais impactaram seu mercantil?',
   'Na sua avaliação, onde ficou a principal perda de oportunidade?',
   'Qual ação objetiva você pretende mudar no próximo mês?'
  ]
 },
 servicos:{
  good:[
   'Parabéns pela meta de serviços. O que mais funcionou na sua abordagem?',
   'Qual comportamento seu ajudou a transformar mais oportunidades em serviços?',
   'O que você pretende manter e o que ainda pode melhorar no próximo mês?'
  ],
  stable:[
   'O que mais contribuiu para você se aproximar da meta de serviços?',
   'Em que momento da oferta você percebe mais dificuldade?',
   'Que ajuste simples pode aumentar sua constância no próximo mês?'
  ],
  attention:[
   'O que mais dificultou sua entrega de serviços neste mês?',
   'Quais fatores internos ou externos reduziram suas oportunidades?',
   'Qual mudança de abordagem você pretende testar no próximo ciclo?'
  ]
 },
 conversao:{
  good:[
   'Sua conversão superou a referência. O que mais ajudou nesse resultado?',
   'Qual etapa do seu atendimento você considera mais forte hoje?',
   'O que pretende fazer para manter ou elevar essa conversão no próximo mês?'
  ],
  stable:[
   'O que funcionou melhor na sua conversão neste mês?',
   'Em qual etapa do atendimento você ainda perde mais oportunidades?',
   'Qual melhoria prática pode elevar sua conversão no próximo ciclo?'
  ],
  attention:[
   'Na sua visão, o que mais prejudicou sua conversão?',
   'Quais fatores internos e externos influenciaram esse indicador?',
   'Qual etapa do atendimento você pretende trabalhar primeiro no próximo mês?'
  ]
 },
 eficiencia:{
  good:[
   'Sua eficiência ficou acima da referência. O que mais contribuiu para isso?',
   'Qual prática de oferta de serviços funcionou melhor para você?',
   'Como pretende manter esse nível e buscar uma evolução no próximo mês?'
  ],
  stable:[
   'O que mais ajudou sua eficiência neste mês?',
   'Onde você percebe maior dificuldade na oferta de serviços elegíveis?',
   'Qual ação pode tornar sua eficiência mais constante no próximo ciclo?'
  ],
  attention:[
   'O que mais limitou sua eficiência neste mês?',
   'Quais fatores internos e externos afetaram a oferta de serviços?',
   'Qual comportamento você pretende ajustar primeiro no próximo mês?'
  ]
 },
 notas:{stable:[
  'Como você avalia seu volume de notas fiscais no mês?',
  'O que esse volume revela sobre seu ritmo de atendimento?',
  'O que você pode ajustar para melhorar esse indicador no próximo ciclo?'
 ]},
 ticket:{stable:[
  'Como você avalia seu ticket médio neste mês?',
  'O que mais influenciou o valor médio por atendimento?',
  'Qual ação pode elevar seu ticket médio no próximo ciclo?'
 ]}
};
function status(value,target,neutral){if(neutral)return value>0?'stable':'attention';if(!target)return value>0?'stable':'attention';var rate=value/target;return rate>=1?'good':rate>=.85?'stable':'attention'}
function seededIndex(metric,tone,key,size){var p=String(key).split('-').map(Number),monthIndex=p[0]*12+p[1],seed=Array.from(norm(sellerName+metric+tone)).reduce(function(a,ch){return a+ch.charCodeAt(0)},0);return size?(seed+monthIndex)%size:0}
function systemFeedback(metric,tone,key){var bank=banks[tone]||banks.stable;return bank[seededIndex(metric,tone,key,bank.length)]}
function questionText(metric,tone,key){var group=questionBanks[metric]||questionBanks.mercantil,bank=group[tone]||group.stable||group.good||group.attention||['Como você avalia este resultado?'];return bank[seededIndex(metric,tone,key,bank.length)]}
function questionSet(metric,tone,key){var group=questionBanks[metric]||questionBanks.mercantil,bank=(group[tone]||group.stable||group.good||group.attention||['Como você avalia este resultado?']).slice();if(!bank.length)return[];var start=seededIndex(metric,tone,key,bank.length),ordered=[];for(var i=0;i<bank.length;i++)ordered.push(bank[(start+i)%bank.length]);return ordered.slice(0,Math.min(3,ordered.length))}
function sellerMonthlyGoals(s,key){var setup=s&&s.goalSetupByMonth&&s.goalSetupByMonth[key];var mg=moneyNum(setup&&setup.mercantile)||moneyNum(s&&s.assignedGoal);var sg=moneyNum(setup&&setup.services)||moneyNum(s&&s.serviceGoal);return{mercantile:mg,services:sg}}
function metrics(prevSeller,prevKey){
 var a=aggregate(prevSeller),goals=sellerMonthlyGoals(prevSeller,prevKey),mg=goals.mercantile,sg=goals.services,ecom=moneyNum(prevSeller&&prevSeller.ecommerce),mercTotal=a.general+ecom;
 var list=[
  {id:'mercantil',icon:'💰',title:'Venda mercantil',value:mercTotal,display:brl.format(mercTotal),target:mg,targetText:mg?'Meta: '+brl.format(mg):'Meta não registrada',tone:status(mercTotal,mg,false)},
  {id:'servicos',icon:'🛡️',title:'Serviços',value:a.services,display:brl.format(a.services),target:sg,targetText:sg?'Meta: '+brl.format(sg):'Meta não registrada',tone:status(a.services,sg,false)},
  {id:'conversao',icon:'🎯',title:'Conversão',value:a.conversion,display:pct.format(a.conversion),target:.35,targetText:'Referência: 35,00%',tone:status(a.conversion,.35,false)},
  {id:'eficiencia',icon:'⚡',title:'Eficiência',value:a.efficiency,display:pct.format(a.efficiency),target:.07,targetText:'Referência: 7,00%',tone:status(a.efficiency,.07,false)}
 ];
 /* Notas fiscais e ticket só aparecem quando realmente há base registrada. */
 if(a.invoiceCount>0){
  list.push({id:'notas',icon:'🧾',title:'Notas fiscais',value:a.invoiceCount,display:String(Math.round(a.invoiceCount)),target:0,targetText:'Quantidade emitida no período',tone:'stable'});
  list.push({id:'ticket',icon:'🎟️',title:'Ticket médio',value:mercTotal/a.invoiceCount,display:brl.format(mercTotal/a.invoiceCount),target:0,targetText:'Venda mercantil ÷ notas fiscais',tone:'stable'});
 }
 return list;
}

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
  .monthly-metric label{display:block;margin-top:12px;font-size:.78rem;font-weight:850;color:#53677b}.monthly-metric textarea{box-sizing:border-box;width:100%;min-height:72px;margin-top:6px;border:1px solid #d5dfeb;border-radius:14px;padding:11px 12px;font:inherit;resize:vertical;background:#fbfdff;color:#17324d}.monthly-guided-questions{display:grid;gap:9px;margin-top:10px}.monthly-guided-question{padding:9px 10px;border-radius:13px;background:#f8fbfe;border:1px solid #e7eef6}.monthly-guided-question label{margin-top:0!important;line-height:1.35}.monthly-guided-question textarea{min-height:64px!important}
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
  var m=modal(),body=m.querySelector('#monthlyCycleBodyV91'),list=metrics(prevSeller,prevKey);
  m.querySelector('#monthlyCycleTitleV91').textContent='Fechamento de '+monthLabel(prevKey);
  m.querySelector('#monthlyCycleSubtitleV91').textContent='Antes de iniciar o novo ciclo, revise seus indicadores e registre sua leitura do mês.';
  body.innerHTML='<div class="monthly-summary">'+list.map(function(x){var qs=questionSet(x.id,x.tone,prevKey);var badge=x.target?(x.value>=x.target?'Meta/referência alcançada':x.value>=x.target*.85?'Próximo da referência':'Abaixo da referência'):'Indicador complementar';return '<section class="monthly-metric '+x.tone+'" data-metric="'+x.id+'"><div class="monthly-metric-top"><div><div class="monthly-metric-title">'+x.icon+' '+x.title+'</div><span class="monthly-result-badge">'+badge+'</span></div><div class="monthly-metric-value"><strong>'+x.display+'</strong><small>'+x.targetText+'</small></div></div><div class="monthly-guided-questions">'+qs.map(function(q,qi){return '<div class="monthly-guided-question"><label>'+(qi+1)+'. '+esc(q)+' *</label><textarea data-question-index="'+qi+'" maxlength="420" placeholder="Responda em poucas palavras, de forma objetiva."></textarea></div>'}).join('')+'</div><div class="platform-feedback"><b>Feedback da plataforma:</b> '+esc(systemFeedback(x.id,x.tone,prevKey))+'</div></section>'}).join('')+'</div><section class="monthly-commitment"><strong>🎯 Meu compromisso para o próximo mês *</strong><div class="monthly-note">Defina uma ação objetiva, simples e acompanhável para o novo ciclo.</div><textarea id="monthlyCommitmentV91" maxlength="700" placeholder="Ex.: acompanhar minha conversão diariamente e reforçar a oferta de serviços em todos os atendimentos."></textarea></section><div class="monthly-actions"><button class="monthly-primary" id="saveMonthlyCloseoutV91">Salvar fechamento do mês</button></div><div class="monthly-note" id="monthlyFeedbackV91">Responda as perguntas de cada indicador em poucas palavras e registre seu compromisso.</div>';
  m.hidden=false;document.body.style.overflow='hidden';
  body.querySelector('#saveMonthlyCloseoutV91').onclick=async function(){
    var sections=Array.from(body.querySelectorAll('.monthly-metric')),answers=sections.map(function(sec){return Array.from(sec.querySelectorAll('textarea')).map(function(t){return t.value.trim()})}),commit=body.querySelector('#monthlyCommitmentV91').value.trim(),fb=body.querySelector('#monthlyFeedbackV91'),btn=this;
    if(answers.some(function(group){return group.some(function(t){return t.length<4})})||commit.length<8){fb.textContent='Responda todas as perguntas de forma objetiva e registre o compromisso do próximo mês.';fb.style.color='#b83249';return}
    btn.disabled=true;btn.textContent='Salvando…';
    var review={version:3,month:prevKey,sellerId:sellerKey(prevSeller),sellerName:prevSeller.name||sellerName,branch:prevRecord.branch||branchText,savedAt:new Date().toISOString(),status:'avaliado',automatic:false,metrics:{},commitment:commit};
    list.forEach(function(x,i){var prompts=questionSet(x.id,x.tone,prevKey),responses=answers[i]||[];review.metrics[x.id]={title:x.title,value:x.value,display:x.display,target:x.target||0,status:x.tone,prompts:prompts,responses:responses,prompt:prompts[0]||'',selfFeedback:responses[0]||'',systemFeedback:systemFeedback(x.id,x.tone,prevKey)}});
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
    var mg=moneyNum(body.querySelector('#monthlyMercGoalV91').value),sg=moneyNum(body.querySelector('#monthlyServGoalV91').value),fb=body.querySelector('#monthlyGoalFeedbackV91'),btn=this;
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
