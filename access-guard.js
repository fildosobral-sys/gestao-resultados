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

  function hideLegacyGender(){
    var gender=document.getElementById('admGender');
    if(gender){gender.value='AUTOMATICO';var field=gender.closest('label');if(field)field.style.display='none';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hideLegacyGender);else hideLegacyGender();
  try{new MutationObserver(hideLegacyGender).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}

  function addScript(src,id){
    if(document.getElementById(id))return;
    var s=document.createElement('script');s.id=id;s.src=src;s.defer=true;document.head.appendChild(s);
  }

  if(/(?:^|\/)vendedor\.html$/i.test(location.pathname)){
    addScript('./vendedor-monthly-v91.js?v=91','monthlyCycleV91Loader');
  }

  if(/(?:^|\/)resultados\.html$/i.test(location.pathname)){
    addScript('./resultados-modal-v91.js?v=91','resultadosModalV91Loader');
  }
})();
