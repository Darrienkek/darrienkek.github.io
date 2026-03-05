const DEFAULT_PAGE_SIZE = 40;
const PAGE_WINDOW = 5;
const BUILD_VERSION = "20260305-2";
const UTF8_DECODER = new TextDecoder("utf-8");
const WINDOWS_1252_REVERSE_MAP = new Map([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f]
]);

const refs = {
  serverAddress: document.getElementById("serverAddress"),
  summary: document.getElementById("summary"),
  generatedAt: document.getElementById("generatedAt"),
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
  pageNumbers: document.getElementById("pageNumbers"),
  pageInfo: document.getElementById("pageInfo"),
  signCardTemplate: document.getElementById("signCardTemplate")
};

let allSigns = [];
let filteredSigns = [];
let currentPage = 1;

init();

async function init() {
  try {
    const response = await fetch(`signs.json?v=${BUILD_VERSION}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load signs.json (${response.status})`);
    }

    const data = await response.json();
    allSigns = Array.isArray(data.signs) ? data.signs : [];

    refs.serverAddress.textContent = data.serverAddress
      ? `Server ${data.serverAddress}`
      : "Server Unknown";

    refs.generatedAt.textContent = data.generatedAt
      ? `Snapshot generated ${formatAbsoluteTime(data.generatedAt)}`
      : "Snapshot time unavailable";

    refs.pageSize.value = String(DEFAULT_PAGE_SIZE);
    refs.sortOrder.value = "newest";
    populateFilters(allSigns);
    wireEvents();
    renderHeroSummary(allSigns);
    applyFiltersAndRender();
  } catch (error) {
    refs.summary.textContent = "Could not load sign data.";
    refs.resultsMeta.textContent = String(error);
    refs.generatedAt.textContent = "Check that signs.json is available.";
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
    if (currentPage <= 1) return;
    currentPage -= 1;
    render();
    scrollResultsIntoView();
  });

  refs.nextPage.addEventListener("click", () => {
    const totalPages = getTotalPages(getPageSize());
    if (currentPage >= totalPages) return;
    currentPage += 1;
    render();
    scrollResultsIntoView();
  });
}

function populateFilters(signs) {
  const types = [...new Set(signs.map((sign) => sign.blockType).filter(Boolean))]
    .sort((a, b) => humanizeBlockType(a).localeCompare(humanizeBlockType(b)));
  const dimensions = [...new Set(signs.map((sign) => sign.dimension).filter(Boolean))]
    .sort((a, b) => humanizeDimension(a).localeCompare(humanizeDimension(b)));

  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = humanizeBlockType(type);
    refs.typeFilter.append(option);
  }

  for (const dimension of dimensions) {
    const option = document.createElement("option");
    option.value = dimension;
    option.textContent = humanizeDimension(dimension);
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
      humanizeBlockType(sign.blockType),
      sign.dimension || "",
      humanizeDimension(sign.dimension),
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
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const start = pageSize === Number.MAX_SAFE_INTEGER ? 0 : (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const pageItems = filteredSigns.slice(start, end);

  if (pageItems.length === 0) {
    refs.signList.append(createEmptyState());
  } else {
    for (const sign of pageItems) {
      refs.signList.append(renderCard(sign));
    }
  }

  renderResultsMeta(total, start, end, pageSize);
  renderPagination(totalPages);
}

function renderCard(sign) {
  const node = refs.signCardTemplate.content.firstElementChild.cloneNode(true);
  const material = getMaterialName(sign.blockType);
  const palette = getSignPalette(material);
  const text = normalizeText(sign.signText);

  node.style.setProperty("--sign-face", palette.face);
  node.style.setProperty("--sign-edge", palette.edge);
  node.style.setProperty("--sign-ink", palette.ink);
  node.style.setProperty("--card-accent", palette.accent);
  node.style.setProperty("--card-glow", palette.glow);
  node.dataset.material = material;
  node.title = humanizeBlockType(sign.blockType);

  node.querySelector('[data-field="typeBadge"]').textContent = material.replace(/_/g, " ").toUpperCase();

  const textNode = node.querySelector(".sign-text");
  if (text) {
    textNode.textContent = text;
  } else {
    textNode.textContent = "(blank sign)";
    node.classList.add("is-empty");
  }

  node.querySelector('[data-field="coords"]').textContent =
    `X: ${formatNumber(sign.x ?? 0)}, Y: ${formatNumber(sign.y ?? 0)}, Z: ${formatNumber(sign.z ?? 0)}`;
  node.querySelector('[data-field="dimension"]').textContent =
    `${getDimensionGlyph(sign.dimension)} ${humanizeDimension(sign.dimension)}`;
  node.querySelector('[data-field="seen"]').textContent = formatRelativeTime(sign.timestamp);

  return node;
}

function renderResultsMeta(total, start, end, pageSize) {
  if (total === 0) {
    refs.resultsMeta.textContent = "No signs match the current filters.";
    refs.pageInfo.textContent = "Page 0 of 0";
    return;
  }

  const from = start + 1;
  const pageSizeLabel = pageSize === Number.MAX_SAFE_INTEGER
    ? "all results on one page"
    : `${formatNumber(pageSize)} per page`;
  const totalPages = getTotalPages(pageSize);

  refs.resultsMeta.textContent =
    `Showing ${formatNumber(from)}-${formatNumber(end)} of ${formatNumber(total)} indexed signs, ${pageSizeLabel}`;
  refs.pageInfo.textContent = `Page ${formatNumber(currentPage)} of ${formatNumber(totalPages)}`;
}

function renderPagination(totalPages) {
  refs.pageNumbers.textContent = "";
  refs.prevPage.disabled = currentPage <= 1 || totalPages === 0;
  refs.nextPage.disabled = currentPage >= totalPages || totalPages === 0;

  const tokens = buildPageTokens(currentPage, totalPages);
  for (const token of tokens) {
    if (token === "...") {
      const ellipsis = document.createElement("span");
      ellipsis.className = "page-ellipsis";
      ellipsis.textContent = token;
      refs.pageNumbers.append(ellipsis);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-number";
    button.textContent = String(token);
    if (token === currentPage) {
      button.classList.add("is-current");
      button.setAttribute("aria-current", "page");
    }
    button.addEventListener("click", () => {
      currentPage = token;
      render();
      scrollResultsIntoView();
    });
    refs.pageNumbers.append(button);
  }
}

function buildPageTokens(page, totalPages) {
  if (totalPages <= 0) return [];
  if (totalPages <= PAGE_WINDOW + 2) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const tokens = [1];
  let start = Math.max(2, page - Math.floor(PAGE_WINDOW / 2));
  let end = Math.min(totalPages - 1, start + PAGE_WINDOW - 1);

  start = Math.max(2, end - PAGE_WINDOW + 1);

  if (start > 2) {
    tokens.push("...");
  }

  for (let value = start; value <= end; value += 1) {
    tokens.push(value);
  }

  if (end < totalPages - 1) {
    tokens.push("...");
  }

  tokens.push(totalPages);
  return tokens;
}

function createEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = "<strong>No matches found.</strong><span>Try broadening the search or turning off the text-only filter.</span>";
  return empty;
}

function renderHeroSummary(signs) {
  const totalSigns = signs.length;
  const dimensions = new Set(signs.map((sign) => sign.dimension).filter(Boolean)).size;
  refs.summary.innerHTML =
    `Monitoring <strong>${formatNumber(totalSigns)}</strong> indexed signs across <strong>${formatNumber(dimensions)}</strong> dimension${dimensions === 1 ? "" : "s"}.`;
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return repairMojibake(value.trim());
}

function formatAbsoluteTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatRelativeTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const divisions = [
    { unit: "day", ms: 86400000 },
    { unit: "hour", ms: 3600000 },
    { unit: "minute", ms: 60000 }
  ];

  for (const division of divisions) {
    if (absMs >= division.ms || division.unit === "minute") {
      return formatter.format(Math.round(diffMs / division.ms), division.unit);
    }
  }

  return "Just now";
}

function getPageSize() {
  const value = refs.pageSize.value;
  if (value === "all") return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE_SIZE;
}

function getTotalPages(pageSize) {
  if (filteredSigns.length === 0) return 0;
  if (pageSize === Number.MAX_SAFE_INTEGER) return 1;
  return Math.max(1, Math.ceil(filteredSigns.length / pageSize));
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function humanizeBlockType(value) {
  if (!value) return "Unknown sign";
  return value
    .replace(/^minecraft:/, "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizeDimension(value) {
  if (!value) return "Unknown";
  return value
    .replace(/^minecraft:/, "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMaterialName(blockType) {
  const raw = (blockType || "").replace(/^minecraft:/, "");
  const tokens = raw.split("_");
  const filtered = tokens.filter((token) => token !== "wall" && token !== "hanging" && token !== "sign");
  return filtered.join("_") || "oak";
}

function getSignPalette(material) {
  const palettes = {
    acacia: { face: "#9f5d31", edge: "#7d4724", ink: "#fff2de", accent: "#ffb067", glow: "rgba(255, 176, 103, 0.28)" },
    bamboo: { face: "#b79656", edge: "#947440", ink: "#2e2313", accent: "#e7cf8a", glow: "rgba(231, 207, 138, 0.28)" },
    birch: { face: "#d7d6d6", edge: "#b3b1b1", ink: "#243146", accent: "#4cecff", glow: "rgba(76, 236, 255, 0.24)" },
    cherry: { face: "#b67d90", edge: "#935f70", ink: "#fff0f5", accent: "#ff93bb", glow: "rgba(255, 147, 187, 0.24)" },
    crimson: { face: "#934028", edge: "#6f2c1a", ink: "#fff1dd", accent: "#ff6f66", glow: "rgba(255, 111, 102, 0.28)" },
    dark_oak: { face: "#1c5a3a", edge: "#15452d", ink: "#62fff4", accent: "#1fe8ff", glow: "rgba(31, 232, 255, 0.24)" },
    jungle: { face: "#83552f", edge: "#644022", ink: "#fff2de", accent: "#ffc579", glow: "rgba(255, 197, 121, 0.26)" },
    mangrove: { face: "#7b3f2d", edge: "#612d1f", ink: "#fff0e3", accent: "#ff8c76", glow: "rgba(255, 140, 118, 0.25)" },
    oak: { face: "#8a6846", edge: "#694c30", ink: "#fff4e4", accent: "#38e9ff", glow: "rgba(56, 233, 255, 0.22)" },
    pale_oak: { face: "#beb2a5", edge: "#97897d", ink: "#1f2638", accent: "#b5ffef", glow: "rgba(181, 255, 239, 0.22)" },
    spruce: { face: "#876443", edge: "#63462d", ink: "#fff0df", accent: "#2ce8ff", glow: "rgba(44, 232, 255, 0.24)" },
    warped: { face: "#1b6c73", edge: "#125157", ink: "#d7ffff", accent: "#53f6ff", glow: "rgba(83, 246, 255, 0.26)" }
  };

  return palettes[material] || palettes.oak;
}

function getDimensionGlyph(value) {
  const glyphs = {
    "minecraft:overworld": "◎",
    "minecraft:the_nether": "◉",
    "minecraft:the_end": "✦"
  };
  return glyphs[value] || "•";
}

function scrollResultsIntoView() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function repairMojibake(value) {
  if (!value || !looksLikeMojibake(value)) return value;

  const bytes = [];
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    const mappedByte = WINDOWS_1252_REVERSE_MAP.get(char);
    if (mappedByte === undefined) {
      return value;
    }

    bytes.push(mappedByte);
  }

  const repaired = UTF8_DECODER.decode(Uint8Array.from(bytes));
  return repaired.includes("\ufffd") ? value : repaired;
}

function looksLikeMojibake(value) {
  return /[ÃÂâÐÑð]|[‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(value);
}
