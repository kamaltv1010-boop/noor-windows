// The window's menus, drawn as Chrome draws its own (see menu.css and
// Browser.showMenu): the main process sends what a menu holds ("noor:menu":
// its items, where its button is), and is told what was chosen.
(() => {
  const layer = document.getElementById("layer");
  /// The open submenu, and the item it is of.
  let sub = null;
  let subOwner = null;
  let hoverTimer = null;

  const element = (tag, className, text) => {
    const made = document.createElement(tag);
    if (className) {
      made.className = className;
    }
    if (text !== undefined && text !== null) {
      made.textContent = text;
    }
    return made;
  };

  const icon = (name, className = "icon") => {
    const span = element("span", className);
    span.innerHTML = window.noorIcons.svg(name, 20);
    return span;
  };

  /// A profile's initial on its color.
  const avatar = (look) => {
    const span = element("span", "avatar", (look && look.initial) || "?");
    span.style.background = (look && look.color) || "#5b3df5";
    return span;
  };

  const choose = (id) => {
    if (id) {
      noor.invoke("menu:choose", id).catch(() => {});
    }
  };
  const close = () => noor.invoke("menu:close").catch(() => {});

  // MARK: - Rows

  const button = (className) => {
    const made = element("button", "item" + (className ? " " + className : ""));
    made.type = "button";
    made.setAttribute("role", "menuitem");
    return made;
  };

  /// What an item with a submenu does: the submenu shows as the pointer
  /// rests on it, or at once on a click or the right arrow key.
  const withSubmenu = (made, items) => {
    made.setAttribute("aria-haspopup", "menu");
    made.submenu = items;
    made.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => openSub(made), 120);
    });
    made.addEventListener("click", () => openSub(made, true));
  };

  /// Moving onto an item of the main panel closes another's submenu.
  const leavesSubmenu = (made) => {
    made.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimer);
      if (sub && made.closest(".panel") !== sub) {
        hoverTimer = setTimeout(closeSub, 160);
      }
    });
  };

  const row = (item) => {
    switch (item.type) {
      case "separator":
        return element("div", "separator");
      case "caption":
        return element("div", "caption", item.label);
      case "footer":
        return element("div", "footer", item.label);
      case "header": {
        const made = element("div", "header");
        made.append(item.profile ? avatar(item.profile) : icon(item.icon || "info"));
        const texts = element("div", "texts");
        texts.append(element("div", "title", item.title));
        if (item.subtitle) {
          texts.append(element("div", "subtitle", item.subtitle));
        }
        made.append(texts);
        return made;
      }
      case "zoom": {
        const made = element("div", "item zoomrow");
        made.append(icon(item.icon || "zoom"), element("span", "label", item.label));
        const group = element("div", "zoomgroup");
        const round = (name, id, title) => {
          const control = element("button", "round focusable");
          control.type = "button";
          control.title = title;
          control.setAttribute("aria-label", title);
          control.innerHTML = window.noorIcons.svg(name, 18);
          control.disabled = item.enabled === false;
          control.addEventListener("click", () => choose(id));
          return control;
        };
        const ids = item.ids || {};
        group.append(round("minus", ids.minus, "Zoom out"), element("span", "zoomvalue", item.value), round("plus", ids.plus, "Zoom in"), element("span", "vsep"), round("fullscreen", ids.full, "Full screen"));
        made.append(group);
        leavesSubmenu(made);
        return made;
      }
      case "toggle": {
        const made = button("toggle");
        made.setAttribute("role", "menuitemcheckbox");
        made.setAttribute("aria-checked", String(Boolean(item.checked)));
        made.disabled = item.enabled === false;
        made.append(icon(item.icon || "check"), element("span", "label", item.label), element("span", "switch" + (item.checked ? " on" : "")));
        made.addEventListener("click", () => choose(item.id));
        leavesSubmenu(made);
        return made;
      }
      case "profile": {
        const made = button("profilerow");
        made.append(avatar(item.profile), element("span", "label", item.label));
        if (item.pill) {
          made.append(element("span", "pill", item.pill));
        }
        made.append(icon("chevron", "more"));
        withSubmenu(made, item.submenu || []);
        return made;
      }
      case "profileItem": {
        const made = button();
        made.disabled = item.enabled === false;
        made.append(avatar(item.profile), element("span", "label", item.label));
        if (item.note) {
          made.append(element("span", "note", item.note));
        }
        if (item.checked) {
          made.append(icon("check", "tick"));
        }
        made.addEventListener("click", () => choose(item.id));
        leavesSubmenu(made);
        return made;
      }
      default: {
        const made = button(item.danger ? "danger" : "");
        made.disabled = item.enabled === false;
        if (item.icon) {
          made.append(icon(item.icon));
        }
        made.append(element("span", "label", item.label));
        if (item.detail) {
          made.append(element("span", "detail", item.detail));
        }
        if (item.shortcut) {
          made.append(element("span", "shortcut", item.shortcut));
        }
        if (item.submenu) {
          made.append(icon("chevron", "more"));
          withSubmenu(made, item.submenu);
        } else {
          made.addEventListener("click", () => choose(item.id));
          leavesSubmenu(made);
        }
        return made;
      }
    }
  };

  const panelOf = (items, isSub) => {
    const panel = element("div", "panel" + (isSub ? " sub" : " main"));
    panel.setAttribute("role", "menu");
    panel.tabIndex = -1;
    for (const item of items) {
      panel.append(row(item));
    }
    return panel;
  };

  // MARK: - Placing

  /// The main panel under its button: its right edge at the button's
  /// ("end", Chrome's ⋯ menu), its left edge ("start"), or its middle.
  const place = (panel, anchor, align) => {
    const width = panel.offsetWidth;
    const a = anchor || { x: innerWidth - 48, y: 4, width: 40, height: 40 };
    let left = align === "start" ? a.x : align === "center" ? a.x + a.width / 2 - width / 2 : a.x + a.width - width;
    left = Math.max(8, Math.min(left, innerWidth - width - 8));
    const top = Math.max(4, Math.min(a.y + a.height + 4, innerHeight - 120));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.maxHeight = `${Math.max(120, innerHeight - top - 8)}px`;
  };

  /// A submenu beside its item: on the left of its panel (the menus are on
  /// the right of the window), or on the right where there is no room.
  const openSub = (owner, focus = false) => {
    clearTimeout(hoverTimer);
    if (subOwner === owner && sub) {
      if (focus) {
        focusFirst(sub);
      }
      return;
    }
    closeSub();
    sub = panelOf(owner.submenu || [], true);
    sub.classList.add("appear");
    layer.append(sub);
    const parent = owner.closest(".panel").getBoundingClientRect();
    const at = owner.getBoundingClientRect();
    const width = sub.offsetWidth;
    let left = parent.left - width - 2;
    if (left < 8) {
      left = Math.min(innerWidth - width - 8, parent.right + 2);
    }
    const height = Math.min(sub.scrollHeight, innerHeight - 16);
    const top = Math.max(8, Math.min(at.top - 8, innerHeight - height - 8));
    sub.style.left = `${Math.round(Math.max(8, left))}px`;
    sub.style.top = `${Math.round(top)}px`;
    sub.style.maxHeight = `${innerHeight - top - 8}px`;
    sub.addEventListener("mouseenter", () => clearTimeout(hoverTimer));
    subOwner = owner;
    owner.classList.add("open");
    owner.setAttribute("aria-expanded", "true");
    if (focus) {
      focusFirst(sub);
    }
  };

  const closeSub = () => {
    if (sub) {
      sub.remove();
      sub = null;
    }
    if (subOwner) {
      subOwner.classList.remove("open");
      subOwner.setAttribute("aria-expanded", "false");
      subOwner = null;
    }
  };

  const focusable = (panel) => [...panel.querySelectorAll("button:not(:disabled)")];

  const focusFirst = (panel) => {
    const first = focusable(panel)[0];
    if (first) {
      first.focus();
    }
  };

  // MARK: - Showing

  noor.on("menu", (menu) => {
    if (!menu) {
      return;
    }
    document.body.classList.toggle("private", Boolean(menu.private));
    // A menu shown again as it changed (the zoom, a switch) keeps the item
    // it had in focus.
    const focusedIndex = menu.update && document.activeElement ? focusable(layer.querySelector(".panel.main") || layer).indexOf(document.activeElement) : -1;
    closeSub();
    layer.textContent = "";
    const panel = panelOf(menu.items || [], false);
    if (!menu.update) {
      panel.classList.add("appear");
    }
    layer.append(panel);
    place(panel, menu.anchor, menu.align);
    const buttons = focusable(panel);
    if (focusedIndex >= 0 && buttons[focusedIndex]) {
      buttons[focusedIndex].focus();
    } else {
      panel.focus();
    }
  });

  // A click outside the menu closes it, and goes nowhere else (as Chrome's).
  layer.addEventListener("mousedown", (event) => {
    if (event.target === layer) {
      close();
    }
  });
  layer.addEventListener("contextmenu", (event) => event.preventDefault());

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (sub) {
        const owner = subOwner;
        closeSub();
        if (owner) {
          owner.focus();
        }
      } else {
        close();
      }
      return;
    }
    const active = document.activeElement;
    const panel = (active && active.closest && active.closest(".panel")) || layer.querySelector(".panel.main");
    if (!panel) {
      return;
    }
    const buttons = focusable(panel);
    const index = buttons.indexOf(active);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!buttons.length) {
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = index === -1 ? (step === 1 ? 0 : buttons.length - 1) : (index + step + buttons.length) % buttons.length;
      buttons[next].focus();
    } else if (event.key === "ArrowRight" && active && active.submenu) {
      event.preventDefault();
      openSub(active, true);
    } else if (event.key === "ArrowLeft" && panel === sub) {
      event.preventDefault();
      const owner = subOwner;
      closeSub();
      if (owner) {
        owner.focus();
      }
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = event.key === "Home" ? buttons[0] : buttons[buttons.length - 1];
      if (target) {
        target.focus();
      }
    }
  });
})();
