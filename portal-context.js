(function(){
  'use strict';
  function text(key){return String(localStorage.getItem(key)||'').trim();}
  function logout(){
    if(!confirm('Sair deste acesso neste aparelho?'))return;
    ['fs_filial','fs_nome','fs_cargo','fs_whatsapp','fs_genero','fs_access_token','fs_pode_compartilhar','fsAuthGlobal','fs_access_persisted','fs_access_verified_at','fs_access_verified_fingerprint'].forEach(function(key){localStorage.removeItem(key);});
    location.replace('./index.html');
  }
  function init(){
    var topbar=document.querySelector('.topbar');if(!topbar)return;
    var name=text('fs_nome')||'USUÁRIO',role=text('fs_cargo').replace(/_/g,' ')||'ACESSO',branch=text('fs_filial');
    var box=document.createElement('button');box.type='button';box.className='portal-user';box.title='Sair deste acesso';box.setAttribute('aria-label','Usuário '+name+'. Toque para sair.');
    box.innerHTML='<span class="portal-avatar">'+name.charAt(0)+'</span><span class="portal-user-copy"><strong>'+name.replace(/[&<>]/g,'')+'</strong><small>'+[role,branch].filter(Boolean).join(' • ')+'</small></span>';
    box.addEventListener('click',function(){if(typeof window.ResultsProfileOpen==='function')window.ResultsProfileOpen();else logout();});
    window.ResultsPortalLogout=logout;
    var actions=topbar.querySelector('.top-actions');topbar.insertBefore(box,actions||null);
    var style=document.createElement('style');style.textContent='.portal-user{display:flex;align-items:center;gap:9px;max-width:300px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;border-radius:14px;padding:7px 10px;text-align:left}.portal-avatar{width:31px;height:31px;flex:0 0 31px;border-radius:10px;background:rgba(255,255,255,.2);display:grid;place-items:center;font-weight:950}.portal-user-copy{min-width:0}.portal-user-copy strong,.portal-user-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.portal-user-copy strong{font-size:11px}.portal-user-copy small{font-size:9px;opacity:.78;margin-top:2px}@media(max-width:760px){.portal-user{max-width:44px;width:44px;height:40px;padding:4px;justify-content:center}.portal-avatar{width:30px;height:30px;flex-basis:30px}.portal-user-copy{display:none}}';document.head.appendChild(style);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
