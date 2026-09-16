(function(){
  'use strict';
  var CENTRAL='https://fildosobral-sys.github.io/';
  function goHome(){try{sessionStorage.setItem('fs_returning_home','1');}catch(e){}location.href=CENTRAL;}
  window.ResultsPortal={goHome:goHome};
  document.addEventListener('DOMContentLoaded',function(){
    var legacy=document.getElementById('fsUniversalHomeButton');if(legacy)legacy.remove();
  });
})();
