// Anclar el elemento html con la funcion funcion de las tabs
document.addEventListener("DOMContentLoaded", function () {
  var container = document.querySelector("#input-datos");
  if (!container) return;
  var buttons = container.querySelectorAll(".tab-btn");
  var panels = container.querySelectorAll(".tab-panel");
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-tab");
      buttons.forEach(function (b) {
        b.classList.remove("active");
      });
      panels.forEach(function (p) {
        p.classList.remove("active");
      });
      btn.classList.add("active");
      container.querySelector("#" + target)
        .classList.add("active");
    });
  });

  if (buttons.length > 0) buttons[0].click();
});


// ── Estructura para algoritmos ──────────────────────────────────────────
var simData = {
  processes: [],
  memory: { total: 64, pageSize: 4, frames: 16 },
  scheduling: { algorithm: "fcfs", quantum: 2 },
  replacement: { algorithm: "fifo", references: [] }
};

// ── Render ──────────────────────────────────────────
// Unica funcion que escribe en la tabla HTML
function renderTabla() {
  var tbody = document.querySelector("#tabla-procesos tbody");
  tbody.innerHTML = "";
  simData.processes.forEach(function(p) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td><input type="number" class="pid"      value="' + p.pid      + '" readonly></td>' +
      '<td><input type="number" class="arrival"  value="' + p.arrival  + '"></td>' +
      '<td><input type="number" class="burst"    value="' + p.burst    + '"></td>' +
      '<td><input type="number" class="priority" value="' + p.priority + '"></td>' +
      '<td><input type="number" class="pages"    value="' + p.pages    + '"></td>' +
      '<td><button class="btn-remove-row">X</button></td>';
    tbody.appendChild(tr);
  });
}

// ── Sincronizar tabla → simData ─────────────────────
// Lee la tabla y actualiza simData.processes
function syncFromTabla() {
  var rows = document.querySelectorAll("#tabla-procesos tbody tr");
  simData.processes = [];
  rows.forEach(function(tr, index) {
    simData.processes.push({
      pid:      index + 1,
      arrival:  parseInt(tr.querySelector(".arrival").value)  || 0,
      burst:    parseInt(tr.querySelector(".burst").value)    || 1,
      priority: parseInt(tr.querySelector(".priority").value) || 1,
      pages:    parseInt(tr.querySelector(".pages").value)    || 1
    });
  });
}

// ── Agregar proceso ─────────────────────────────────
document.getElementById("btn-add-proceso").addEventListener("click", function() {
  syncFromTabla();
  var nextPID = simData.processes.length > 0
    ? simData.processes[simData.processes.length - 1].pid + 1
    : 1;
  simData.processes.push({ pid: nextPID, arrival: 0, burst: 1, priority: 1, pages: 1 });
  renderTabla();
});

// ── Eliminar proceso ────────────────────────────────
document.querySelector("#tabla-procesos tbody").addEventListener("click", function(e) {
  if (e.target.classList.contains("btn-remove-row")) {
    var index = e.target.closest("tr").rowIndex - 1;
    simData.processes.splice(index, 1);
    // Reasignar PIDs
    simData.processes.forEach(function(p, i) { p.pid = i + 1; });
    renderTabla();
  }
});

// ── Edicion manual en la tabla ──────────────────────
document.querySelector("#tabla-procesos tbody").addEventListener("change", function(e) {
  syncFromTabla();
});

// ── Carga desde archivo de procesos ─────────────────
document.getElementById("file-procesos").addEventListener("change", function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    parseProcesos(e.target.result);
    renderTabla();
    showStatus("status-procesos");
  };
  reader.readAsText(file);
});

function parseProcesos(text) {
  simData.processes = [];
  var lines = text.trim().split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line === "" || line.toLowerCase().startsWith("pid")) continue;
    var parts = line.split(",");
    if (parts.length < 5) continue;
    simData.processes.push({
      pid:      parseInt(parts[0]),
      arrival:  parseInt(parts[1]),
      burst:    parseInt(parts[2]),
      priority: parseInt(parts[3]),
      pages:    parseInt(parts[4])
    });
  }
}
// Mostrar carga exitosa de archivos
function showStatus(id) {
  var el = document.getElementById(id);
  el.classList.remove("hidden");
  setTimeout(function() {
    el.classList.add("hidden");
  }, 3000);
}

// ── Carga desde archivo de memoria ──────────────────
document.getElementById("file-memoria").addEventListener("change", function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    parseMemoria(e.target.result);
    renderMemoria();
    showStatus("status-memoria");
  };
  reader.readAsText(file);
});

function parseMemoria(text) {
  var lines = text.trim().split("\n");
  lines.forEach(function(line) {
    line = line.trim();
    var parts = line.split("=");
    if (parts.length < 2) return;
    var key = parts[0].trim().toLowerCase();
    var val = parseInt(parts[1].trim());
    if      (key === "memoria")  simData.memory.total    = val;
    else if (key === "pagesize") simData.memory.pageSize = val;
    else if (key === "frames")   simData.memory.frames   = val;
  });
}

// ── Render memoria ───────────────────────────────────
// Actualiza los inputs de la tab de memoria con simData
function renderMemoria() {
  document.querySelector(".mem-total").value    = simData.memory.total;
  document.querySelector(".mem-pagesize").value = simData.memory.pageSize;
  document.querySelector(".mem-frames").value   = simData.memory.frames;
}

// ── Edicion manual de memoria ────────────────────────
document.getElementById("form-memoria").addEventListener("change", function() {
  simData.memory.total    = parseInt(document.querySelector(".mem-total").value)    || 64;
  simData.memory.pageSize = parseInt(document.querySelector(".mem-pagesize").value) || 4;
  simData.memory.frames   = parseInt(document.querySelector(".mem-frames").value)   || 16;
});
