(() => {
  const $ = (id) => document.getElementById(id);
  let showing = "bookmarks";

  const item = (entry, onRemove) => {
    const element = document.createElement("div");
    element.className = "item";
    const text = document.createElement("div");
    text.className = "text";
    const t = document.createElement("div");
    t.className = "t";
    t.textContent = entry.title || entry.url;
    const u = document.createElement("div");
    u.className = "u";
    u.textContent = entry.url;
    text.append(t, u);
    text.addEventListener("click", () => noor.invoke("nav:go", entry.url));
    const remove = document.createElement("button");
    remove.className = "x";
    remove.title = "Remove";
    remove.textContent = "✕";
    remove.addEventListener("click", onRemove);
    element.append(text, remove);
    return element;
  };

  const render = async () => {
    const query = $("q").value.trim().toLowerCase();
    const list = $("list");
    list.textContent = "";
    $("clear").hidden = showing !== "history";
    let entries = [];
    if (showing === "bookmarks") {
      entries = (await noor.invoke("bookmarks:list")).filter((e) => !query || (e.title + " " + e.url).toLowerCase().includes(query));
    } else {
      entries = await noor.invoke("history:list", query);
    }
    $("empty").hidden = entries.length > 0;
    $("empty").textContent = showing === "bookmarks" ? "No bookmarks yet. Add one with ☆ in the toolbar." : "No history.";
    list.hidden = entries.length === 0;
    for (const entry of entries) {
      list.append(item(entry, () => {
        noor.invoke(showing === "bookmarks" ? "bookmarks:remove" : "history:remove", entry.url).then(render);
      }));
    }
  };

  $("showbookmarks").addEventListener("click", () => {
    showing = "bookmarks";
    $("showbookmarks").classList.add("on");
    $("showhistory").classList.remove("on");
    render();
  });
  $("showhistory").addEventListener("click", () => {
    showing = "history";
    $("showhistory").classList.add("on");
    $("showbookmarks").classList.remove("on");
    render();
  });
  $("q").addEventListener("input", render);
  $("clear").addEventListener("click", () => {
    if (confirm("Clear the history of this profile?")) {
      noor.invoke("history:clear").then(render);
    }
  });
  window.addEventListener("focus", render);
  render();
})();
