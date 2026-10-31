(() => {
  const $ = (id) => document.getElementById(id);
  /// The cookies of the profile picked: { total, sites: [{ site, count, cookies }] }.
  let data = null;
  /// The sites opened to show their cookies.
  const opened = new Set();

  const element = (tag, className, text) => {
    const made = document.createElement(tag);
    if (className) {
      made.className = className;
    }
    if (text !== undefined) {
      made.textContent = text;
    }
    return made;
  };

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const SAME_SITE = { lax: "SameSite=Lax", strict: "SameSite=Strict", no_restriction: "SameSite=None" };
  const expiry = (cookie) => (cookie.session || !cookie.expires ? "When Noor closes" : new Date(cookie.expires).toLocaleDateString());

  const table = (cookies) => {
    const list = element("table");
    const columns = element("colgroup");
    for (const width of ["22%", "34%", "20%", "11%", "13%"]) {
      const column = element("col");
      column.style.width = width;
      columns.append(column);
    }
    list.append(columns);
    const head = element("tr");
    for (const title of ["Name", "Value", "Domain and path", "Expires", ""]) {
      head.append(element("th", "", title));
    }
    list.append(head);
    for (const cookie of cookies) {
      const row = element("tr");
      const name = element("td", "", cookie.name);
      name.title = cookie.name;
      const value = element("td", "value", cookie.value);
      value.title = "Click to copy";
      value.addEventListener("click", () => {
        navigator.clipboard.writeText(cookie.value).then(() => {
          value.classList.add("copied");
          value.textContent = "Copied";
          setTimeout(() => {
            value.classList.remove("copied");
            value.textContent = cookie.value;
          }, 900);
        }).catch(() => {});
      });
      const where = element("td", "", cookie.domain + cookie.path);
      where.title = where.textContent;
      const flags = element("td", "flags");
      for (const flag of [cookie.secure && "Secure", cookie.httpOnly && "HttpOnly", SAME_SITE[cookie.sameSite]]) {
        if (flag) {
          flags.append(element("span", "", flag));
        }
      }
      row.append(name, value, where, element("td", "", expiry(cookie)), flags);
      list.append(row);
    }
    return list;
  };

  const render = () => {
    const sites = $("sites");
    sites.textContent = "";
    if (!data) {
      return;
    }
    const query = $("q").value.trim().toLowerCase();
    // A site that matches shows all its cookies; else those that match.
    const shown = data.sites.map((site) => {
      if (!query || site.site.includes(query)) {
        return site;
      }
      const cookies = site.cookies.filter((cookie) => cookie.name.toLowerCase().includes(query) || cookie.domain.toLowerCase().includes(query));
      return cookies.length ? { ...site, cookies } : null;
    }).filter(Boolean);
    $("summary").textContent = `${plural(data.total, "cookie")} from ${plural(data.sites.length, "site")}${query ? `; ${shown.length} shown` : ""}.`;
    $("empty").hidden = data.total > 0;
    sites.hidden = shown.length === 0;
    for (const site of shown) {
      const box = element("div", "site");
      const head = element("div", "head");
      const open = opened.has(site.site) || Boolean(query);
      const remove = element("button", "button danger small", "Delete");
      remove.title = `Delete the cookies of ${site.site}`;
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        noor.invoke("cookies:remove", $("profile").value, site.site).then(show).catch(() => {});
      });
      head.append(element("span", "arrow", open ? "▾" : "▸"), element("span", "name", site.site), element("span", "count", plural(site.count, "cookie")), remove);
      head.addEventListener("click", () => {
        if (opened.has(site.site)) {
          opened.delete(site.site);
        } else {
          opened.add(site.site);
        }
        render();
      });
      box.append(head);
      if (open) {
        box.append(table(site.cookies));
      }
      sites.append(box);
    }
  };

  const show = (next) => {
    data = next;
    render();
  };
  const load = () => noor.invoke("cookies:list", $("profile").value).then(show).catch(() => {});

  noor.invoke("cookies:profiles").then(({ profiles, current }) => {
    for (const profile of profiles) {
      const option = element("option", "", profile.name);
      option.value = profile.id;
      option.selected = profile.id === current;
      $("profile").append(option);
    }
    load();
  }).catch(() => {});
  $("profile").addEventListener("change", () => {
    opened.clear();
    load();
  });
  $("q").addEventListener("input", render);
  $("export").addEventListener("click", () => noor.invoke("cookies:export", $("profile").value).catch(() => {}));
  // Fresh when shown again, and once cookies have been collected.
  window.addEventListener("focus", load);
  noor.on("warmup", (status) => {
    if (status && !status.running) {
      load();
    }
  });
})();
