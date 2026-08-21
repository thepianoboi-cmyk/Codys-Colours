(function () {
  var ALL_CARDS = ["search", "detail", "convert", "extract", "palette", "favourites", "patterns"];
  var DEFAULT_MAIN_CARDS = ["detail"];
  var CARD_LABELS = {
    search: "Search",
    detail: "Selected Colour",
    convert: "Convert",
    extract: "Extract",
    palette: "Palette",
    favourites: "Favourites",
    patterns: "Patterns"
  };
  var GUIDE_SUFFIXES = ["CMYK", "TCX", "TPG", "TSX", "TPM", "XGC", "EC", "PC", "CP", "UP", "SP", "TN", "RGB", "C", "U", "M"];

  var state = {
    records: [],
    starterRecords: [],
    importedRecords: [],
    filtered: [],
    active: null,
    mode: "all",
    recents: [],
    favourites: [],
    patterns: [],
    patternSort: "recent",
    guideFilter: "all",
    activeView: "main",
    mainCards: DEFAULT_MAIN_CARDS.slice(),
    customize: false,
    scaleMode: "auto",
    palette: [],
    paletteName: "Codys Colours Palette",
    convertMatches: [],
    extracted: [],
    extractImageData: null,
    sample: null,
    pickActive: false,
    pickTimer: null,
    pickInitialSignature: "",
    pickBusy: false,
    pickKeepAliveTick: 0
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(message, isError) {
    els.status.textContent = message;
    els.status.className = isError ? "error" : "";
  }

  function resizePanelToContent() {
    try {
      if (window.__adobe_cep__ && window.__adobe_cep__.resizeContent) {
        window.__adobe_cep__.resizeContent(760, 760);
      }
    } catch (ignore) {}
  }

  function norm(value) {
    var text = String(value || "");
    try {
      text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (ignore) {}
    return text.toUpperCase()
      .replace(/[^A-Z0-9#]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "");
  }

  function compact(value) {
    return norm(value).replace(/\s+/g, "");
  }

  function numericPart(value) {
    var match = String(value || "").match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  function querySuffix(query) {
    var n = norm(query);
    var pieces = n.split(" ");
    var last = pieces[pieces.length - 1];
    for (var i = 0; i < GUIDE_SUFFIXES.length; i++) {
      if (last === GUIDE_SUFFIXES[i]) return GUIDE_SUFFIXES[i];
    }
    var c = compact(query);
    for (var j = 0; j < GUIDE_SUFFIXES.length; j++) {
      var suffix = GUIDE_SUFFIXES[j];
      if (c.length > suffix.length && c.slice(-suffix.length) === suffix && /\d/.test(c.slice(0, -suffix.length))) return suffix;
    }
    return "";
  }

  function exactMatch(record, query) {
    var q = compact(query);
    if (!q) return false;
    var hexRgb = hexQueryRgb(query);
    if (hexRgb && String(record.hex || "").toUpperCase() === hexFromRgb(hexRgb).toUpperCase()) return true;
    if (compact(record.name) === q || compact(record.sourceLabel) === q || compact(record.key) === q || compact(record.colorName) === q) return true;
    var i;
    for (i = 0; record.aliases && i < record.aliases.length; i++) {
      if (compact(record.aliases[i]) === q) return true;
    }
    for (i = 0; record.codes && i < record.codes.length; i++) {
      if (compact(record.codes[i]) === q) return true;
    }
    if (querySuffix(query)) return false;
    if (record.baseKey && compact(record.baseKey) === q) return true;
    return false;
  }

  function rank(record, query) {
    if (!query) return 1000;
    var qNorm = norm(query);
    var qCompact = compact(query);
    var suffix = querySuffix(query);
    var recordSearch = record.search || norm(record.name + " " + record.sourceLabel);
    if (exactMatch(record, query)) return 0;
    var hexRgb = hexQueryRgb(query);
    if (hexRgb) return 200 + labDistance(recordLab(record), rgbToLab(hexRgb));
    if (recordSearch.indexOf(qNorm) >= 0 || compact(recordSearch).indexOf(qCompact) >= 0) return 10;
    var queryNum = numericPart(qCompact);
    if (queryNum !== null && (!suffix || record.suffix === suffix)) {
      var best = 99999;
      for (var i = 0; i < record.codes.length; i++) {
        var recNum = numericPart(record.codes[i]);
        if (recNum !== null) best = Math.min(best, Math.abs(recNum - queryNum));
      }
      if (best <= 35) return 100 + best;
    }
    return 999999;
  }

  function comparisonDistance(record, rgb) {
    if (!record || !rgb) return null;
    return labDistance(recordLab(record), rgbToLab(rgb));
  }

  function exactRgbMatch(record, rgb) {
    if (!record || !rgb) return false;
    return String(record.hex || "").toUpperCase() === hexFromRgb(rgb).toUpperCase() ||
      (channel(record.r) === channel(rgb.r) && channel(record.g) === channel(rgb.g) && channel(record.b) === channel(rgb.b));
  }

  function colourRankScore(record, rgb) {
    var distance = comparisonDistance(record, rgb);
    if (distance === null) return 999999;
    if (exactRgbMatch(record, rgb)) return -1;
    return 200 + distance;
  }

  function filterRecords() {
    var query = els.search.value;
    var sampleRgb = hexQueryRgb(query) || (!query && state.sample ? state.sample : null);
    var ranked = [];
    for (var i = 0; i < state.records.length; i++) {
      var record = state.records[i];
      var score = sampleRgb ? colourRankScore(record, sampleRgb) : query ? rank(record, query) : i;
      var include = !query || score < 999999;
      if (state.guideFilter !== "all" && record.suffix !== state.guideFilter) include = false;
      if (state.mode === "exact") include = include && query && exactMatch(record, query);
      if (state.mode === "close") include = include && query && score >= 100 && score < 999999;
      if (include) ranked.push({ score: score, index: i, record: record });
    }
    ranked.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return a.record.name < b.record.name ? -1 : 1;
    });
    state.filtered = ranked.slice(0, 120).map(function (item) {
      item.record._score = item.score;
      return item.record;
    });
    if (sampleRgb || query || state.mode !== "all") {
      state.active = state.filtered[0] || null;
    } else if (!state.active || state.filtered.indexOf(state.active) < 0) {
      state.active = state.filtered[0] || null;
    }
  }

  function sourceBadge(record) {
    var source = String((record && (record.sourceSummary || record.previewSource || record.cmykSource)) || "").toLowerCase();
    if (record && record.imported) return "Imported";
    if (source.indexOf("starter") >= 0) return "Starter";
    if (record && record.suffix) return record.suffix;
    return "Library";
  }

  function resultRelation(record, index) {
    if (state.sample) {
      if (index === 0) return "Closest";
      if (exactRgbMatch(record, state.sample)) return "Exact";
      if (index < 10) return "Related";
      return "Suggested";
    }
    if (els.search && els.search.value && exactMatch(record, els.search.value)) return "Exact";
    if (state.mode === "close") return "Related";
    return sourceBadge(record);
  }

  function setResultsInfo(text) {
    if (els.resultsInfo) els.resultsInfo.textContent = text;
    if (els.detailResultsInfo) els.detailResultsInfo.textContent = text;
  }

  function resultContainers() {
    var containers = [];
    if (els.results) containers.push(els.results);
    if (els.detailResults) containers.push(els.detailResults);
    return containers;
  }

  function renderResults() {
    var html = "";
    var sample = state.sample;
    if (sample) setResultsInfo("Exact, closest, related, and suggested colours for " + sample.hex + ".");
    else if (els.search && els.search.value) setResultsInfo("Exact and related matches for the current search.");
    else setResultsInfo("Search or Pick a colour to show exact, closest, and suggested colours.");
    if (sample) {
      html += '<div class="result sampleResult">';
      html += '<i class="swatch" style="background:' + sample.hex + '"></i>';
      html += '<span><strong>' + escapeHtml(sample.label || "Selected colour") + '</strong>';
      html += '<span><span class="badge">Exact</span> ' + sample.hex + ' | RGB ' + rgbText(sample) + ' | CMYK ' + cmykText(sample.cmyk) + '</span></span>';
      html += '</div>';
    }
    if (!state.filtered.length) {
      var empty = '<div class="result"><div></div><div><strong>No matches</strong><span>Try a number, name, or hex value.</span></div></div>';
      var emptyContainers = resultContainers();
      for (var e = 0; e < emptyContainers.length; e++) emptyContainers[e].innerHTML = html + empty;
      if (els.detailResultsCount) els.detailResultsCount.textContent = sample ? "1 colour" : "0 colours";
      renderDetail();
      return;
    }
    for (var i = 0; i < state.filtered.length; i++) {
      var record = state.filtered[i];
      var active = state.active && state.active.key === record.key ? " active" : "";
      var badge = resultRelation(record, i);
      html += '<button class="result' + active + '" data-key="' + record.key + '">';
      html += '<i class="swatch" style="background:' + record.hex + '"></i>';
      html += '<span><strong>' + escapeHtml(record.name) + '</strong>';
      html += '<span><span class="badge">' + badge + '</span> ' + record.hex + ' | ' + resultDistanceText(record) + '</span></span>';
      html += '</button>';
    }
    var count = state.filtered.length + (sample ? 1 : 0);
    if (els.detailResultsCount) els.detailResultsCount.textContent = count + (count === 1 ? " colour" : " colours");
    var containers = resultContainers();
    for (var c = 0; c < containers.length; c++) {
      containers[c].innerHTML = html;
      var buttons = containers[c].querySelectorAll("button.result");
      for (var j = 0; j < buttons.length; j++) {
        buttons[j].onclick = function () {
          state.active = recordByKey(this.getAttribute("data-key"));
          renderAll();
        };
      }
    }
    renderDetail();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function displayName(record) {
    return record && record.name ? record.name : "Unnamed colour";
  }

  function recordByKey(key) {
    for (var i = 0; i < state.records.length; i++) {
      if (state.records[i].key === key) return state.records[i];
    }
    return null;
  }

  function recordByExactName(name) {
    var q = compact(name);
    if (!q) return null;
    for (var i = 0; i < state.records.length; i++) {
      var record = state.records[i];
      if (compact(record.name) === q || compact(record.sourceLabel) === q || compact(record.key) === q || compact(record.colorName) === q) return record;
      for (var a = 0; record.aliases && a < record.aliases.length; a++) {
        if (compact(record.aliases[a]) === q) return record;
      }
      for (var c = 0; record.codes && c < record.codes.length; c++) {
        if (compact(record.codes[c]) === q) return record;
      }
    }
    return null;
  }

  function hostResultOk(payload) {
    return payload && (payload.ok === true || payload.ok === "true");
  }

  function parseHostPayload(result) {
    try {
      return JSON.parse(result);
    } catch (err) {
      return null;
    }
  }

  function channel(value) {
    var num = Math.round(Number(value));
    if (isNaN(num)) return 0;
    return Math.max(0, Math.min(255, num));
  }

  function colourSignature(rgb) {
    if (!rgb) return "";
    var cmyk = normalizeCmyk(rgb.cmyk);
    return [
      rgb.spotName || "",
      rgb.colorModel || "",
      channel(rgb.r),
      channel(rgb.g),
      channel(rgb.b),
      cmyk ? cmykText(cmyk) : "",
      rgb.tint === undefined ? "" : String(rgb.tint)
    ].join("|");
  }

  function hostTextIsError(result) {
    var text = String(result || "").toLowerCase();
    return text.indexOf("could not") >= 0 || text.indexOf("unsupported") >= 0 || text.indexOf("blocked") >= 0;
  }

  function hexFromRgb(rgb) {
    function piece(value) {
      var text = channel(value).toString(16).toUpperCase();
      return text.length === 1 ? "0" + text : text;
    }
    return "#" + piece(rgb.r) + piece(rgb.g) + piece(rgb.b);
  }

  function cmykToRgb(cmyk) {
    var c = Math.max(0, Math.min(100, Number(cmyk.c))) / 100;
    var m = Math.max(0, Math.min(100, Number(cmyk.m))) / 100;
    var y = Math.max(0, Math.min(100, Number(cmyk.y))) / 100;
    var k = Math.max(0, Math.min(100, Number(cmyk.k))) / 100;
    return {
      r: Math.round(255 * (1 - c) * (1 - k)),
      g: Math.round(255 * (1 - m) * (1 - k)),
      b: Math.round(255 * (1 - y) * (1 - k))
    };
  }

  function roundValue(value, decimals) {
    var places = decimals === undefined ? 2 : decimals;
    var factor = Math.pow(10, places);
    var num = Number(value);
    if (isNaN(num)) return 0;
    return Math.round(num * factor) / factor;
  }

  function formatNumber(value) {
    var rounded = roundValue(value, 2);
    if (Math.abs(rounded - Math.round(rounded)) < 0.005) return String(Math.round(rounded));
    return String(rounded);
  }

  function normalizeCmyk(cmyk) {
    if (!cmyk) return null;
    return {
      c: roundValue(cmyk.c, 2),
      m: roundValue(cmyk.m, 2),
      y: roundValue(cmyk.y, 2),
      k: roundValue(cmyk.k, 2)
    };
  }

  function rgbToCmyk(rgb) {
    var r = channel(rgb.r) / 255;
    var g = channel(rgb.g) / 255;
    var b = channel(rgb.b) / 255;
    var k = 1 - Math.max(r, g, b);
    if (k >= 0.9999) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: roundValue(((1 - r - k) / (1 - k)) * 100, 2),
      m: roundValue(((1 - g - k) / (1 - k)) * 100, 2),
      y: roundValue(((1 - b - k) / (1 - k)) * 100, 2),
      k: roundValue(k * 100, 2)
    };
  }

  function normalizeLab(lab) {
    if (!lab) return null;
    return {
      l: roundValue(lab.l, 2),
      a: roundValue(lab.a, 2),
      b: roundValue(lab.b, 2)
    };
  }

  function rgbText(rgb) {
    if (!rgb) return "-";
    return channel(rgb.r) + "/" + channel(rgb.g) + "/" + channel(rgb.b);
  }

  function cmykText(cmyk) {
    var value = normalizeCmyk(cmyk);
    if (!value) return "-";
    return formatNumber(value.c) + "/" + formatNumber(value.m) + "/" + formatNumber(value.y) + "/" + formatNumber(value.k);
  }

  function labObjectText(lab) {
    var value = normalizeLab(lab);
    if (!value) return "-";
    return formatNumber(value.l) + " / " + formatNumber(value.a) + " / " + formatNumber(value.b);
  }

  function sampleSourceText(sample) {
    if (!sample) return "-";
    var parts = [];
    if (sample.spotName) parts.push(sample.spotName);
    parts.push(sample.colorModel || "RGB");
    if (sample.tint !== undefined && Number(sample.tint) < 99.95) parts.push(formatNumber(sample.tint) + "% tint");
    if (sample.cmykSource) parts.push(sample.cmykSource);
    return parts.join(" | ");
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function srgbToLinear(value) {
    var c = channel(value) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function rgbToLab(rgb) {
    var r = srgbToLinear(rgb.r);
    var g = srgbToLinear(rgb.g);
    var b = srgbToLinear(rgb.b);
    var x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    var y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
    var z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    function f(t) {
      return t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + (16 / 116);
    }
    var fx = f(x);
    var fy = f(y);
    var fz = f(z);
    return {
      l: (116 * fy) - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz)
    };
  }

  function recordLab(record) {
    if (record && record.lab) return {
      l: Number(record.lab.l),
      a: Number(record.lab.a),
      b: Number(record.lab.b)
    };
    return rgbToLab(record || { r: 0, g: 0, b: 0 });
  }

  function labDistance(a, b) {
    var dl = Number(a.l) - Number(b.l);
    var da = Number(a.a) - Number(b.a);
    var db = Number(a.b) - Number(b.b);
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  function labText(record) {
    var lab = recordLab(record);
    return Math.round(lab.l * 10) / 10 + " / " + Math.round(lab.a * 10) / 10 + " / " + Math.round(lab.b * 10) / 10;
  }

  function luminance(rgb) {
    return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
  }

  function contrastRatio(foreground, background) {
    var a = luminance(foreground);
    var b = luminance(background);
    var light = Math.max(a, b);
    var dark = Math.min(a, b);
    return (light + 0.05) / (dark + 0.05);
  }

  function contrastLabel(ratio) {
    if (ratio >= 7) return "AAA";
    if (ratio >= 4.5) return "AA";
    if (ratio >= 3) return "Large";
    return "Low";
  }

  function setSampleFromRgb(rgb, label) {
    if (!rgb) {
      state.sample = null;
      return;
    }
    var sampledRgb = {
      r: channel(rgb.r),
      g: channel(rgb.g),
      b: channel(rgb.b)
    };
    var cmyk = normalizeCmyk(rgb.cmyk) || rgbToCmyk(sampledRgb);
    var lab = normalizeLab(rgb.lab) || rgbToLab(sampledRgb);
    state.sample = {
      r: sampledRgb.r,
      g: sampledRgb.g,
      b: sampledRgb.b,
      hex: hexFromRgb(sampledRgb),
      cmyk: cmyk,
      cmykSource: rgb.cmykSource || (rgb.cmyk ? "Adobe host colour" : "RGB approximation"),
      lab: lab,
      labSource: rgb.labSource || (rgb.lab ? "Adobe host colour" : "sRGB calculation"),
      colorModel: rgb.colorModel || "RGB",
      colorSource: rgb.colorSource || "Picked colour",
      spotName: rgb.spotName || "",
      tint: rgb.tint,
      label: label || "Selected colour"
    };
  }

  function formatDelta(distance) {
    if (distance === null || distance === undefined || isNaN(distance)) return "No comparison";
    if (distance < 0) return "Exact RGB";
    if (distance < 0.05) return "Exact RGB";
    return "Delta " + (Math.round(distance * 10) / 10);
  }

  function sampleDelta(record) {
    if (!state.sample || !record) return null;
    return exactRgbMatch(record, state.sample) ? -1 : comparisonDistance(record, state.sample);
  }

  function resultDistanceText(record) {
    if (state.sample) return formatDelta(sampleDelta(record)) + " | CMYK " + record.c + "/" + record.m + "/" + record.y + "/" + record.k;
    return "CMYK " + record.c + "/" + record.m + "/" + record.y + "/" + record.k;
  }

  function renderComparison(record) {
    if (!els.sampleChip || !els.matchChip) return;
    if (state.sample) {
      els.sampleChip.style.background = state.sample.hex;
      els.sampleLabel.textContent = state.sample.label || "Selected colour";
      els.sampleHex.textContent = state.sample.hex;
      setText(els.sampleStatRgb, rgbText(state.sample));
      setText(els.sampleStatCmyk, cmykText(state.sample.cmyk));
      setText(els.sampleStatLab, labObjectText(state.sample.lab));
      setText(els.sampleStatSource, sampleSourceText(state.sample));
    } else {
      els.sampleChip.style.background = "";
      els.sampleLabel.textContent = "No sample";
      els.sampleHex.textContent = "Pick, Find, Extract, or search a hex colour.";
      setText(els.sampleStatRgb, "-");
      setText(els.sampleStatCmyk, "-");
      setText(els.sampleStatLab, "-");
      setText(els.sampleStatSource, "-");
    }
    if (record) {
      els.matchChip.style.background = record.hex;
      els.matchLabel.textContent = displayName(record);
      els.matchDelta.textContent = state.sample ? formatDelta(sampleDelta(record)) + " | " + record.hex : record.hex + " | " + sourceBadge(record);
      setText(els.matchStatRgb, rgbText(record));
      setText(els.matchStatCmyk, cmykText(record));
      setText(els.matchStatLab, labText(record));
      setText(els.matchStatSource, state.sample ? formatDelta(sampleDelta(record)) : sourceBadge(record));
    } else {
      els.matchChip.style.background = "";
      els.matchLabel.textContent = "No match selected";
      els.matchDelta.textContent = "Closest library colours will appear in Search.";
      setText(els.matchStatRgb, "-");
      setText(els.matchStatCmyk, "-");
      setText(els.matchStatLab, "-");
      setText(els.matchStatSource, "-");
    }
  }

  function renderDetail() {
    var record = state.active;
    if (!record) {
      els.chip.style.background = "";
      els.detailName.textContent = "No colour selected";
      els.detailMeta.textContent = "Search by number, name, or hex.";
      els.detailHex.textContent = "-";
      els.detailCmyk.textContent = "-";
      els.detailLab.textContent = "-";
      els.detailSource.textContent = "-";
      renderComparison(null);
      if (els.toggleFavourite) {
        els.toggleFavourite.textContent = "☆ Favourite";
        els.toggleFavourite.className = "starButton";
      }
      return;
    }
    els.chip.style.background = record.hex;
    els.detailName.textContent = record.name;
    els.detailMeta.textContent = record.sourceLabel + " | " + sourceBadge(record);
    els.detailHex.textContent = record.hex + " RGB " + record.r + "/" + record.g + "/" + record.b;
    els.detailCmyk.textContent = record.c + "/" + record.m + "/" + record.y + "/" + record.k;
    els.detailLab.textContent = labText(record);
    els.detailSource.textContent = record.sourceSummary;
    renderComparison(record);
    if (els.toggleFavourite) {
      var fav = isFavourite(record);
      els.toggleFavourite.textContent = (fav ? "★ Favourite" : "☆ Favourite");
      els.toggleFavourite.className = fav ? "starButton active" : "starButton";
    }
  }

  function loadList(name) {
    try {
      return JSON.parse(localStorage.getItem(name) || "[]");
    } catch (err) {
      return [];
    }
  }

  function saveList(name, list) {
    localStorage.setItem(name, JSON.stringify(list.slice(0, 24)));
  }

  function textValue(value) {
    return value === undefined || value === null ? "" : String(value).replace(/^\s+|\s+$/g, "");
  }

  function normalizedFieldMap(raw) {
    var map = {};
    for (var key in raw) {
      if (raw.hasOwnProperty(key)) map[compact(key)] = raw[key];
    }
    return map;
  }

  function fieldValue(raw, names) {
    var map = normalizedFieldMap(raw || {});
    for (var i = 0; i < names.length; i++) {
      var direct = raw[names[i]];
      if (direct !== undefined && direct !== null && textValue(direct) !== "") return textValue(direct);
      var mapped = map[compact(names[i])];
      if (mapped !== undefined && mapped !== null && textValue(mapped) !== "") return textValue(mapped);
    }
    return "";
  }

  function firstTextField(raw) {
    var skip = {
      HEX: true,
      HTML: true,
      RGB: true,
      R: true,
      RED: true,
      G: true,
      GREEN: true,
      B: true,
      BLUE: true,
      CMYK: true,
      C: true,
      CYAN: true,
      M: true,
      MAGENTA: true,
      Y: true,
      YELLOW: true,
      K: true,
      BLACK: true,
      LAB: true,
      L: true,
      A: true,
      SOURCE: true,
      GUIDE: true
    };
    for (var key in raw) {
      if (!raw.hasOwnProperty(key)) continue;
      var compactKey = compact(key);
      var value = textValue(raw[key]);
      if (!value || skip[compactKey] || parseHex(value)) continue;
      return value;
    }
    return "";
  }

  function scanHex(raw) {
    for (var key in raw) {
      if (!raw.hasOwnProperty(key)) continue;
      var rgb = parseHex(raw[key]);
      if (rgb) return rgb;
    }
    return null;
  }

  function parseRgbFields(raw) {
    var rgbTextValue = fieldValue(raw, ["rgb"]);
    var nums = numberList(rgbTextValue);
    if (nums.length >= 3) return { r: nums[0], g: nums[1], b: nums[2] };
    var r = fieldValue(raw, ["r", "red"]);
    var g = fieldValue(raw, ["g", "green"]);
    var b = fieldValue(raw, ["b", "blue"]);
    if (r !== "" && g !== "" && b !== "") return { r: Number(r), g: Number(g), b: Number(b) };
    return null;
  }

  function parseCmykFields(raw) {
    var cmykTextValue = fieldValue(raw, ["cmyk"]);
    var nums = numberList(cmykTextValue);
    if (nums.length >= 4) return normalizeCmyk({ c: nums[0], m: nums[1], y: nums[2], k: nums[3] });
    var c = fieldValue(raw, ["c", "cyan"]);
    var m = fieldValue(raw, ["m", "magenta"]);
    var y = fieldValue(raw, ["y", "yellow"]);
    var k = fieldValue(raw, ["k", "black"]);
    if (c !== "" && m !== "" && y !== "" && k !== "") return normalizeCmyk({ c: c, m: m, y: y, k: k });
    return null;
  }

  function parseLabFields(raw) {
    if (raw && raw.lab && typeof raw.lab === "object") return normalizeLab(raw.lab);
    var labTextValue = fieldValue(raw, ["lab", "l a b"]);
    var nums = numberList(labTextValue);
    if (nums.length >= 3) return normalizeLab({ l: nums[0], a: nums[1], b: nums[2] });
    var l = fieldValue(raw, ["l", "lightness"]);
    var a = fieldValue(raw, ["a"]);
    var b = fieldValue(raw, ["lab b"]);
    if (l !== "" && a !== "" && b !== "") return normalizeLab({ l: l, a: a, b: b });
    return null;
  }

  function slug(value) {
    var text = compact(value).toLowerCase();
    return text || "colour";
  }

  function inferredSuffix(name, raw) {
    var suffix = fieldValue(raw, ["suffix", "finish", "book", "library"]);
    if (suffix) return compact(suffix).slice(0, 12);
    var parts = norm(name).split(" ");
    var last = parts[parts.length - 1] || "";
    return last.length <= 4 && /^[A-Z]+$/.test(last) ? last : "";
  }

  function importedRecord(raw, index, fallbackSource) {
    raw = raw || {};
    var name = fieldValue(raw, ["name", "colour", "color", "code", "swatch", "label"]) || firstTextField(raw);
    var source = fieldValue(raw, ["source", "source summary", "source label", "guide", "library", "file"]) || fallbackSource || "Imported library";
    var rgb = parseRgbFields(raw) || scanHex(raw);
    var cmyk = parseCmykFields(raw);
    if (!rgb && cmyk) rgb = cmykToRgb(cmyk);
    if (!rgb) return null;
    rgb = { r: channel(rgb.r), g: channel(rgb.g), b: channel(rgb.b) };
    var hex = hexFromRgb(rgb);
    if (!name) name = hex;
    var lab = parseLabFields(raw) || rgbToLab(rgb);
    var suffix = inferredSuffix(name, raw);
    var code = fieldValue(raw, ["code", "id", "number"]);
    var aliases = [];
    var aliasText = fieldValue(raw, ["alias", "aliases", "alternate", "alternative"]);
    if (aliasText) aliases = aliasText.split(/[|;,]+/);
    var codes = [name, code, suffix, hex].concat(aliases);
    var cleanCodes = [];
    for (var i = 0; i < codes.length; i++) {
      var codeText = textValue(codes[i]);
      if (codeText && cleanCodes.indexOf(codeText) < 0) cleanCodes.push(codeText);
    }
    var record = {
      key: fieldValue(raw, ["key"]) || "imported-" + slug(source + "-" + name + "-" + hex) + "-" + index,
      name: name,
      sourceLabel: name,
      hex: hex,
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      c: cmyk ? cmyk.c : rgbToCmyk(rgb).c,
      m: cmyk ? cmyk.m : rgbToCmyk(rgb).m,
      y: cmyk ? cmyk.y : rgbToCmyk(rgb).y,
      k: cmyk ? cmyk.k : rgbToCmyk(rgb).k,
      lab: lab,
      suffix: suffix,
      baseKey: slug(name),
      codes: cleanCodes,
      aliases: aliases,
      sources: [source],
      sourceSummary: source,
      previewSource: source,
      cmykSource: cmyk ? source : "RGB approximation",
      imported: true
    };
    record.search = norm([record.name, record.sourceLabel, record.hex, source, record.suffix, cleanCodes.join(" ")].join(" "));
    return record;
  }

  function normalizeLibraryRecords(records, fallbackSource, imported) {
    var out = [];
    records = records || [];
    for (var i = 0; i < records.length; i++) {
      var record = importedRecord(records[i], i, fallbackSource);
      if (!record) continue;
      if (!imported) record.imported = false;
      out.push(record);
    }
    return out;
  }

  function mergeRecords(base, imported) {
    var seen = {};
    var out = [];
    var all = (base || []).concat(imported || []);
    for (var i = 0; i < all.length; i++) {
      var record = all[i];
      var id = compact((record.name || "") + " " + (record.hex || "") + " " + (record.sourceSummary || ""));
      if (seen[id]) continue;
      seen[id] = true;
      out.push(record);
    }
    return out;
  }

  function loadImportedRecords() {
    try {
      var parsed = JSON.parse(localStorage.getItem("sca.importedRecords") || "[]");
      return normalizeLibraryRecords(parsed || [], "Imported library", true);
    } catch (err) {
      return [];
    }
  }

  function saveImportedRecords() {
    localStorage.setItem("sca.importedRecords", JSON.stringify(state.importedRecords.slice(0, 50000)));
  }

  function csvRows(text) {
    var rows = [];
    var row = [];
    var field = "";
    var quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quoted) {
        if (ch === '"' && text.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch !== "\r") {
        field += ch;
      }
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  function parseCsvRecords(text) {
    var rows = csvRows(text || "");
    while (rows.length && rows[0].join("").replace(/\s+/g, "") === "") rows.shift();
    if (!rows.length) return [];
    var headers = rows.shift();
    var records = [];
    for (var r = 0; r < rows.length; r++) {
      var values = rows[r];
      if (!values.join("").replace(/\s+/g, "")) continue;
      var record = {};
      for (var c = 0; c < headers.length; c++) {
        record[textValue(headers[c]) || ("Column " + (c + 1))] = values[c] || "";
      }
      records.push(record);
    }
    return records;
  }

  function parseImportedPayload(text, fileName) {
    var lower = String(fileName || "").toLowerCase();
    if (lower.slice(-5) === ".json" || /^\s*[\[{]/.test(text)) {
      var parsed = JSON.parse(text);
      if (parsed && parsed.records) return parsed.records;
      if (parsed instanceof Array) return parsed;
      throw new Error("JSON must be an array or an object with a records array.");
    }
    return parseCsvRecords(text);
  }

  function refreshLibrarySummary() {
    var importedCount = state.importedRecords.length;
    var starterCount = state.starterRecords.length;
    var total = state.records.length;
    els.sourceSummary.textContent = total + " colours loaded. " + importedCount + " imported, " + starterCount + " starter.";
    els.notice.textContent = state.libraryNotice || "Import only CSV or JSON colour libraries you are authorised to use.";
  }

  function importLibraryFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
      try {
        var raw = parseImportedPayload(evt.target.result || "", file.name || "Imported library");
        var records = normalizeLibraryRecords(raw, file.name || "Imported library", true);
        if (!records.length) {
          setStatus("No usable colours found in that file. Include at least a name plus hex/RGB/CMYK columns.", true);
          return;
        }
        state.importedRecords = mergeRecords(state.importedRecords, records);
        state.records = mergeRecords(state.starterRecords, state.importedRecords);
        saveImportedRecords();
        refreshLibrarySummary();
        filterRecords();
        renderAll();
        setStatus("Imported " + records.length + " colours from " + (file.name || "file") + ".");
      } catch (err) {
        setStatus("Could not import that library: " + err.message, true);
      }
    };
    reader.onerror = function () {
      setStatus("Could not read that library file.", true);
    };
    reader.readAsText(file);
  }

  function clearImportedLibrary() {
    if (!state.importedRecords.length) {
      setStatus("No imported colours to clear.");
      return;
    }
    state.importedRecords = [];
    state.records = state.starterRecords.slice();
    saveImportedRecords();
    refreshLibrarySummary();
    filterRecords();
    renderAll();
    setStatus("Cleared imported colour libraries. Starter colours remain.");
  }

  function pushUnique(list, key) {
    var out = [key];
    for (var i = 0; i < list.length; i++) {
      if (list[i] !== key) out.push(list[i]);
    }
    return out.slice(0, 24);
  }

  function listHas(list, key) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === key) return true;
    }
    return false;
  }

  function removeKey(list, key) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] !== key) out.push(list[i]);
    }
    return out;
  }

  function validCardList(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (ALL_CARDS.indexOf(list[i]) >= 0 && out.indexOf(list[i]) < 0) out.push(list[i]);
    }
    var detailIndex = out.indexOf("detail");
    var searchIndex = out.indexOf("search");
    if (detailIndex > searchIndex && searchIndex >= 0) {
      out.splice(detailIndex, 1);
      out.splice(searchIndex, 0, "detail");
    }
    return out;
  }

  function loadMainCards() {
    try {
      var saved = localStorage.getItem("sca.mainCards");
      if (!saved) return DEFAULT_MAIN_CARDS.slice();
      var cards = validCardList(JSON.parse(saved));
      if (cards.length === 2 && cards.indexOf("detail") >= 0 && cards.indexOf("search") >= 0) return DEFAULT_MAIN_CARDS.slice();
      return cards.length ? cards : DEFAULT_MAIN_CARDS.slice();
    } catch (err) {
      return DEFAULT_MAIN_CARDS.slice();
    }
  }

  function saveMainCards() {
    localStorage.setItem("sca.mainCards", JSON.stringify(state.mainCards));
  }

  function saveFavourites() {
    saveList("sca.favourites", state.favourites);
  }

  function isFavourite(record) {
    return !!(record && listHas(state.favourites, record.key));
  }

  function toggleFavourite(record) {
    if (!record) return false;
    if (isFavourite(record)) {
      state.favourites = removeKey(state.favourites, record.key);
      saveFavourites();
      return false;
    }
    state.favourites = pushUnique(state.favourites, record.key);
    saveFavourites();
    remember(record);
    recordPattern(record, "Favourite");
    return true;
  }

  function loadPalette() {
    try {
      var parsed = JSON.parse(localStorage.getItem("sca.palette") || "[]");
      return parsed && parsed.length ? parsed.slice(0, 96) : [];
    } catch (err) {
      return [];
    }
  }

  function savePalette() {
    localStorage.setItem("sca.palette", JSON.stringify(state.palette.slice(0, 96)));
    localStorage.setItem("sca.paletteName", state.paletteName || "Codys Colours Palette");
  }

  function paletteRecords() {
    var records = [];
    for (var i = 0; i < state.palette.length; i++) {
      var record = recordByKey(state.palette[i]);
      if (record) records.push(record);
    }
    return records;
  }

  function addToPalette(record) {
    if (!record) return;
    state.palette = pushUnique(state.palette, record.key).slice(0, 96);
    savePalette();
    remember(record);
    recordPattern(record, "Palette");
    renderPalette();
  }

  function addRecordsToPalette(records) {
    for (var i = records.length - 1; i >= 0; i--) {
      if (records[i]) state.palette = pushUnique(state.palette, records[i].key).slice(0, 96);
    }
    savePalette();
    renderPalette();
  }

  function removeFromPalette(key) {
    var next = [];
    for (var i = 0; i < state.palette.length; i++) {
      if (state.palette[i] !== key) next.push(state.palette[i]);
    }
    state.palette = next;
    savePalette();
    renderPalette();
  }

  function simulateVision(rgb, type) {
    var matrices = {
      protan: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
      deutan: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
      tritan: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525]
    };
    var m = matrices[type];
    return {
      r: channel(rgb.r * m[0] + rgb.g * m[1] + rgb.b * m[2]),
      g: channel(rgb.r * m[3] + rgb.g * m[4] + rgb.b * m[5]),
      b: channel(rgb.r * m[6] + rgb.g * m[7] + rgb.b * m[8])
    };
  }

  function renderAccessibility() {
    if (!els.accessibilityPreview) return;
    var records = paletteRecords();
    var base = records[0] || state.active;
    if (!base) {
      els.accessibilityPreview.innerHTML = '<span class="muted">No colour selected</span>';
      return;
    }
    var rgb = { r: base.r, g: base.g, b: base.b };
    var whiteRatio = contrastRatio(rgb, { r: 255, g: 255, b: 255 });
    var blackRatio = contrastRatio(rgb, { r: 0, g: 0, b: 0 });
    var pairHtml = "";
    if (records.length > 1) {
      var pair = records[1];
      var pairRatio = contrastRatio(rgb, { r: pair.r, g: pair.g, b: pair.b });
      pairHtml = '<div class="contrastCard" style="background:' + base.hex + ';color:' + pair.hex + '"><strong>' + Math.round(pairRatio * 10) / 10 + ':1</strong><span>' + contrastLabel(pairRatio) + ' pair</span></div>';
    } else {
      var protan = hexFromRgb(simulateVision(rgb, "protan"));
      var deutan = hexFromRgb(simulateVision(rgb, "deutan"));
      var tritan = hexFromRgb(simulateVision(rgb, "tritan"));
      pairHtml = '<div class="contrastCard"><strong>Vision</strong><span class="visionRow"><i class="visionDot" style="background:' + protan + '"></i><i class="visionDot" style="background:' + deutan + '"></i><i class="visionDot" style="background:' + tritan + '"></i></span></div>';
    }
    els.accessibilityPreview.innerHTML =
      '<div class="contrastCard" style="background:' + base.hex + ';color:#fff"><strong>' + Math.round(whiteRatio * 10) / 10 + ':1</strong><span>' + contrastLabel(whiteRatio) + ' on white</span></div>' +
      '<div class="contrastCard" style="background:' + base.hex + ';color:#000"><strong>' + Math.round(blackRatio * 10) / 10 + ':1</strong><span>' + contrastLabel(blackRatio) + ' on black</span></div>' +
      pairHtml;
  }

  function renderPalette() {
    if (!els.paletteList) return;
    var records = paletteRecords();
    els.paletteCount.textContent = records.length + (records.length === 1 ? " colour" : " colours");
    els.paletteName.value = state.paletteName || "Codys Colours Palette";
    var strip = "";
    var list = "";
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      strip += '<button data-key="' + record.key + '" style="background:' + record.hex + '" data-tip="' + escapeHtml(record.name) + '"></button>';
      list += '<button class="paletteItem" data-key="' + record.key + '">';
      list += '<i style="background:' + record.hex + '"></i>';
      list += '<span><strong>' + escapeHtml(displayName(record)) + '</strong><span>' + record.hex + ' | ' + sourceBadge(record) + '</span></span>';
      list += '<b class="removePalette" data-remove="' + record.key + '">x</b>';
      list += '</button>';
    }
    els.paletteStrip.innerHTML = strip || '<span class="muted">Empty</span>';
    els.paletteList.innerHTML = list || '<span class="muted">Add colours from search, pick, convert, or extract.</span>';
    var stripButtons = els.paletteStrip.querySelectorAll("button");
    for (var s = 0; s < stripButtons.length; s++) {
      stripButtons[s].onclick = function () {
        state.active = recordByKey(this.getAttribute("data-key"));
        renderAll();
      };
    }
    var items = els.paletteList.querySelectorAll(".paletteItem");
    for (var j = 0; j < items.length; j++) {
      items[j].onclick = function (evt) {
        var removeKey = evt.target.getAttribute("data-remove");
        if (removeKey) {
          removeFromPalette(removeKey);
          return;
        }
        state.active = recordByKey(this.getAttribute("data-key"));
        renderAll();
      };
    }
    renderAccessibility();
  }

  function loadPatterns() {
    try {
      var parsed = JSON.parse(localStorage.getItem("sca.patterns") || "[]");
      return parsed && parsed.length ? parsed.slice(0, 120) : [];
    } catch (err) {
      return [];
    }
  }

  function savePatterns() {
    localStorage.setItem("sca.patterns", JSON.stringify(state.patterns.slice(0, 120)));
  }

  function recordPattern(record, action) {
    if (!record) return;
    var now = new Date().getTime();
    var next = [];
    var found = false;
    for (var i = 0; i < state.patterns.length; i++) {
      var item = state.patterns[i];
      if (item.type === "colour" && item.key === record.key) {
        item.name = record.name;
        item.hex = record.hex;
        item.suffix = record.suffix || "";
        item.source = sourceBadge(record);
        item.cmyk = record.c + "/" + record.m + "/" + record.y + "/" + record.k;
        item.count = (item.count || 0) + 1;
        item.lastUsed = now;
        item.action = action || item.action || "Used";
        found = true;
      }
      next.push(item);
    }
    if (!found) {
      next.unshift({
        type: "colour",
        key: record.key,
        name: record.name,
        hex: record.hex,
        suffix: record.suffix || "",
        source: sourceBadge(record),
        cmyk: record.c + "/" + record.m + "/" + record.y + "/" + record.k,
        count: 1,
        firstUsed: now,
        lastUsed: now,
        action: action || "Used"
      });
    }
    next.sort(function (a, b) { return (b.lastUsed || 0) - (a.lastUsed || 0); });
    state.patterns = next.slice(0, 120);
    savePatterns();
    renderPatternList();
  }

  function importDocumentPatterns(patterns) {
    var now = new Date().getTime();
    var map = {};
    for (var i = 0; i < state.patterns.length; i++) {
      var existing = state.patterns[i];
      map[(existing.type || "colour") + ":" + (existing.key || existing.name)] = existing;
    }
    var added = 0;
    for (var j = 0; j < patterns.length; j++) {
      var name = patterns[j].name || "";
      if (!name) continue;
      var id = "documentPattern:" + name;
      if (!map[id]) {
        map[id] = {
          type: "documentPattern",
          name: name,
          count: 1,
          firstUsed: now,
          lastUsed: now,
          source: "Illustrator Pattern"
        };
        added++;
      } else {
        map[id].lastUsed = now;
        map[id].count = (map[id].count || 0) + 1;
      }
    }
    var next = [];
    for (var key in map) {
      if (map.hasOwnProperty(key)) next.push(map[key]);
    }
    next.sort(function (a, b) { return (b.lastUsed || 0) - (a.lastUsed || 0); });
    state.patterns = next.slice(0, 120);
    savePatterns();
    renderPatternList();
    return added;
  }

  function rgbToHue(record) {
    if (!record) return 999;
    var r = (record.r || 0) / 255;
    var g = (record.g || 0) / 255;
    var b = (record.b || 0) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var delta = max - min;
    if (!delta) return 0;
    var hue;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    return Math.round(hue * 60 + 360) % 360;
  }

  function sortedPatterns() {
    var list = state.patterns.slice();
    list.sort(function (a, b) {
      if (state.patternSort === "count") return (b.count || 0) - (a.count || 0) || String(a.name).localeCompare(String(b.name));
      if (state.patternSort === "name") return String(a.name).localeCompare(String(b.name));
      if (state.patternSort === "suffix") return String(a.suffix || a.source || "").localeCompare(String(b.suffix || b.source || "")) || String(a.name).localeCompare(String(b.name));
      if (state.patternSort === "hue") return rgbToHue(recordByKey(a.key)) - rgbToHue(recordByKey(b.key)) || String(a.name).localeCompare(String(b.name));
      return (b.lastUsed || 0) - (a.lastUsed || 0);
    });
    return list;
  }

  function renderPatternList() {
    if (!els.patternList) return;
    var list = sortedPatterns();
    if (!list.length) {
      els.patternList.innerHTML = '<span class="muted">No saved patterns yet</span>';
      return;
    }
    var html = "";
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var record = recordByKey(item.key);
      var hex = item.hex || (record && record.hex) || "#ffffff";
      var name = item.name || (record && record.name) || "Pattern";
      var meta = item.source || (record && sourceBadge(record)) || "Pattern";
      if (item.cmyk) meta += " | CMYK " + item.cmyk;
      var dataKey = item.key ? ' data-key="' + escapeHtml(item.key) + '"' : "";
      html += '<button class="patternItem"' + dataKey + ' data-index="' + i + '">';
      html += '<i class="patternSwatch" style="background:' + hex + '"></i>';
      html += '<span><span class="patternName">' + escapeHtml(name) + '</span>';
      html += '<span class="patternMeta">' + escapeHtml(meta) + '</span></span>';
      html += '<span class="patternCount">' + (item.count || 1) + 'x</span>';
      html += '</button>';
    }
    els.patternList.innerHTML = html;
    var buttons = els.patternList.querySelectorAll(".patternItem");
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].onclick = function () {
        var key = this.getAttribute("data-key");
        var record = key ? recordByKey(key) : null;
        if (record) {
          state.active = record;
          els.search.value = record.name;
          filterRecords();
          renderAll();
        } else {
          var item = sortedPatterns()[parseInt(this.getAttribute("data-index"), 10)];
          els.search.value = item && item.name ? item.name : "";
          filterRecords();
          renderAll();
        }
      };
    }
  }

  function patternCopyText() {
    var rows = ["Name\tHex\tCMYK\tSource\tUses"];
    var list = sortedPatterns();
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var record = recordByKey(item.key);
      rows.push([
        item.name || (record && record.name) || "",
        item.hex || (record && record.hex) || "",
        item.cmyk || (record ? record.c + "/" + record.m + "/" + record.y + "/" + record.k : ""),
        item.source || (record && sourceBadge(record)) || "",
        item.count || 1
      ].join("\t"));
    }
    return rows.join("\n");
  }

  function paletteCopyText() {
    var rows = ["Palette\tName\tHex\tRGB\tCMYK\tLab\tSource"];
    var records = paletteRecords();
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      rows.push([
        state.paletteName || "Codys Colours Palette",
        record.name,
        record.hex,
        record.r + "/" + record.g + "/" + record.b,
        record.c + "/" + record.m + "/" + record.y + "/" + record.k,
        labText(record),
        record.sourceSummary
      ].join("\t"));
    }
    return rows.join("\n");
  }

  function exportPalettePng() {
    var records = paletteRecords();
    if (!records.length) {
      setStatus("Add colours to the palette before exporting.", true);
      return;
    }
    var canvas = document.createElement("canvas");
    var width = 960;
    var rowHeight = 72;
    var header = 92;
    canvas.width = width;
    canvas.height = header + rowHeight * records.length + 34;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f7f7f4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#202224";
    ctx.font = "700 30px Arial, sans-serif";
    ctx.fillText(state.paletteName || "Codys Colours Palette", 36, 48);
    ctx.font = "14px Arial, sans-serif";
    ctx.fillStyle = "#60656c";
    ctx.fillText(records.length + " colours | Codys Colours", 36, 72);
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      var y = header + rowHeight * i;
      ctx.fillStyle = record.hex;
      ctx.fillRect(36, y, 96, 48);
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.strokeRect(36, y, 96, 48);
      ctx.fillStyle = "#202224";
      ctx.font = "700 18px Arial, sans-serif";
      ctx.fillText(record.name, 154, y + 18);
      ctx.font = "14px Arial, sans-serif";
      ctx.fillStyle = "#60656c";
      ctx.fillText(record.hex + " | RGB " + record.r + "/" + record.g + "/" + record.b + " | CMYK " + record.c + "/" + record.m + "/" + record.y + "/" + record.k + " | Lab " + labText(record), 154, y + 42);
    }
    var link = document.createElement("a");
    link.download = (state.paletteName || "codys-colours-palette").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() + ".png";
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatus("Exported palette PNG.");
  }

  function numberList(value) {
    var matches = String(value || "").match(/-?\d+(?:\.\d+)?/g);
    var out = [];
    if (!matches) return out;
    for (var i = 0; i < matches.length; i++) out.push(Number(matches[i]));
    return out;
  }

  function parseHex(value) {
    var match = String(value || "").match(/#?([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i);
    if (!match) return null;
    var hex = match[1];
    if (hex.length === 3) hex = hex.replace(/(.)/g, "$1$1");
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function hexQueryRgb(value) {
    var text = String(value || "");
    if (text.indexOf("#") < 0 && !/^\s*[0-9a-f]{6}\s*$/i.test(text)) return null;
    return parseHex(text);
  }

  function parseConvertInput(mode, value) {
    var nums = numberList(value);
    if (mode === "hex") {
      var hex = parseHex(value);
      if (!hex) return null;
      return { type: "rgb", rgb: hex };
    }
    if (mode === "rgb" && nums.length >= 3) {
      return { type: "rgb", rgb: { r: nums[0], g: nums[1], b: nums[2] } };
    }
    if (mode === "cmyk" && nums.length >= 4) {
      return { type: "rgb", rgb: cmykToRgb({ c: nums[0], m: nums[1], y: nums[2], k: nums[3] }) };
    }
    if (mode === "lab" && nums.length >= 3) {
      return { type: "lab", lab: { l: nums[0], a: nums[1], b: nums[2] } };
    }
    return null;
  }

  function nearestToLab(lab) {
    var scored = [];
    for (var i = 0; i < state.records.length; i++) {
      var record = state.records[i];
      if (state.guideFilter !== "all" && record.suffix !== state.guideFilter) continue;
      scored.push({ distance: labDistance(recordLab(record), lab), record: record });
    }
    scored.sort(function (a, b) { return a.distance - b.distance; });
    return scored.slice(0, 8);
  }

  function renderMatchList(container, matches, className) {
    if (!container) return;
    var html = "";
    for (var i = 0; i < matches.length; i++) {
      var match = matches[i];
      var record = match.record;
      var metric = match.metric || formatDelta(match.distance);
      html += '<button class="' + className + '" data-key="' + record.key + '">';
      html += '<i style="background:' + record.hex + '"></i>';
      html += '<span><strong>' + escapeHtml(displayName(record)) + '</strong><span>' + record.hex + ' | match ' + metric + '</span></span>';
      html += '</button>';
    }
    container.innerHTML = html || '<span class="muted">No matches yet</span>';
    var buttons = container.querySelectorAll("button");
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].onclick = function () {
        state.active = recordByKey(this.getAttribute("data-key"));
        renderAll();
      };
    }
  }

  function runConvertFromValue(mode, value) {
    var parsed = parseConvertInput(mode, value);
    if (!parsed) {
      setStatus("Enter a valid " + mode.toUpperCase() + " colour.", true);
      return;
    }
    var matches = parsed.type === "lab" ? nearestToLab(parsed.lab) : nearestToRgb(parsed.rgb);
    if (parsed.type === "rgb") setSampleFromRgb(parsed.rgb, "Converted input");
    else state.sample = null;
    state.convertMatches = matches.map(function (item) {
      return { record: item.record, distance: item.distance };
    });
    renderMatchList(els.convertResults, state.convertMatches, "matchItem");
    if (state.convertMatches.length) {
      state.active = state.convertMatches[0].record;
      renderAll();
      setStatus("Converted to closest library match: " + state.active.name);
    }
  }

  function extractedMatchesFromSamples(samples) {
    var matches = [];
    for (var i = 0; i < samples.length; i++) {
      var nearest = nearestToRgb(samples[i])[0];
      if (!nearest) continue;
      matches.push({
        rgb: samples[i],
        hex: samples[i].hex || hexFromRgb(samples[i]),
        count: samples[i].count || 1,
        record: nearest.record,
        distance: nearest.distance
      });
    }
    return matches;
  }

  function renderExtracted() {
    if (!els.extractResults) return;
    var html = "";
    for (var i = 0; i < state.extracted.length; i++) {
      var item = state.extracted[i];
      html += '<button class="extractItem" data-key="' + item.record.key + '">';
      html += '<i style="background:' + item.hex + '"></i>';
      html += '<span><strong>' + escapeHtml(item.hex + " -> " + displayName(item.record)) + '</strong><span>' + item.record.hex + ' | match ' + (Math.round(item.distance * 10) / 10) + '</span></span>';
      html += '</button>';
    }
    els.extractResults.innerHTML = html || '<span class="muted">Extract from an image or selected artwork.</span>';
    var buttons = els.extractResults.querySelectorAll(".extractItem");
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].onclick = function () {
        state.active = recordByKey(this.getAttribute("data-key"));
        renderAll();
      };
    }
  }

  function setExtractedFromSamples(samples, label) {
    if (samples && samples.length) setSampleFromRgb(samples[0], label || "Extracted colour");
    state.extracted = extractedMatchesFromSamples(samples).slice(0, 8);
    renderExtracted();
    if (!state.extracted.length) {
      setStatus("No usable colours found in " + label + ".", true);
      return;
    }
    var records = [];
    for (var i = 0; i < state.extracted.length; i++) records.push(state.extracted[i].record);
    addRecordsToPalette(records);
    if (records.length) {
      state.active = records[0];
      renderAll();
    }
    setStatus("Extracted " + state.extracted.length + " colours from " + label + " and added them to Palette.");
  }

  function extractSamplesFromImageData(data, width, height) {
    var area = width * height;
    var step = Math.max(1, Math.floor(Math.sqrt(area / 42000)));
    var buckets = {};
    for (var y = 0; y < height; y += step) {
      for (var x = 0; x < width; x += step) {
        var offset = (y * width + x) * 4;
        var alpha = data[offset + 3];
        if (alpha < 140) continue;
        var r = data[offset];
        var g = data[offset + 1];
        var b = data[offset + 2];
        var key = (r >> 4) + "-" + (g >> 4) + "-" + (b >> 4);
        if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
        buckets[key].r += r;
        buckets[key].g += g;
        buckets[key].b += b;
        buckets[key].count++;
      }
    }
    var colors = [];
    for (var key in buckets) {
      if (!buckets.hasOwnProperty(key)) continue;
      var bucket = buckets[key];
      colors.push({
        r: Math.round(bucket.r / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        b: Math.round(bucket.b / bucket.count),
        count: bucket.count
      });
    }
    colors.sort(function (a, b) {
      function score(color) {
        var max = Math.max(color.r, color.g, color.b);
        var min = Math.min(color.r, color.g, color.b);
        var saturation = max ? (max - min) / max : 0;
        var contrast = Math.abs((color.r + color.g + color.b) / 3 - 248) / 248;
        return color.count * (0.45 + saturation) * (0.7 + contrast);
      }
      return score(b) - score(a);
    });
    var selected = [];
    for (var i = 0; i < colors.length && selected.length < 10; i++) {
      var color = colors[i];
      var distinct = true;
      for (var j = 0; j < selected.length; j++) {
        var dr = color.r - selected[j].r;
        var dg = color.g - selected[j].g;
        var db = color.b - selected[j].b;
        if (Math.sqrt(dr * dr + dg * dg + db * db) < 26) distinct = false;
      }
      if (distinct) {
        color.hex = hexFromRgb(color);
        selected.push(color);
      }
    }
    return selected;
  }

  function extractFromImageFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
      var image = new Image();
      image.onload = function () {
        var maxSide = 520;
        var scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        var canvas = els.extractCanvas || document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        var ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        state.extractImageData = pixels;
        canvas.className = "extractCanvas ready";
        var samples = extractSamplesFromImageData(pixels.data, pixels.width, pixels.height);
        setExtractedFromSamples(samples, file.name || "image");
      };
      image.onerror = function () {
        setStatus("Could not read that image file.", true);
      };
      image.src = evt.target.result;
    };
    reader.onerror = function () {
      setStatus("Could not load that image file.", true);
    };
    reader.readAsDataURL(file);
  }

  function sampleExtractCanvas(evt) {
    if (!state.extractImageData || !els.extractCanvas) {
      setStatus("Load an image first, then click the preview to pick a colour.", true);
      return;
    }
    var rect = els.extractCanvas.getBoundingClientRect();
    var x = Math.floor((evt.clientX - rect.left) * state.extractImageData.width / rect.width);
    var y = Math.floor((evt.clientY - rect.top) * state.extractImageData.height / rect.height);
    x = Math.max(0, Math.min(state.extractImageData.width - 1, x));
    y = Math.max(0, Math.min(state.extractImageData.height - 1, y));
    var offset = (y * state.extractImageData.width + x) * 4;
    var data = state.extractImageData.data;
    var rgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2], count: 1 };
    rgb.hex = hexFromRgb(rgb);
    setExtractedFromSamples([rgb], "image click");
  }

  function copyText(text, message) {
    var field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "readonly");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand("copy");
      setStatus(message || "Copied.");
    } catch (err) {
      setStatus("Could not copy automatically. Select the text manually.", true);
    }
    document.body.removeChild(field);
  }

  function renderMiniList(container, list) {
    var html = "";
    for (var i = 0; i < list.length; i++) {
      var record = recordByKey(list[i]);
      if (!record) continue;
      html += '<button class="mini" data-key="' + record.key + '"><i style="background:' + record.hex + '"></i>' + escapeHtml(displayName(record)) + '</button>';
    }
    container.innerHTML = html || '<span class="muted">None yet</span>';
    var buttons = container.querySelectorAll(".mini");
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].onclick = function () {
        state.active = recordByKey(this.getAttribute("data-key"));
        els.search.value = state.active ? state.active.name : "";
        filterRecords();
        renderAll();
      };
    }
  }

  function cardId(card) {
    return "card" + card.charAt(0).toUpperCase() + card.slice(1);
  }

  function cardLabel(card) {
    return CARD_LABELS[card] || card;
  }

  function cardElement(card) {
    return $(cardId(card));
  }

  function cardsForView(view) {
    if (view === "convert") return ["convert", "extract", "palette"];
    if (view === "palette") return ["palette", "detail"];
    if (view === "favourites") return ["favourites", "detail"];
    if (view === "patterns") return ["patterns", "detail"];
    return state.mainCards.slice();
  }

  function setSelectOptions(select, cards, placeholder) {
    if (!select) return;
    select.innerHTML = "";
    var placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholder;
    select.appendChild(placeholderOption);
    for (var i = 0; i < cards.length; i++) {
      var option = document.createElement("option");
      option.value = cards[i];
      option.textContent = cardLabel(cards[i]);
      select.appendChild(option);
    }
    select.disabled = !cards.length;
    select.value = "";
  }

  function addMainCard(card) {
    if (!card || ALL_CARDS.indexOf(card) < 0 || state.mainCards.indexOf(card) >= 0) return false;
    state.mainCards.push(card);
    state.mainCards = validCardList(state.mainCards);
    saveMainCards();
    return true;
  }

  function removeMainCard(card) {
    if (!card || state.mainCards.indexOf(card) < 0) return false;
    state.mainCards = removeKey(state.mainCards, card);
    saveMainCards();
    return true;
  }

  function resetMainCards() {
    state.mainCards = DEFAULT_MAIN_CARDS.slice();
    saveMainCards();
  }

  function renderCustomizeControls() {
    var missing = [];
    for (var a = 0; a < ALL_CARDS.length; a++) {
      if (state.mainCards.indexOf(ALL_CARDS[a]) < 0) missing.push(ALL_CARDS[a]);
    }
    setSelectOptions(els.customAddSelect, missing, "Add section to Main");
    setSelectOptions(els.customRemoveSelect, state.mainCards, "Remove section from Main");
    if (els.customAddButton) els.customAddButton.disabled = !missing.length;
    if (els.customRemoveButton) els.customRemoveButton.disabled = !state.mainCards.length;
    if (els.customResetButton) els.customResetButton.disabled = state.mainCards.length === DEFAULT_MAIN_CARDS.length && state.mainCards.join("|") === DEFAULT_MAIN_CARDS.join("|");

    var cards = document.querySelectorAll(".toolCard");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i].getAttribute("data-card");
      var inMain = state.mainCards.indexOf(card) >= 0;
      var pin = cards[i].querySelector('[data-custom="pin"]');
      var up = cards[i].querySelector('[data-custom="up"]');
      var down = cards[i].querySelector('[data-custom="down"]');
      if (pin) pin.textContent = "Remove";
      if (pin) pin.disabled = !inMain;
      if (up) up.disabled = !inMain || state.mainCards.indexOf(card) <= 0;
      if (down) down.disabled = !inMain || state.mainCards.indexOf(card) < 0 || state.mainCards.indexOf(card) >= state.mainCards.length - 1;
    }
  }

  function renderView() {
    if (!els.app) return;
    var views = ["main", "convert", "palette", "favourites", "patterns"];
    for (var i = 0; i < views.length; i++) {
      var view = views[i];
      var section = $("view" + view.charAt(0).toUpperCase() + view.slice(1));
      if (section) section.className = view === state.activeView ? "tabView active" : "tabView";
    }
    var tabs = els.primaryTabs ? els.primaryTabs.querySelectorAll("[data-view]") : [];
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].className = tabs[t].getAttribute("data-view") === state.activeView ? "active" : "";
    }
    var container = $(state.activeView + "Canvas") || els.mainCanvas;
    var order = cardsForView(state.activeView);
    var store = $("cardStore");
    for (var s = 0; s < ALL_CARDS.length; s++) {
      var storedCard = cardElement(ALL_CARDS[s]);
      if (storedCard && store) store.appendChild(storedCard);
    }
    for (var j = 0; j < order.length; j++) {
      var card = cardElement(order[j]);
      if (card && container) container.appendChild(card);
    }
    var customizeActive = state.customize && state.activeView === "main";
    els.app.className = "app" + (customizeActive ? " customizeMode" : "");
    document.body.className = state.scaleMode === "compact" ? "modeCompact" : state.scaleMode === "mini" ? "modeMini" : "";
    if (els.customizeToggle) els.customizeToggle.className = customizeActive ? "active" : "";
    if (els.scaleMode) els.scaleMode.value = state.scaleMode;
    if (els.scaleTabs) {
      var scaleButtons = els.scaleTabs.querySelectorAll("[data-scale]");
      for (var b = 0; b < scaleButtons.length; b++) {
        scaleButtons[b].className = scaleButtons[b].getAttribute("data-scale") === state.scaleMode ? "active" : "";
      }
    }
    renderCustomizeControls();
  }

  function renderMatchTabs() {
    var tabs = document.querySelectorAll(".matchTabs button");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].className = tabs[i].getAttribute("data-mode") === state.mode ? "active" : "";
    }
  }

  function renderAll() {
    renderView();
    renderMatchTabs();
    renderResults();
    renderMiniList(els.recentList, state.recents);
    renderMiniList(els.favoriteList, state.favourites);
    renderPalette();
    renderMatchList(els.convertResults, state.convertMatches, "matchItem");
    renderExtracted();
    renderPatternList();
  }

  function csEval(script, callback) {
    if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      window.__adobe_cep__.evalScript(script, callback || function () {});
      return;
    }
    setStatus("Adobe CEP bridge is not available in this preview. Open the panel inside Illustrator or Photoshop.", true);
  }

  function hostCall(functionName, payload, callback) {
    var json = JSON.stringify(payload || {});
    var script = functionName + "(" + JSON.stringify(json) + ")";
    csEval(script, function (result) {
      if (callback) callback(result);
    });
  }

  function remember(record) {
    if (!record) return;
    state.recents = pushUnique(state.recents, record.key);
    saveList("sca.recents", state.recents);
    renderMiniList(els.recentList, state.recents);
  }

  function selectedOrWarn() {
    if (!state.active) {
      setStatus("Pick a colour first.", true);
      return null;
    }
    return state.active;
  }

  function nearestToRgb(rgb, limit) {
    var scored = [];
    var targetRgb = {
      r: channel(rgb.r),
      g: channel(rgb.g),
      b: channel(rgb.b)
    };
    for (var i = 0; i < state.records.length; i++) {
      var record = state.records[i];
      if (state.guideFilter !== "all" && record.suffix !== state.guideFilter) continue;
      var score = colourRankScore(record, targetRgb);
      var distance = score < 0 ? 0 : comparisonDistance(record, targetRgb);
      scored.push({ score: score, distance: distance, record: record });
    }
    scored.sort(function (a, b) { return a.score - b.score; });
    return scored.slice(0, limit || 12);
  }

  function showMatchesFromRgb(rgb, label) {
    state.mode = "all";
    setSampleFromRgb(rgb, label || "Selected colour");
    var useExactSpot = rgb.spotName && (rgb.tint === undefined || Number(rgb.tint) >= 99.95);
    var exactSpot = useExactSpot ? recordByExactName(rgb.spotName || "") : null;
    var nearest = nearestToRgb(rgb, 80);
    state.filtered = nearest.map(function (item) {
      item.record._score = item.distance;
      return item.record;
    });
    if (exactSpot) {
      var merged = [exactSpot];
      for (var i = 0; i < state.filtered.length; i++) {
        if (state.filtered[i].key !== exactSpot.key) merged.push(state.filtered[i]);
      }
      state.filtered = merged.slice(0, 80);
      state.active = exactSpot;
      els.search.value = exactSpot.name;
    } else {
      state.filtered = state.filtered.slice(0, 80);
      state.active = state.filtered[0] || null;
      els.search.value = "";
    }
    renderAll();
    var suffix = " RGB " + rgbText(state.sample) + " | CMYK " + cmykText(state.sample && state.sample.cmyk);
    setStatus((exactSpot ? "Exact spot found from " : "Closest match from ") + label + ": " + (state.active ? state.active.name : "none") + "." + suffix);
  }

  function findCurrentColour(label, cleanupAfter) {
    hostCall("SCA_getCurrentColor", {}, function (result) {
      var rgb = parseHostPayload(result);
      if (!hostResultOk(rgb)) {
        setStatus((rgb && rgb.message) || result || "No current colour found.", true);
        return;
      }
      showMatchesFromRgb(rgb, label || "current colour");
      if (cleanupAfter) hostCall("SCA_cleanupPickTarget", {}, function () {});
    });
  }

  function resetPickButton() {
    state.pickActive = false;
    state.pickInitialSignature = "";
    state.pickKeepAliveTick = 0;
    if (els.activateEyedropper) {
      els.activateEyedropper.textContent = "Pick";
      els.activateEyedropper.className = "iconButton";
    }
  }

  function cancelPick() {
    clearPickWatch(true);
    setStatus("Colour picker cancelled.");
  }

  function pollPickResult() {
    if (!state.pickActive || state.pickBusy) return;
    state.pickBusy = true;
    state.pickKeepAliveTick += 1;
    hostCall("SCA_getPickerColor", {}, function (result) {
      state.pickBusy = false;
      if (!state.pickActive) return;
      var rgb = parseHostPayload(result);
      if (!hostResultOk(rgb)) {
        if (state.pickKeepAliveTick >= 3) {
          state.pickKeepAliveTick = 0;
          hostCall("SCA_keepPickerAlive", {}, function () {});
        }
        return;
      }
      if (state.pickInitialSignature && colourSignature(rgb) === state.pickInitialSignature) {
        if (state.pickKeepAliveTick >= 3) {
          state.pickKeepAliveTick = 0;
          hostCall("SCA_keepPickerAlive", {}, function () {});
        }
        return;
      }
      showMatchesFromRgb(rgb, "picked colour");
      state.pickInitialSignature = colourSignature(rgb);
      state.pickKeepAliveTick = 0;
      hostCall("SCA_keepPickerAlive", {}, function () {});
      setStatus("Live picked colour: " + (state.active ? state.active.name : "none") + ". Press Cancel Pick when finished.");
    });
  }

  function startPickWatch() {
    if (state.pickTimer) window.clearInterval(state.pickTimer);
    state.pickTimer = window.setInterval(function () {
      pollPickResult();
    }, 650);
  }

  function clearPickWatch(cleanup) {
    if (state.pickTimer) window.clearInterval(state.pickTimer);
    state.pickTimer = null;
    state.pickInitialSignature = "";
    state.pickBusy = false;
    resetPickButton();
    if (cleanup) hostCall("SCA_cleanupPickTarget", {}, function () {});
  }

  function runCustomAdd() {
    if (!els.customAddSelect) return;
    var card = els.customAddSelect.value;
    if (!card) {
      setStatus("Choose a section to add back to Main first.", true);
      return;
    }
    if (addMainCard(card)) {
      renderAll();
      setStatus("Added to Main: " + cardLabel(card) + ".");
    }
  }

  function runCustomRemove() {
    if (!els.customRemoveSelect) return;
    var card = els.customRemoveSelect.value;
    if (!card) {
      setStatus("Choose a section to remove from Main first.", true);
      return;
    }
    if (removeMainCard(card)) {
      renderAll();
      setStatus("Removed from Main: " + cardLabel(card) + ".");
    }
  }

  function runCustomReset() {
    resetMainCards();
    renderAll();
    setStatus("Restored Main to the default dashboard.");
  }

  function selectHasValue(select, value) {
    if (!select) return false;
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) return true;
    }
    return false;
  }

  function handleCustomAction(button) {
    var cardEl = button;
    while (cardEl && (!cardEl.getAttribute || !cardEl.getAttribute("data-card"))) cardEl = cardEl.parentNode;
    if (!cardEl) return;
    var card = cardEl.getAttribute("data-card");
    var action = button.getAttribute("data-custom");
    var index = state.mainCards.indexOf(card);
    if (action === "pin") {
      removeMainCard(card);
    }
    if (action === "up" && index > 0) {
      var previous = state.mainCards[index - 1];
      state.mainCards[index - 1] = card;
      state.mainCards[index] = previous;
      saveMainCards();
    }
    if (action === "down" && index >= 0 && index < state.mainCards.length - 1) {
      var next = state.mainCards[index + 1];
      state.mainCards[index + 1] = card;
      state.mainCards[index] = next;
      saveMainCards();
    }
    renderAll();
  }

  function closestTipTarget(target) {
    while (target && target !== document && target.getAttribute) {
      if (target.getAttribute("data-tip")) return target;
      target = target.parentNode;
    }
    return null;
  }

  function hideTip() {
    if (!els.hoverTip) return;
    els.hoverTip.className = "hoverTip";
    els.hoverTip.textContent = "";
  }

  function positionTip(target) {
    if (!els.hoverTip || !target) return;
    var tip = els.hoverTip;
    var margin = 8;
    var maxWidth = Math.max(160, Math.min(280, window.innerWidth - (margin * 2)));
    tip.style.maxWidth = maxWidth + "px";
    tip.className = "hoverTip visible";
    var rect = target.getBoundingClientRect();
    var tipWidth = tip.offsetWidth;
    var tipHeight = tip.offsetHeight;
    var left = rect.left;
    if (left + tipWidth > window.innerWidth - margin) left = window.innerWidth - tipWidth - margin;
    if (left < margin) left = margin;
    var top = rect.top - tipHeight - margin;
    if (top < margin) top = rect.bottom + margin;
    if (top + tipHeight > window.innerHeight - margin) top = window.innerHeight - tipHeight - margin;
    if (top < margin) top = margin;
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }

  function showTip(target) {
    if (!els.hoverTip || !target) return;
    var text = target.getAttribute("data-tip") || "";
    if (!text) return;
    els.hoverTip.textContent = text;
    positionTip(target);
  }

  function wireTooltips() {
    var tipped = document.querySelectorAll("[data-tip]");
    for (var tipIndex = 0; tipIndex < tipped.length; tipIndex++) {
      tipped[tipIndex].setAttribute("aria-label", tipped[tipIndex].getAttribute("data-tip"));
      tipped[tipIndex].removeAttribute("title");
    }
    document.addEventListener("mouseover", function (evt) {
      var target = closestTipTarget(evt.target);
      if (target) showTip(target);
    });
    document.addEventListener("mouseout", function (evt) {
      var target = closestTipTarget(evt.target);
      if (!target) return;
      var next = evt.relatedTarget;
      while (next && next !== document && next !== target) next = next.parentNode;
      if (next !== target) hideTip();
    });
    document.addEventListener("focusin", function (evt) {
      var target = closestTipTarget(evt.target);
      if (target) showTip(target);
    });
    document.addEventListener("focusout", hideTip);
    window.addEventListener("resize", hideTip);
    window.addEventListener("scroll", hideTip, true);
  }

  function wireEvents() {
    wireTooltips();
    els.primaryTabs.onclick = function (evt) {
      var target = evt.target;
      if (!target || !target.getAttribute || !target.getAttribute("data-view")) return;
      state.activeView = target.getAttribute("data-view");
      if (state.activeView !== "main" && state.customize) {
        state.customize = false;
        localStorage.setItem("sca.customize", "0");
      }
      localStorage.setItem("sca.activeView", state.activeView);
      renderView();
    };
    document.onclick = function (evt) {
      var target = evt.target;
      if (target && target.getAttribute && target.getAttribute("data-custom")) handleCustomAction(target);
    };
    els.search.oninput = function () {
      var rgb = hexQueryRgb(els.search.value);
      if (rgb) {
        state.mode = "all";
        setSampleFromRgb(rgb, "Search colour");
      }
      else if (els.search.value) state.sample = null;
      filterRecords();
      renderAll();
    };
    els.guideFilter.onchange = function () {
      state.guideFilter = els.guideFilter.value;
      localStorage.setItem("sca.guideFilter", state.guideFilter);
      filterRecords();
      renderAll();
    };
    els.libraryFile.onchange = function () {
      importLibraryFile(els.libraryFile.files && els.libraryFile.files[0]);
      els.libraryFile.value = "";
    };
    els.clearImported.onclick = clearImportedLibrary;
    els.customAddButton.onclick = runCustomAdd;
    els.customRemoveButton.onclick = runCustomRemove;
    els.customResetButton.onclick = runCustomReset;
    var tabs = document.querySelectorAll(".matchTabs button");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function () {
        state.mode = this.getAttribute("data-mode");
        for (var j = 0; j < tabs.length; j++) tabs[j].className = "";
        this.className = "active";
        filterRecords();
        renderAll();
      };
    }
    els.addToPalette.onclick = function () {
      var record = selectedOrWarn();
      if (!record) return;
      addToPalette(record);
      setStatus("Added to Palette: " + record.name);
    };
    els.toggleFavourite.onclick = function () {
      var record = selectedOrWarn();
      if (!record) return;
      var active = toggleFavourite(record);
      renderAll();
      setStatus((active ? "Favourited: " : "Removed favourite: ") + record.name);
    };
    els.addSwatch.onclick = function () {
      var record = selectedOrWarn();
      if (!record) return;
      hostCall("SCA_addSwatch", record, function (result) {
        remember(record);
        recordPattern(record, "Swatch");
        setStatus(result || ("Added " + record.name));
      });
    };
    els.applyColour.onclick = function () {
      var record = selectedOrWarn();
      if (!record) return;
      hostCall("SCA_applyColour", record, function (result) {
        remember(record);
        recordPattern(record, "Applied");
        setStatus(result || ("Applied " + record.name));
      });
    };
    els.addSquare.onclick = function () {
      var record = selectedOrWarn();
      if (!record) return;
      hostCall("SCA_addColourSquare", record, function (result) {
        var failed = hostTextIsError(result);
        if (!failed) {
          remember(record);
          recordPattern(record, "Square");
        }
        setStatus(result || ("Added colour square: " + record.name), failed);
      });
    };
    els.addShown.onclick = function () {
      var shown = state.filtered.slice(0, 250);
      if (!shown.length) {
        setStatus("No shown colours to add.", true);
        return;
      }
      hostCall("SCA_addManySwatches", shown, function (result) {
        for (var i = 0; i < shown.length && i < 50; i++) recordPattern(shown[i], "Shown");
        setStatus(result || ("Added " + shown.length + " colours."));
      });
    };
    els.activateEyedropper.onclick = function () {
      if (state.pickActive) {
        cancelPick();
        return;
      }
      clearPickWatch(false);
      hostCall("SCA_startEyedropperPick", {}, function (result) {
        var payload = parseHostPayload(result);
        if (!hostResultOk(payload)) {
          setStatus((payload && payload.message) || result || "Could not start picker.", true);
          return;
        }
        state.pickActive = true;
        state.pickInitialSignature = colourSignature(payload.initial || {});
        els.activateEyedropper.textContent = "Cancel Pick";
        els.activateEyedropper.className = "iconButton picking";
        startPickWatch();
        hostCall("SCA_keepPickerAlive", {}, function () {});
        setStatus(payload.message || "Click colours with the Eyedropper. The panel updates live until you press Cancel Pick.");
      });
    };
    els.checkCurrent.onclick = function () {
      if (state.pickActive) {
        pollPickResult();
        return;
      }
      findCurrentColour("selected colour", true);
    };
    els.paletteName.oninput = function () {
      state.paletteName = els.paletteName.value || "Codys Colours Palette";
      savePalette();
    };
    els.addPaletteSwatches.onclick = function () {
      var records = paletteRecords();
      if (!records.length) {
        setStatus("Add colours to the palette first.", true);
        return;
      }
      hostCall("SCA_addManySwatches", records, function (result) {
        for (var i = 0; i < records.length && i < 50; i++) recordPattern(records[i], "Palette Swatch");
        setStatus(result || ("Added " + records.length + " palette swatches."));
      });
    };
    els.copyPalette.onclick = function () {
      var records = paletteRecords();
      if (!records.length) {
        setStatus("Add colours to the palette before copying.", true);
        return;
      }
      copyText(paletteCopyText(), "Copied palette data.");
    };
    els.exportPalette.onclick = exportPalettePng;
    els.clearPalette.onclick = function () {
      state.palette = [];
      savePalette();
      renderPalette();
      setStatus("Cleared palette.");
    };
    els.convertButton.onclick = function () {
      runConvertFromValue(els.convertMode.value, els.convertInput.value);
    };
    els.convertInput.onkeydown = function (evt) {
      if (evt.keyCode === 13) runConvertFromValue(els.convertMode.value, els.convertInput.value);
    };
    els.convertMode.onchange = function () {
      var placeholders = {
        hex: "#E31B23",
        rgb: "227, 27, 35",
        cmyk: "0, 88, 85, 11",
        lab: "49, 70, 50"
      };
      els.convertInput.placeholder = placeholders[els.convertMode.value] || "";
    };
    els.convertFromDesign.onclick = function () {
      hostCall("SCA_getCurrentColor", {}, function (result) {
        var rgb = parseHostPayload(result);
        if (!hostResultOk(rgb)) {
          setStatus((rgb && rgb.message) || result || "No current design colour found.", true);
          return;
        }
        els.convertMode.value = "rgb";
        els.convertInput.value = channel(rgb.r) + ", " + channel(rgb.g) + ", " + channel(rgb.b);
        runConvertFromValue("rgb", els.convertInput.value);
      });
    };
    els.extractFile.onchange = function () {
      extractFromImageFile(els.extractFile.files && els.extractFile.files[0]);
      els.extractFile.value = "";
    };
    els.extractCanvas.onclick = function (evt) {
      sampleExtractCanvas(evt);
    };
    els.extractSelection.onclick = function () {
      hostCall("SCA_extractSelectionColors", {}, function (result) {
        var payload = parseHostPayload(result);
        if (!hostResultOk(payload)) {
          setStatus((payload && payload.message) || result || "Could not extract selected artwork colours.", true);
          return;
        }
        setExtractedFromSamples(payload.colors || [], "selected artwork");
      });
    };
    if (els.scaleMode) {
      els.scaleMode.onchange = function () {
        state.scaleMode = els.scaleMode.value;
        localStorage.setItem("sca.scaleMode", state.scaleMode);
        renderView();
      };
    }
    if (els.scaleTabs) {
      els.scaleTabs.onclick = function (evt) {
        var target = evt.target;
        if (!target || !target.getAttribute || !target.getAttribute("data-scale")) return;
        state.scaleMode = target.getAttribute("data-scale");
        localStorage.setItem("sca.scaleMode", state.scaleMode);
        renderView();
      };
    }
    els.customizeToggle.onclick = function () {
      state.customize = !state.customize;
      localStorage.setItem("sca.customize", state.customize ? "1" : "0");
      state.activeView = "main";
      localStorage.setItem("sca.activeView", state.activeView);
      renderView();
      setStatus(state.customize ? "Customize mode on. Add/remove cards from Main or move them Up/Down." : "Customize mode off.");
    };
    els.patternSort.onchange = function () {
      state.patternSort = els.patternSort.value;
      localStorage.setItem("sca.patternSort", state.patternSort);
      renderPatternList();
    };
    els.copyPatterns.onclick = function () {
      if (!state.patterns.length) {
        setStatus("No pattern history to copy yet.", true);
        return;
      }
      copyText(patternCopyText(), "Copied pattern history.");
    };
    els.scanPatterns.onclick = function () {
      hostCall("SCA_getDocumentPatterns", {}, function (result) {
        try {
          var payload = JSON.parse(result);
          if (!payload.ok) {
            setStatus(payload.message || "Could not scan Illustrator patterns.", true);
            return;
          }
          var added = importDocumentPatterns(payload.patterns || []);
          setStatus("Scanned " + (payload.patterns || []).length + " Illustrator patterns. Added " + added + " new.");
        } catch (err) {
          setStatus(result || "Could not scan document patterns.", true);
        }
      });
    };
  }

  function loadData() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "data/codys_colours.json", true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 0 && xhr.status !== 200) {
        setStatus("Could not load colour data: " + xhr.status, true);
        return;
      }
      var payload = JSON.parse(xhr.responseText);
      state.libraryNotice = payload.notice || "Public build includes generic starter colours only. Import your own authorised CSV or JSON colour libraries.";
      state.starterRecords = normalizeLibraryRecords(payload.records || [], "Starter library", false);
      state.importedRecords = loadImportedRecords();
      state.records = mergeRecords(state.starterRecords, state.importedRecords);
      state.recents = loadList("sca.recents");
      state.favourites = loadList("sca.favourites");
      state.patterns = loadPatterns();
      state.palette = loadPalette();
      state.paletteName = localStorage.getItem("sca.paletteName") || "Codys Colours Palette";
      state.patternSort = localStorage.getItem("sca.patternSort") || "recent";
      state.guideFilter = localStorage.getItem("sca.guideFilter") || "all";
      state.activeView = localStorage.getItem("sca.activeView") || "main";
      if (["main", "convert", "palette", "favourites", "patterns"].indexOf(state.activeView) < 0) state.activeView = "main";
      if (!selectHasValue(els.guideFilter, state.guideFilter)) state.guideFilter = "all";
      state.mainCards = loadMainCards();
      state.customize = localStorage.getItem("sca.customize") === "1";
      state.scaleMode = localStorage.getItem("sca.scaleMode") || "auto";
      els.patternSort.value = state.patternSort;
      els.guideFilter.value = state.guideFilter;
      if (els.scaleMode) els.scaleMode.value = state.scaleMode;
      refreshLibrarySummary();
      filterRecords();
      renderAll();
      setStatus("Loaded " + state.records.length + " colours.");
    };
    xhr.send();
  }

  function init() {
    els = {
      app: $("app"),
      sourceSummary: $("sourceSummary"),
      notice: $("notice"),
      primaryTabs: $("primaryTabs"),
      scaleTabs: $("scaleTabs"),
      mainCanvas: $("mainCanvas"),
      search: $("searchInput"),
      guideFilter: $("guideFilter"),
      libraryFile: $("libraryFile"),
      clearImported: $("clearImported"),
      resultsInfo: $("resultsInfo"),
      results: $("results"),
      detailResultsInfo: $("detailResultsInfo"),
      detailResults: $("detailResults"),
      detailResultsCount: $("detailResultsCount"),
      chip: $("chip"),
      sampleChip: $("sampleChip"),
      sampleLabel: $("sampleLabel"),
      sampleHex: $("sampleHex"),
      sampleStatRgb: $("sampleStatRgb"),
      sampleStatCmyk: $("sampleStatCmyk"),
      sampleStatLab: $("sampleStatLab"),
      sampleStatSource: $("sampleStatSource"),
      matchChip: $("matchChip"),
      matchLabel: $("matchLabel"),
      matchDelta: $("matchDelta"),
      matchStatRgb: $("matchStatRgb"),
      matchStatCmyk: $("matchStatCmyk"),
      matchStatLab: $("matchStatLab"),
      matchStatSource: $("matchStatSource"),
      detailName: $("detailName"),
      detailMeta: $("detailMeta"),
      detailHex: $("detailHex"),
      detailCmyk: $("detailCmyk"),
      detailLab: $("detailLab"),
      detailSource: $("detailSource"),
      toggleFavourite: $("toggleFavourite"),
      addToPalette: $("addToPalette"),
      addSwatch: $("addSwatch"),
      applyColour: $("applyColour"),
      addSquare: $("addSquare"),
      addShown: $("addShown"),
      paletteCount: $("paletteCount"),
      paletteName: $("paletteName"),
      paletteStrip: $("paletteStrip"),
      paletteList: $("paletteList"),
      accessibilityPreview: $("accessibilityPreview"),
      addPaletteSwatches: $("addPaletteSwatches"),
      copyPalette: $("copyPalette"),
      exportPalette: $("exportPalette"),
      clearPalette: $("clearPalette"),
      convertFromDesign: $("convertFromDesign"),
      convertMode: $("convertMode"),
      convertInput: $("convertInput"),
      convertButton: $("convertButton"),
      convertResults: $("convertResults"),
      extractFile: $("extractFile"),
      extractCanvas: $("extractCanvas"),
      extractSelection: $("extractSelection"),
      extractResults: $("extractResults"),
      activateEyedropper: $("activateEyedropper"),
      checkCurrent: $("checkCurrent"),
      recentList: $("recentList"),
      favoriteList: $("favoriteList"),
      patternList: $("patternList"),
      patternSort: $("patternSort"),
      copyPatterns: $("copyPatterns"),
      scanPatterns: $("scanPatterns"),
      customizeToggle: $("customizeToggle"),
      customAddSelect: $("customAddSelect"),
      customAddButton: $("customAddButton"),
      customRemoveSelect: $("customRemoveSelect"),
      customRemoveButton: $("customRemoveButton"),
      customResetButton: $("customResetButton"),
      hoverTip: $("hoverTip"),
      status: $("status")
    };
    resizePanelToContent();
    wireEvents();
    loadData();
    window.setTimeout(resizePanelToContent, 250);
  }

  window.onbeforeunload = function () {
    clearPickWatch(true);
  };

  document.addEventListener("DOMContentLoaded", init);
})();
