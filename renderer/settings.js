(() => {
  const $ = (id) => document.getElementById(id);
  const KIND_TITLES = {
    canvas: ["Canvas", "Drawings get noise a site can't tell from the real thing."],
    webGL: ["WebGL", "3D drawings get the same noise."],
    audio: ["Audio", "Sound processing gets noise. Off at first: on a PC this value is nearly the same for everyone with the same Chrome, so noise would stand out."],
    clientRects: ["ClientRects", "Measured sizes of elements shift slightly. Off at first: on a PC these sizes are the same for everyone with the same Windows and fonts, so a shift would stand out."],
    screen: ["Screen Size", "Sites see another common PC screen."],
    hardware: ["Processor & Memory", "Sites see another common core count."],
    device: ["iPhone", "The iPhone this profile is to every site: its screen, touch, Safari and iOS version."],
  };
  // Noor iPhone: the noise is on at first, as in the iPhone app.
  const IPHONE_HINTS = {
    audio: "Sound processing gets noise, so a site can't follow this profile to another.",
    clientRects: "Measured sizes of elements shift slightly, so a site can't follow this profile to another.",
  };
  let settings = null;
  let warmup = null;
  // The cookie settings as last saved, to tell what isn't saved yet.
  let savedForm = null;

  // Collecting cookies (see main/warmup.js): its settings, what is under
  // way, or how many cookies the profile in use has.
  const form = () => ({
    mode: $("warmupmode").value,
    count: Number($("warmupcount").value),
    sites: $("warmupsites").value,
    auto: $("warmupauto").checked,
  });
  const formKey = (f) => JSON.stringify([f.mode, String(f.count), String(f.sites).trim(), Boolean(f.auto)]);
  const written = () => $("warmupsites").value.split(/[\s,;]+/).filter(Boolean).length;
  // An address as a person writes it: no "https://", no last "/".
  const plain = (url) => url.replace(/^https:\/\//, "").replace(/\/$/, "");
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  const showMode = () => {
    const mine = $("warmupmode").value === "mine";
    $("warmupcountrow").hidden = mine;
    $("warmupsitesrow").hidden = !mine;
    $("warmupmodehint").textContent = mine
      ? `The sites you write below${written() ? ` (${written()})` : ""}.`
      : "A new random mix each time: the world's, and those of the country of your time zone.";
  };

  const showSaved = () => {
    const unsaved = savedForm !== null && formKey(form()) !== savedForm;
    const saved = warmup && warmup.settings;
    let text = "";
    if (unsaved) {
      text = "Changes not saved yet.";
    } else if (saved) {
      text = (saved.mode === "mine" ? `Saved: your ${plural(saved.sites.length, "site")}` : `Saved: ${plural(saved.count, "popular site")}`) + (saved.auto ? ", and in every new profile." : ".");
    }
    $("warmupsaved").textContent = text;
    $("warmupsave").disabled = !unsaved;
  };

  // The form as the settings were saved (on opening, and once saved).
  const fillForm = (saved) => {
    $("warmupmode").value = saved.mode;
    $("warmupcount").value = String(saved.count);
    $("warmupsites").value = saved.sites.map(plain).join("\n");
    $("warmupauto").checked = saved.auto;
    savedForm = formKey(form());
    showMode();
  };

  // A few names of a long list, and how many more.
  const some = (list, name) => (list.length > 6 ? `${list.slice(0, 5).map(name).join(", ")} and ${list.length - 5} more` : list.map(name).join(", "));

  // How many profiles collect at once: as many as this PC can take (0), or
  // the number chosen. Saved as soon as it is chosen.
  const PARALLEL = [0, 1, 2, 3, 5, 10, 15, 20, 30, 50];
  const showParallel = (parallel, overview) => {
    const select = $("warmupparallel");
    const machine = (overview && overview.machine) || 0;
    const values = PARALLEL.includes(parallel) ? PARALLEL : PARALLEL.concat(parallel).sort((a, b) => a - b);
    const labels = values.map((value) => (value === 0 ? `All (up to ${machine})` : value === 1 ? "1 (one by one)" : String(value)));
    if (select.dataset.labels !== labels.join("|")) {
      select.textContent = "";
      values.forEach((value, i) => {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = labels[i];
        select.append(option);
      });
      select.dataset.labels = labels.join("|");
    }
    select.value = String(parallel);
    $("warmupparallelhint").textContent = `How many profiles collect at the same time; the others wait their turn.${machine ? ` This PC takes ${machine} well; more may slow it.` : ""}`;
  };

  // The profiles collecting, and those waiting their turn.
  const showOverview = (overview) => {
    const running = (overview && overview.running) || [];
    const waiting = (overview && overview.waiting) || [];
    const atOnce = (overview && overview.atOnce) || 0;
    const busy = running.length + waiting.length > 0;
    const all = $("warmupall");
    all.textContent = busy ? "Stop All" : "Collect in All";
    all.className = "button small " + (busy ? "danger" : "secondary");
    $("warmupallhint").textContent = busy
      ? [
        running.length ? `Collecting in ${plural(running.length, "profile")} at once: ${some(running, (r) => `${r.name} (${Math.min(r.done + 1, r.total)} of ${r.total})`)}.` : "",
        waiting.length ? `Waiting their turn (${atOnce} at a time): ${some(waiting, (w) => w.name)}.` : "",
      ].join(" ").trim()
      : `Every profile collects its cookies at the same time${atOnce ? ` (${atOnce} at most, see “At once”)` : ""}, each in the background with its own fingerprints, while you use any profile.`;
  };

  const showWarmup = (next) => {
    if (!next) {
      return;
    }
    if (next.overview) {
      showOverview(next.overview);
    }
    if (next.settings) {
      showParallel(next.settings.parallel || 0, next.overview);
    }
    // Another profile's collection: only the overview changes here.
    if (settings && settings.profile && next.profileId && next.profileId !== settings.profile.id) {
      return;
    }
    warmup = next;
    if (savedForm === null && warmup.settings) {
      fillForm(warmup.settings);
    }
    const busy = warmup.running || warmup.waiting;
    const start = $("warmupstart");
    start.textContent = busy ? "Stop" : "Collect";
    start.className = "button small" + (busy ? " danger" : "");
    for (const id of ["warmupmode", "warmupcount", "warmupsites", "warmupauto"]) {
      $(id).disabled = busy;
    }
    const where = warmup.mine ? " of your sites" : "";
    const region = warmup.region ? ` Sites of the world and of ${warmup.region}.` : "";
    let text;
    if (warmup.waiting) {
      text = `Waiting its turn (${warmup.position} in line): ${warmup.overview ? warmup.overview.atOnce : "some"} profiles collect at a time (see “At once”).`;
    } else if (warmup.running) {
      text = `Visiting ${Math.min(warmup.done + 1, warmup.total)} of ${warmup.total}${where}${warmup.current ? `: ${warmup.current}` : ""}. ${plural(warmup.cookies, "cookie")} (+${warmup.added}).${region}`;
    } else if (warmup.finished) {
      const opened = warmup.done - warmup.failed;
      text = `${warmup.stopped ? "Stopped" : "Done"}: ${opened} of ${plural(warmup.total, "site")} visited${warmup.failed ? ` (${warmup.failed} didn't open)` : ""}. This profile has ${plural(warmup.cookies, "cookie")} from ${plural(warmup.domains, "site")} now (+${warmup.added}).`;
    } else {
      text = `This profile has ${plural(warmup.cookies, "cookie")} from ${plural(warmup.domains, "site")}.`;
    }
    if (warmup.clearOnQuit) {
      text += " \"Clear everything on quit\" is on: they go when Noor closes.";
    }
    $("warmupstatus").textContent = text.trim();
    showSaved();
  };

  const row = (label, hint, control) => {
    const element = document.createElement("div");
    element.className = "row";
    const text = document.createElement("div");
    text.className = "label";
    text.textContent = label;
    if (hint) {
      const small = document.createElement("small");
      small.textContent = hint;
      text.append(small);
    }
    element.append(text, control);
    return element;
  };

  const button = (label, className, onClick) => {
    const element = document.createElement("button");
    element.className = "button small " + className;
    element.textContent = label;
    element.addEventListener("click", onClick);
    return element;
  };

  const apply = (next) => {
    settings = next;
    for (const box of document.querySelectorAll("input[data-setting]")) {
      box.checked = Boolean(settings[box.dataset.setting]);
    }
    const engine = $("searchengine");
    engine.textContent = "";
    for (const { id, name } of settings.searchEngines) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = name;
      option.selected = id === settings.searchEngine;
      engine.append(option);
    }

    // Each profile opens in a window of its own; this window's is marked.
    const profiles = $("profiles");
    profiles.textContent = "";
    const open = new Set(settings.openProfiles || [settings.profile.id]);
    for (const profile of settings.profiles) {
      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.gap = "6px";
      const here = profile.id === settings.profile.id;
      if (here) {
        const mark = document.createElement("span");
        mark.className = "value";
        mark.style.whiteSpace = "nowrap";
        mark.textContent = "This window";
        controls.append(mark);
      } else {
        const opening = button(open.has(profile.id) ? "Show" : "Open", "secondary", () => noor.invoke("profiles:open", profile.id).then(apply));
        opening.title = open.has(profile.id) ? "Bring its window to the front" : "Open it in a window of its own";
        controls.append(opening);
      }
      if (!profile.isDefault) {
        controls.append(button("Delete", "danger", () => noor.invoke("profiles:delete", profile.id).then(apply)));
      }
      const hints = [];
      if (profile.isDefault) {
        hints.push("The first profile; it can't be deleted.");
      }
      if (!here && open.has(profile.id)) {
        hints.push("Open in another window.");
      }
      profiles.append(row((here ? "✓ " : "") + profile.name, hints.join(" "), controls));
    }
    $("deleteallrow").hidden = settings.profiles.length < 2;
    $("newprofilename").placeholder = `Profile ${settings.profiles.length + 1}`;

    const isIPhone = settings.device === "iphone";
    // Noor iPhone shows an iPhone's fonts (scripts/parts/iphone.js).
    $("fontscard").hidden = isIPhone;
    const protections = $("protections");
    protections.textContent = "";
    for (const kind of settings.kinds || Object.keys(KIND_TITLES)) {
      const [title, plainHint] = KIND_TITLES[kind];
      const hint = (isIPhone && IPHONE_HINTS[kind]) || plainHint;
      if (kind === "device") {
        // The iPhone can't be off: only changed.
        const renew = button("New iPhone", "secondary", () => noor.invoke("fingerprint:new", [kind]).then(apply));
        protections.append(row(`${title}: ${settings.values.iphone.name}`, hint, renew));
        continue;
      }
      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.alignItems = "center";
      controls.style.gap = "10px";
      const renew = button("New", "secondary", () => noor.invoke("fingerprint:new", [kind]).then(apply));
      renew.title = `New ${title} fingerprint`;
      renew.disabled = !settings.protections[kind];
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = Boolean(settings.protections[kind]);
      box.addEventListener("change", () => noor.invoke("settings:set", "protection." + kind, box.checked).then(apply));
      controls.append(renew, box);
      protections.append(row(title, hint, controls));
    }

    const values = $("values");
    values.textContent = "";
    const value = (text) => {
      const element = document.createElement("div");
      element.className = "value";
      element.textContent = text;
      return element;
    };
    if (isIPhone) {
      const iphone = settings.values.iphone;
      values.append(row("iPhone", "", value(`${iphone.name} · iOS ${iphone.iOS}`)));
      values.append(row("Screen size", "", value(`${iphone.width} × ${iphone.height} · ×${iphone.scale}`)));
      values.append(row("User agent", "", value(settings.values.userAgent)));
      values.append(row("Language", "", value(settings.values.language)));
      $("fingerprintfooter").textContent = "Every profile is one real iPhone to the sites it opens, the same ones as in the iPhone app: Safari's user agent and requests, the iPhone's screen, pixel density and touch, its graphics card, voices and fonts, and what Safari on its iOS version has and lacks, sign-in sites included. Canvas, WebGL and audio values and ClientRects get noise of their own on each site.";
      $("appname").textContent = "Noor iPhone for Windows";
    } else {
      const fonts = settings.fonts;
      $("fontsfound").textContent = !fonts
        ? "Looking at this PC's fonts…"
        : fonts.hidden.length
          ? `${fonts.hidden.length} font${fonts.hidden.length === 1 ? "" : "s"} of other programs on this PC: ${fonts.hidden.slice(0, 12).join(", ")}${fonts.hidden.length > 12 ? "…" : ""}`
          : "This PC has Windows' own fonts only: nothing to hide.";
      values.append(row("Screen size", "", value(`${settings.values.screen.width} × ${settings.values.screen.height}`)));
      values.append(row("Processor & memory", "", value(`${settings.values.hardware.cores} cores · ${settings.values.hardware.memory} GB`)));
      values.append(row("User agent", "", value(settings.values.userAgent)));
      values.append(row("Brands", "", value(settings.values.brands.map((b) => `${b.brand} ${b.version}`).join(" · "))));
    }

    const extensions = $("extensionlist");
    extensions.textContent = "";
    for (const extension of settings.extensions || []) {
      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.alignItems = "center";
      controls.style.gap = "8px";
      if (extension.optionsURL) {
        controls.append(button("Options", "secondary", () => noor.invoke("extensions:options", extension.optionsURL).then(apply)));
      }
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = Boolean(extension.enabled);
      box.title = extension.enabled ? "On" : "Off";
      box.addEventListener("change", () => noor.invoke("extensions:enable", extension.id, box.checked).then(apply));
      controls.append(box, button("Remove", "danger", () => noor.invoke("extensions:remove", extension.id).then(apply)));
      const element = row(extension.name, [extension.version, extension.description].filter(Boolean).join(" · ").slice(0, 140), controls);
      if (extension.icon) {
        const icon = document.createElement("img");
        icon.src = extension.icon;
        icon.width = 24;
        icon.height = 24;
        icon.style.borderRadius = "6px";
        icon.style.marginRight = "10px";
        icon.style.flex = "none";
        icon.alt = "";
        element.prepend(icon);
      }
      extensions.append(element);
    }
    if (!(settings.extensions || []).length) {
      extensions.append(row("No extensions yet", "Add one from the Chrome Web Store, or from a file or folder.", document.createElement("span")));
    }
    if (settings.clearOnQuit) {
      extensions.append(row("Extensions are off", "While \"Clear everything on quit\" is on, tabs keep nothing on disk, and Chromium can't run extensions there.", document.createElement("span")));
    }

    const sites = $("downsites");
    sites.textContent = "";
    sites.hidden = settings.shieldsDownSites.length === 0;
    $("downsitesfooter").hidden = settings.shieldsDownSites.length > 0;
    for (const site of settings.shieldsDownSites) {
      sites.append(row(site, "Shields down", button("Turn On", "secondary", () => noor.invoke("shields:allow", site).then(apply))));
    }

    $("timezonehint").textContent = settings.timezoneFromIP
      ? (settings.timezone
        ? `Pages see ${settings.timezone}, the time zone where your connection is (a VPN's, when one is on), as a visitor from there would.`
        : "Pages see the time zone where your connection is (a VPN's, when one is on). It couldn't be found yet; pages see this PC's for now.")
      : "Pages see this PC's time zone. On, they see the one where your connection is (a VPN's, when one is on).";
    // What was found: the address sites see, its country and its zone.
    const found = settings.timezoneInfo || {};
    let country = found.country || "";
    try {
      if (country) country = new Intl.DisplayNames(["en"], { type: "region" }).of(country) || country;
    } catch (error) {
      // The code as it is.
    }
    const when = found.checkedAt ? new Date(found.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    $("timezonefound").textContent = found.ip
      ? `Your IP address: ${found.ip}${country ? ` (${country})` : ""} · its time zone: ${found.found || "not found yet"}${when ? ` · checked at ${when}` : ""}. A VPN turned on or off is seen within half a minute.`
      : "Your IP address hasn't been read yet.";
    $("timezonecheck").hidden = !settings.timezoneFromIP;
    $("version").textContent = settings.version;
    $("chromium").textContent = `${settings.chromium} (Electron ${settings.electron})`;
  };

  $("timezonecheck").addEventListener("click", () => {
    const check = $("timezonecheck");
    check.disabled = true;
    check.textContent = "Checking…";
    noor.invoke("timezone:check").then(apply).finally(() => {
      check.disabled = false;
      check.textContent = "Check Now";
    });
  });

  for (const box of document.querySelectorAll("input[data-setting]")) {
    box.addEventListener("change", () => noor.invoke("settings:set", box.dataset.setting, box.checked).then(apply));
  }
  // Opened from the ⋯ menu's "Extensions": that part, once it is filled.
  const scrollToHash = () => {
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target) {
      target.scrollIntoView();
    }
  };
  $("searchengine").addEventListener("change", () => noor.invoke("settings:set", "searchEngine", $("searchengine").value).then(apply));
  $("extstore").addEventListener("click", () => noor.invoke("extensions:store").then(apply));
  $("extfile").addEventListener("click", () => noor.invoke("extensions:install", "file").then(apply));
  $("extfolder").addEventListener("click", () => noor.invoke("extensions:install", "folder").then(apply));
  $("newprofile").addEventListener("click", () => {
    const name = $("newprofilename").value.trim() || $("newprofilename").placeholder;
    $("newprofilename").value = "";
    noor.invoke("profiles:create", name).then(apply);
  });
  $("newprofilename").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      $("newprofile").click();
    }
  });
  $("deleteall").addEventListener("click", () => noor.invoke("profiles:deleteAll").then(apply));
  $("manycreate").addEventListener("click", () => {
    const count = Math.floor(Number($("manycount").value));
    if (!(count >= 1 && count <= 100)) {
      $("manycount").focus();
      return;
    }
    noor.invoke("profiles:createMany", count, $("manyname").value.trim()).then(apply);
  });
  $("changeall").addEventListener("click", () => noor.invoke("fingerprint:new", null).then(apply));
  $("newsession").addEventListener("click", () => noor.invoke("session:new"));
  $("warmupall").addEventListener("click", () => {
    const busy = $("warmupall").textContent === "Stop All";
    noor.invoke(busy ? "warmup:stopAll" : "warmup:startAll").then(showWarmup).catch(() => {});
  });
  $("warmupparallel").addEventListener("change", () => {
    noor.invoke("warmup:save", { parallel: Number($("warmupparallel").value) }).then(showWarmup).catch(() => {});
  });
  $("warmupstart").addEventListener("click", () => {
    if (warmup && (warmup.running || warmup.waiting)) {
      noor.invoke("warmup:stop").then(showWarmup).catch(() => {});
      return;
    }
    if ($("warmupmode").value === "mine" && !written()) {
      $("warmupsaved").textContent = "Write your sites first, one per line.";
      $("warmupsites").focus();
      return;
    }
    // What the form says is saved, then visited.
    noor.invoke("warmup:start", form()).then((next) => {
      if (next && next.settings) {
        fillForm(next.settings);
      }
      showWarmup(next);
    }).catch(() => {});
  });
  $("warmupsave").addEventListener("click", () => {
    noor.invoke("warmup:save", form()).then((next) => {
      fillForm(next.settings);
      showWarmup(next);
    }).catch(() => {});
  });
  for (const id of ["warmupmode", "warmupcount", "warmupsites", "warmupauto"]) {
    $(id).addEventListener("input", () => { showMode(); showSaved(); });
    $(id).addEventListener("change", () => { showMode(); showSaved(); });
  }
  $("cookiessee").addEventListener("click", () => noor.invoke("cookies:open"));
  noor.on("warmup", showWarmup);
  $("resetstats").addEventListener("click", () => noor.invoke("stats:reset"));

  const refresh = () => Promise.all([
    noor.invoke("settings:get").then(apply).catch(() => {}),
    noor.invoke("warmup:get").then(showWarmup).catch(() => {}),
  ]);
  window.addEventListener("focus", refresh);
  refresh().then(scrollToHash);

  // As Chrome's settings: an icon by each section and in the sidebar, the
  // section in view marked there, and a search through every setting.
  const icons = window.noorIcons;
  for (const target of document.querySelectorAll("h3[data-icon], .sidebar a[data-icon], .searchicon[data-icon]")) {
    target.insertAdjacentHTML("afterbegin", icons.svg(target.dataset.icon, 20));
  }
  const content = $("content");
  const headings = [...content.querySelectorAll("h3[id]")];
  const links = [...document.querySelectorAll(".sidebar a")];
  const markActive = () => {
    const shown = headings.filter((heading) => !heading.classList.contains("filtered"));
    let current = shown[0] || null;
    for (const heading of shown) {
      if (heading.getBoundingClientRect().top <= 140) {
        current = heading;
      }
    }
    // At the very bottom, the last section shown.
    if (shown.length && innerHeight + scrollY >= document.documentElement.scrollHeight - 4 && document.documentElement.scrollHeight > innerHeight + 8) {
      current = shown[shown.length - 1];
    }
    for (const link of links) {
      link.classList.toggle("active", Boolean(current) && link.getAttribute("href") === "#" + current.id);
    }
  };
  addEventListener("scroll", markActive, { passive: true });
  addEventListener("resize", markActive);
  for (const link of links) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.getElementById(link.getAttribute("href").slice(1));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", link.getAttribute("href"));
      }
    });
  }
  markActive();

  // The search: the rows whose words match, in their cards and sections;
  // a section whose title matches, whole.
  const search = $("settingsearch");
  const filter = () => {
    const query = search.value.trim().toLowerCase();
    const sections = [];
    for (const node of content.children) {
      if (node.tagName === "H3") {
        sections.push({ heading: node, nodes: [] });
      } else if (sections.length && node.id !== "nomatch") {
        sections[sections.length - 1].nodes.push(node);
      }
    }
    let anyShown = false;
    for (const { heading, nodes } of sections) {
      const titled = Boolean(query) && heading.textContent.toLowerCase().includes(query);
      let shown = 0;
      for (const node of nodes) {
        const rows = node.classList.contains("card") ? [...node.querySelectorAll(".row")] : [];
        if (rows.length) {
          let matching = 0;
          for (const row of rows) {
            const match = !query || titled || row.textContent.toLowerCase().includes(query);
            row.classList.toggle("filtered", !match);
            // The first row shown has no line above it.
            row.classList.toggle("firstshown", match && !row.hidden && matching === 0);
            if (match && !row.hidden) {
              matching += 1;
            }
          }
          node.classList.toggle("filtered", matching === 0 && Boolean(query));
          shown += matching;
        } else {
          const match = !query || titled || node.textContent.toLowerCase().includes(query);
          node.classList.toggle("filtered", !match);
          if (match && query && node.textContent.trim()) {
            shown += 1;
          }
        }
      }
      heading.classList.toggle("filtered", Boolean(query) && !titled && shown === 0);
      if (!query || titled || shown > 0) {
        anyShown = true;
      }
    }
    $("nomatch").hidden = anyShown;
    markActive();
  };
  search.addEventListener("input", filter);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && search.value) {
      search.value = "";
      filter();
    }
  });
  // Rows filled in later (the profiles, the extensions) are searched too.
  let filterTimer = null;
  new MutationObserver(() => {
    if (search.value.trim()) {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(filter, 50);
    }
  }).observe(content, { childList: true, subtree: true });
})();
