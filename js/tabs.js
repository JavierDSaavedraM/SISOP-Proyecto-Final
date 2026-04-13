// ============================================================
// ESTADO GLOBAL
// ============================================================
var simData = {
    processes: [],
    memory: { total: 64, pageSize: 4, frames: 16 },
    scheduling: { algorithm: "fcfs", quantum: 2 },
    replacement: { algorithm: "fifo", references: [] }
};

// ============================================================
// INICIALIZACIÓN
// ============================================================
$(document).ready(function () {

    // Inicializar tabs de jQuery UI en ventana de datos
    $("#input-tabs").tabs();

    // Mostrar/ocultar quantum según algoritmo
    $("#sched-algorithm").change(function () {
        var val = $(this).val();
        if (val === "rr" || val === "mlfq") {
            $("#quantum-label, #quantum").show();
        } else {
            $("#quantum-label, #quantum").hide();
        }
    });

    // Agregar fila de proceso
    $("#btn-add-row").click(function () {
        addProcessRow();
    });

    // Eliminar fila (delegado porque las filas son dinámicas)
    $("#process-table tbody").on("click", ".btn-remove-row", function () {
        $(this).closest("tr").remove();
    });

    // Cargar datos manuales
    $("#btn-load-manual").click(function () {
        loadManual();
    });

    // Cargar desde archivos
    $("#btn-load-files").click(function () {
        loadFiles();
    });
});

// ============================================================
// AGREGAR FILA A LA TABLA
// ============================================================
function addProcessRow() {
    var tbody = $("#process-table tbody");
    var lastPID = 1;
    tbody.find("tr").each(function () {
        var pid = parseInt($(this).find(".pid").val());
        if (pid >= lastPID) lastPID = pid + 1;
    });

    tbody.append(
        '<tr>' +
        '<td><input type="number" class="pid" min="1" value="' + lastPID + '"></td>' +
        '<td><input type="number" class="arrival" min="0" value="0"></td>' +
        '<td><input type="number" class="burst" min="1" value="1"></td>' +
        '<td><input type="number" class="priority" min="1" value="1"></td>' +
        '<td><input type="number" class="pages" min="1" value="1"></td>' +
        '<td><button class="btn-remove-row">X</button></td>' +
        '</tr>'
    );
}

// ============================================================
// CARGA MANUAL
// ============================================================
function loadManual() {
    // Memoria
    simData.memory.total    = parseInt($("#mem-total").val());
    simData.memory.pageSize = parseInt($("#mem-pagesize").val());
    simData.memory.frames   = parseInt($("#mem-frames").val());

    // Scheduling
    simData.scheduling.algorithm = $("#sched-algorithm").val();
    simData.scheduling.quantum   = parseInt($("#quantum").val());

    // Reemplazo
    simData.replacement.algorithm  = $("#replace-algorithm").val();
    var refRaw = $("#page-references").val().trim();
    simData.replacement.references = refRaw
        ? refRaw.split(",").map(function (x) { return parseInt(x.trim()); })
        : [];

    // Procesos
    simData.processes = [];
    var valid = true;
    $("#process-table tbody tr").each(function () {
        var pid      = parseInt($(this).find(".pid").val());
        var arrival  = parseInt($(this).find(".arrival").val());
        var burst    = parseInt($(this).find(".burst").val());
        var priority = parseInt($(this).find(".priority").val());
        var pages    = parseInt($(this).find(".pages").val());

        if (isNaN(pid) || isNaN(arrival) || isNaN(burst) || isNaN(priority) || isNaN(pages)) {
            valid = false;
            return false; // break each
        }
        simData.processes.push({ pid, arrival, burst, priority, pages });
    });

    if (!valid) {
        alert("Datos incompletos o inválidos en la tabla de procesos.");
        return;
    }

    validateAndDispatch();
}

// ============================================================
// CARGA DESDE ARCHIVOS
// ============================================================
function loadFiles() {
    var fileProcesos = $("#file-procesos")[0].files[0];
    var fileMemoria  = $("#file-memoria")[0].files[0];

    if (!fileProcesos && !fileMemoria) {
        alert("Selecciona al menos un archivo.");
        return;
    }

    var pending = 0;
    if (fileProcesos) pending++;
    if (fileMemoria)  pending++;

    function checkDone() {
        pending--;
        if (pending === 0) validateAndDispatch();
    }

    if (fileProcesos) {
        var r1 = new FileReader();
        r1.onload = function (e) {
            parseProcesos(e.target.result);
            checkDone();
        };
        r1.readAsText(fileProcesos);
    }

    if (fileMemoria) {
        var r2 = new FileReader();
        r2.onload = function (e) {
            parseMemoria(e.target.result);
            checkDone();
        };
        r2.readAsText(fileMemoria);
    }
}

// ============================================================
// PARSERS
// ============================================================
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

function parseMemoria(text) {
    var lines = text.trim().split("\n");
    lines.forEach(function (line) {
        line = line.trim();
        if (line.toLowerCase().startsWith("memoria=")) {
            simData.memory.total = parseInt(line.split("=")[1]);
        } else if (line.toLowerCase().startsWith("pagesize=")) {
            simData.memory.pageSize = parseInt(line.split("=")[1]);
        } else if (line.toLowerCase().startsWith("frames=")) {
            simData.memory.frames = parseInt(line.split("=")[1]);
        }
    });
}

// ============================================================
// VALIDACIÓN Y DISPATCH
// ============================================================
function validateAndDispatch() {
    // Validaciones básicas
    if (simData.processes.length === 0) {
        alert("No hay procesos definidos.");
        return;
    }
    if (simData.memory.frames <= 0 || simData.memory.pageSize <= 0) {
        alert("Configuración de memoria inválida.");
        return;
    }

    // Verificar que frames * pageSize <= memoria total
    if (simData.memory.frames * simData.memory.pageSize > simData.memory.total) {
        alert("Frames × PageSize excede la memoria total.");
        return;
    }

    console.log("simData cargado:", simData);

    // Aquí se llaman las funciones de cada visualizador
    // cuando estén implementados:
    // updateStatesDiagram(simData);
    // updateScheduling(simData);
    // updateMemory(simData);
}
