document.documentElement.dataset.noorSample = "yes";
chrome.storage.local.set({ seen: location.href }).catch(() => {});
