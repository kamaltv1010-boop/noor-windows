(() => {
  const $ = (id) => document.getElementById(id);
  const KIND_TITLES = {
    canvas: ["Canvas", "Drawings get noise a site can't tell from the real thing."],
    webGL: ["WebGL", "3D drawings get the same noise."],
    audio: ["Audio", "Sound processing gets noise."],
    clientRects: ["ClientRects", "Measured sizes of elements shift slightly."],
    screen: ["Screen Size", "Sites see another common PC screen."],
    hardware: ["Processor & Memory", "Sites see another common core count."],
  };
  let settings = null;

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

    const profiles = $("profiles");
    profiles.textContent = "";
    for (const profile of settings.profiles) {
      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.gap = "6px";
      if (profile.id === settings.profile.id) {
        const mark = document.createElement("span");
        mark.className = "value";
        mark.textContent = "In use";
        controls.append(mark);
      } else {
        controls.append(button("Switch", "secondary", () => noor.invoke("profiles:switch", profile.id).then(apply)));
      }
      if (!profile.isDefault) {
        controls.append(button("Delete", "danger", () => noor.invoke("profiles:delete", profile.id).then(apply)));
      }
      profiles.append(row((profile.id === settings.profile.id ? "✓ " : "") + profile.name, profile.isDefault ? "The first profile; it can't be deleted." : "", controls));
    }
    $("deleteallrow").hidden = settings.profiles.length < 2;
    $("newprofilename").placeholder = `Profile ${settings.profiles.length + 1}`;

    const protections = $("protections");
    protections.textContent = "";
    for (const [kind, [title, hint]] of Object.entries(KIND_TITLES)) {
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
    values.append(row("Screen size", "", value(`${settings.values.screen.width} × ${settings.values.screen.height}`)));
    values.append(row("Processor & memory", "", value(`${settings.values.hardware.cores} cores · ${settings.values.hardware.memory} GB`)));
    values.append(row("User agent", "", value(settings.values.userAgent)));
    values.append(row("Brands", "", value(settings.values.brands.map((b) => `${b.brand} ${b.version}`).join(" · "))));

    const sites = $("downsites");
    sites.textContent = "";
    sites.hidden = settings.shieldsDownSites.length === 0;
    $("downsitesfooter").hidden = settings.shieldsDownSites.length > 0;
    for (const site of settings.shieldsDownSites) {
      sites.append(row(site, "Shields down", button("Turn On", "secondary", () => noor.invoke("shields:allow", site).then(apply))));
    }

    $("version").textContent = settings.version;
    $("chromium").textContent = `${settings.chromium} (Electron ${settings.electron})`;
  };

  for (const box of document.querySelectorAll("input[data-setting]")) {
    box.addEventListener("change", () => noor.invoke("settings:set", box.dataset.setting, box.checked).then(apply));
  }
  $("searchengine").addEventListener("change", () => noor.invoke("settings:set", "searchEngine", $("searchengine").value).then(apply));
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
  $("changeall").addEventListener("click", () => noor.invoke("fingerprint:new", null).then(apply));
  $("newsession").addEventListener("click", () => noor.invoke("session:new"));
  $("resetstats").addEventListener("click", () => noor.invoke("stats:reset"));

  const refresh = () => noor.invoke("settings:get").then(apply).catch(() => {});
  window.addEventListener("focus", refresh);
  refresh();
})();
