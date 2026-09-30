(function(){
'use strict';
if(window.__FS_RESULTADOS_RANKING_V92__)return;
window.__FS_RESULTADOS_RANKING_V92__=true;

function selectedDate(){
  var el=document.getElementById('dailyGoalDate');
  return el&&el.value ? el.value : new Date().toISOString().slice(0,10);
}

function loadScript(src,id){
  return new Promise(function(resolve,reject){
    if(window[id])return resolve();
    var old=document.querySelector('script[data-dynamic="'+id+'"]');
    if(old){old.addEventListener('load',resolve,{once:true});return;}
    var s=document.createElement('script');
    s.src=src;s.async=true;s.dataset.dynamic=id;
    s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
  });
}

function cssText(){
  return `
    *{box-sizing:border-box}
    .export-sheet{width:1220px;background:#f4f7fb;padding:26px;font-family:Inter,Arial,sans-serif;color:#17263a}
    .export-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:24px 26px;border-radius:24px;background:linear-gradient(135deg,#176ee8,#6749df);color:#fff;margin-bottom:18px}
    .export-head small{display:block;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;opacity:.78}
    .export-head h1{margin:5px 0 0;font-size:32px;line-height:1.05}
    .export-date{font-size:16px;font-weight:850;background:rgba(255,255,255,.15);padding:11px 15px;border-radius:14px;white-space:nowrap}
    .team-partial-panel{margin:0!important;padding:22px!important;border:1px solid #dbe3ee!important;border-left:6px solid #6c50e6!important;border-radius:22px!important;background:#fff!important;box-shadow:none!important}
    .team-partial-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:18px!important;margin-bottom:14px!important}
    .team-partial-head h3{margin:0!important;font-size:27px!important}
    .team-partial-head p{margin:5px 0 0!important;color:#6b7888!important;font-size:13px!important}
    .team-partial-eyebrow{display:block!important;font-size:11px!important;font-weight:900!important;letter-spacing:.14em!important;color:#684ee4!important;margin-bottom:5px!important}
    .team-partial-head .pill{font-size:12px!important;padding:8px 12px!important;background:#eef2f7!important;border-radius:999px!important;white-space:nowrap!important}
    .team-partial-summary{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:10px!important;margin:14px 0 16px!important}
    .team-partial-summary>div{background:#f7f9fc!important;border:1px solid #e1e7f0!important;border-radius:14px!important;padding:11px 13px!important}
    .team-partial-summary span{display:block!important;font-size:9px!important;font-weight:900!important;text-transform:uppercase!important;color:#718096!important}
    .team-partial-summary strong{display:block!important;font-size:23px!important;margin-top:4px!important}
    .team-partial-list{display:grid!important;gap:9px!important}
    .team-partial-row{display:grid!important;grid-template-columns:62px 230px minmax(0,1fr)!important;gap:14px!important;align-items:center!important;padding:13px 15px!important;border-radius:16px!important;border:1px solid #e2e8f0!important;break-inside:avoid!important;background:#fff!important;min-height:94px!important}
    .team-partial-row.status-hit{background:#f2fbf6!important;border-color:#b9e6cd!important}
    .team-partial-row.status-progress{background:#fffaf0!important;border-color:#f0d69c!important}
    .team-partial-row.status-zero{background:#fafbfd!important;border-color:#e1e7ef!important}
    .team-partial-rank{text-align:center!important}
    .team-partial-rank strong{display:block!important;font-size:19px!important}
    .team-partial-rank span{display:block!important;font-size:27px!important;margin-top:4px!important}
    .team-partial-person strong{display:block!important;font-size:18px!important}
    .team-partial-person small{display:block!important;margin-top:4px!important;font-size:12px!important;color:#728095!important}
    .team-partial-kpis{display:grid!important;grid-template-columns:1fr 1fr!important;gap:12px!important}
    .team-partial-kpis>div{position:relative!important;background:#f8fafc!important;border-radius:13px!important;padding:9px 11px 10px!important;min-width:0!important}
    .team-partial-kpis span{display:block!important;font-size:8px!important;font-weight:900!important;text-transform:uppercase!important;color:#6b7888!important}
    .team-partial-kpis strong{display:block!important;font-size:17px!important;margin-top:2px!important}
    .team-partial-kpis small{display:block!important;font-size:9px!important;color:#8190a1!important;margin-top:2px!important;padding-right:64px!important}
    .team-partial-kpis b{position:absolute!important;right:10px!important;top:10px!important;font-size:11px!important}
    .team-progress{height:7px!important;background:#dfe6ef!important;border-radius:999px!important;overflow:hidden!important;margin-top:8px!important}
    .team-progress i{display:block!important;height:100%!important;background:linear-gradient(90deg,#1687ef,#674be3)!important;border-radius:999px!important}
    .team-progress.service i{background:linear-gradient(90deg,#21a879,#51c7a0)!important}
    .team-partial-message{grid-column:2/-1!important;margin:1px 0 0!important;font-size:10px!important;color:#66778c!important;line-height:1.35!important}
    .team-partial-actions,.team-partial-detail,.team-partial-empty,button{display:none!important}
    .export-foot{text-align:right;color:#8793a2;font-size:10px;margin-top:12px}
  `;
}

async function exportPartialOnly(){
  var partial=document.querySelector('.team-partial-panel');
  if(!partial){alert('O resultado parcial da equipe ainda não está disponível.');return;}
  try{
    if(!window.html2canvas)await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','html2canvas');

    var wrap=document.createElement('div');
    wrap.style.cssText='position:fixed;left:-20000px;top:0;width:1272px;background:#f4f7fb;z-index:-1;padding:0;margin:0;';
    var sheet=document.createElement('div');sheet.className='export-sheet';

    var head=document.createElement('div');head.className='export-head';
    head.innerHTML='<div><small>ACOMPANHAMENTO PARCIAL</small><h1>Resultado parcial da equipe</h1></div><div class="export-date">'+selectedDate().split('-').reverse().join('/')+'</div>';
    sheet.appendChild(head);

    var clone=partial.cloneNode(true);
    clone.querySelectorAll('.team-partial-actions,.team-partial-detail,.team-partial-empty,button').forEach(function(x){x.remove();});
    var eyebrow=clone.querySelector('.team-partial-eyebrow');
    if(eyebrow)eyebrow.remove();
    var h3=clone.querySelector('.team-partial-head h3');
    if(h3)h3.textContent='Ranking parcial';
    var p=clone.querySelector('.team-partial-head p');
    if(p)p.textContent='Ordem decrescente pelo desempenho do dia, com mercantil e serviços lado a lado.';
    sheet.appendChild(clone);

    var foot=document.createElement('div');foot.className='export-foot';
    foot.textContent='Gerado pela Gestão de Resultados • '+new Date().toLocaleString('pt-BR');
    sheet.appendChild(foot);

    var style=document.createElement('style');style.textContent=cssText();
    wrap.appendChild(style);wrap.appendChild(sheet);document.body.appendChild(wrap);

    await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})});
    var canvas=await html2canvas(sheet,{
      scale:2.35,
      backgroundColor:'#f4f7fb',
      useCORS:true,
      logging:false,
      width:1220,
      windowWidth:1272
    });
    wrap.remove();

    var a=document.createElement('a');
    a.download='resultado-parcial-equipe-'+selectedDate()+'.png';
    a.href=canvas.toDataURL('image/png',1);
    a.click();
  }catch(e){
    alert('Não foi possível gerar a imagem do ranking neste aparelho. Tente novamente com internet ativa.');
  }
}

function replaceDownloadHandler(){
  var old=document.getElementById('teamPartialDownload');
  if(!old||old.dataset.v92==='1')return;
  var btn=old.cloneNode(true);
  btn.dataset.v92='1';
  btn.textContent='⬇️ Baixar resultado parcial';
  old.replaceWith(btn);
  btn.addEventListener('click',exportPartialOnly);
}

function boot(){
  replaceDownloadHandler();
  var mo=new MutationObserver(replaceDownloadHandler);
  mo.observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
