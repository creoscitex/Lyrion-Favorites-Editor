const state = {
  title: "Favorites",
  rootStations: [],
  categories: [],
  selectedCategoryKey: "__root__",
  editingStationIndex: null,
  search: "",
  drag: null,
  checkingVisible: false,
  categorySortAsc: true,
  stationSortAsc: true,
  categorySortMode: null,
  stationSortMode: null
};

const els = {
  categoryList: document.getElementById("categoryList"),
  stationsTitle: document.getElementById("stationsTitle"),
  stationTableBody: document.getElementById("stationTableBody"),
  stationSearch: document.getElementById("stationSearch"),
  sortStationsBtn: document.getElementById("sortStationsBtn"),
  checkVisibleBtn: document.getElementById("checkVisibleBtn"),
  stationForm: document.getElementById("stationForm"),
  formTitle: document.getElementById("formTitle"),
  stationName: document.getElementById("stationName"),
  stationUrl: document.getElementById("stationUrl"),
  stationIcon: document.getElementById("stationIcon"),
  stationType: document.getElementById("stationType"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  addCategoryBtn: document.getElementById("addCategoryBtn"),
  sortCategoriesBtn: document.getElementById("sortCategoriesBtn"),
  newCategoryName: document.getElementById("newCategoryName"),
  saveBtn: document.getElementById("saveBtn"),
  reloadBtn: document.getElementById("reloadBtn"),
  opmlTitle: document.getElementById("opmlTitle"),
  toast: document.getElementById("toast")
};

function showToast(message, timeout = 2300) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), timeout);
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function parseOpml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid XML in favorites.opml");
  }

  const opml = doc.querySelector("opml");
  const body = opml?.querySelector("body");
  if (!opml || !body) {
    throw new Error("No OPML body found");
  }

  const titleNode = opml.querySelector("head > title");
  state.title = titleNode?.textContent?.trim() || "Favorites";
  state.rootStations = [];
  state.categories = [];

  const topOutlines = Array.from(body.children).filter((el) => el.tagName === "outline");
  for (const node of topOutlines) {
    const url = node.getAttribute("URL");
    if (url) {
      state.rootStations.push(stationFromNode(node));
      continue;
    }

    const category = {
      text: node.getAttribute("text") || "Untitled",
      icon: node.getAttribute("icon") || "html/images/favorites.png",
      stations: []
    };

    const stationNodes = Array.from(node.children).filter((el) => el.tagName === "outline");
    for (const s of stationNodes) {
      if (s.getAttribute("URL")) {
        category.stations.push(stationFromNode(s));
      }
    }
    state.categories.push(category);
  }

  state.selectedCategoryKey = "__root__";
  state.editingStationIndex = null;
}

function stationFromNode(node) {
  return {
    text: node.getAttribute("text") || "",
    URL: node.getAttribute("URL") || "",
    icon: node.getAttribute("icon") || "html/images/radio.png",
    type: node.getAttribute("type") || "audio",
    _status: "unknown",
    _statusHint: "Not checked"
  };
}

function normalizeStatus(station) {
  if (!station._status) station._status = "unknown";
  if (!station._statusHint) station._statusHint = "Not checked";
}

function compareByName(a, b, asc = true) {
  const av = (a?.text || "").trim();
  const bv = (b?.text || "").trim();
  const result = av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true });
  return asc ? result : -result;
}

function getSelectedCategoryName() {
  if (state.selectedCategoryKey === "__root__") {
    return "__root__";
  }
  return state.categories[Number(state.selectedCategoryKey)]?.text || "__root__";
}

function restoreSelectedCategoryByName(categoryName) {
  if (!categoryName || categoryName === "__root__") {
    state.selectedCategoryKey = "__root__";
    return;
  }
  const idx = state.categories.findIndex((cat) => cat.text === categoryName);
  state.selectedCategoryKey = idx >= 0 ? String(idx) : "__root__";
}

function applySortModesToData() {
  if (state.categorySortMode) {
    state.categories.sort((a, b) => compareByName(a, b, state.categorySortMode === "asc"));
  }
  if (state.stationSortMode) {
    const list = getSelectedStationList();
    list.sort((a, b) => compareByName(a, b, state.stationSortMode === "asc"));
  }
}

function buildOpml() {
  const lines = [];
  lines.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
  lines.push("<opml version=\"1.0\">");
  lines.push("  <head>");
  lines.push(`    <title>${escapeXml(state.title || "Favorites")}</title>`);
  lines.push("    <expansionState></expansionState>");
  lines.push("  </head>");
  lines.push("  <body>");

  for (const station of state.rootStations) {
    lines.push(`    <outline URL=\"${escapeXml(station.URL)}\" icon=\"${escapeXml(station.icon)}\" text=\"${escapeXml(station.text)}\" type=\"${escapeXml(station.type || "audio")}\" />`);
  }

  for (const category of state.categories) {
    lines.push(`    <outline icon=\"${escapeXml(category.icon || "html/images/favorites.png")}\" text=\"${escapeXml(category.text)}\">`);
    for (const station of category.stations) {
      lines.push(`      <outline URL=\"${escapeXml(station.URL)}\" icon=\"${escapeXml(station.icon)}\" text=\"${escapeXml(station.text)}\" type=\"${escapeXml(station.type || "audio")}\" />`);
    }
    lines.push("    </outline>");
  }

  lines.push("  </body>");
  lines.push("</opml>");
  return lines.join("\n") + "\n";
}

function getSelectedStationList() {
  if (state.selectedCategoryKey === "__root__") {
    return state.rootStations;
  }
  const idx = Number(state.selectedCategoryKey);
  return state.categories[idx]?.stations || [];
}

function getStationListByCategoryKey(categoryKey) {
  if (categoryKey === "__root__") {
    return state.rootStations;
  }
  const idx = Number(categoryKey);
  return state.categories[idx]?.stations || [];
}

function moveStation(sourceKey, sourceIndex, targetKey) {
  const sourceList = getStationListByCategoryKey(sourceKey);
  const targetList = getStationListByCategoryKey(targetKey);
  if (!sourceList || !targetList) return;
  if (sourceIndex < 0 || sourceIndex >= sourceList.length) return;

  const [station] = sourceList.splice(sourceIndex, 1);
  targetList.push(station);
  state.selectedCategoryKey = targetKey;
  state.editingStationIndex = null;
  resetStationForm();
  render();
  showToast(`Moved to ${targetKey === "__root__" ? "Top level" : state.categories[Number(targetKey)]?.text || "category"}.`);
}

function renderCategories() {
  const items = [];

  items.push({ key: "__root__", name: "Top level", root: true });
  state.categories.forEach((cat, index) => {
    items.push({ key: String(index), name: cat.text, root: false });
  });

  els.categoryList.innerHTML = "";

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "category-item" + (state.selectedCategoryKey === item.key ? " active" : "");
    li.dataset.key = item.key;

    const name = document.createElement("div");
    name.className = "category-name";
    name.textContent = item.name;
    name.addEventListener("click", () => {
      state.selectedCategoryKey = item.key;
      state.editingStationIndex = null;
      resetStationForm();
      render();
    });

    li.addEventListener("dragover", (event) => {
      if (!state.drag) return;
      event.preventDefault();
      li.classList.add("drop-target");
    });

    li.addEventListener("dragleave", () => {
      li.classList.remove("drop-target");
    });

    li.addEventListener("drop", (event) => {
      event.preventDefault();
      li.classList.remove("drop-target");
      if (!state.drag) return;
      const { sourceCategoryKey, sourceIndex } = state.drag;
      state.drag = null;
      moveStation(sourceCategoryKey, sourceIndex, item.key);
    });

    const actions = document.createElement("div");
    actions.className = "category-actions";

    if (!item.root) {
      const rename = document.createElement("button");
      rename.className = "small";
      rename.textContent = "rename";
      rename.addEventListener("click", () => {
        const current = state.categories[Number(item.key)];
        const next = prompt("New category name", current.text);
        if (!next) return;
        current.text = next.trim();
        renderCategories();
        renderStations();
      });

      const remove = document.createElement("button");
      remove.className = "small";
      remove.textContent = "del";
      remove.addEventListener("click", () => {
        const idx = Number(item.key);
        const cat = state.categories[idx];
        const msg = cat.stations.length
          ? `Delete category \"${cat.text}\" and ${cat.stations.length} stations?`
          : `Delete category \"${cat.text}\"?`;
        if (!confirm(msg)) return;
        state.categories.splice(idx, 1);
        state.selectedCategoryKey = "__root__";
        state.editingStationIndex = null;
        resetStationForm();
        render();
      });

      actions.append(rename, remove);
    }

    li.append(name, actions);
    els.categoryList.appendChild(li);
  }
}

function renderStations() {
  const list = getSelectedStationList();
  const currentCategoryName = state.selectedCategoryKey === "__root__"
    ? "Top level"
    : state.categories[Number(state.selectedCategoryKey)]?.text || "Stations";

  els.stationsTitle.textContent = `Stations in: ${currentCategoryName}`;
  els.stationTableBody.innerHTML = "";

  const term = state.search.trim().toLowerCase();
  const filtered = list
    .map((s, i) => ({ station: s, index: i }))
    .filter(({ station }) => {
      if (!term) return true;
      return [station.text, station.URL, station.type].join(" ").toLowerCase().includes(term);
    });

  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No stations in this category.";
    row.appendChild(cell);
    els.stationTableBody.appendChild(row);
    return;
  }

  for (const { station, index } of filtered) {
    normalizeStatus(station);
    const row = document.createElement("tr");
    row.draggable = true;
    row.addEventListener("dragstart", () => {
      state.drag = {
        sourceCategoryKey: state.selectedCategoryKey,
        sourceIndex: index
      };
      row.classList.add("drag-source");
    });
    row.addEventListener("dragend", () => {
      state.drag = null;
      row.classList.remove("drag-source");
      document.querySelectorAll(".category-item.drop-target").forEach((el) => el.classList.remove("drop-target"));
    });

    const nameCell = document.createElement("td");
    nameCell.textContent = station.text;

    const urlCell = document.createElement("td");
    urlCell.className = "url-cell";
    urlCell.textContent = station.URL;
    urlCell.title = station.URL;

    const statusCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `status-badge ${station._status}`;
    badge.textContent = station._status;
    badge.title = station._statusHint;
    statusCell.appendChild(badge);

    const typeCell = document.createElement("td");
    typeCell.textContent = station.type || "audio";

    const actionCell = document.createElement("td");
    const editBtn = document.createElement("button");
    editBtn.className = "small";
    editBtn.textContent = "edit";
    editBtn.addEventListener("click", () => startStationEdit(index));

    const delBtn = document.createElement("button");
    delBtn.className = "small";
    delBtn.textContent = "del";
    delBtn.addEventListener("click", () => {
      if (!confirm(`Delete station \"${station.text}\"?`)) return;
      list.splice(index, 1);
      if (state.editingStationIndex === index) {
        resetStationForm();
      }
      renderStations();
    });

    const upBtn = document.createElement("button");
    upBtn.className = "small";
    upBtn.textContent = "up";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => {
      if (index === 0) return;
      [list[index - 1], list[index]] = [list[index], list[index - 1]];
      renderStations();
    });

    const downBtn = document.createElement("button");
    downBtn.className = "small";
    downBtn.textContent = "down";
    downBtn.disabled = index === list.length - 1;
    downBtn.addEventListener("click", () => {
      if (index === list.length - 1) return;
      [list[index + 1], list[index]] = [list[index], list[index + 1]];
      renderStations();
    });

    const checkBtn = document.createElement("button");
    checkBtn.className = "small";
    checkBtn.textContent = "check";
    checkBtn.addEventListener("click", async () => {
      await checkStationAvailability(station);
      renderStations();
    });

    actionCell.append(editBtn, delBtn, upBtn, downBtn, checkBtn);

    row.append(nameCell, urlCell, statusCell, typeCell, actionCell);
    els.stationTableBody.appendChild(row);
  }
}

function render() {
  renderCategories();
  renderStations();
  els.opmlTitle.value = state.title;
  els.sortCategoriesBtn.textContent = state.categorySortAsc ? "Sort A-Z" : "Sort Z-A";
  els.sortStationsBtn.textContent = state.stationSortAsc ? "Sort A-Z" : "Sort Z-A";
}

function sortCategoriesByName() {
  const direction = state.categorySortMode === "asc" ? "desc" : "asc";
  const currentCategory = state.selectedCategoryKey === "__root__"
    ? null
    : state.categories[Number(state.selectedCategoryKey)];

  state.categories.sort((a, b) => compareByName(a, b, direction === "asc"));
  state.categorySortMode = direction;
  state.categorySortAsc = !state.categorySortAsc;

  if (currentCategory) {
    const idx = state.categories.indexOf(currentCategory);
    state.selectedCategoryKey = idx >= 0 ? String(idx) : "__root__";
  }

  render();
  showToast("Categories sorted by name.");
}

function sortSelectedStationsByName() {
  const direction = state.stationSortMode === "asc" ? "desc" : "asc";
  const list = getSelectedStationList();
  list.sort((a, b) => compareByName(a, b, direction === "asc"));
  state.stationSortMode = direction;
  state.stationSortAsc = !state.stationSortAsc;
  state.editingStationIndex = null;
  resetStationForm();
  renderStations();
  els.sortStationsBtn.textContent = state.stationSortAsc ? "Sort A-Z" : "Sort Z-A";
  showToast("Stations sorted by name.");
}

function resetStationForm() {
  state.editingStationIndex = null;
  els.formTitle.textContent = "Add station";
  els.stationForm.reset();
  els.stationType.value = "audio";
}

function startStationEdit(index) {
  const list = getSelectedStationList();
  const station = list[index];
  if (!station) return;

  state.editingStationIndex = index;
  els.formTitle.textContent = "Edit station";
  els.stationName.value = station.text;
  els.stationUrl.value = station.URL;
  els.stationIcon.value = station.icon;
  els.stationType.value = station.type || "audio";
}

async function loadFromServer() {
  const previousCategory = getSelectedCategoryName();
  const previousSearch = state.search;
  const res = await fetch("/api/load");
  if (!res.ok) {
    throw new Error("Cannot load favorites.opml");
  }
  const data = await res.json();
  parseOpml(data.content);
  restoreSelectedCategoryByName(previousCategory);
  applySortModesToData();
  state.search = previousSearch;
  els.stationSearch.value = previousSearch;
  render();
  resetStationForm();
}

async function saveToServer() {
  const content = buildOpml();
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Save failed");
  }
  showToast(`Saved. Backup: ${data.backup}`);
}

async function checkStationAvailability(station) {
  station._status = "checking";
  station._statusHint = "Checking...";
  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: station.URL })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      station._status = "alive";
      station._statusHint = `${data.mode} ${data.status}`;
      return true;
    }
    station._status = "dead";
    station._statusHint = data.error || `${data.mode || "GET"} ${data.status || "fail"}`;
    return false;
  } catch (error) {
    station._status = "dead";
    station._statusHint = error.message || "Network error";
    return false;
  }
}

async function checkVisibleStations() {
  if (state.checkingVisible) return;
  state.checkingVisible = true;
  els.checkVisibleBtn.disabled = true;
  const prev = els.checkVisibleBtn.textContent;
  els.checkVisibleBtn.textContent = "Checking...";

  try {
    const list = getSelectedStationList();
    const term = state.search.trim().toLowerCase();
    const filtered = list
      .filter((station) => {
        if (!term) return true;
        return [station.text, station.URL, station.type].join(" ").toLowerCase().includes(term);
      });

    let okCount = 0;
    for (const station of filtered) {
      const ok = await checkStationAvailability(station);
      if (ok) okCount += 1;
      renderStations();
    }
    showToast(`Checked ${filtered.length}. Alive: ${okCount}.`);
  } finally {
    state.checkingVisible = false;
    els.checkVisibleBtn.disabled = false;
    els.checkVisibleBtn.textContent = prev;
  }
}

els.stationForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const station = {
    text: els.stationName.value.trim(),
    URL: els.stationUrl.value.trim(),
    icon: (els.stationIcon.value || "html/images/radio.png").trim(),
    type: (els.stationType.value || "audio").trim()
  };

  if (!station.text || !station.URL) {
    showToast("Name and URL are required.");
    return;
  }

  const list = getSelectedStationList();

  if (state.editingStationIndex === null) {
    list.push(station);
    showToast("Station added.");
  } else {
    list[state.editingStationIndex] = station;
    showToast("Station updated.");
  }

  resetStationForm();
  renderStations();
});

els.cancelEditBtn.addEventListener("click", () => {
  resetStationForm();
});

els.addCategoryBtn.addEventListener("click", () => {
  const name = els.newCategoryName.value.trim();
  if (!name) {
    showToast("Category name is empty.");
    return;
  }
  state.categories.push({ text: name, icon: "html/images/favorites.png", stations: [] });
  els.newCategoryName.value = "";
  state.selectedCategoryKey = String(state.categories.length - 1);
  render();
  showToast("Category added.");
});

els.sortCategoriesBtn.addEventListener("click", () => {
  sortCategoriesByName();
});

els.stationSearch.addEventListener("input", () => {
  state.search = els.stationSearch.value;
  renderStations();
});

els.sortStationsBtn.addEventListener("click", () => {
  sortSelectedStationsByName();
});

els.checkVisibleBtn.addEventListener("click", async () => {
  await checkVisibleStations();
});

els.opmlTitle.addEventListener("input", () => {
  state.title = els.opmlTitle.value;
});

els.reloadBtn.addEventListener("click", async () => {
  try {
    await loadFromServer();
    showToast("Reloaded from file.");
  } catch (error) {
    showToast(error.message || "Reload failed");
  }
});

els.saveBtn.addEventListener("click", async () => {
  try {
    await saveToServer();
  } catch (error) {
    showToast(error.message || "Save failed");
  }
});

(async function init() {
  try {
    await loadFromServer();
    showToast("Loaded favorites.opml");
  } catch (error) {
    showToast(error.message || "Initial load failed", 3200);
  }
})();
