/* =====================================================
   CALENDARIO VISUAL SOLO FECHA (Vanilla JS Datepicker)
===================================================== */
const inputFecha = document.getElementById('fechaCustomMostrar');
let fechaCustomValue = null;

// Inicializa calendario visual, SOLO FECHA
const picker = new Datepicker(inputFecha, {
    format: "yyyy-mm-dd",
    autohide: true,
    todayHighlight: true,
    language: "es"
});

// Guarda la fecha seleccionada
inputFecha.addEventListener('changeDate', function(e) {
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
let currentVideos = [];
let estadoActual = "borrador";


/* =====================================================
   PROGRESS BAR
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
        progressWrap.style.display = "none";
        progressEl.value = 0;
    }, 600);
}


/* =====================================================
   UTILS
===================================================== */

function slugify(text) {
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, "")
        .replaceAll(" ", "-");
}

function uid() {
    return Date.now() + "-" + Math.random().toString(36).slice(2);
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

    cargar();
}

init();


/* =====================================================
   DROPDOWN ESTADO
===================================================== */

const estadoSelected = $("estadoSelected");
const estadoMenu = $("estadoMenu");

estadoSelected.onclick = () =>
    estadoMenu.classList.toggle("hidden");

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
   VIDEOS
===================================================== */

$("videoUploadBox").onclick = () => $("videosInput").click();

$("videosInput").onchange = e => {
    currentVideos = [...e.target.files];
    $("videoCount").innerText = currentVideos.length + " archivos";
};


/* =====================================================
   STORAGE
===================================================== */

async function upload(bucket, file, nameHint) {

    const ext = file.name.split(".").pop();
    const name = `${slugify(nameHint)}-${uid()}.${ext}`;

    await sb.storage.from(bucket).upload(name, file, { upsert: true });

    return sb.storage.from(bucket).getPublicUrl(name).data.publicUrl;
}


/* =====================================================
   SAVE ARTICLE (con PROGRESS)
===================================================== */

$("saveBtn").onclick = saveArticle;

async function saveArticle() {
    try {
        setProgress(5); // INICIO

        let img = null;

        if (currentFile) {
            setProgress(15); // Antes de subir imagen
            img = await upload("articulos", currentFile, $("titulo").value);
            setProgress(30); // Imagen subida
        }

        // FECHA CUSTOM VISUAL
        let fecha_creacion = new Date().toISOString();
        if (inputFecha.value) {
            fecha_creacion = inputFecha.value + "T00:00:00";
            fecha_creacion = new Date(fecha_creacion).toISOString();
        }

        const payload = {
            titulo: $("titulo").value,
            slug: slugify($("titulo").value),
            resumen: $("resumen").value,
            contenido: $("contenido").value,
            estado: estadoActual,
            fecha_creacion: fecha_creacion
        };

        if (img) payload.imagen = img;

        let articuloId;

        if (editId) {
            setProgress(40);
            await sb.from("articulos").update(payload).eq("id", editId);
            articuloId = editId;
        } else {
            setProgress(50);
            const { data } = await sb
                .from("articulos")
                .insert(payload)
                .select()
                .single();
            articuloId = data.id;
        }

        // Subida de videos con "progreso visual" aprox
        for (let i = 0; i < currentVideos.length; i++) {
            const p1 = 60 + Math.floor((i / Math.max(1, currentVideos.length)) * 30);
            const p2 = 60 + Math.floor(((i + 1) / Math.max(1, currentVideos.length)) * 30);
            setProgress(p1);

            const url = await upload("videos-articulos", currentVideos[i], $("titulo").value);

            setProgress(p2);

            await sb.from("articulos_videos").insert({
                articulo_id: articuloId,
                orden: i + 1,
                url
            });
        }

        setProgress(100); // Listo
        hideProgressSoon();

        resetForm();
        cargar();

    } catch (e) {
        hideProgressSoon();
        alert("Error: " + e.message);
    }
}


/* =====================================================
   LISTAR
===================================================== */

async function cargar() {

    const { data } = await sb
        .from("articulos")
        .select("*")
        .neq("estado", "eliminado")
        .order("fecha_creacion", { ascending: false });

    const lista = $("lista");
    lista.innerHTML = "";

    data.forEach(a => {

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

        card.querySelector(".editBtn").onclick = () => editar(a);
        card.querySelector(".delBtn").onclick = () => eliminar(a.id);

        lista.appendChild(card);
    });
}


/* =====================================================
   EDITAR
===================================================== */

function editar(a) {

    editId = a.id;

    $("titulo").value = a.titulo;
    $("resumen").value = a.resumen;
    $("contenido").value = a.contenido;

    estadoActual = a.estado;
    estadoSelected.innerText = a.estado;

    if (a.imagen) {
        $("preview").src = a.imagen;
        $("preview").classList.remove("hidden");
    }

    // Setear fecha en el picker visual
    if (a.fecha_creacion) {
        const fecha = new Date(a.fecha_creacion);
        const y = fecha.toISOString().split("T")[0];
        inputFecha.value = y;
        fechaCustomValue = fecha;
        picker.setDate(fecha);
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

    // Reset calendario visual
    inputFecha.value = "";
    fechaCustomValue = null;
    picker.setDate(new Date()); // Para que aparezca en hoy por defecto
}


/* =====================================================
   ELIMINAR
===================================================== */

async function eliminar(id) {
    if (!confirm("¿Eliminar artículo?")) return;
    await sb.from("articulos")
        .update({ estado: "eliminado" })
        .eq("id", id);
    cargar();
}