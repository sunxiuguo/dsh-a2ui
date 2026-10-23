// jsdom does not implement constructable stylesheets. This shim is layout-free:
// component/state tests are NOT real-browser styling or host acceptance tests.
if(!CSSStyleSheet.prototype.replaceSync)CSSStyleSheet.prototype.replaceSync=function(){};
