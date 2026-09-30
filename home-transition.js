(function(){
  'use strict';
  const APP_ID='gestao-resultados';
  const RETURN_KEY='gr_portal_return_v1';
  const MODE_KEY='gr_launch_mode_v1';
  const here=()=>new URL(location.href);
  const baseUrl=()=>new URL('./',location.href);
  const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true || window.navigator.standalone===true;
  const sameAppUrl=(url)=>{
    try{
      const u=new URL(url,location.href),b=baseUrl();
      return u.origin===b.origin && u.pathname.startsWith(b.pathname);
    }catch(_){return false;}
  };
  const safePortalUrl=(url)=>{
    try{
      const u=new URL(url,location.href);
      if(u.origin!==location.origin)return '';
      if(sameAppUrl(u.href))return '';
      return u.href;
    }catch(_){return '';}
  };
  function detect(){
    const u=here(),params=u.searchParams;
    const pwa=params.get('source')==='pwa' || params.get('app')===APP_ID && isStandalone();
    if(pwa || isStandalone()){
      sessionStorage.removeItem(RETURN_KEY);
      sessionStorage.setItem(MODE_KEY,'standalone');
      return {mode:'standalone',returnUrl:''};
    }
    const explicit=safePortalUrl(params.get('return')||params.get('portal_return')||'');
    if(explicit){
      sessionStorage.setItem(RETURN_KEY,explicit);
      sessionStorage.setItem(MODE_KEY,'portal');
      return {mode:'portal',returnUrl:explicit};
    }
    const rawRef=document.referrer||'';
    const ref=safePortalUrl(rawRef);
    if(ref){
      sessionStorage.setItem(RETURN_KEY,ref);
      sessionStorage.setItem(MODE_KEY,'portal');
      return {mode:'portal',returnUrl:ref};
    }
    // Navegação interna entre index/resultados/vendedor: preservar o portal apenas
    // durante esta sessão. Ao abrir o link direto, sem referrer interno, limpa tudo.
    const stored=safePortalUrl(sessionStorage.getItem(RETURN_KEY)||'');
    const storedMode=sessionStorage.getItem(MODE_KEY)||'';
    if(rawRef && sameAppUrl(rawRef) && storedMode==='portal' && stored){
      return {mode:'portal',returnUrl:stored};
    }
    // Link direto: nunca herdar contexto antigo de outra plataforma.
    sessionStorage.removeItem(RETURN_KEY);
    sessionStorage.setItem(MODE_KEY,'direct');
    return {mode:'direct',returnUrl:''};
  }
  const ctx=detect();
  function goHome(){
    const target=safePortalUrl(sessionStorage.getItem(RETURN_KEY)||'');
    if(ctx.mode==='portal' && target){ location.href=target; return; }
    location.href='./index.html?app='+encodeURIComponent(APP_ID)+'&source=internal';
  }
  function isPortal(){return ctx.mode==='portal' && !!safePortalUrl(sessionStorage.getItem(RETURN_KEY)||'');}
  window.ResultsPortal={goHome,isPortal,mode:ctx.mode,returnUrl:ctx.returnUrl};
  window.ResultsAppContext={id:APP_ID,mode:ctx.mode,isStandalone:isStandalone(),isPortal:isPortal()};
  document.addEventListener('DOMContentLoaded',function(){
    const legacy=document.getElementById('fsUniversalHomeButton');if(legacy)legacy.remove();
    document.documentElement.dataset.resultsLaunchMode=ctx.mode;
  });
})();
