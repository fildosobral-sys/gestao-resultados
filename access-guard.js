(function(){
  'use strict';
  function normalize(v){return String(v||'').trim().toUpperCase();}
  function digits(v){return String(v||'').replace(/\D/g,'');}
  function role(v){var r=normalize(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_');if(r==='DESENVOLVER_MASTER')r='DESENVOLVEDOR_MASTER';return r;}
  function branch(v){var n=digits(v);return n?'FILIAL '+String(parseInt(n,10)):normalize(v).replace(/\s+/g,' ');}
  function fingerprint(){return [branch(localStorage.getItem('fs_filial')),normalize(localStorage.getItem('fs_nome')),role(localStorage.getItem('fs_cargo')),digits(localStorage.getItem('fs_whatsapp'))].join('|');}
  function authorized(){try{var verified=Number(localStorage.getItem('fs_access_verified_at')||0),saved=localStorage.getItem('fs_access_verified_fingerprint')||'',token=localStorage.getItem('fsAuthGlobal')||'',age=Date.now()-verified;return token==='ok-@fildO1060'&&verified>0&&age>=0&&age<(12*60*60*1000)&&saved&&saved===fingerprint();}catch(e){return false;}}
  if(!authorized()){try{sessionStorage.setItem('fs_requested_module',location.pathname+location.search);}catch(e){}location.replace('./index.html?acesso=necessario');return;}
  document.documentElement.classList.remove('fs-module-auth-lock');

  // V90: mantém compatibilidade com o banco legado, mas não exibe mais gênero da saudação na Administração.
  function hideLegacyGender(){
    var gender=document.getElementById('admGender');
    if(gender){gender.value='AUTOMATICO';var field=gender.closest('label');if(field)field.style.display='none';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hideLegacyGender);else hideLegacyGender();
  try{new MutationObserver(hideLegacyGender).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}

  // V90: ciclo mensal inteligente do vendedor carregado sem alterar a estrutura principal já homologada.
  if(/(?:^|\/)vendedor\.html$/i.test(location.pathname)){
    var monthly=document.createElement('script');
    monthly.src='./vendedor-monthly-v90.js?v=90';
    monthly.defer=true;
    document.head.appendChild(monthly);
  }
})();
