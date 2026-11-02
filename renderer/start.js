(() => {
  const $ = (id) => document.getElementById(id);
  const isPrivate = new URLSearchParams(location.search).get("private") === "1";
  document.body.classList.toggle("private", isPrivate);
  $("title").textContent = isPrivate ? "Private Browsing" : "Noor";
  $("statscard").hidden = isPrivate;
  $("privatecard").hidden = !isPrivate;
  $("profile").hidden = isPrivate;

  const duration = (ms) => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) {
      return `${seconds} s`;
    }
    const minutes = Math.round(seconds / 60);
    return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;
  };

  const letter = (url) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return (host[0] || "?").toUpperCase();
    } catch (error) {
      return "?";
    }
  };

  // A pin's drawing (Lucide's "pin", ISC), as in the ⋯ menu.
  const PIN = '<svg class="pinicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';

  /// The pinned links, a row above the favorites: one opens as an address
  /// typed in the box above does (nav:go), the site is sent the same.
  const renderPins = (pins) => {
    const row = $("pins");
    row.textContent = "";
    $("pinnedrow").hidden = pins.length === 0;
    for (const pinned of pins) {
      const pin = document.createElement("div");
      pin.className = "pin";
      pin.title = pinned.url;
      pin.dataset.url = pinned.url;
      pin.tabIndex = 0;
      pin.setAttribute("role", "button");
      const icon = document.createElement("span");
      icon.innerHTML = PIN;
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = pinned.title || pinned.url;
      const remove = document.createElement("button");
      remove.className = "remove";
      remove.title = "Unpin";
      remove.textContent = "✕";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        noor.invoke("pins:remove", pinned.url).then(refresh);
      });
      pin.append(icon.firstChild, name, remove);
      pin.addEventListener("click", () => noor.invoke("nav:go", pinned.url));
      pin.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          noor.invoke("nav:go", pinned.url);
        }
      });
      row.append(pin);
    }
  };

  const render = (state) => {
    $("profilename").textContent = state.profile.name;
    $("trackers").textContent = state.stats.trackersBlocked.toLocaleString();
    $("https").textContent = state.stats.httpsUpgrades.toLocaleString();
    $("time").textContent = duration(state.stats.timeSaved);
    renderPins(state.pins || []);
    const grid = $("favorites");
    grid.textContent = "";
    $("nofavs").hidden = state.bookmarks.length > 0;
    for (const bookmark of state.bookmarks.slice(0, 24)) {
      const fav = document.createElement("div");
      fav.className = "fav";
      fav.title = bookmark.url;
      fav.tabIndex = 0;
      fav.setAttribute("role", "button");
      const icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = letter(bookmark.url);
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = bookmark.title || bookmark.url;
      const remove = document.createElement("button");
      remove.className = "remove";
      remove.title = "Remove Bookmark";
      remove.textContent = "✕";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        noor.invoke("bookmarks:remove", bookmark.url).then(refresh);
      });
      fav.append(icon, name, remove);
      fav.addEventListener("click", () => noor.invoke("nav:go", bookmark.url));
      fav.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          noor.invoke("nav:go", bookmark.url);
        }
      });
      grid.append(fav);
    }
  };

  const refresh = () => noor.invoke("start:state").then(render).catch(() => {});

  $("search").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("q").value.trim();
    if (text) {
      noor.invoke("nav:go", text);
    }
  });
  $("profile").addEventListener("click", () => {
    const r = $("profile").getBoundingClientRect();
    noor.invoke("menu:profile", { x: r.left, y: r.top, width: r.width, height: r.height }, "center");
  });
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refresh();
    }
  });
  refresh();
})();
