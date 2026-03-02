const DEFAULT_PAGE_SIZE = 40;

const refs = {
  serverAddress: document.getElementById("serverAddress"),
  summary: document.getElementById("summary"),
  searchInput: document.getElementById("searchInput"),
  typeFilter: document.getElementById("typeFilter"),
  dimensionFilter: document.getElementById("dimensionFilter"),
  sortOrder: document.getElementById("sortOrder"),
  pageSize: document.getElementById("pageSize"),
  onlyWithText: document.getElementById("onlyWithText"),
  resultsMeta: document.getElementById("resultsMeta"),
  signList: document.getElementById("signList"),
  prevPage: document.getElementById("prevPage"),
  nextPage: document.getElementById("nextPage"),
  pageInfo: document.getElementById("pageInfo"),
  signCardTemplate: document.getElementById("signCardTemplate")
};

let allSigns = [];
let filteredSigns = [];
let currentPage = 1;

init();

async function init() {
  try {
    const response = await fetch("signs.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load signs.json (${response.status})`);
    }

    const data = await response.json();
    allSigns = Array.isArray(data.signs) ? data.signs : [];

    refs.serverAddress.textContent = data.serverAddress
      ? `Server: ${data.serverAddress}`
      : "Server: Unknown";

    refs.summary.textContent = `${formatNumber(allSigns.length)} signs indexed`;
    refs.pageSize.value = String(DEFAULT_PAGE_SIZE);
    populateFilters(allSigns);
    wireEvents();
    applyFiltersAndRender();
  } catch (error) {
    refs.summary.textContent = "Could not load sign data.";
    refs.resultsMeta.textContent = String(error);
  }
}

function wireEvents() {
  const reapply = () => {
    currentPage = 1;
    applyFiltersAndRender();
  };

  refs.searchInput.addEventListener("input", reapply);
  refs.typeFilter.addEventListener("change", reapply);
  refs.dimensionFilter.addEventListener("change", reapply);
  refs.sortOrder.addEventListener("change", reapply);
  refs.pageSize.addEventListener("change", reapply);
  refs.onlyWithText.addEventListener("change", reapply);

  refs.prevPage.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  refs.nextPage.addEventListener("click", () => {
    const totalPages = getTotalPages(getPageSize());
    if (currentPage < totalPages) {
      currentPage += 1;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

function populateFilters(signs) {
  const types = [...new Set(signs.map((s) => s.blockType).filter(Boolean))].sort();
  const dimensions = [...new Set(signs.map((s) => s.dimension).filter(Boolean))].sort();

  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    refs.typeFilter.append(option);
  }

  for (const dimension of dimensions) {
    const option = document.createElement("option");
    option.value = dimension;
    option.textContent = dimension;
    refs.dimensionFilter.append(option);
  }
}

function applyFiltersAndRender() {
  const query = refs.searchInput.value.trim().toLowerCase();
  const type = refs.typeFilter.value;
  const dimension = refs.dimensionFilter.value;
  const onlyWithText = refs.onlyWithText.checked;
  const sortOrder = refs.sortOrder.value;

  filteredSigns = allSigns.filter((sign) => {
    if (type && sign.blockType !== type) return false;
    if (dimension && sign.dimension !== dimension) return false;

    const text = normalizeText(sign.signText);
    if (onlyWithText && !text) return false;

    if (!query) return true;

    const haystack = [
      sign.blockType || "",
      sign.dimension || "",
      text,
      String(sign.x ?? ""),
      String(sign.y ?? ""),
      String(sign.z ?? "")
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  filteredSigns.sort((a, b) => sortSigns(a, b, sortOrder));
  render();
}

function sortSigns(a, b, order) {
  if (order === "oldest") {
    return (a.timestamp ?? 0) - (b.timestamp ?? 0);
  }
  if (order === "text-az") {
    return normalizeText(a.signText).localeCompare(normalizeText(b.signText));
  }
  if (order === "text-za") {
    return normalizeText(b.signText).localeCompare(normalizeText(a.signText));
  }
  return (b.timestamp ?? 0) - (a.timestamp ?? 0);
}

function render() {
  refs.signList.textContent = "";

  const total = filteredSigns.length;
  const pageSize = getPageSize();
  const totalPages = getTotalPages(pageSize);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const pageItems = filteredSigns.slice(start, end);

  for (const sign of pageItems) {
    const node = refs.signCardTemplate.content.firstElementChild.cloneNode(true);
    const textNode = node.querySelector(".sign-text");
    const text = normalizeText(sign.signText);
    textNode.textContent = text || "(no text)";

    node.querySelector('[data-field="blockType"]').textContent = sign.blockType || "unknown";
    node.querySelector('[data-field="dimension"]').textContent = sign.dimension || "unknown";
    node.querySelector('[data-field="coords"]').textContent = `${sign.x}, ${sign.y}, ${sign.z}`;
    node.querySelector('[data-field="seen"]').textContent = formatTimestamp(sign.timestamp);

    refs.signList.append(node);
  }

  const from = total === 0 ? 0 : start + 1;
  const pageSizeLabel = pageSize === Number.MAX_SAFE_INTEGER ? "all per page" : `${formatNumber(pageSize)} per page`;
  refs.resultsMeta.textContent = `Showing ${formatNumber(from)}-${formatNumber(end)} of ${formatNumber(total)} signs (${pageSizeLabel})`;
  refs.pageInfo.textContent = `Page ${formatNumber(currentPage)} of ${formatNumber(totalPages)}`;

  refs.prevPage.disabled = currentPage <= 1;
  refs.nextPage.disabled = currentPage >= totalPages;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatTimestamp(ms) {
  if (!ms) return "unknown";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

function getPageSize() {
  const value = refs.pageSize.value;
  if (value === "all") return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE_SIZE;
}

function getTotalPages(pageSize) {
  if (pageSize === Number.MAX_SAFE_INTEGER) return 1;
  return Math.max(1, Math.ceil(filteredSigns.length / pageSize));
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}
