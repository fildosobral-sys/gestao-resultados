(function(){
'use strict';
if(window.__FS_RESULTADOS_MODAL_V91__)return;
window.__FS_RESULTADOS_MODAL_V91__=true;

function installCss(){
  if(document.getElementById('resultadosModalV91Css'))return;
  var st=document.createElement('style');
  st.id='resultadosModalV91Css';
  st.textContent=`
    html.team-modal-open-v91,body.team-modal-open-v91{overflow:hidden!important}
    body>.team-modal[hidden]{display:none!important}
    body>.team-modal{
      position:fixed!important;
      inset:0!important;
      width:100vw!important;
      height:100dvh!important;
      min-height:100vh!important;
      z-index:2147483000!important;
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      padding:18px!important;
      margin:0!important;
      transform:none!important;
      contain:none!important;
      overflow:auto!important;
      overscroll-behavior:contain;
      background:rgba(15,28,43,.54)!important;
      box-sizing:border-box!important;
    }
    body>.team-modal>.team-modal-card{
      position:relative!important;
      width:min(920px,calc(100vw - 36px))!important;
      max-width:calc(100vw - 36px)!important;
      max-height:calc(100dvh - 36px)!important;
      margin:auto!important;
      transform:none!important;
      overflow:auto!important;
      box-sizing:border-box!important;
    }
    body>.team-modal>.team-modal-card.wide{
      width:min(1180px,calc(100vw - 36px))!important;
    }
    @media(max-width:760px){
      body>.team-modal{padding:8px!important}
      body>.team-modal>.team-modal-card,
      body>.team-modal>.team-modal-card.wide{
        width:calc(100vw - 16px)!important;
        max-width:calc(100vw - 16px)!important;
        max-height:calc(100dvh - 16px)!important;
        border-radius:18px!important;
      }
    }
  `;
  document.head.appendChild(st);
}

function moveModalsToBody(){
  document.querySelectorAll('.team-modal').forEach(function(modal){
    if(modal.parentElement!==document.body)document.body.appendChild(modal);
  });
}

function syncBodyLock(){
  var open=[...document.querySelectorAll('body>.team-modal')].some(function(m){return !m.hidden;});
  document.documentElement.classList.toggle('team-modal-open-v91',open);
  document.body.classList.toggle('team-modal-open-v91',open);
}

function normalizeOpenModal(modal){
  if(!modal)return;
  if(modal.parentElement!==document.body)document.body.appendChild(modal);
  modal.scrollTop=0;
  var card=modal.querySelector('.team-modal-card');
  if(card){card.scrollTop=0;card.scrollLeft=0;}
  syncBodyLock();
}

function boot(){
  installCss();
  moveModalsToBody();
  syncBodyLock();

  document.addEventListener('click',function(e){
    var btn=e.target.closest('#teamPartialManual,#teamPartialImport,[data-close-team-modal]');
    if(!btn)return;
    requestAnimationFrame(function(){
      moveModalsToBody();
      if(btn.id==='teamPartialImport')normalizeOpenModal(document.getElementById('teamPartialImportModal'));
      else if(btn.id==='teamPartialManual')normalizeOpenModal(document.getElementById('teamPartialManualModal'));
      else syncBodyLock();
    });
  },true);

  var mo=new MutationObserver(function(mutations){
    var changed=false;
    mutations.forEach(function(m){
      if(m.type==='attributes'&&m.target.classList&&m.target.classList.contains('team-modal'))changed=true;
      if(m.type==='childList')changed=true;
    });
    if(changed){
      moveModalsToBody();
      document.querySelectorAll('body>.team-modal:not([hidden])').forEach(normalizeOpenModal);
      syncBodyLock();
    }
  });
  mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','class']});

  window.addEventListener('resize',function(){
    document.querySelectorAll('body>.team-modal:not([hidden])').forEach(normalizeOpenModal);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
