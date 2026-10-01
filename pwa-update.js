(function(){
  'use strict';
  if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;

  const CHECK_MS=60000;
  let registration=null;
  let hadController=!!navigator.serviceWorker.controller;
  let reloading=false;

  function updateNow(){
    if(registration) registration.update().catch(()=>{});
  }
  function safeReloadOnControllerChange(){
    if(!hadController){hadController=true;return;}
    if(reloading)return;
    try{
      const key='fs_pwa_controller_reload_v142';
      const last=Number(sessionStorage.getItem(key)||0);
      const now=Date.now();
      if(now-last<8000)return;
      sessionStorage.setItem(key,String(now));
    }catch(_){ }
    reloading=true;
    location.reload();
  }

  navigator.serviceWorker.addEventListener('controllerchange',safeReloadOnControllerChange);
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'})
      .then(function(reg){
        registration=reg;
        updateNow();
        setInterval(updateNow,CHECK_MS);
        document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateNow()});
        window.addEventListener('focus',updateNow);
        window.addEventListener('online',updateNow);
      })
      .catch(function(error){console.warn('[Resultados] PWA indisponível:',error);});
  });
})();
