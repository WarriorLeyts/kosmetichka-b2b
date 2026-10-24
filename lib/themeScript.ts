export const THEME_KEY = "kosmetichka-theme";

/** Runs in <head> before the first paint: applies the saved theme (or the device theme) without a flash.
 *  Admin and picker pages always stay light. */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,p=location.pathname;
if(localStorage.getItem("cookie_consent"))d.dataset.consent="1";
if(/^\\/(admin|picker)(\\/|$)/.test(p)){d.dataset.theme="light";d.dataset.area="staff";return;}
var t=localStorage.getItem("${THEME_KEY}");
if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
d.dataset.theme=t;}catch(e){}})();`;

