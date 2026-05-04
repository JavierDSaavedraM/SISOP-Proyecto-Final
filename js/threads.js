// ============================================================
// ESTADO GLOBAL DE THREADS
// ============================================================
var threadState = {
  processes  : [],   // procesos con threads generados
  cores      : [],   // [{ id, currentThread }]
  timeline   : [],   // [{ coreId, threadId, pid, start, end }]
  currentStep: 0,
  isRunning  : false,
  stepPaused : false,
  numCores   : 2
};

// ============================================================
// GENERACION DE THREADS Y FORKS
// ============================================================
function generateThreadsAndForks() {
  threadState.processes = [];
  var nextPID = Math.max.apply(null, simData.processes.map(function(p) { return p.pid; })) + 1;

  simData.processes.forEach(function(p) {
    var numThreads  = p.pages || 1;
    var burstThread = Math.round((p.burst / numThreads) * 100) / 100;

    if (p.type === "fork") {
      // Proceso original
      var original = {
        pid     : p.pid,
        label   : "P" + p.pid,
        type    : "process",
        arrival : p.arrival,
        burst   : p.burst,
        priority: p.priority,
        memory  : { frames: [], pageSize: simData.memory ? simData.memory.pageSize : 4 },
        threads : []
      };
      for (var t = 0; t < numThreads; t++) {
        original.threads.push({
          id       : t + 1,
          label    : "P" + p.pid + "-T" + (t + 1),
          burst    : burstThread,
          remaining: burstThread,
          arrival  : p.arrival,
          state    : "new",
          core     : null
        });
      }
      threadState.processes.push(original);

      // Proceso fork - PID nuevo, memoria separada
      var fork = {
        pid     : nextPID,
        label   : "F" + p.pid + "-" + nextPID,
        type    : "fork",
        arrival : p.arrival,
        burst   : p.burst,
        priority: p.priority,
        memory  : { frames: [], pageSize: simData.memory ? simData.memory.pageSize : 4 },
        threads : []
      };
      for (var tf = 0; tf < numThreads; tf++) {
        fork.threads.push({
          id       : tf + 1,
          label    : "P" + nextPID + "-T" + (tf + 1),
          burst    : burstThread,
          remaining: burstThread,
          arrival  : p.arrival,
          state    : "new",
          core     : null
        });
      }
      threadState.processes.push(fork);
      nextPID++;

    } else {
      // Thread normal - comparte memoria del proceso padre
      var proc = {
        pid     : p.pid,
        label   : "P" + p.pid,
        type    : "thread",
        arrival : p.arrival,
        burst   : p.burst,
        priority: p.priority,
        memory  : null,   // comparte memoria del padre
        threads : []
      };
      for (var th = 0; th < numThreads; th++) {
        proc.threads.push({
          id       : th + 1,
          label    : "P" + p.pid + "-T" + (th + 1),
          burst    : burstThread,
          remaining: burstThread,
          arrival  : p.arrival,
          state    : "new",
          core     : null
        });
      }
      threadState.processes.push(proc);
    }
  });
}

// ============================================================
// SCHEDULER MULTICORE
// Adapta el algoritmo seleccionado para distribuir threads entre cores
// ============================================================
function runMulticoreScheduler() {
  var numCores  = threadState.numCores;
  var algorithm = document.getElementById("thread-algorithm") 
    ? document.getElementById("thread-algorithm").value 
    : "fcfs";

  // Flatten todos los threads de todos los procesos
  var allThreads = [];
  threadState.processes.forEach(function(proc) {
    proc.threads.forEach(function(t) {
      allThreads.push({
        pid      : proc.pid,
        tid      : t.id,
        label    : t.label,
        arrival  : proc.arrival,
        burst    : t.burst,
        remaining: t.burst,
        priority : proc.priority,
        isFork   : proc.type === "fork",  // agregar esto
        state    : "new"
      });
    });
  });

  var timeline  = [];
  var time      = 0;
  var cores     = new Array(numCores).fill(null).map(function(_, i) {
    return { id: i, free: true, freeAt: 0 };
  });
  var remaining = allThreads.slice();
  var quantum   = parseInt(document.getElementById("thread-quantum") 
    ? document.getElementById("thread-quantum").value 
    : 2) || 2;

  var maxTime = allThreads.reduce(function(acc, t) { return acc + t.burst; }, 0)
    + Math.max.apply(null, allThreads.map(function(t) { return t.arrival; })) + 1;

  while (remaining.length > 0 && time <= maxTime) {
    // Liberar cores que terminaron
    cores.forEach(function(core) {
      if (!core.free && core.freeAt <= time) core.free = true;
    });

    var freeCores = cores.filter(function(c) { return c.free; });
    if (freeCores.length === 0) { time++; continue; }

    var available = remaining.filter(function(t) { return t.arrival <= time; });
    if (available.length === 0) { time++; continue; }

    // Ordenar según algoritmo
    if (algorithm === "fcfs") {
      available.sort(function(a, b) { return a.arrival - b.arrival || a.pid - b.pid; });
    } else if (algorithm === "sjf" || algorithm === "srtf") {
      available.sort(function(a, b) { return a.remaining - b.remaining; });
    } else if (algorithm === "priority") {
      available.sort(function(a, b) { return a.priority - b.priority || a.arrival - b.arrival; });
    } else if (algorithm === "rr") {
      // Round robin - tomar en orden
      available.sort(function(a, b) { return a.arrival - b.arrival; });
    }

    // Asignar threads disponibles a cores libres
    var assigned = 0;
    freeCores.forEach(function(core) {
      if (assigned >= available.length) return;
      var t = available[assigned];
      assigned++;

      var runTime = algorithm === "rr"
        ? Math.min(quantum, t.remaining)
        : t.remaining;

      timeline.push({
        coreId  : core.id,
        pid     : t.pid,
        tid     : t.tid,
        label   : t.label,
        isFork  : t.isFork,  // agregar esto
        start   : time,
        end     : time + runTime
      });

      t.remaining -= runTime;
      core.free    = false;
      core.freeAt  = time + runTime;

      if (t.remaining <= 0) {
        remaining.splice(remaining.indexOf(t), 1);
      }
    });

    // Avanzar tiempo al siguiente evento
    var nextEvent = Math.min.apply(null, cores.map(function(c) { return c.freeAt; }));
    time = nextEvent;
  }

  return timeline;
}

// ============================================================
// INICIAR SIMULACION
// ============================================================
function startThreads() {
  if (simData.processes.length === 0) {
    alert("No hay procesos en simData.");
    return;
  }

  var rawCores = parseInt(document.getElementById("thread-cores").value) || 2;
  if (rawCores > 10) {
    alert("Máximo 10 cores permitidos. Se usarán 10.");
  }
  threadState.numCores = Math.min(10, Math.max(1, rawCores));
  document.getElementById("thread-cores").value = threadState.numCores;

  generateThreadsAndForks();

  var timeline = runMulticoreScheduler();
  threadState.timeline    = timeline;
  threadState.currentStep = 0;
  threadState.isRunning   = true;
  threadState.stepPaused  = false;
  threadState.cores       = new Array(threadState.numCores).fill(null).map(function(_, i) {
    return { id: i, currentThread: null };
  });

  document.getElementById("btn-run-threads").textContent  = "↺ Reset";
  document.getElementById("btn-run-threads").classList.add("running");
  document.getElementById("btn-pause-threads").disabled   = false;
  document.getElementById("btn-reset-threads").disabled   = false;

  initThreadCanvases();
  runThreadStep();
}

function resetThreads() {
  threadState.processes   = [];
  threadState.cores       = [];
  threadState.timeline    = [];
  threadState.currentStep = 0;
  threadState.isRunning   = false;
  threadState.stepPaused  = false;

  document.getElementById("btn-run-threads").textContent  = "▶ Correr";
  document.getElementById("btn-run-threads").classList.remove("running");
  document.getElementById("btn-pause-threads").textContent = "⏸ Pausar";
  document.getElementById("btn-pause-threads").disabled   = true;
  document.getElementById("btn-reset-threads").disabled   = true;

  var tbody = document.getElementById("thread-table-body");
  if (tbody) tbody.innerHTML = "";

  resetThreadCanvases();
}

// ============================================================
// PASO AUTOMATICO
// ============================================================
function runThreadStep() {
  document.getElementById("btn-pause-threads").textContent = "⏸ Pausar";
  threadState.stepPaused = false;

  function nextStep() {
    if (threadState.stepPaused) return;
    if (threadState.currentStep >= threadState.timeline.length) {
      document.getElementById("btn-pause-threads").textContent = "✓ Terminado";
      document.getElementById("btn-pause-threads").disabled    = true;
      return;
    }

    threadState.currentStep++;
    var step     = threadState.currentStep;
    var timeline = threadState.timeline;
    var speed    = 2100 - parseInt(document.getElementById("thread-speed").value);

    // Actualizar estado de cores
    var block = timeline[step - 1];
    threadState.cores[block.coreId].currentThread = block;

    updateCoresGrid(timeline, step);
    renderThreadGantt(timeline, step, function() {
      setTimeout(nextStep, speed * 0.4);
    });
  }

  nextStep();
}

// ============================================================
// RENDER TABLA DE THREADS
// ============================================================


function updateCoresGrid(timeline, step) {
  var block = timeline[step - 1];
  if (!block) return;

  // Calcular qué corre en cada core en este instante
  var active = {};
  timeline.slice(0, step).forEach(function(b) {
    if (b.start <= block.start && b.end > block.start) {
      active[b.coreId] = b;
    }
  });

  threadState.cores.forEach(function(core) {
    var el = document.getElementById("core-box-" + core.id);
    if (!el) return;
    var running = active[core.id];
    if (running) {
      el.style.background = getThreadColor(running.pid, running.tid);
      el.querySelector(".core-label").textContent = running.label;
      el.querySelector(".core-status").textContent = "t=" + parseFloat(running.start.toFixed(2)) + "→" + parseFloat(running.end.toFixed(2));
    } else {
      el.style.background = "#eee";
      el.querySelector(".core-label").textContent = "Idle";
      el.querySelector(".core-status").textContent = "";
    }
  });
}

// ============================================================
// CONTROLES
// ============================================================
document.addEventListener("DOMContentLoaded", function() {
  var btnRun = document.getElementById("btn-run-threads");
  if (btnRun) {
    btnRun.addEventListener("click", function() {
      if (threadState.isRunning) { resetThreads(); return; }
      startThreads();
    });
  }

  var btnPause = document.getElementById("btn-pause-threads");
  if (btnPause) {
    btnPause.addEventListener("click", function() {
      if (!threadState.isRunning) return;
      if (!threadState.stepPaused) {
        threadState.stepPaused = true;
        if (threadAnimState && threadAnimState.blockAnim) {
          cancelAnimationFrame(threadAnimState.blockAnim);
          threadAnimState.blockAnim = null;
        }
        btnPause.textContent = "▶ Continuar";
      } else {
        runThreadStep();
      }
    });
  }

  var btnReset = document.getElementById("btn-reset-threads");
  if (btnReset) {
    btnReset.addEventListener("click", resetThreads);
  }

  var speedSlider = document.getElementById("thread-speed");
  if (speedSlider) {
    speedSlider.addEventListener("input", function() {
      document.getElementById("thread-speed-label").textContent = (2100 - parseInt(this.value)) + "ms";
    });
  }

  var coresInput = document.getElementById("thread-cores");
  if (coresInput) {
    coresInput.addEventListener("change", function() {
      renderCoresGrid(parseInt(this.value) || 2);
    });
    renderCoresGrid(2);
  }
});

function renderCoresGrid(numCores) {
  var grid = document.getElementById("cores-grid");
  if (!grid) return;
  grid.innerHTML = "";
  for (var i = 0; i < numCores; i++) {
    var div = document.createElement("div");
    div.className = "core-box";
    div.id        = "core-box-" + i;
    div.innerHTML =
      '<div class="core-title">Core ' + i + '</div>' +
      '<div class="core-label">Idle</div>' +
      '<div class="core-status"></div>';
    grid.appendChild(div);
  }
}

// ============================================================
// COLOR POR THREAD
// ============================================================
var threadColors = [
  "#00d4f0","#33e0f5","#66ebf8",
  "#00ffb3","#33ffc2","#66ffd1",
  "#7cff00","#99ff33","#b3ff66",
  "#ffd400","#ffe033","#ffeb66",
  "#ff9a00","#ffad33","#ffc066",
  "#ff5cc8","#ff85d6","#ffade3"
];

function getThreadColor(pid, tid) {
  var base = (pid - 1) * 3;
  var idx  = (base + (tid - 1)) % threadColors.length;
  return threadColors[idx];
}
