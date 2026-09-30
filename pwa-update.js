(function(){
  'use strict';
  if(!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;
  const appBase=new URL('./',location.href).href;
  window.addEventListener('load',async function(){
    try{
      const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      await reg.update().catch(function(){});
      // Não remove service workers de outras plataformas. Apenas garante que este
      // registro tenha o escopo da pasta atual da Gestão de Resultados.
      if(!reg.scope.startsWith(appBase)) console.warn('[Resultados] Escopo PWA inesperado:',reg.scope);
    }catch(error){console.warn('[Resultados] PWA indisponível:',error);}
  });
})();
