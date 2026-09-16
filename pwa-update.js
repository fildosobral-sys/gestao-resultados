(function(){
  'use strict';
  if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;
  window.addEventListener('load',function(){navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(function(reg){reg.update().catch(function(){});}).catch(function(error){console.warn('[Resultados] PWA indisponível:',error);});});
})();
