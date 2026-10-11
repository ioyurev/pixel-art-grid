// Набор легко различимых символов для схемы
  const SYMBOL_PALETTE = [
    '■', '●', '▲', '◆', '★', '♥', '♦', '♣', '♠', '✦',
    '×', '○', '□', '△', '◇', '☆', '♡', '◈', '⊕', '⊗',
    '▪', '▫', '◉', '◎', '✿', '❀', '✱', '⬟', '⬡', '⊞',
    '⊠', '⊡', '▣', '▤', '▥', '▦', '▧', '▨', '▩', '⊙',
    '⊚', '◌', '◍', '◐', '◑', '◒', '◓', '◔', '◕', '✦',
    '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A',
    'B', 'C', 'D', 'E', 'F', 'H', 'K', 'M', 'P', 'R'
  ];

  // Константы оформления (SSOT для визуальных стилей схемы)
  const SCHEME_THEME = {
    background: '#ffffff',
    minorGridColor: 'rgba(0, 0, 0, 0.22)',
    minorGridWidth: 0.75,
    majorGridColor: 'rgba(0, 0, 0, 0.85)',
    majorGridWidth: 2.0,
    numberColor: '#1e293b',
    numberFontSize: 11,
    numberFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    symbolFontFamily: 'sans-serif',
    symbolFontWeight: '600',
  };

  // Константы
  const ALPHA_THRESHOLD = 128;
  const MAJOR_GRID_STEP = 10;
  const DEFAULTS = {
    CELL_MM: 2.4,
    WIDTH_MM: 200,
    CELL_SIZE_PX: 26,
  };

  // Состояние приложения
  const state = {
    imageBitmap: null,
    rawPixels: null,
    srcWidth: 0,
    srcHeight: 0,
    palette: [] // [{ hex, rgb: [r,g,b], symbol }]
  };

  // Элементы DOM
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  const cellMmInput = document.getElementById('cellMm');
  const widthMmInput = document.getElementById('widthMm');
  const cellSizeInput = document.getElementById('cellSize');
  const showSymbolsInput = document.getElementById('showSymbols');
  const showNumbersInput = document.getElementById('showNumbers');
  const printBtn = document.getElementById('printBtn');
  const downloadSvgBtn = document.getElementById('downloadSvgBtn');
  const downloadPngBtn = document.getElementById('downloadPngBtn');

  const schemeSvg = document.getElementById('schemeSvg');
  const printWrap = document.getElementById('printWrap');
  const paletteGrid = document.getElementById('paletteGrid');

  const infoResolution = document.getElementById('infoResolution');
  const infoPhysical = document.getElementById('infoPhysical');
  const infoColorCount = document.getElementById('infoColorCount');

  // Утилита: перевод RGB в HEX
  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  // Утилита: чтение пикселя из ImageData
  function readPixel(data, idx) {
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
  }

  // Утилита: вычисление контрастного цвета (чёрный или белый)
  function getContrastColor(r, g, b) {
    // Взвешенная яркость по формуле ITU-R BT.601
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 140 ? '#0f172a' : '#ffffff';
  }

  // Загрузка файла изображения
  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => processLoadedImage(img);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Извлечение пиксельных данных из изображения без интерполяции
  function extractPixelData(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const offCtx = offCanvas.getContext('2d');
    offCtx.imageSmoothingEnabled = false;
    offCtx.drawImage(img, 0, 0);
    return { width: w, height: h, pixels: offCtx.getImageData(0, 0, w, h).data };
  }

  // Сбор уникальных цветов и назначение символов
  function buildPalette(pixels, w, h) {
    const colorMap = new Map(); // hex -> { r, g, b, count }
    for (let i = 0; i < pixels.length; i += 4) {
      const p = readPixel(pixels, i);
      if (p.a < ALPHA_THRESHOLD) continue;
      const hex = rgbToHex(p.r, p.g, p.b);
      const entry = colorMap.get(hex);
      if (entry) {
        entry.count++;
      } else {
        colorMap.set(hex, { r: p.r, g: p.g, b: p.b, count: 1 });
      }
    }

    return Array.from(colorMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([hex, { r, g, b }], index) => ({
        hex,
        rgb: [r, g, b],
        symbol: SYMBOL_PALETTE[index % SYMBOL_PALETTE.length],
      }));
  }

  // Синхронизация ширины печати из размера ячейки
  function syncPrintWidth(srcWidth) {
    const cellMm = parseFloat(cellMmInput.value) || DEFAULTS.CELL_MM;
    widthMmInput.value = (srcWidth * cellMm).toFixed(1);
  }

  // Обработка загруженного изображения
  function processLoadedImage(img) {
    const { width, height, pixels } = extractPixelData(img);
    state.srcWidth = width;
    state.srcHeight = height;
    state.rawPixels = pixels;

    syncPrintWidth(width);
    state.palette = buildPalette(pixels, width, height);

    renderPalette();
    renderScheme();
    updateInfo();
  }

  // Вычисление физических размеров схемы
  function getPhysicalDimensions() {
    const w = state.srcWidth;
    const h = state.srcHeight;
    const cellMm = parseFloat(cellMmInput.value) || DEFAULTS.CELL_MM;
    const wMm = parseFloat(widthMmInput.value) || (w * cellMm);
    const hMm = Math.round((wMm * h) / w);
    return { w, h, cellMm, wMm, hMm };
  }

  // Обновление текстовых метрик в DOM
  function updateMetricsDisplay() {
    if (!state.srcWidth) return;
    const { w, h, wMm, hMm } = getPhysicalDimensions();
    infoResolution.textContent = `${w} × ${h} px`;
    infoPhysical.textContent = `${wMm} × ${hMm} мм`;
    infoColorCount.textContent = `${state.palette.length}`;
  }

  // Единый расчёт геометрии схемы (SSOT)
  function getSchemeLayout(w, h, cellSize, withNumbers) {
    const maxDigits = String(h).length;
    const leftMargin = withNumbers ? Math.max(32, maxDigits * 9 + 14) : 4;
    const topMargin = withNumbers ? 20 : 4;
    const rightMargin = 4;
    const bottomMargin = 4;
    const totalWidth = leftMargin + w * cellSize + rightMargin;
    const totalHeight = topMargin + h * cellSize + bottomMargin;
    const gridRight = leftMargin + w * cellSize;
    const gridBottom = topMargin + h * cellSize;
    const fontSize = Math.max(9, Math.floor(cellSize * 0.58));

    return {
      w,
      h,
      cellSize,
      withNumbers,
      leftMargin,
      topMargin,
      rightMargin,
      bottomMargin,
      totalWidth,
      totalHeight,
      gridRight,
      gridBottom,
      fontSize,
    };
  }

  // Обновление CSS-переменных для корректной печати
  function updatePrintCssVars() {
    if (!state.srcWidth) return;
    const { w, cellMm, wMm } = getPhysicalDimensions();
    const cellSize = parseInt(cellSizeInput.value, 10) || DEFAULTS.CELL_SIZE_PX;
    const layout = getSchemeLayout(w, state.srcHeight, cellSize, showNumbersInput.checked);

    if (layout.totalWidth && w) {
      const gridPixelWidth = w * cellSize;
      const gridRatio = gridPixelWidth / layout.totalWidth;
      const totalPrintCanvasWidthMm = (w * cellMm) / gridRatio;
      document.documentElement.style.setProperty('--print-canvas-width-mm', `${totalPrintCanvasWidthMm.toFixed(2)}mm`);
    } else {
      document.documentElement.style.setProperty('--print-canvas-width-mm', `${wMm}mm`);
    }
    document.documentElement.style.setProperty('--print-width-mm', `${wMm}mm`);
  }

  // Обёртка: обновление всей информации
  function updateInfo() {
    updateMetricsDisplay();
    updatePrintCssVars();
  }

  // Отрисовка палитры (только цветные блоки, символы зависят от чекбокса)
  function renderPalette() {
    paletteGrid.innerHTML = '';
    const withSymbols = showSymbolsInput.checked;
    state.palette.forEach(item => {
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      swatch.style.backgroundColor = item.hex;
      swatch.style.color = getContrastColor(item.rgb[0], item.rgb[1], item.rgb[2]);
      swatch.textContent = withSymbols ? item.symbol : '';
      swatch.title = item.hex;
      paletteGrid.appendChild(swatch);
    });
  }

  // Экранирование XML для безопасности
  function escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 1. Генерация векторных ячеек
  function buildCellsSvg(layout, pixels) {
    const rects = [];
    const { w, h, cellSize, leftMargin, topMargin } = layout;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const p = readPixel(pixels, idx);
        if (p.a < ALPHA_THRESHOLD) continue;
        const px = leftMargin + x * cellSize;
        const py = topMargin + y * cellSize;
        rects.push(`<rect x="${px}" y="${py}" width="${cellSize}" height="${cellSize}" fill="rgb(${p.r},${p.g},${p.b})"/>`);
      }
    }
    return `<g class="scheme-cells">${rects.join('')}</g>`;
  }

  // 2. Генерация векторных символов поверх ячеек
  function buildSymbolsSvg(layout, pixels, colorSymbolMap) {
    const texts = [];
    const { w, h, cellSize, leftMargin, topMargin, fontSize } = layout;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const p = readPixel(pixels, idx);
        if (p.a < ALPHA_THRESHOLD) continue;

        const hex = rgbToHex(p.r, p.g, p.b);
        const item = colorSymbolMap.get(hex);
        if (!item) continue;

        const cx = leftMargin + x * cellSize + cellSize / 2;
        const cy = topMargin + y * cellSize + cellSize / 2;
        const contrast = getContrastColor(p.r, p.g, p.b);
        texts.push(`<text x="${cx}" y="${cy}" fill="${contrast}">${escapeXml(item.symbol)}</text>`);
      }
    }
    return `<g class="scheme-symbols" font-family="${SCHEME_THEME.symbolFontFamily}" font-weight="${SCHEME_THEME.symbolFontWeight}" font-size="${fontSize}px" text-anchor="middle" dominant-baseline="central">${texts.join('')}</g>`;
  }

  // 3. Генерация линий сетки через объединённые path (компактно и аппаратно быстро)
  function buildGridSvg(layout) {
    const { w, h, cellSize, leftMargin, topMargin, gridRight, gridBottom } = layout;
    let minorD = '';
    let majorD = '';

    // Минорная сетка (каждая ячейка)
    for (let x = 0; x <= w; x++) {
      const cx = leftMargin + x * cellSize;
      minorD += `M${cx} ${topMargin}V${gridBottom}`;
    }
    for (let y = 0; y <= h; y++) {
      const cy = topMargin + y * cellSize;
      minorD += `M${leftMargin} ${cy}H${gridRight}`;
    }

    // Мажорная сетка (каждые MAJOR_GRID_STEP ячеек)
    for (let x = 0; x <= w; x += MAJOR_GRID_STEP) {
      const cx = leftMargin + x * cellSize;
      majorD += `M${cx} ${topMargin}V${gridBottom}`;
    }
    for (let y = 0; y <= h; y += MAJOR_GRID_STEP) {
      const cy = topMargin + y * cellSize;
      majorD += `M${leftMargin} ${cy}H${gridRight}`;
    }
    if (w % MAJOR_GRID_STEP !== 0) {
      majorD += `M${gridRight} ${topMargin}V${gridBottom}`;
    }
    if (h % MAJOR_GRID_STEP !== 0) {
      majorD += `M${leftMargin} ${gridBottom}H${gridRight}`;
    }

    return `
      <path class="scheme-minor-grid" d="${minorD}" stroke="${SCHEME_THEME.minorGridColor}" stroke-width="${SCHEME_THEME.minorGridWidth}" shape-rendering="crispEdges"/>
      <path class="scheme-major-grid" d="${majorD}" stroke="${SCHEME_THEME.majorGridColor}" stroke-width="${SCHEME_THEME.majorGridWidth}" shape-rendering="crispEdges"/>
    `;
  }

  // 4. Генерация векторной нумерации
  function buildNumbersSvg(layout) {
    const { w, h, cellSize, leftMargin, topMargin } = layout;
    const colTexts = [];
    const rowTexts = [];

    for (let x = MAJOR_GRID_STEP; x <= w; x += MAJOR_GRID_STEP) {
      const cx = leftMargin + x * cellSize;
      colTexts.push(`<text x="${cx}" y="${topMargin - 3}" text-anchor="middle" dominant-baseline="alphabetic">${x}</text>`);
    }

    for (let y = MAJOR_GRID_STEP; y <= h; y += MAJOR_GRID_STEP) {
      const cy = topMargin + y * cellSize;
      rowTexts.push(`<text x="${leftMargin - 5}" y="${cy}" text-anchor="end" dominant-baseline="central">${y}</text>`);
    }

    return `<g class="scheme-numbers" fill="${SCHEME_THEME.numberColor}" font-family="${SCHEME_THEME.numberFontFamily}" font-weight="600" font-size="${SCHEME_THEME.numberFontSize}px">${colTexts.join('')}${rowTexts.join('')}</g>`;
  }

  // Полная сборка тела схемы (SSOT)
  function buildSchemeSvgContent(layout, state, options = {}) {
    const { withSymbols = true, withNumbers = true } = options;
    const parts = [
      `<rect width="${layout.totalWidth}" height="${layout.totalHeight}" fill="${SCHEME_THEME.background}"/>`,
      buildCellsSvg(layout, state.rawPixels),
    ];

    if (withSymbols) {
      const colorSymbolMap = new Map();
      state.palette.forEach(p => colorSymbolMap.set(p.hex, p));
      parts.push(buildSymbolsSvg(layout, state.rawPixels, colorSymbolMap));
    }

    parts.push(buildGridSvg(layout));

    if (withNumbers) {
      parts.push(buildNumbersSvg(layout));
    }

    return parts.join('\n');
  }

  // Генерация полного валидного XML-документа SVG
  function buildSvgDocument(layout, state, options = {}) {
    const content = buildSchemeSvgContent(layout, state, options);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.totalWidth} ${layout.totalHeight}" width="${layout.totalWidth}" height="${layout.totalHeight}">
${content}
</svg>`;
  }

  // Отрисовка схемы в DOM (оркестратор)
  function renderScheme() {
    if (!state.rawPixels || !state.srcWidth) return;

    const cellSize = parseInt(cellSizeInput.value, 10) || DEFAULTS.CELL_SIZE_PX;
    const layout = getSchemeLayout(state.srcWidth, state.srcHeight, cellSize, showNumbersInput.checked);

    schemeSvg.setAttribute('viewBox', `0 0 ${layout.totalWidth} ${layout.totalHeight}`);
    schemeSvg.setAttribute('width', layout.totalWidth);
    schemeSvg.setAttribute('height', layout.totalHeight);
    schemeSvg.innerHTML = buildSchemeSvgContent(layout, state, {
      withSymbols: showSymbolsInput.checked,
      withNumbers: showNumbersInput.checked,
    });
  }

  // Генерация симпатичного пиксель-арт образца (Грибочек 16x16)
  function createSampleImage() {
    const w = 16;
    const h = 16;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = w;
    sampleCanvas.height = h;
    const sCtx = sampleCanvas.getContext('2d');

    const C = {
      _: 'transparent',
      K: '#1e1b18', // контур
      R: '#e11d48', // красный шляпки
      W: '#ffffff', // белый горошек
      S: '#ffedd5', // ножка (кремовый)
      D: '#fed7aa', // тень ножки
      T: '#fb7185'  // блик шляпки
    };

    const pattern = [
      "________________",
      "_____KKKKKK_____",
      "___KKRRWWRRKK___",
      "__KRRRWWWWWRRK__",
      "_KRRTTRRRWWWRRK_",
      "_KRTTRRRRWWWRRK_",
      "KRRTTRWWWRRRRRRK",
      "KRRRRRWWWRRRRRRK",
      "KRRWWRRRRRRWWWRK",
      "KKWWRRKKKKRWWKKK",
      "_KKKKKSSSSKKKK__",
      "___KSSSDDDSSK___",
      "___KSSSDDDSSK___",
      "___KSSSSDDSSK___",
      "____KKKKKKKK____",
      "________________"
    ];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const key = pattern[y][x];
        const col = C[key];
        if (col !== 'transparent') {
          sCtx.fillStyle = col;
          sCtx.fillRect(x, y, 1, 1);
        }
      }
    }

    const img = new Image();
    img.onload = () => processLoadedImage(img);
    img.src = sampleCanvas.toDataURL();
  }

  // Универсальный хелпер скачивания Blob (SRP)
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Стратегии экспорта (OCP)
  const EXPORTERS = {
    svg: () => {
      if (!state.rawPixels || !state.srcWidth) return;
      const cellSize = parseInt(cellSizeInput.value, 10) || DEFAULTS.CELL_SIZE_PX;
      const layout = getSchemeLayout(state.srcWidth, state.srcHeight, cellSize, showNumbersInput.checked);
      const svgDoc = buildSvgDocument(layout, state, {
        withSymbols: showSymbolsInput.checked,
        withNumbers: showNumbersInput.checked,
      });
      const blob = new Blob([svgDoc], { type: 'image/svg+xml;charset=utf-8' });
      downloadBlob(blob, `embroidery-scheme-${state.srcWidth}x${state.srcHeight}.svg`);
    },

    png: (options = { dpi: 300 }) => {
      if (!state.rawPixels || !state.srcWidth) return;
      const cellSize = parseInt(cellSizeInput.value, 10) || DEFAULTS.CELL_SIZE_PX;
      const layout = getSchemeLayout(state.srcWidth, state.srcHeight, cellSize, showNumbersInput.checked);
      const svgDoc = buildSvgDocument(layout, state, {
        withSymbols: showSymbolsInput.checked,
        withNumbers: showNumbersInput.checked,
      });

      // Базовый экранный DPI ~96. Масштаб для 300 DPI: 300 / 96 ≈ 3.125
      const scale = Math.max(1, (options.dpi || 300) / 96);
      const offCanvas = document.createElement('canvas');
      offCanvas.width = Math.round(layout.totalWidth * scale);
      offCanvas.height = Math.round(layout.totalHeight * scale);
      const offCtx = offCanvas.getContext('2d');

      const img = new Image();
      const svgBlob = new Blob([svgDoc], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        offCtx.drawImage(img, 0, 0, offCanvas.width, offCanvas.height);
        URL.revokeObjectURL(url);
        offCanvas.toBlob((blob) => {
          if (blob) {
            downloadBlob(blob, `embroidery-scheme-${state.srcWidth}x${state.srcHeight}-${options.dpi || 300}dpi.png`);
          }
        }, 'image/png');
      };
      img.src = url;
    },
  };

  function exportScheme(format, options) {
    const exporter = EXPORTERS[format];
    if (exporter) {
      exporter(options);
    }
  }

  // Слушатели событий
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  loadSampleBtn.addEventListener('click', () => {
    createSampleImage();
  });

  // Drag and drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  cellMmInput.addEventListener('input', () => {
    if (state.srcWidth) {
      const cellMm = parseFloat(cellMmInput.value) || DEFAULTS.CELL_MM;
      widthMmInput.value = (state.srcWidth * cellMm).toFixed(1);
    }
    updateInfo();
  });

  widthMmInput.addEventListener('input', () => {
    if (state.srcWidth) {
      const wMm = parseFloat(widthMmInput.value) || DEFAULTS.WIDTH_MM;
      cellMmInput.value = (wMm / state.srcWidth).toFixed(2);
    }
    updateInfo();
  });

  cellSizeInput.addEventListener('input', () => {
    renderScheme();
    updateInfo();
  });

  showSymbolsInput.addEventListener('change', () => {
    renderScheme();
    renderPalette();
  });

  showNumbersInput.addEventListener('change', () => {
    renderScheme();
    updateInfo();
  });

  // Печать
  printBtn.addEventListener('click', () => {
    updateInfo();
    window.print();
  });

  // Экспорт SVG
  downloadSvgBtn.addEventListener('click', () => {
    exportScheme('svg');
  });

  // Экспорт PNG (300 DPI)
  downloadPngBtn.addEventListener('click', () => {
    exportScheme('png', { dpi: 300 });
  });

  // Запуск образца при первом открытии
  window.addEventListener('DOMContentLoaded', () => {
    createSampleImage();
  });
