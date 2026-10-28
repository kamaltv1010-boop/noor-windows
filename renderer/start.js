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

  const render = (state) => {
    $("profilename").textContent = state.profile.name;
    $("trackers").textContent = state.stats.trackersBlocked.toLocaleString();
    $("https").textContent = state.stats.httpsUpgrades.toLocaleString();
    $("time").textContent = duration(state.stats.timeSaved);
    const grid = $("favorites");
    grid.textContent = "";
    $("nofavs").hidden = state.bookmarks.length > 0;
    for (const bookmark of state.bookmarks.slice(0, 24)) {
      const fav = document.createElement("button");
      fav.className = "fav";
      fav.title = bookmark.url;
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
  $("profile").addEventListener("click", () => noor.invoke("menu:profile"));
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refresh();
    }
  });
  refresh();
})();
