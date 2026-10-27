/**
 * iPhone/iPad Safari zooms the whole page in when a field with text smaller than 16px gets focus,
 * and leaves it zoomed. `maximum-scale=1` stops that; iOS still lets people pinch-zoom, so it is
 * added only there (on Android it would block pinch zoom). Runs in <head> and again whenever React
 * adds or replaces a viewport tag there.
 */
export const IOS_NO_ZOOM_SCRIPT = `(function(){try{var n=navigator;
if(!(/iP(hone|ad|od)/.test(n.userAgent)||(n.platform==="MacIntel"&&n.maxTouchPoints>1)))return;
function f(){var m=document.querySelectorAll('meta[name="viewport"]');for(var i=0;i<m.length;i++){var c=m[i].getAttribute("content")||"";if(!/maximum-scale/.test(c))m[i].setAttribute("content",c+(c?", ":"")+"maximum-scale=1");}}
f();document.addEventListener("DOMContentLoaded",f);
if(window.MutationObserver&&document.head)new MutationObserver(f).observe(document.head,{childList:true});}catch(e){}})();`;
