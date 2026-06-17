// Runs in the ISOLATED world at document_start ONLY on Klavity origins.
// Content scripts can't share window.* with the page (separate JS worlds), but
// the DOM is shared — so we publish the extension id as a data-attribute, which
// the Klavity web app reads to confirm the extension is installed.
document.documentElement.dataset.klavityExtId = chrome.runtime.id
