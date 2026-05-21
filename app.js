(function () {
  "use strict";

  const MOST_USED_COUNT = 5;
  const LS_KEY_CUSTOM = "moodlet_customMoods";
  const LS_KEY_USAGE = "moodlet_usageCounts";
  const LS_KEY_BG = "moodlet_background";

  let settings = null;
  let allSettingsMoods = [];
  let customMoods = [];
  let usageCounts = {};
  let selectedKeys = new Set();
  let mostUsedSnapshot = [];
  let bgImage = null;
  let charImage = null;
  let toastTimer = null;
  // bgChoice: { type: "preset", file: "name.png" } | { type: "color", value: "#hex" } | { type: "upload", dataUrl: "..." }
  let bgChoice = null;

  // --- DOM refs ---
  const searchInput = document.getElementById("search-input");
  const resetBtn = document.getElementById("reset-btn");
  const mostUsedSection = document.getElementById("most-used-section");
  const mostUsedGrid = document.getElementById("most-used-grid");
  const allMoodsGrid = document.getElementById("all-moods-grid");
  const customSection = document.getElementById("custom-section");
  const customGrid = document.getElementById("custom-grid");
  const customLabelInput = document.getElementById("custom-label");
  const customEmojiInput = document.getElementById("custom-emoji");
  const customAddBtn = document.getElementById("custom-add-btn");
  const customError = document.getElementById("custom-error");
  const toastEl = document.getElementById("toast");
  const bgToggleBtn = document.getElementById("bg-toggle-btn");
  const bgPanel = document.getElementById("bg-panel");
  const bgPresetsGrid = document.getElementById("bg-presets");
  const bgColorPicker = document.getElementById("bg-color-picker");
  const bgColorApply = document.getElementById("bg-color-apply");
  const bgUploadInput = document.getElementById("bg-upload-input");
  const bgUploadName = document.getElementById("bg-upload-name");
  const bgCurrentLabel = document.getElementById("bg-current");
  const generateBtn = document.getElementById("generate-btn");
  const previewSection = document.getElementById("preview-section");
  const canvas = document.getElementById("status-canvas");
  const ctx = canvas.getContext("2d");
  const downloadBtn = document.getElementById("download-btn");
  const shareBtn = document.getElementById("share-btn");

  // =========================================================================
  // Init
  // =========================================================================

  async function init() {
    try {
      const resp = await fetch("settings.json");
      settings = await resp.json();
    } catch (e) {
      console.error("Failed to load settings.json", e);
      return;
    }

    allSettingsMoods = [...settings.moods];
    loadCustomMoods();
    loadUsageCounts();
    loadBgChoice();
    mostUsedSnapshot = getMostUsedMoods();
    preloadAssets();
    renderBgPresets();
    updateBgUI();
    renderAllSections();
    bindEvents();
  }

  function loadCustomMoods() {
    try {
      const raw = localStorage.getItem(LS_KEY_CUSTOM);
      customMoods = raw ? JSON.parse(raw) : [];
    } catch {
      customMoods = [];
    }
  }

  function saveCustomMoods() {
    localStorage.setItem(LS_KEY_CUSTOM, JSON.stringify(customMoods));
  }

  function loadUsageCounts() {
    try {
      const raw = localStorage.getItem(LS_KEY_USAGE);
      usageCounts = raw ? JSON.parse(raw) : {};
    } catch {
      usageCounts = {};
    }
  }

  function saveUsageCounts() {
    localStorage.setItem(LS_KEY_USAGE, JSON.stringify(usageCounts));
  }

  function preloadAssets() {
    charImage = new Image();
    charImage.src = "resources/graphics/character.png";
    applyBgChoice();
  }

  // =========================================================================
  // Background customizer
  // =========================================================================

  function loadBgChoice() {
    try {
      var raw = localStorage.getItem(LS_KEY_BG);
      if (raw) {
        bgChoice = JSON.parse(raw);
        return;
      }
    } catch {}
    var bgs = settings.backgrounds || [];
    if (bgs.length > 0) {
      bgChoice = { type: "preset", file: bgs[0] };
    } else {
      bgChoice = null;
    }
  }

  function saveBgChoice() {
    localStorage.setItem(LS_KEY_BG, JSON.stringify(bgChoice));
  }

  function applyBgChoice() {
    bgImage = null;
    if (!bgChoice) return;

    if (bgChoice.type === "preset") {
      bgImage = new Image();
      bgImage.src = "resources/graphics/backgrounds/" + bgChoice.file;
    } else if (bgChoice.type === "upload" && bgChoice.dataUrl) {
      bgImage = new Image();
      bgImage.src = bgChoice.dataUrl;
    }
  }

  function renderBgPresets() {
    bgPresetsGrid.innerHTML = "";
    var bgs = settings.backgrounds || [];
    bgs.forEach(function (filename) {
      var img = document.createElement("img");
      img.className = "bg-preset-thumb";
      img.src = "resources/graphics/backgrounds/" + filename;
      img.alt = filename;
      img.title = filename;
      if (bgChoice && bgChoice.type === "preset" && bgChoice.file === filename) {
        img.classList.add("selected");
      }
      img.addEventListener("click", function () {
        bgChoice = { type: "preset", file: filename };
        saveBgChoice();
        applyBgChoice();
        updateBgUI();
      });
      bgPresetsGrid.appendChild(img);
    });

    if (bgs.length === 0) {
      var note = document.createElement("span");
      note.className = "bg-upload-name";
      note.textContent = "No preset backgrounds found.";
      bgPresetsGrid.appendChild(note);
    }
  }

  function selectBgColor() {
    var color = bgColorPicker.value;
    bgChoice = { type: "color", value: color };
    saveBgChoice();
    applyBgChoice();
    updateBgUI();
  }

  function handleBgUpload(e) {
    var file = e.target.files[0];
    if (!file) return;

    bgUploadName.textContent = file.name;
    var reader = new FileReader();
    reader.onload = function (ev) {
      bgChoice = { type: "upload", dataUrl: ev.target.result };
      saveBgChoice();
      applyBgChoice();
      updateBgUI();
    };
    reader.readAsDataURL(file);
  }

  function updateBgUI() {
    bgPresetsGrid.querySelectorAll(".bg-preset-thumb").forEach(function (img) {
      var file = img.alt;
      img.classList.toggle("selected", bgChoice && bgChoice.type === "preset" && bgChoice.file === file);
    });

    if (!bgChoice) {
      bgCurrentLabel.textContent = "Current: default (fallback color)";
    } else if (bgChoice.type === "preset") {
      bgCurrentLabel.textContent = "Current: " + bgChoice.file;
    } else if (bgChoice.type === "color") {
      bgCurrentLabel.innerHTML = "";
      bgCurrentLabel.appendChild(document.createTextNode("Current: Solid color "));
      var swatch = document.createElement("span");
      swatch.style.display = "inline-block";
      swatch.style.width = "12px";
      swatch.style.height = "12px";
      swatch.style.backgroundColor = bgChoice.value;
      swatch.style.border = "1px solid #888";
      swatch.style.borderRadius = "2px";
      swatch.style.verticalAlign = "middle";
      bgCurrentLabel.appendChild(swatch);
      bgColorPicker.value = bgChoice.value;
    } else if (bgChoice.type === "upload") {
      bgCurrentLabel.textContent = "Current: uploaded image";
    }
  }

  // =========================================================================
  // Rendering toggle sections
  // =========================================================================

  function getAllMoodsSorted() {
    return [...allSettingsMoods].sort((a, b) =>
      a.display.localeCompare(b.display)
    );
  }

  function getCustomMoodsSorted() {
    return [...customMoods].sort((a, b) =>
      a.display.localeCompare(b.display)
    );
  }

  function getMostUsedMoods() {
    const allMoods = [...allSettingsMoods, ...customMoods];
    const moodMap = new Map(allMoods.map((m) => [m.key, m]));

    return Object.entries(usageCounts)
      .filter(([key]) => moodMap.has(key))
      .sort((a, b) => b[1] - a[1])
      .slice(0, MOST_USED_COUNT)
      .map(([key]) => moodMap.get(key));
  }

  function renderAllSections() {
    const query = searchInput.value.trim().toLowerCase();
    renderMostUsed(query);
    renderAllMoods(query);
    renderCustom(query);
  }

  function renderMostUsed(query) {
    const filtered = filterByQuery(mostUsedSnapshot, query);

    if (mostUsedSnapshot.length === 0 || filtered.length === 0) {
      mostUsedSection.hidden = true;
      return;
    }
    mostUsedSection.hidden = false;
    mostUsedGrid.innerHTML = "";
    filtered.forEach((mood) =>
      mostUsedGrid.appendChild(createToggle(mood, false))
    );
  }

  function renderAllMoods(query) {
    const moods = getAllMoodsSorted();
    const filtered = filterByQuery(moods, query);
    const section = document.getElementById("all-moods-section");

    if (filtered.length === 0 && query) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    allMoodsGrid.innerHTML = "";
    filtered.forEach((mood) =>
      allMoodsGrid.appendChild(createToggle(mood, false))
    );
  }

  function renderCustom(query) {
    const moods = getCustomMoodsSorted();
    const filtered = filterByQuery(moods, query);

    if (filtered.length === 0 && moods.length > 0 && query) {
      customGrid.innerHTML = "";
      customSection.hidden = true;
      return;
    }
    customSection.hidden = false;
    customGrid.innerHTML = "";
    filtered.forEach((mood) =>
      customGrid.appendChild(createToggle(mood, true))
    );
  }

  function filterByQuery(moods, query) {
    if (!query) return moods;
    return moods.filter((m) => m.display.toLowerCase().includes(query));
  }

  function createToggle(mood, showRemove) {
    const btn = document.createElement("button");
    btn.className = "mood-toggle" + (selectedKeys.has(mood.key) ? " active" : "");
    btn.dataset.key = mood.key;

    const emojiSpan = document.createElement("span");
    emojiSpan.className = "emoji";
    emojiSpan.textContent = mood.emoji;
    btn.appendChild(emojiSpan);

    const labelSpan = document.createElement("span");
    labelSpan.textContent = mood.display;
    btn.appendChild(labelSpan);

    btn.addEventListener("click", (e) => {
      if (e.target.closest(".remove-btn")) return;
      toggleMood(mood.key);
    });

    if (showRemove) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "\u00d7";
      removeBtn.title = "Remove custom mood";
      removeBtn.addEventListener("click", () => removeCustomMood(mood.key));
      btn.appendChild(removeBtn);
    }

    return btn;
  }

  // =========================================================================
  // Toggle logic
  // =========================================================================

  function toggleMood(key) {
    if (selectedKeys.has(key)) {
      selectedKeys.delete(key);
    } else {
      if (selectedKeys.size >= settings.maxSelectedMoods) {
        showToast("Whoaa, slow down! You're feeling too many emotions!");
        return;
      }
      selectedKeys.add(key);
    }
    syncToggleStates();
  }

  function syncToggleStates() {
    document.querySelectorAll(".mood-toggle").forEach((btn) => {
      btn.classList.toggle("active", selectedKeys.has(btn.dataset.key));
    });
  }

  function resetSelections() {
    selectedKeys.clear();
    syncToggleStates();
  }

  // =========================================================================
  // Custom moods
  // =========================================================================

  function isValidLabel(str) {
    return str.length > 0 && /^[\p{L}\p{N}\p{Zs}]+$/u.test(str);
  }

  function isValidEmoji(str) {
    if (!str) return false;
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      const segments = [...segmenter.segment(str)];
      if (segments.length !== 1) return false;
    }
    return /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(\u200D(\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u.test(str);
  }

  function isDuplicate(display) {
    const lower = display.toLowerCase();
    const all = [...allSettingsMoods, ...customMoods];
    return all.some((m) => m.display.toLowerCase() === lower);
  }

  function addCustomMood() {
    const label = customLabelInput.value.trim();
    const emoji = customEmojiInput.value.trim();

    customError.hidden = true;

    if (!isValidLabel(label)) {
      showCustomError("Label must contain only letters, numbers, or spaces.");
      return;
    }
    if (!isValidEmoji(emoji)) {
      showCustomError("Please enter a single valid emoji.");
      return;
    }
    if (isDuplicate(label)) {
      showCustomError("A mood with this label already exists.");
      return;
    }

    const key = "custom_" + label.toLowerCase().replace(/\s+/g, "_");
    const mood = { key, display: label, emoji };

    customMoods.push(mood);
    saveCustomMoods();
    customLabelInput.value = "";
    customEmojiInput.value = "";
    renderAllSections();
  }

  function removeCustomMood(key) {
    customMoods = customMoods.filter((m) => m.key !== key);
    selectedKeys.delete(key);
    saveCustomMoods();
    renderAllSections();
  }

  function showCustomError(msg) {
    customError.textContent = msg;
    customError.hidden = false;
  }

  // =========================================================================
  // Toast
  // =========================================================================

  function showToast(msg, duration) {
    duration = duration || 3000;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, duration);
  }

  // =========================================================================
  // Canvas rendering
  // =========================================================================

  function getSelectedMoods() {
    const allMoods = [...allSettingsMoods, ...customMoods];
    const moodMap = new Map(allMoods.map((m) => [m.key, m]));
    return [...selectedKeys]
      .map((k) => moodMap.get(k))
      .filter(Boolean);
  }

  function generate() {
    const selected = getSelectedMoods();
    if (selected.length === 0) {
      showToast("Select at least one mood first!");
      return;
    }

    incrementUsageCounts(selected);
    renderCanvas(selected);
    previewSection.hidden = false;
    previewSection.scrollIntoView({ behavior: "smooth", block: "center" });
    detectShareSupport();
  }

  function incrementUsageCounts(moods) {
    moods.forEach((m) => {
      usageCounts[m.key] = (usageCounts[m.key] || 0) + 1;
    });
    saveUsageCounts();
  }

  function renderCanvas(selectedMoods) {
    ctx.clearRect(0, 0, 1080, 1080);
    drawBackground();
    drawBubble(ctx, selectedMoods);
    drawCharacter();
    drawText(ctx, settings.username, selectedMoods);
  }

  // --- Background ---

  function drawBackground() {
    if (bgChoice && bgChoice.type === "color") {
      ctx.fillStyle = bgChoice.value;
      ctx.fillRect(0, 0, 1080, 1080);
    } else if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
      ctx.drawImage(bgImage, 0, 0, 1080, 1080);
    } else {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, 1080, 1080);
    }
  }

  // --- Character ---

  function getCharacterBounds() {
    // --- TWEAKABLE SETTINGS ---
    var CHAR_Y = 300;
    var CHAR_MAX_WIDTH = 320;
    var CHAR_MAX_HEIGHT = 320;
    // --- END SETTINGS ---

    var cx = 540;
    var x = cx - CHAR_MAX_WIDTH / 2;
    return { x: x, y: CHAR_Y, maxW: CHAR_MAX_WIDTH, maxH: CHAR_MAX_HEIGHT, cx: cx };
  }

  function drawCharacter() {
    var bounds = getCharacterBounds();

    if (charImage && charImage.complete && charImage.naturalWidth > 0) {
      var scale = Math.min(
        bounds.maxW / charImage.naturalWidth,
        bounds.maxH / charImage.naturalHeight,
        1
      );
      var w = charImage.naturalWidth * scale;
      var h = charImage.naturalHeight * scale;
      var x = bounds.cx - w / 2;
      var y = bounds.y + (bounds.maxH - h) / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(charImage, x, y, w, h);
    }
  }

  // --- Bubble ---

  function drawBubble(ctx, selectedMoods) {
    // --- TWEAKABLE SETTINGS ---
    var EMOJIS_PER_ROW = 5;
    var BUBBLE_PADDING = 30;
    var EMOJI_SIZE = 64;
    var EMOJI_GAP = 16;
    var MAX_VISIBLE_EMOJIS = 12;
    var BUBBLE_RADIUS = 24;
    var BUBBLE_COLOR = "rgba(255, 255, 255, 0.92)";
    var BUBBLE_BORDER = "#333333";
    var BUBBLE_BORDER_WIDTH = 3;
    var TAIL_WIDTH = 30;
    var TAIL_HEIGHT = 30;
    var GAP_ABOVE_CHARACTER = 10;
    var ELLIPSIS_FONT_SIZE = 32;
    // --- END SETTINGS ---

    if (selectedMoods.length === 0) return;

    var charBounds = getCharacterBounds();

    var emojis = selectedMoods.map(function (m) { return m.emoji; });
    var showEllipsis = emojis.length > MAX_VISIBLE_EMOJIS;
    var visibleEmojis = showEllipsis
      ? emojis.slice(0, MAX_VISIBLE_EMOJIS)
      : emojis;

    var cellSize = EMOJI_SIZE + EMOJI_GAP;
    var cols = EMOJIS_PER_ROW;
    var totalItems = visibleEmojis.length + (showEllipsis ? 1 : 0);
    var rows = Math.ceil(totalItems / cols);

    var usedCols = Math.min(totalItems, cols);
    var bubbleContentWidth = usedCols * cellSize - EMOJI_GAP;
    var bubbleWidth = bubbleContentWidth + BUBBLE_PADDING * 2;
    var bubbleHeight = rows * cellSize - EMOJI_GAP + BUBBLE_PADDING * 2;

    var bx = charBounds.cx - bubbleWidth / 2;
    var by = charBounds.y - TAIL_HEIGHT - bubbleHeight - GAP_ABOVE_CHARACTER;

    ctx.save();
    ctx.fillStyle = BUBBLE_COLOR;
    ctx.strokeStyle = BUBBLE_BORDER;
    ctx.lineWidth = BUBBLE_BORDER_WIDTH;
    roundRect(ctx, bx, by, bubbleWidth, bubbleHeight, BUBBLE_RADIUS);
    ctx.fill();
    ctx.stroke();

    var tailX = charBounds.cx - TAIL_WIDTH / 2;
    var tailY = by + bubbleHeight;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY - 2);
    ctx.lineTo(charBounds.cx, tailY + TAIL_HEIGHT);
    ctx.lineTo(tailX + TAIL_WIDTH, tailY - 2);
    ctx.closePath();
    ctx.fillStyle = BUBBLE_COLOR;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = BUBBLE_COLOR;
    ctx.fillRect(tailX + 1, tailY - BUBBLE_BORDER_WIDTH, TAIL_WIDTH - 2, BUBBLE_BORDER_WIDTH + 2);

    ctx.font = EMOJI_SIZE + "px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    var contentStartX = bx + BUBBLE_PADDING;
    var contentStartY = by + BUBBLE_PADDING;

    visibleEmojis.forEach(function (emoji, i) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var itemsInThisRow = Math.min(cols, totalItems - row * cols);
      var rowWidth = itemsInThisRow * cellSize - EMOJI_GAP;
      var rowOffsetX = (bubbleContentWidth - rowWidth) / 2;

      var ex = contentStartX + rowOffsetX + col * cellSize + EMOJI_SIZE / 2;
      var ey = contentStartY + row * cellSize + EMOJI_SIZE / 2;
      ctx.fillStyle = "#000";
      ctx.fillText(emoji, ex, ey);
    });

    if (showEllipsis) {
      var ei = visibleEmojis.length;
      var col = ei % cols;
      var row = Math.floor(ei / cols);
      var itemsInThisRow = Math.min(cols, totalItems - row * cols);
      var rowWidth = itemsInThisRow * cellSize - EMOJI_GAP;
      var rowOffsetX = (bubbleContentWidth - rowWidth) / 2;

      var ex = contentStartX + rowOffsetX + col * cellSize + EMOJI_SIZE / 2;
      var ey = contentStartY + row * cellSize + EMOJI_SIZE / 2;
      ctx.fillStyle = "#666";
      ctx.font = "bold " + ELLIPSIS_FONT_SIZE + "px 'Press Start 2P', monospace";
      ctx.fillText("...", ex, ey);
    }

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // --- Text ---

  function drawText(ctx, username, selectedMoods) {
    // --- TWEAKABLE SETTINGS ---
    var TEXT_AREA_X = 40;
    var TEXT_AREA_Y = 700;
    var TEXT_AREA_WIDTH = 1000;
    var TEXT_AREA_HEIGHT = 300;
    var TEXT_COLOR = "#ffffff";
    var TEXT_SHADOW_COLOR = "#000000";
    var TEXT_SHADOW_BLUR = 6;
    var FONT_SIZE_LARGE = 32;
    var FONT_SIZE_MEDIUM = 26;
    var FONT_SIZE_SMALL = 20;
    var LINE_HEIGHT_MULTIPLIER = 1.8;
    var MAX_VISIBLE_LINES = 10;
    // --- END SETTINGS ---

    var count = selectedMoods.length;
    var fontSize;
    if (count <= 3) fontSize = FONT_SIZE_LARGE;
    else if (count <= 6) fontSize = FONT_SIZE_MEDIUM;
    else fontSize = FONT_SIZE_SMALL;

    var lineHeight = Math.round(fontSize * LINE_HEIGHT_MULTIPLIER);
    var font = fontSize + "px 'Press Start 2P', monospace";

    var lines = selectedMoods.map(function (m) {
      return username + " is feeling " + m.display;
    });

    var visibleLines;
    var moreCount = 0;
    if (lines.length > MAX_VISIBLE_LINES) {
      visibleLines = lines.slice(0, MAX_VISIBLE_LINES - 1);
      moreCount = lines.length - visibleLines.length;
    } else {
      visibleLines = lines;
    }

    var totalHeight = visibleLines.length * lineHeight + (moreCount > 0 ? lineHeight : 0);
    var startY;

    if (count <= 2) {
      startY = TEXT_AREA_Y + (TEXT_AREA_HEIGHT - totalHeight) / 2;
    } else {
      startY = TEXT_AREA_Y;
    }

    ctx.save();
    ctx.font = font;
    ctx.textBaseline = "top";
    ctx.shadowColor = TEXT_SHADOW_COLOR;
    ctx.shadowBlur = TEXT_SHADOW_BLUR;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = TEXT_COLOR;

    visibleLines.forEach(function (line, i) {
      ctx.fillText(line, TEXT_AREA_X, startY + i * lineHeight, TEXT_AREA_WIDTH);
    });

    if (moreCount > 0) {
      ctx.fillText(
        "...and " + moreCount + " more",
        TEXT_AREA_X,
        startY + visibleLines.length * lineHeight,
        TEXT_AREA_WIDTH
      );
    }

    ctx.restore();
  }

  // =========================================================================
  // Export: download + share
  // =========================================================================

  function buildFilename() {
    var now = new Date();
    var y = now.getFullYear();
    var mon = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"][now.getMonth()];
    var d = String(now.getDate()).padStart(2, "0");
    var h = String(now.getHours()).padStart(2, "0");
    var m = String(now.getMinutes()).padStart(2, "0");
    var s = String(now.getSeconds()).padStart(2, "0");
    var user = (settings.username || "user").toLowerCase().replace(/\s+/g, "-");
    return "moodlet-" + user + "-" + y + mon + d + "-" + h + m + s + ".png";
  }

  function downloadPNG() {
    var filename = buildFilename();
    canvas.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
  }

  async function sharePNG() {
    try {
      const blob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, "image/png");
      });
      const file = new File([blob], buildFilename(), { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "My Moodlet Status",
          files: [file],
        });
      } else {
        showToast("Sharing not supported on this device. Use Download instead.");
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        showToast("Sharing failed. Try downloading instead.");
      }
    }
  }

  function detectShareSupport() {
    try {
      var testBlob = new Blob(["test"], { type: "image/png" });
      var testFile = new File([testBlob], "test.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [testFile] })) {
        shareBtn.hidden = false;
        return;
      }
    } catch {}
    shareBtn.hidden = true;
  }

  // =========================================================================
  // Event binding
  // =========================================================================

  function bindEvents() {
    searchInput.addEventListener("input", function () {
      renderAllSections();
    });

    resetBtn.addEventListener("click", resetSelections);

    bgToggleBtn.addEventListener("click", function () {
      var open = bgPanel.hidden;
      bgPanel.hidden = !open;
      bgToggleBtn.classList.toggle("open", open);
    });
    bgColorApply.addEventListener("click", selectBgColor);
    bgUploadInput.addEventListener("change", handleBgUpload);

    customAddBtn.addEventListener("click", addCustomMood);

    customLabelInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") addCustomMood();
    });
    customEmojiInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") addCustomMood();
    });

    generateBtn.addEventListener("click", generate);
    downloadBtn.addEventListener("click", downloadPNG);
    shareBtn.addEventListener("click", sharePNG);
  }

  // =========================================================================
  // Start
  // =========================================================================

  document.addEventListener("DOMContentLoaded", init);
})();
