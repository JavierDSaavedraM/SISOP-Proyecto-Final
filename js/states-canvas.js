// ============================================================
// CANVAS SETUP
// ============================================================
var statesCanvas = null;
var statesCtx    = null;

var STATE_W = 90;
var STATE_H = 44;
var STATE_R = 8;

// Posiciones de cada nodo
var stateNodes = {
  new:        { x: 60,  y: 120, label: "New",        color: "#aaaadd" },
  ready:      { x: 210, y: 120, label: "Ready",       color: "#80c8f0" },
  running:    { x: 370, y: 120, label: "Running",     color: "#80d0a0" },
  waiting:    { x: 370, y: 260, label: "Waiting",     color: "#f0c080" },
  terminated: { x: 530, y: 120, label: "Terminated",  color: "#f08080" }
};

// Transiciones: { from, to, label, curve }
// curve: 1 = arriba, -1 = abajo, 0 = recta
var stateTransitions = [
  { from: "new",     to: "ready",      label: "admitted",          curve:  0  },
  { from: "ready",   to: "running",    label: "dispatch",          curve: -1  },
  { from: "running", to: "ready",      label: "interrupt",         curve: -1  },
  { from: "running", to: "waiting",    label: "I/O wait",          curve:  0  },
  { from: "waiting", to: "ready",      label: "I/O complete",      curve:  0  },
  { from: "running", to: "terminated", label: "exit",              curve:  0  }
];

var stateAnimAnim   = null;
var activeTransition = null;  // { from, to, progress }
var activeStates     = {};    // { pid: stateName }

// ============================================================
// INIT
// ============================================================
function initStatesCanvas() {
  statesCanvas = document.getElementById("states-canvas");
  if (!statesCanvas) return;
  statesCtx = statesCanvas.getContext("2d");
  statesCanvas.width  = 680;
  statesCanvas.height = 340;
  drawStatesStatic(null, null);
}

// ============================================================
// DRAW STATIC
// ============================================================
function drawStatesStatic(highlightState, highlightTransition) {
  statesCtx.clearRect(0, 0, statesCanvas.width, statesCanvas.height);

  // Flechas
  stateTransitions.forEach(function(t) {
    var isActive = highlightTransition &&
      highlightTransition.from === t.from &&
      highlightTransition.to   === t.to;
    drawArrow(t, isActive ? highlightTransition.progress : 1, isActive);
  });

  // Nodos
  Object.keys(stateNodes).forEach(function(key) {
    var node      = stateNodes[key];
    var isActive  = highlightState === key;
    var hasPIDs   = activeStates && Object.values(activeStates).includes(key);
    drawNode(node, key, isActive, hasPIDs);
  });
}

// ============================================================
// DRAW NODE
// ============================================================
function drawNode(node, key, isActive, hasPIDs) {
  var x = node.x, y = node.y;

  // Sombra si activo
  if (isActive) {
    statesCtx.shadowColor   = "rgba(0,0,0,0.35)";
    statesCtx.shadowBlur    = 12;
    statesCtx.shadowOffsetX = 3;
    statesCtx.shadowOffsetY = 3;
  }

  // Fondo
  statesCtx.fillStyle   = isActive ? darkenColor(node.color) : node.color;
  statesCtx.strokeStyle = isActive ? "#000" : "#555";
  statesCtx.lineWidth   = isActive ? 3 : 2;
  roundRectPath(statesCtx, x, y, STATE_W, STATE_H, STATE_R);
  statesCtx.fill();
  statesCtx.stroke();

  statesCtx.shadowColor = "transparent";
  statesCtx.shadowBlur  = 0;
  statesCtx.shadowOffsetX = 0;
  statesCtx.shadowOffsetY = 0;

  // Label
  statesCtx.fillStyle    = "#000";
  statesCtx.font         = "bold 13px Arial";
  statesCtx.textAlign    = "center";
  statesCtx.textBaseline = "middle";
  statesCtx.fillText(node.label, x + STATE_W / 2, y + STATE_H / 2);

  // PIDs en el nodo
  if (hasPIDs) {
    var pids = Object.keys(activeStates).filter(function(pid) {
      return activeStates[pid] === key;
    }).map(function(pid) { return "P" + pid; }).join(", ");
    statesCtx.fillStyle    = "#333";
    statesCtx.font         = "10px Arial";
    statesCtx.textAlign    = "center";
    statesCtx.textBaseline = "top";
    statesCtx.fillText(pids, x + STATE_W / 2, y + STATE_H + 3);
  }
}

// ============================================================
// DRAW ARROW
// ============================================================
function drawArrow(transition, progress, isActive) {
  var fromNode = stateNodes[transition.from];
  var toNode   = stateNodes[transition.to];

  var x1 = fromNode.x + STATE_W / 2;
  var y1 = fromNode.y + STATE_H / 2;
  var x2 = toNode.x   + STATE_W / 2;
  var y2 = toNode.y   + STATE_H / 2;

  // Ajustar punto de salida/entrada al borde del nodo
  var points = getEdgePoints(fromNode, toNode, transition.curve);
  var px1 = points.x1, py1 = points.y1;
  var px2 = points.x2, py2 = points.y2;

  // Punto de control para curva
  var cpx, cpy;
  if (transition.curve !== 0) {
    var mx  = (px1 + px2) / 2;
    var my  = (py1 + py2) / 2;
    var dx  = px2 - px1;
    var dy  = py2 - py1;
    var len = Math.sqrt(dx * dx + dy * dy);
    cpx = mx - (dy / len) * 40 * transition.curve;
    cpy = my + (dx / len) * 40 * transition.curve;
  }

  // Color
  statesCtx.strokeStyle = isActive ? "#e63" : "#666";
  statesCtx.lineWidth   = isActive ? 2.5 : 1.5;
  statesCtx.setLineDash(isActive ? [] : []);

  statesCtx.beginPath();
  if (transition.curve !== 0) {
    // Dibujar solo hasta progress
    var steps = 30;
    var limit = Math.floor(steps * progress);
    statesCtx.moveTo(px1, py1);
    for (var i = 1; i <= limit; i++) {
      var t  = i / steps;
      var bx = (1-t)*(1-t)*px1 + 2*(1-t)*t*cpx + t*t*px2;
      var by = (1-t)*(1-t)*py1 + 2*(1-t)*t*cpy + t*t*py2;
      statesCtx.lineTo(bx, by);
    }
  } else {
    var ex = px1 + (px2 - px1) * progress;
    var ey = py1 + (py2 - py1) * progress;
    statesCtx.moveTo(px1, py1);
    statesCtx.lineTo(ex, ey);
  }
  statesCtx.stroke();
  statesCtx.setLineDash([]);

  // Arrowhead solo cuando progress = 1
  if (progress >= 1) {
    var angle;
    if (transition.curve !== 0) {
      var t2  = 0.98;
      var bx2 = (1-t2)*(1-t2)*px1 + 2*(1-t2)*t2*cpx + t2*t2*px2;
      var by2 = (1-t2)*(1-t2)*py1 + 2*(1-t2)*t2*cpy + t2*t2*py2;
      angle = Math.atan2(py2 - by2, px2 - bx2);
    } else {
      angle = Math.atan2(py2 - py1, px2 - px1);
    }
    drawArrowHead(px2, py2, angle, isActive ? "#e63" : "#666");
  }

  // Etiqueta
  if (progress >= 1) {
    var lx, ly;
    if (transition.curve !== 0) {
      lx = 0.25*px1 + 0.5*cpx + 0.25*px2;
      ly = 0.25*py1 + 0.5*cpy + 0.25*py2 - 8;
    } else {
      lx = (px1 + px2) / 2;
      ly = (py1 + py2) / 2 - 10;
    }
    statesCtx.fillStyle    = isActive ? "#e63" : "#555";
    statesCtx.font         = isActive ? "bold 10px Arial" : "10px Arial";
    statesCtx.textAlign    = "center";
    statesCtx.textBaseline = "bottom";
    statesCtx.fillText(transition.label, lx, ly);
  }
}

function drawArrowHead(x, y, angle, color) {
  var size = 8;
  statesCtx.fillStyle = color;
  statesCtx.beginPath();
  statesCtx.moveTo(x, y);
  statesCtx.lineTo(
    x - size * Math.cos(angle - Math.PI / 7),
    y - size * Math.sin(angle - Math.PI / 7)
  );
  statesCtx.lineTo(
    x - size * Math.cos(angle + Math.PI / 7),
    y - size * Math.sin(angle + Math.PI / 7)
  );
  statesCtx.closePath();
  statesCtx.fill();
}

// ============================================================
// EDGE POINTS - punto de salida/entrada en borde del nodo
// ============================================================
function getEdgePoints(fromNode, toNode, curve) {
  var fx = fromNode.x + STATE_W / 2;
  var fy = fromNode.y + STATE_H / 2;
  var tx = toNode.x   + STATE_W / 2;
  var ty = toNode.y   + STATE_H / 2;

  var dx  = tx - fx;
  var dy  = ty - fy;
  var len = Math.sqrt(dx * dx + dy * dy);

  // Offset por curva
  var offsetY = curve !== 0 ? 10 * curve : 0;

  // Salida del nodo origen
  var ex1 = fx + (dx / len) * (STATE_W / 2);
  var ey1 = fy + (dy / len) * (STATE_H / 2) + offsetY;

  // Entrada al nodo destino
  var ex2 = tx - (dx / len) * (STATE_W / 2);
  var ey2 = ty - (dy / len) * (STATE_H / 2) + offsetY;

  return { x1: ex1, y1: ey1, x2: ex2, y2: ey2 };
}

// ============================================================
// ANIMACION DE TRANSICION
// ============================================================
function animateTransition(fromState, toState, onComplete) {
  if (stateAnimAnim) {
    cancelAnimationFrame(stateAnimAnim);
    stateAnimAnim = null;
  }

  var startTime = null;
  var duration  = 600;

  function draw(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);

    drawStatesStatic(toState, { from: fromState, to: toState, progress: progress });

    if (progress < 1) {
      stateAnimAnim = requestAnimationFrame(draw);
    } else {
      stateAnimAnim = null;
      if (onComplete) onComplete();
    }
  }

  stateAnimAnim = requestAnimationFrame(draw);
}

// ============================================================
// ACTUALIZAR DESDE SCHEDULING
// Llamado por scheduling.js en cada paso
// ============================================================
function updateStatesDiagram(timeline, step, procs) {
  if (!statesCanvas) return;

  var block = timeline[step - 1];
  if (!block) return;

  // Calcular burst usado por cada PID hasta este paso
  var usedBurst = {};
  timeline.slice(0, step).forEach(function(b) {
    usedBurst[b.pid] = (usedBurst[b.pid] || 0) + (b.end - b.start);
  });

  // Determinar estado de cada proceso
  var prevStates = {};
  Object.keys(activeStates).forEach(function(pid) {
    prevStates[pid] = activeStates[pid];
  });

  activeStates = {};
  procs.forEach(function(p) {
    var used = usedBurst[p.pid] || 0;
    if (used >= p.burst) {
      activeStates[p.pid] = "terminated";
    } else if (p.pid === block.pid) {
      activeStates[p.pid] = "running";
    } else if (p.arrival <= block.start) {
      activeStates[p.pid] = "ready";
    } else {
      activeStates[p.pid] = "new";
    }
  });

  // Determinar transicion del proceso en ejecucion
  var prevState = prevStates[block.pid] || "new";
  var currState = activeStates[block.pid];

  // Actualizar label
  var label = document.getElementById("current-pid-state");
  if (label) label.textContent = "Proceso: P" + block.pid + " → " + currState;

  // Animar transicion si la ventana esta abierta
  var win = document.getElementById("states-canvas");
  if (win && prevState !== currState) {
    animateTransition(prevState, currState, function() {
      drawStatesStatic(currState, null);
    });
  } else {
    drawStatesStatic(currState, null);
  }

  // Actualizar tabla
  updateStatesTable(procs, usedBurst, block);
}

// ============================================================
// TABLA DE ESTADOS
// ============================================================
function updateStatesTable(procs, usedBurst, block) {
  var tbody = document.getElementById("states-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  procs.forEach(function(p) {
    var used  = usedBurst[p.pid] || 0;
    var state;
    if (used >= p.burst) {
      state = "Terminated";
    } else if (p.pid === block.pid) {
      state = "Running";
    } else if (p.arrival <= block.start) {
      state = "Ready";
    } else {
      state = "New";
    }

    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td>P' + p.pid + '</td>' +
      '<td><span class="state-badge state-' + state.toLowerCase() + '">' + state + '</span></td>';
    tbody.appendChild(tr);
  });
}

// ============================================================
// UTILIDADES
// ============================================================
function roundRectPath(ctx, x, y, w, h, r) {
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

function darkenColor(hex) {
  var r = Math.max(0, parseInt(hex.slice(1,3), 16) - 40);
  var g = Math.max(0, parseInt(hex.slice(3,5), 16) - 40);
  var b = Math.max(0, parseInt(hex.slice(5,7), 16) - 40);
  return "rgb(" + r + "," + g + "," + b + ")";
}

// ============================================================
// REPLAY
// ============================================================
document.addEventListener("DOMContentLoaded", function() {
  var btn = document.getElementById("btn-start-states");
  if (btn) {
    btn.addEventListener("click", function() {
      if (!schedState.isRunning && schedState.timeline.length === 0) {
        alert("Primero corre un algoritmo en la ventana de Scheduling.");
        return;
      }

      // Resetear estado visual
      activeStates = {};
      drawStatesStatic(null, null);
      var label = document.getElementById("current-pid-state");
      if (label) label.textContent = "Proceso: Ninguno";
      var tbody = document.getElementById("states-table-body");
      if (tbody) tbody.innerHTML = "";

      // Reproducir paso a paso desde el inicio
      var step = 0;
      function playNext() {
        if (step >= schedState.timeline.length) {
          btn.textContent = "▶ Reiniciar";
          return;
        }
        step++;
        updateStatesDiagram(schedState.timeline, step, simData.processes);
        var speed = 2100 - parseInt(document.getElementById("sched-speed").value);
        setTimeout(playNext, speed);
      }

      btn.textContent = "↺ Reiniciar";
      playNext();
    });
  }
});
