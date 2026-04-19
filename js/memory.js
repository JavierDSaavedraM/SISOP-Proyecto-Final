// ============================================================
// ESTADO GLOBAL DE MEMORIA
// ============================================================
var memState = {
  frames       : [],    // [{ pid, page, dirty }] o null si libre
  pageFaults   : 0,
  isRunning    : false,
  currentStep  : 0,
  timeline     : []     // snapshot de frames en cada paso
};

var replaceState = {
  references   : [],
  frames       : [],
  step         : 0,
  faults       : 0,
  hits         : 0,
  history      : [],    // [{page, frames, fault, replaced, refBits}]
  isRunning    : false,
  stepPaused   : false,
  fifoQueue    : [],
  lruOrder     : [],
  clockPtr     : 0,
  refBits      : []
};

// Canvas
var memCanvas     = null;
var memCtx        = null;
var replaceCanvas = null;
var replaceCtx    = null;

var FRAME_W  = 100;
var FRAME_H  = 40;
var FRAME_G  = 6;
var COLS     = 4;

// ============================================================
// INIT
// ============================================================
function initTabs(containerSelector) {
  var container = document.querySelector(containerSelector);
  if (!container) return;
  var buttons = container.querySelectorAll(".tab-btn");
  var panels  = container.querySelectorAll(".tab-panel");

  buttons.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var target = btn.getAttribute("data-tab");
      buttons.forEach(function(b) { b.classList.remove("active"); });
      panels.forEach(function(p)  { p.classList.remove("active"); });
      btn.classList.add("active");
      container.querySelector("#" + target).classList.add("active");
    });
  });

  if (buttons.length > 0) buttons[0].click();
}
function initMemoryCanvases() {
  memCanvas     = document.getElementById("mem-canvas");
  memCtx        = memCanvas ? memCanvas.getContext("2d") : null;
  replaceCanvas = document.getElementById("replace-canvas");
  replaceCtx    = replaceCanvas ? replaceCanvas.getContext("2d") : null;
}

document.addEventListener("DOMContentLoaded", function() {
  initTabs("#memory-tabs");
  initMemoryCanvases();
  initMemoryControls();
});

// ============================================================
// CONTROLES
// ============================================================
function initMemoryControls() {
  var btnRun = document.getElementById("btn-run-memory");
  if (btnRun) {
    btnRun.addEventListener("click", function() {
      if (memState.isRunning) {
        resetMemory();
      } else {
        startMemory();
      }
    });
  }

  var btnReset = document.getElementById("btn-reset-memory");
  if (btnReset) {
    btnReset.addEventListener("click", resetMemory);
  }

  var btnRunReplace = document.getElementById("btn-run-replace");
  if (btnRunReplace) {
    btnRunReplace.addEventListener("click", function() {
      if (replaceState.isRunning) {
        resetReplace();
      } else {
        startReplace();
      }
    });
  }

  var btnResetReplace = document.getElementById("btn-reset-replace");
  if (btnResetReplace) {
    btnResetReplace.addEventListener("click", resetReplace);
  }

  var speedSlider = document.getElementById("replace-speed");
  if (speedSlider) {
    speedSlider.addEventListener("input", function() {
      document.getElementById("replace-speed-label").textContent = this.value + "ms";
    });
  }

  var pidSelect = document.getElementById("mem-pid-select");
  if (pidSelect) {
    pidSelect.addEventListener("change", function() {
      renderPageTable(parseInt(this.value));
    });
  }
}

// ============================================================
// MEMORIA PRINCIPAL - CORRER
// ============================================================
function startMemory() {
  if (schedState.timeline.length === 0) {
    alert("Primero corre un algoritmo en Scheduling.");
    return;
  }

  var totalFrames = simData.memory.frames;
  memState.frames      = new Array(totalFrames).fill(null);
  memState.pageFaults  = 0;
  memState.isRunning   = true;
  memState.currentStep = 0;
  memState.timeline    = [];

  document.getElementById("btn-run-memory").textContent = "↺ Reset";
  document.getElementById("btn-reset-memory").disabled  = false;

  // Generar referencias desde scheduling timeline
  generateMemoryTimeline();
  runMemoryStep();
}

function generateMemoryTimeline() {
  var frames     = new Array(simData.memory.frames).fill(null);
  var fifoQueue  = [];
  var references = buildReferenceString();

  memState.timeline = [];
  references.forEach(function(ref) {
    var pid  = ref.pid;
    var page = ref.page;

    // Verificar si la página ya está en memoria
    var hit = frames.some(function(f) {
      return f && f.pid === pid && f.page === page;
    });

    if (!hit) {
      memState.pageFaults++;
      // Buscar frame libre
      var freeIdx = frames.indexOf(null);
      if (freeIdx !== -1) {
        frames[freeIdx] = { pid: pid, page: page, dirty: false };
        fifoQueue.push(freeIdx);
      } else {
        // Reemplazar con FIFO por defecto en memoria principal
        var replaceIdx = fifoQueue.shift();
        frames[replaceIdx] = { pid: pid, page: page, dirty: false };
        fifoQueue.push(replaceIdx);
      }
    }

    memState.timeline.push({
      frames    : frames.map(function(f) { return f ? Object.assign({}, f) : null; }),
      pid       : pid,
      page      : page,
      fault     : !hit
    });
  });
}

function buildReferenceString() {
  var refs = [];
  schedState.timeline.forEach(function(block) {
    var proc = simData.processes.find(function(p) { return p.pid === block.pid; });
    if (!proc) return;
    for (var i = 0; i < proc.pages; i++) {
      refs.push({ pid: block.pid, page: i });
    }
  });
  return refs;
}

function runMemoryStep() {
  var speed = 2100 - parseInt(document.getElementById("sched-speed").value);

  function nextStep() {
    if (memState.currentStep >= memState.timeline.length) {
      document.getElementById("btn-run-memory").textContent = "✓ Terminado";
      return;
    }

    var snap = memState.timeline[memState.currentStep];
    memState.currentStep++;
    memState.frames = snap.frames;

    renderMemoryCanvas(snap);
    updateMemSummary();
    updatePidSelect();

    setTimeout(nextStep, speed);
  }

  nextStep();
}

// ============================================================
// SINCRONIZAR CON SCHEDULING
// Llamado desde scheduling.js en cada paso
// ============================================================
function updateMemoryFromSched(timeline, step) {
  if (!memState.isRunning) return;
  if (memState.currentStep >= memState.timeline.length) return;

  var snap = memState.timeline[memState.currentStep];
  if (!snap) return;
  memState.currentStep++;
  memState.frames = snap.frames;

  renderMemoryCanvas(snap);
  updateMemSummary();
  updatePidSelect();
}

// ============================================================
// RENDER MEMORIA CANVAS
// ============================================================
function renderMemoryCanvas(snap) {
  if (!memCanvas || !memCtx) return;

  var occupied = snap.frames.filter(function(f) { return f !== null; });
  var rows     = Math.ceil(occupied.length / COLS);
  memCanvas.width  = COLS * (FRAME_W + FRAME_G) + FRAME_G;
  memCanvas.height = Math.max(rows * (FRAME_H + FRAME_G) + FRAME_G, 60);

  memCtx.clearRect(0, 0, memCanvas.width, memCanvas.height);

  var col = 0, row = 0;
  snap.frames.forEach(function(f, idx) {
    if (!f) return;

    var x      = FRAME_G + col * (FRAME_W + FRAME_G);
    var y      = FRAME_G + row * (FRAME_H + FRAME_G);
    var color  = getColor(f.pid);
    var isNew  = snap.fault && f.pid === snap.pid && f.page === snap.page;

    // Sombra si es nuevo
    if (isNew) {
      memCtx.shadowColor   = "rgba(0,0,0,0.3)";
      memCtx.shadowBlur    = 8;
      memCtx.shadowOffsetX = 2;
      memCtx.shadowOffsetY = 2;
    }

    memCtx.fillStyle   = color;
    memCtx.strokeStyle = isNew ? "#e63" : "#000";
    memCtx.lineWidth   = isNew ? 3 : 1.5;
    roundRect(memCtx, x, y, FRAME_W, FRAME_H, 5);
    memCtx.fill();
    memCtx.stroke();

    memCtx.shadowColor = "transparent";
    memCtx.shadowBlur  = 0;

    memCtx.fillStyle    = "#000";
    memCtx.font         = "bold 12px Arial";
    memCtx.textAlign    = "center";
    memCtx.textBaseline = "middle";
    memCtx.fillText("P" + f.pid + " | Pág " + f.page, x + FRAME_W / 2, y + FRAME_H / 2);

    // Frame index
    memCtx.fillStyle    = "#555";
    memCtx.font         = "9px Arial";
    memCtx.textAlign    = "left";
    memCtx.textBaseline = "top";
    memCtx.fillText("F" + idx, x + 3, y + 2);

    col++;
    if (col >= COLS) { col = 0; row++; }
  });
}

// ============================================================
// SUMMARY Y TABLA DE PAGINAS
// ============================================================
function updateMemSummary() {
  var total    = simData.memory.frames;
  var used     = memState.frames.filter(function(f) { return f !== null; }).length;
  var free     = total - used;
  var fragBytes = used * simData.memory.pageSize - used * simData.memory.pageSize; // 0 con paginacion pura

  document.getElementById("mem-used").textContent        = used;
  document.getElementById("mem-free").textContent        = free;
  document.getElementById("mem-fragmentation").textContent = "0 KB";
  document.getElementById("mem-page-faults").textContent = memState.pageFaults;
  document.getElementById("mem-status").textContent      = "Frames libres: " + free + " / " + total;
}

function updatePidSelect() {
  var select = document.getElementById("mem-pid-select");
  if (!select) return;
  var current = select.value;
  select.innerHTML = '<option value="">-- Seleccionar --</option>';
  simData.processes.forEach(function(p) {
    var opt = document.createElement("option");
    opt.value       = p.pid;
    opt.textContent = "P" + p.pid;
    select.appendChild(opt);
  });
  if (current) {
    select.value = current;
    renderPageTable(parseInt(current));
  }
}

function renderPageTable(pid) {
  var tbody = document.getElementById("mem-page-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!pid) return;

  var proc = simData.processes.find(function(p) { return p.pid === pid; });
  if (!proc) return;

  for (var page = 0; page < proc.pages; page++) {
    var frameIdx = -1;
    memState.frames.forEach(function(f, i) {
      if (f && f.pid === pid && f.page === page) frameIdx = i;
    });

    var valid = frameIdx !== -1;
    var tr    = document.createElement("tr");
    tr.innerHTML =
      '<td>' + page + '</td>' +
      '<td>' + (valid ? "F" + frameIdx : "-") + '</td>' +
      '<td><span class="valid-bit ' + (valid ? "valid" : "invalid") + '">' + (valid ? "1" : "0") + '</span></td>' +
      '<td>0</td>';
    tbody.appendChild(tr);
  }
}

// ============================================================
// RESET MEMORIA
// ============================================================
function resetMemory() {
  memState.frames      = [];
  memState.pageFaults  = 0;
  memState.isRunning   = false;
  memState.currentStep = 0;
  memState.timeline    = [];

  document.getElementById("btn-run-memory").textContent = "▶ Correr";
  document.getElementById("btn-reset-memory").disabled  = true;
  document.getElementById("mem-used").textContent       = "-";
  document.getElementById("mem-free").textContent       = "-";
  document.getElementById("mem-fragmentation").textContent = "-";
  document.getElementById("mem-page-faults").textContent  = "0";
  document.getElementById("mem-status").textContent     = "Frames libres: - / -";
  document.getElementById("mem-page-table-body").innerHTML = "";

  if (memCtx) memCtx.clearRect(0, 0, memCanvas.width, memCanvas.height);
}

// ============================================================
// ALGORITMOS DE REEMPLAZO
// ============================================================
function startReplace() {
  if (schedState.timeline.length === 0) {
    alert("Primero corre un algoritmo en Scheduling.");
    return;
  }

  var algorithm  = document.getElementById("replace-algorithm").value;
  var frames     = simData.memory.frames;
  var references = buildReferenceString().map(function(r) { return r.pid * 100 + r.page; });

  replaceState.references = references;
  replaceState.frames     = new Array(frames).fill(null);
  replaceState.step       = 0;
  replaceState.faults     = 0;
  replaceState.hits       = 0;
  replaceState.history    = [];
  replaceState.isRunning  = true;
  replaceState.stepPaused = false;
  replaceState.fifoQueue  = [];
  replaceState.lruOrder   = [];
  replaceState.clockPtr   = 0;
  replaceState.refBits    = new Array(frames).fill(0);

  document.getElementById("btn-run-replace").textContent    = "↺ Reset";
  document.getElementById("btn-reset-replace").disabled     = false;

  // Generar historia completa del algoritmo
  generateReplaceHistory(algorithm, references, frames);
  renderRefSequence();
  runReplaceStep();
}

function generateReplaceHistory(algorithm, references, numFrames) {
  var frames   = new Array(numFrames).fill(null);
  var history  = [];
  var fifo     = [];
  var lruOrder = [];
  var clockPtr = 0;
  var refBits  = new Array(numFrames).fill(0);

  references.forEach(function(page, i) {
    var framesCopy = frames.slice();
    var hit        = frames.indexOf(page) !== -1;
    var replaced   = null;
    var fault      = !hit;
    var rbCopy     = refBits.slice();

    if (!hit) {
      var freeIdx = frames.indexOf(null);
      if (freeIdx !== -1) {
        frames[freeIdx] = page;
        if (algorithm === "fifo")   fifo.push(freeIdx);
        if (algorithm === "lru")    lruOrder.push(page);
        if (algorithm === "clock" || algorithm === "second") {
          refBits[freeIdx] = 1;
        }
      } else {
        var replaceIdx;
        if (algorithm === "fifo") {
          replaceIdx = fifo.shift();
          replaced   = frames[replaceIdx];
          frames[replaceIdx] = page;
          fifo.push(replaceIdx);
        } else if (algorithm === "lru") {
          var lruPage = lruOrder.shift();
          replaceIdx  = frames.indexOf(lruPage);
          replaced    = frames[replaceIdx];
          frames[replaceIdx] = page;
          lruOrder.push(page);
        } else if (algorithm === "optimal") {
          var future  = references.slice(i + 1);
          var farthest = -1;
          replaceIdx  = 0;
          frames.forEach(function(f, idx) {
            var nextUse = future.indexOf(f);
            if (nextUse === -1) nextUse = Infinity;
            if (nextUse > farthest) { farthest = nextUse; replaceIdx = idx; }
          });
          replaced = frames[replaceIdx];
          frames[replaceIdx] = page;
        } else if (algorithm === "clock") {
          while (refBits[clockPtr] === 1) {
            refBits[clockPtr] = 0;
            clockPtr = (clockPtr + 1) % numFrames;
          }
          replaceIdx = clockPtr;
          replaced   = frames[replaceIdx];
          frames[replaceIdx] = page;
          refBits[replaceIdx] = 1;
          clockPtr = (clockPtr + 1) % numFrames;
        } else if (algorithm === "second") {
          while (refBits[clockPtr] === 1) {
            refBits[clockPtr] = 0;
            clockPtr = (clockPtr + 1) % numFrames;
          }
          replaceIdx = clockPtr;
          replaced   = frames[replaceIdx];
          frames[replaceIdx] = page;
          refBits[replaceIdx] = 0;
          clockPtr = (clockPtr + 1) % numFrames;
        }
      }
    } else {
      if (algorithm === "lru") {
        var idx = lruOrder.indexOf(page);
        if (idx !== -1) lruOrder.splice(idx, 1);
        lruOrder.push(page);
      }
      if (algorithm === "clock" || algorithm === "second") {
        var fi = frames.indexOf(page);
        if (fi !== -1) refBits[fi] = 1;
      }
    }

    rbCopy = refBits.slice();
    history.push({
      page     : page,
      frames   : frames.slice(),
      fault    : fault,
      replaced : replaced,
      refBits  : rbCopy
    });
  });

  replaceState.history = history;
}

// ============================================================
// RENDER SECUENCIA DE REFERENCIAS
// ============================================================
function renderRefSequence() {
  var el = document.getElementById("ref-sequence");
  if (!el) return;
  el.innerHTML = "";
  replaceState.references.forEach(function(page, i) {
    var span = document.createElement("span");
    span.className   = "ref-chip";
    span.id          = "ref-chip-" + i;
    span.textContent = page;
    el.appendChild(span);
  });
}

// ============================================================
// RENDER REPLACE CANVAS
// ============================================================
function renderReplaceCanvas(stepIdx) {
  if (!replaceCanvas || !replaceCtx) return;

  var snap     = replaceState.history[stepIdx];
  var numFrames = simData.memory.frames;

  replaceCanvas.width  = numFrames * (FRAME_W + FRAME_G) + FRAME_G;
  replaceCanvas.height = FRAME_H + FRAME_G * 2;

  replaceCtx.clearRect(0, 0, replaceCanvas.width, replaceCanvas.height);

  snap.frames.forEach(function(page, i) {
    var x      = FRAME_G + i * (FRAME_W + FRAME_G);
    var y      = FRAME_G;
    var isEmpty = page === null;
    var isNew   = snap.fault && page === snap.page && snap.frames.indexOf(page) === i;

    replaceCtx.fillStyle   = isEmpty ? "#eee" : (isNew ? "#80d0a0" : "#b7b7e0");
    replaceCtx.strokeStyle = isNew ? "#2a2" : "#000";
    replaceCtx.lineWidth   = isNew ? 3 : 1.5;
    roundRect(replaceCtx, x, y, FRAME_W, FRAME_H, 5);
    replaceCtx.fill();
    replaceCtx.stroke();

    replaceCtx.fillStyle    = "#000";
    replaceCtx.font         = "bold 12px Arial";
    replaceCtx.textAlign    = "center";
    replaceCtx.textBaseline = "middle";
    replaceCtx.fillText(isEmpty ? "libre" : "Pág " + page, x + FRAME_W / 2, y + FRAME_H / 2);

    // Frame label
    replaceCtx.fillStyle    = "#555";
    replaceCtx.font         = "9px Arial";
    replaceCtx.textAlign    = "left";
    replaceCtx.textBaseline = "top";
    replaceCtx.fillText("F" + i, x + 3, y + 2);
  });
}

// ============================================================
// RENDER REPLACE TABLE
// ============================================================
function renderReplaceTable(upToStep) {
  var tbody = document.getElementById("replace-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  replaceState.history.slice(0, upToStep).forEach(function(snap, i) {
    var tr = document.createElement("tr");
    if (snap.fault) tr.classList.add("fault-row");
    tr.innerHTML =
      '<td>' + (i + 1) + '</td>' +
      '<td>' + snap.page + '</td>' +
      '<td>' + snap.frames.map(function(f, i) {
        return f === null ? "-" : "F" + i + ":" + f;
      }).join(" | ") + '</td>' +
      '<td>' + (snap.fault ? "✗" : "✓") + '</td>' +
      '<td>' + (snap.replaced !== null && snap.replaced !== undefined ? snap.replaced : "-") + '</td>' +
      '<td>' + snap.refBits.join(" | ") + '</td>';
    tbody.appendChild(tr);
  });
}

// ============================================================
// PASO AUTOMATICO REEMPLAZO
// ============================================================
function runReplaceStep() {
  replaceState.stepPaused = false;

  function nextStep() {
    if (replaceState.stepPaused) return;
    if (replaceState.step >= replaceState.history.length) {
      document.getElementById("btn-run-replace").textContent = "✓ Terminado";
      document.getElementById("btn-run-replace").disabled    = true;
      return;
    }

    var snap  = replaceState.history[replaceState.step];
    var speed = parseInt(document.getElementById("replace-speed").value);

    if (snap.fault) replaceState.faults++;
    else            replaceState.hits++;

    // Resaltar chip de referencia actual
    document.querySelectorAll(".ref-chip").forEach(function(c) {
      c.classList.remove("ref-chip-active");
    });
    var chip = document.getElementById("ref-chip-" + replaceState.step);
    if (chip) chip.classList.add("ref-chip-active");

    renderReplaceCanvas(replaceState.step);
    renderReplaceTable(replaceState.step + 1);
    updateReplaceSummary();

    replaceState.step++;
    setTimeout(nextStep, speed);
  }

  nextStep();
}

function updateReplaceSummary() {
  var total = replaceState.faults + replaceState.hits;
  var rate  = total > 0 ? ((replaceState.faults / total) * 100).toFixed(1) + "%" : "-";
  document.getElementById("replace-faults").textContent = replaceState.faults;
  document.getElementById("replace-hits").textContent   = replaceState.hits;
  document.getElementById("replace-rate").textContent   = rate;
}

// ============================================================
// RESET REEMPLAZO
// ============================================================
function resetReplace() {
  replaceState.references  = [];
  replaceState.frames      = [];
  replaceState.step        = 0;
  replaceState.faults      = 0;
  replaceState.hits        = 0;
  replaceState.history     = [];
  replaceState.isRunning   = false;
  replaceState.stepPaused  = false;

  document.getElementById("btn-run-replace").textContent = "▶ Correr";
  document.getElementById("btn-run-replace").disabled    = false;
  document.getElementById("btn-reset-replace").disabled  = true;
  document.getElementById("replace-faults").textContent  = "0";
  document.getElementById("replace-hits").textContent    = "0";
  document.getElementById("replace-rate").textContent    = "-";
  document.getElementById("replace-table-body").innerHTML = "";
  document.getElementById("ref-sequence").innerHTML      = "";

  if (replaceCtx) replaceCtx.clearRect(0, 0, replaceCanvas.width, replaceCanvas.height);
}
