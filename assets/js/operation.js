/* =====================================================
   CALENDARIO VISUAL SOLO FECHA (Vanilla JS Datepicker)
===================================================== */
const inputFecha = document.getElementById('fechaCustomMostrar');
let fechaCustomValue = null;

const picker = new Datepicker(inputFecha, {
    format: "yyyy-mm-dd",
    autohide: true,
    todayHighlight: true,
    language: "es"
});

inputFecha.addEventListener('changeDate', function (e) {
    fechaCustomValue = e.detail.date;
    if (fechaCustomValue) {
        const d = fechaCustomValue;
        const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        inputFecha.value = str;
    }
});


/* =====================================================
   SUPABASE
===================================================== */
const sb = window.supabase.createClient(
    "https://api.solargentinotv.com.ar",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwemd4dmtlZHNkampoenp5eXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MzQwOTAsImV4cCI6MjA4NTExMDA5MH0.RgFghlZVV4Ww27rfh96nTiafDwRu9jtC3S6Y6aFdIxE"
);

const $ = id => document.getElementById(id);


/* =====================================================
   STATE
===================================================== */
let editId = null;
let currentFile = null;
let currentVideos = []; // modo normal (sin señales)
let estadoActual = "borrador";

// para edición (detectar cambios)
let prevUsaDropdown = false;
let prevGroupIds = [];


/* =====================================================
   PROGRESS BAR (barra simple)
===================================================== */
let progressWrap = null;
let progressEl = null;

function ensureProgressUI() {
    if (progressWrap && progressEl) return;

    const formCard = document.querySelector(".formCard") || document.body;

    progressWrap = document.createElement("div");
    progressWrap.className = "progress-bar";
    progressWrap.style.display = "none";

    progressEl = document.createElement("progress");
    progressEl.max = 100;
    progressEl.value = 0;

    progressWrap.appendChild(progressEl);

    const rowBtns = formCard.querySelector(".row") || null;
    if (rowBtns) formCard.insertBefore(progressWrap, rowBtns);
    else formCard.appendChild(progressWrap);
}

function setProgress(val) {
    ensureProgressUI();
    progressWrap.style.display = "block";
    progressEl.value = Math.max(0, Math.min(100, val));
}

function hideProgressSoon() {
    setTimeout(() => {
        if (!progressWrap) return;
        progressWrap.style.display = "none";
        progressEl.value = 0;
    }, 600);
}


/* =====================================================
   UTILS
===================================================== */
function slugify(text) {
    return (text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, "")
        .replaceAll(" ", "-");
}

function uid() {
    return Date.now() + "-" + Math.random().toString(36).slice(2);
}

function isValidSignalId(id) {
    return /^[a-z0-9][a-z0-9-]*$/.test(id);
}


/* =====================================================
   AUTH
===================================================== */
$("loginBtn").onclick = login;
$("logoutBtn").onclick = logout;

async function login() {
    const { error } = await sb.auth.signInWithPassword({
        email: $("email").value,
        password: $("password").value
    });
    if (error) return alert(error.message);
    init();
}

async function logout() {
    await sb.auth.signOut();
    location.reload();
}


/* =====================================================
   INIT
===================================================== */
async function init() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;

    $("loginBox").classList.add("hidden");
    $("dash").classList.remove("hidden");
    $("logoutBtn").classList.remove("hidden");

    hookSignalsUI();
    cargar();
}
init();


/* =====================================================
   DROPDOWN ESTADO
===================================================== */
const estadoSelected = $("estadoSelected");
const estadoMenu = $("estadoMenu");

estadoSelected.onclick = () => estadoMenu.classList.toggle("hidden");

document.querySelectorAll(".estadoItem").forEach(item => {
    item.onclick = () => {
        estadoActual = item.dataset.value;
        estadoSelected.innerText = item.innerText;
        estadoMenu.classList.add("hidden");
    };
});


/* =====================================================
   IMAGEN
===================================================== */
$("uploadBox").onclick = () => $("imagenFile").click();

$("imagenFile").onchange = e => {
    currentFile = e.target.files[0];
    $("preview").src = URL.createObjectURL(currentFile);
    $("preview").classList.remove("hidden");
};


/* =====================================================
   VIDEOS (modo normal)
===================================================== */
$("videoUploadBox").onclick = () => $("videosInput").click();

$("videosInput").onchange = e => {
    if (getSignalsEnabled()) {
        alert("Tenés activado el selector de señales. Subí los videos dentro de cada señal.");
        $("videosInput").value = "";
        return;
    }
    currentVideos = [...e.target.files];
    $("videoCount").innerText = currentVideos.length + " archivos";
};


/* =====================================================
   STORAGE
===================================================== */
async function upload(bucket, file, nameHint) {
    const ext = file.name.split(".").pop();
    const name = `${slugify(nameHint)}-${uid()}.${ext}`;

    const { error } = await sb.storage.from(bucket).upload(name, file, { upsert: true });
    if (error) throw error;

    return sb.storage.from(bucket).getPublicUrl(name).data.publicUrl;
}


/* =====================================================
   SWITCH 100% CUSTOM (sin checkbox)
   Requiere en HTML:
   <div id="useSignalsDropdown" class="signalsSwitch" role="switch" aria-checked="false" tabindex="0">
     <span class="signalsSwitchUI"></span>
     <span class="signalsSwitchText">...</span>
   </div>
===================================================== */
function setSignalsSwitch(on) {
    const sw = $("useSignalsDropdown");
    if (!sw) return;

    sw.setAttribute("aria-checked", on ? "true" : "false");
    sw.classList.toggle("is-on", !!on);

    const box = $("signalsDropdownBox");
    if (box) {
        box.classList.toggle("hidden", !on);
        if (on) box.classList.add("signalsBoxAppear");
        else box.classList.remove("signalsBoxAppear");
    }

    // si activo señales, limpio videos normales
    if (on) {
        currentVideos = [];
        $("videosInput").value = "";
        $("videoCount").innerText = "o arrastrar acá";
    }
}

function getSignalsEnabled() {
    const sw = $("useSignalsDropdown");
    return sw?.getAttribute("aria-checked") === "true";
}

function hookSignalsUI() {
    const sw = $("useSignalsDropdown");
    if (!sw) return;

    // click
    sw.addEventListener("click", () => {
        setSignalsSwitch(!getSignalsEnabled());
    });

    // teclado (Enter / Space)
    sw.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSignalsSwitch(!getSignalsEnabled());
        }
    });

    $("addSignalBtn").addEventListener("click", () => {
        addSignalBlock({ label: "", id: "", existingCount: 0 });
    });
}

function clearSignalsUI() {
    setSignalsSwitch(false);
    $("signalsDropdownTitle").value = "";
    $("signalsContainer").innerHTML = "";
    prevUsaDropdown = false;
    prevGroupIds = [];
}


/* =====================================================
   SEÑALES UI (bloques)
===================================================== */
function addSignalBlock({ label, id, existingCount }) {
    const wrap = document.createElement("div");
    wrap.className = "signalBlock";
    wrap.dataset.prevId = id || "";
    wrap._files = [];

    wrap.innerHTML = `
    <div class="signalMeta">
      <input class="signalLabel" placeholder="Nombre señal (visible). Ej: TNT Sports Premium" value="${label || ""}">
      <input class="signalId" placeholder="ID señal (manual). Ej: tntsports" value="${id || ""}">
    </div>

    <div class="uploadBox signalVideoUpload">
      <input type="file" class="signalVideosInput" hidden multiple accept="video/*">
      <div class="uploadInner">
        🎬 Subir videos de esta señal
        <span class="signalVideoCount">o arrastrar acá</span>
      </div>
    </div>

    <div class="existingInfo">
      ${existingCount ? `Videos ya guardados: <b>${existingCount}</b> (si subís nuevos, reemplaza)` : `Sin videos guardados aún`}
    </div>

    <div class="signalActions">
      <button type="button" class="secondary fillIdBtn">Autogenerar ID</button>
      <button type="button" class="danger removeSignalBtn">Eliminar señal</button>
    </div>
  `;

    $("signalsContainer").appendChild(wrap);

    const labelEl = wrap.querySelector(".signalLabel");
    const idEl = wrap.querySelector(".signalId");
    const uploadBox = wrap.querySelector(".signalVideoUpload");
    const input = wrap.querySelector(".signalVideosInput");
    const count = wrap.querySelector(".signalVideoCount");

    wrap.querySelector(".fillIdBtn").onclick = () => {
        idEl.value = slugify(labelEl.value);
    };

    labelEl.addEventListener("blur", () => {
        if (!idEl.value.trim()) idEl.value = slugify(labelEl.value);
    });

    uploadBox.onclick = () => input.click();

    input.onchange = e => {
        wrap._files = [...e.target.files];
        count.innerText = `${wrap._files.length} archivos`;
    };

    wrap.querySelector(".removeSignalBtn").onclick = () => wrap.remove();
}

function readSignalsBlocks() {
    const blocks = [...$("signalsContainer").querySelectorAll(".signalBlock")];

    return blocks.map(b => ({
        el: b,
        label: b.querySelector(".signalLabel").value.trim(),
        id: b.querySelector(".signalId").value.trim(),
        prevId: b.dataset.prevId || "",
        files: b._files || []
    }));
}


/* =====================================================
   SAVE
===================================================== */
$("saveBtn").onclick = saveArticle;

if ($("cancelEdit")) {
    $("cancelEdit").onclick = () => {
        resetForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
    };
}

async function saveArticle() {
    try {
        setProgress(5);

        let img = null;
        if (currentFile) {
            setProgress(15);
            img = await upload("articulos", currentFile, $("titulo").value);
            setProgress(30);
        }

        let fecha_creacion = new Date().toISOString();
        if (inputFecha.value) {
            fecha_creacion = inputFecha.value + "T00:00:00";
            fecha_creacion = new Date(fecha_creacion).toISOString();
        }

        const signalsEnabled = getSignalsEnabled();
        const dropdownTitle = ($("signalsDropdownTitle").value || "").trim();

        if (signalsEnabled) {
            const content = $("contenido").value || "";
            if (!content.includes("{s-dropdown}")) {
                alert("Si activás señales, en el contenido debe estar {s-dropdown}.");
                return;
            }
            if (!dropdownTitle) {
                alert("Poné un título para el selector (ej: Elegí la señal).");
                return;
            }
        }

        const payload = {
            titulo: $("titulo").value,
            slug: slugify($("titulo").value),
            resumen: $("resumen").value,
            contenido: $("contenido").value,
            estado: estadoActual,
            fecha_creacion,
            usa_dropdown: signalsEnabled,
            dropdown_titulo: signalsEnabled ? dropdownTitle : null
        };

        if (img) payload.imagen = img;

        let articuloId;

        if (editId) {
            setProgress(40);
            const { error } = await sb.from("articulos").update(payload).eq("id", editId);
            if (error) throw error;
            articuloId = editId;
        } else {
            setProgress(50);
            const { data, error } = await sb.from("articulos").insert(payload).select().single();
            if (error) throw error;
            articuloId = data.id;
        }

        // si cambió el modo, borramos videos para no mezclar
        if (editId && prevUsaDropdown !== signalsEnabled) {
            await sb.from("articulos_videos").delete().eq("articulo_id", articuloId);
            prevGroupIds = [];
        }

        if (signalsEnabled) {
            const blocks = readSignalsBlocks().filter(b => b.label && b.id);

            if (blocks.length === 0) {
                alert("Agregá al menos 1 señal con Nombre e ID.");
                return;
            }

            // validar IDs
            for (const b of blocks) {
                if (!isValidSignalId(b.id)) {
                    alert(`ID inválido "${b.id}". Usá minúsculas/números/guión. Ej: tntsports / espn-premium`);
                    return;
                }
            }

            // IDs únicos
            const ids = blocks.map(b => b.id);
            const dup = ids.find((id, idx) => ids.indexOf(id) !== idx);
            if (dup) {
                alert("Tenés IDs repetidos: " + dup);
                return;
            }

            // detectar señales removidas (en edición)
            const currentIds = blocks.map(b => b.id);
            const removed = prevGroupIds.filter(oldId => !currentIds.includes(oldId));
            for (const rid of removed) {
                await sb.from("articulos_videos").delete().eq("articulo_id", articuloId).eq("grupo", rid);
            }

            // si el ID cambió (prevId -> id), renombrar grupo
            for (const b of blocks) {
                if (b.prevId && b.prevId !== b.id) {
                    await sb.from("articulos_videos")
                        .update({ grupo: b.id, label_grupo: b.label })
                        .eq("articulo_id", articuloId)
                        .eq("grupo", b.prevId);

                    b.el.dataset.prevId = b.id;
                }
            }

            // subir/reemplazar por señal SOLO si hay files
            const totalNew = blocks.reduce((acc, b) => acc + (b.files.length || 0), 0);
            let uploaded = 0;

            for (const b of blocks) {
                // siempre actualizo label (por si lo cambió)
                await sb.from("articulos_videos")
                    .update({ label_grupo: b.label })
                    .eq("articulo_id", articuloId)
                    .eq("grupo", b.id);

                // si no hay nuevos, no reemplazo
                if (!b.files.length) continue;

                // reemplaza la señal completa
                await sb.from("articulos_videos").delete().eq("articulo_id", articuloId).eq("grupo", b.id);

                for (let i = 0; i < b.files.length; i++) {
                    const p1 = 60 + Math.floor((uploaded / Math.max(1, totalNew)) * 30);
                    setProgress(p1);

                    const url = await upload("videos-articulos", b.files[i], $("titulo").value);

                    uploaded++;
                    const p2 = 60 + Math.floor((uploaded / Math.max(1, totalNew)) * 30);
                    setProgress(p2);

                    const { error } = await sb.from("articulos_videos").insert({
                        articulo_id: articuloId,
                        orden: i + 1,
                        url,
                        grupo: b.id,
                        label_grupo: b.label
                    });
                    if (error) throw error;
                }
            }

            prevUsaDropdown = true;
            prevGroupIds = blocks.map(b => b.id);

        } else {
            // modo normal: solo reemplaza si cargaste nuevos
            if (currentVideos.length > 0) {
                await sb.from("articulos_videos").delete().eq("articulo_id", articuloId).is("grupo", null);

                for (let i = 0; i < currentVideos.length; i++) {
                    const p1 = 60 + Math.floor((i / Math.max(1, currentVideos.length)) * 30);
                    const p2 = 60 + Math.floor(((i + 1) / Math.max(1, currentVideos.length)) * 30);
                    setProgress(p1);

                    const url = await upload("videos-articulos", currentVideos[i], $("titulo").value);

                    setProgress(p2);

                    const { error } = await sb.from("articulos_videos").insert({
                        articulo_id: articuloId,
                        orden: i + 1,
                        url,
                        grupo: null,
                        label_grupo: null
                    });
                    if (error) throw error;
                }
            }

            prevUsaDropdown = false;
            prevGroupIds = [];
        }

        setProgress(100);
        hideProgressSoon();

        resetForm();
        cargar();

    } catch (e) {
        hideProgressSoon();
        alert("Error: " + (e?.message || e));
    }
}


/* =====================================================
   LISTAR
===================================================== */
async function cargar() {
    const { data, error } = await sb
        .from("articulos")
        .select("*")
        .neq("estado", "eliminado")
        .order("fecha_creacion", { ascending: false });

    if (error) return alert("Error al cargar artículos");

    const lista = $("lista");
    lista.innerHTML = "";

    (data || []).forEach(a => {
        const fecha = new Date(a.fecha_creacion).toLocaleString();

        const card = document.createElement("div");
        card.className = "articleCard";

        card.innerHTML = `
      ${a.imagen
                ? `<img src="${a.imagen}" class="thumb">`
                : `<div class="thumb placeholder">Sin imagen</div>`}
      <div class="articleTitle">${a.titulo}</div>
      <small>${fecha}</small>
      <div class="row">
        <button class="editBtn">Editar</button>
        <button class="danger delBtn">Eliminar</button>
        <div class="status ${a.estado}">${a.estado}</div>
      </div>
    `;

        card.querySelector(".editBtn").onclick = () => editarArticulo(a.id);
        card.querySelector(".delBtn").onclick = () => eliminar(a.id);

        lista.appendChild(card);
    });
}


/* =====================================================
   EDITAR (carga señales existentes)
===================================================== */
async function editarArticulo(id) {
    const { data: a, error } = await sb.from("articulos").select("*").eq("id", id).single();
    if (error || !a) return alert("No se pudo abrir el artículo");

    editId = a.id;

    $("titulo").value = a.titulo || "";
    $("resumen").value = a.resumen || "";
    $("contenido").value = a.contenido || "";

    estadoActual = a.estado;
    estadoSelected.innerText = a.estado;

    if (a.imagen) {
        $("preview").src = a.imagen;
        $("preview").classList.remove("hidden");
    } else {
        $("preview").classList.add("hidden");
    }

    if (a.fecha_creacion) {
        const fecha = new Date(a.fecha_creacion);
        const y = fecha.toISOString().split("T")[0];
        inputFecha.value = y;
        fechaCustomValue = fecha;
        picker.setDate(fecha);
    }

    // preparar UI
    if ($("cancelEdit")) $("cancelEdit").classList.remove("hidden");

    // reset videos normales
    currentVideos = [];
    $("videosInput").value = "";
    $("videoCount").innerText = "o arrastrar acá";

    // set prev
    prevUsaDropdown = !!a.usa_dropdown;
    prevGroupIds = [];

    // cargar videos del artículo
    const { data: vids } = await sb
        .from("articulos_videos")
        .select("*")
        .eq("articulo_id", a.id)
        .order("grupo", { ascending: true })
        .order("orden", { ascending: true });

    const videos = vids || [];

    // señales
    setSignalsSwitch(!!a.usa_dropdown);
    $("signalsDropdownTitle").value = a.dropdown_titulo || "";
    $("signalsContainer").innerHTML = "";

    if (a.usa_dropdown) {
        const groups = {};
        for (const v of videos) {
            if (!v.grupo) continue;
            if (!groups[v.grupo]) groups[v.grupo] = { label: v.label_grupo || v.grupo, count: 0 };
            groups[v.grupo].count++;
        }

        const keys = Object.keys(groups);
        prevGroupIds = keys.slice();

        for (const k of keys) {
            addSignalBlock({
                label: groups[k].label,
                id: k,
                existingCount: groups[k].count
            });
        }
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}


/* =====================================================
   RESET
===================================================== */
function resetForm() {
    editId = null;
    currentFile = null;
    currentVideos = [];
    estadoActual = "borrador";

    $("titulo").value = "";
    $("resumen").value = "";
    $("contenido").value = "";

    $("preview").classList.add("hidden");

    // Reset calendario
    inputFecha.value = "";
    fechaCustomValue = null;
    picker.setDate(new Date());

    // Reset videos
    $("videosInput").value = "";
    $("videoCount").innerText = "o arrastrar acá";

    // Reset señales
    clearSignalsUI();

    if ($("cancelEdit")) $("cancelEdit").classList.add("hidden");
}


/* =====================================================
   ELIMINAR
===================================================== */
async function eliminar(id) {
    if (!confirm("¿Eliminar artículo?")) return;

    const { error } = await sb.from("articulos")
        .update({ estado: "eliminado" })
        .eq("id", id);

    if (error) return alert("Error eliminando");
    cargar();
}