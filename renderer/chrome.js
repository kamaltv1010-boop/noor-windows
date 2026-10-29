// The tab strip and the toolbar. The main process sends the state; every
// button asks it to act.
(() => {
  const $ = (id) => document.getElementById(id);
  const BASE_HEIGHT = 86;
  const BAND_HEIGHT = 40;
  let state = null;
  let editing = false;
  let promptAction = null;
  let toastTimer = null;

  const render = () => {
    if (!state) {
      return;
    }
    document.body.classList.toggle("private", state.isPrivate);
    const tabs = $("tabs");
    tabs.textContent = "";
    for (const tab of state.tabs) {
      const element = document.createElement("div");
      element.className = "tab" + (tab.active ? " active" : "") + (tab.loading ? " loading" : "") + (tab.isPrivate ? " private" : "");
      element.title = tab.url || tab.title;
      const icon = document.createElement("span");
      icon.className = "icon";
      if (tab.loading) {
        icon.textContent = "◌";
      } else if (tab.isPrivate) {
        icon.textContent = "🕶";
      } else if (tab.favicon) {
        const img = document.createElement("img");
        img.src = tab.favicon;
        img.alt = "";
        img.addEventListener("error", () => {
          icon.textContent = "○";
        });
        icon.append(img);
      } else {
        icon.textContent = tab.isBlank ? "✦" : "○";
      }
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = tab.title;
      const close = document.createElement("button");
      close.className = "close";
      close.title = "Close Tab (Ctrl+W)";
      close.textContent = "✕";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        noor.invoke("tabs:close", tab.id);
      });
      element.append(icon, title, close);
      element.addEventListener("click", () => noor.invoke("tabs:select", tab.id));
      element.addEventListener("auxclick", (event) => {
        if (event.button === 1) {
          noor.invoke("tabs:close", tab.id);
        }
      });
      element.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        noor.invoke("menu:tab", tab.id);
      });
      tabs.append(element);
      if (tab.active) {
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
    $("back").disabled = !state.canGoBack;
    $("forward").disabled = !state.canGoForward;
    $("reload").textContent = state.loading ? "✕" : "↻";
    $("reload").title = state.loading ? "Stop (Esc)" : "Reload (Ctrl+R)";
    if (!editing) {
      $("address").value = state.url;
    }
    const shields = $("shields");
    shields.classList.toggle("hidden", !state.site);
    shields.classList.toggle("down", !state.shieldsUp);
    shields.title = state.site ? `Shields ${state.shieldsUp ? "up" : "down"} for ${state.site}` : "Shields";
    $("shieldcount").textContent = state.shieldsUp && state.trackersBlocked ? String(state.trackersBlocked) : "";
    $("bookmark").textContent = state.bookmarked ? "★" : "☆";
    $("bookmark").classList.toggle("on", state.bookmarked);
    $("bookmark").disabled = !state.url;
    $("profilename").textContent = state.profile.name;
    const actions = $("actions");
    if (actions) {
      actions.hidden = !state.extensionsHere;
      if (state.extensionsHere) {
        actions.setAttribute("partition", state.partition || "");
        actions.setAttribute("tab", state.activeWebContentsId === null || state.activeWebContentsId === undefined ? "" : String(state.activeWebContentsId));
      }
    }
    const add = $("addextension");
    const store = state.storeExtension;
    add.hidden = !store;
    if (store) {
      add.disabled = store.installed || store.installing;
      $("addextensionlabel").textContent = store.installed ? "Added to Noor" : store.installing ? "Adding…" : "Add to Noor";
    }
  };
  $("addextension").addEventListener("click", () => noor.invoke("extensions:addFromStore"));

  noor.on("state", (next) => {
    state = next;
    render();
  });
  noor.on("toast", (message) => {
    const toast = $("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
  });
  noor.on("focus-address", () => {
    $("address").focus();
    $("address").select();
  });
  noor.on("find", () => openFind());
  noor.on("found", ({ activeMatchOrdinal, matches }) => {
    $("findcount").textContent = matches ? `${activeMatchOrdinal}/${matches}` : "0/0";
  });
  noor.on("prompt", (options) => openPrompt(options));

  const updateHeight = () => {
    const bands = [$("findbar"), $("prompt")].filter((band) => !band.hidden).length;
    noor.invoke("chrome:height", BASE_HEIGHT + bands * BAND_HEIGHT);
  };

  // Address bar
  const address = $("address");
  address.addEventListener("focus", () => {
    editing = true;
    setTimeout(() => address.select(), 0);
  });
  address.addEventListener("input", () => { editing = true; });
  address.addEventListener("blur", () => {
    editing = false;
    render();
  });
  address.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const text = address.value;
      editing = false;
      noor.invoke("nav:go", text);
      address.blur();
    } else if (event.key === "Escape") {
      editing = false;
      render();
      address.blur();
      if (state && state.loading) {
        noor.invoke("nav:stop");
      }
    }
  });

  $("newtab").addEventListener("click", () => noor.invoke("tabs:new", { isPrivate: Boolean(state && state.isPrivate) }));
  $("back").addEventListener("click", () => noor.invoke("nav:back"));
  $("forward").addEventListener("click", () => noor.invoke("nav:forward"));
  $("reload").addEventListener("click", () => noor.invoke(state && state.loading ? "nav:stop" : "nav:reload"));
  $("shields").addEventListener("click", () => noor.invoke("menu:shields"));
  $("bookmark").addEventListener("click", () => noor.invoke("bookmark:toggle"));
  $("profile").addEventListener("click", () => noor.invoke("menu:profile"));
  $("more").addEventListener("click", () => noor.invoke("menu:more"));
  $("tabstrip").addEventListener("dblclick", (event) => {
    if (event.target === $("tabs") || event.target === $("tabstrip")) {
      noor.invoke("tabs:new", { isPrivate: Boolean(state && state.isPrivate) });
    }
  });

  // Find on page
  const openFind = () => {
    $("findbar").hidden = false;
    updateHeight();
    $("findtext").focus();
    $("findtext").select();
  };
  const closeFind = () => {
    $("findbar").hidden = true;
    $("findcount").textContent = "";
    updateHeight();
    noor.invoke("find:stop");
  };
  $("findtext").addEventListener("input", () => noor.invoke("find", $("findtext").value, { forward: true, findNext: false }));
  $("findtext").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      noor.invoke("find", $("findtext").value, { forward: !event.shiftKey, findNext: true });
    } else if (event.key === "Escape") {
      closeFind();
    }
  });
  $("findnext").addEventListener("click", () => noor.invoke("find", $("findtext").value, { forward: true, findNext: true }));
  $("findprev").addEventListener("click", () => noor.invoke("find", $("findtext").value, { forward: false, findNext: true }));
  $("findclose").addEventListener("click", closeFind);

  // A line of text the main process asks for (a new profile's name).
  const openPrompt = ({ title, placeholder, value, action, button }) => {
    promptAction = action;
    $("prompttitle").textContent = title || "";
    $("promptinput").placeholder = placeholder || "";
    $("promptinput").value = value || "";
    $("promptok").textContent = button || "Create";
    $("prompt").hidden = false;
    updateHeight();
    $("promptinput").focus();
    $("promptinput").select();
  };
  const closePrompt = () => {
    $("prompt").hidden = true;
    promptAction = null;
    updateHeight();
  };
  $("prompt").addEventListener("submit", (event) => {
    event.preventDefault();
    const action = promptAction;
    const value = $("promptinput").value;
    closePrompt();
    if (action) {
      noor.invoke(action, value);
    }
  });
  $("promptcancel").addEventListener("click", closePrompt);
  $("promptinput").addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePrompt();
    }
  });

  noor.invoke("state").then((next) => {
    state = next;
    render();
  }).catch(() => {});
})();
