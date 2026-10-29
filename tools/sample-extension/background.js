chrome.runtime.onInstalled.addListener(() => { chrome.storage.local.set({ installed: true }); });
// The smoke test asks the background what Chrome's would answer: the tab
// the user is on, while the extension's popup has the focus.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message !== "active-tab") return false;
  chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => reply({
    url: tabs[0] ? tabs[0].url : null,
    windows: typeof chrome.windows,
  }), (error) => reply({ error: String(error) }));
  return true;
});
