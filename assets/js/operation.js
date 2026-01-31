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
   🔥 NUEVO — PROGRESS BAR (NO ROMPE NADA)
===================================================== */

let progressWrap = null;
let progressEl = null;

function ensureProgressUI() {
    if (progressWrap && progressEl) return;

    // lo insertamos dentro del form (si existe), o al final del body como fallback
    const formCard = document.querySelector(".formCard") || document.body;

    progressWrap = document.createElement("div");
    progressWrap.className = "progress-bar";
    progressWrap.style.display = "none";

    progressEl = document.createElement("progress");
    progressEl.max = 100;
    progressEl.value = 0;

    progressWrap.appendChild(progressEl);

    // lo ponemos antes de los botones del form si existe, si no al final
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
    if (!progressWrap) return;
    setTimeout(() => {
        progressWrap.style.display = "none";
        progressEl.value = 0;
    }, 600);
}


/* =====================================================
   🔥 NUEVO — GENERAR THUMBS AUTOMÁTICOS (YOUTUBE STYLE)
===================================================== */

async function generateThumbs(videoUrl) {
    try {
        const res = await fetch("/api/generate-thumbs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl })
        });

        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            throw new Error(`API ${res.status}: ${txt || "sin respuesta"}`);
        }

        console.log("✅ thumbs generados:", videoUrl);

    } catch (e) {
        console.error("❌ thumbs error:", e.message || e);
    }
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

const uploadBox = $("uploadBox");
const fileInput = $("imagenFile");
const preview = $("preview");

uploadBox.onclick = () => fileInput.click();

fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;

    currentFile = file;

    preview.src = URL.createObjectURL(file);
    preview.classList.remove("hidden");
};


/* =====================================================
   VIDEOS
===================================================== */

const videoBox = $("videoUploadBox");
const videosInput = $("videosInput");
const videoCount = $("videoCount");

videoBox.onclick = () => videosInput.click();

videosInput.onchange = () => {
    currentVideos = [...videosInput.files];
    videoCount.innerText = currentVideos.length + " archivos";
};


/* =====================================================
   STORAGE
===================================================== */

async function upload(bucket, file, nameHint) {

    const ext = file.name.split(".").pop();
    const name = `${slugify(nameHint)}-${uid()}.${ext}`;

    const { error } = await sb.storage
        .from(bucket)
        .upload(name, file, { upsert: true });

    if (error) throw error;

    return sb.storage.from(bucket).getPublicUrl(name).data.publicUrl;
}


/* =====================================================
   SAVE ARTICLE
===================================================== */

$("saveBtn").onclick = saveArticle;

async function saveArticle() {

    try {

        setProgress(5);

        let img = null;

        if (currentFile) {
            setProgress(10);
            img = await upload("articulos", currentFile, $("titulo").value);
            setProgress(20);
        }

        const payload = {
            titulo: $("titulo").value,
            slug: slugify($("titulo").value),
            resumen: $("resumen").value,
            contenido: $("contenido").value,
            estado: estadoActual
        };

        if (img) payload.imagen = img;

        let articuloId;


        /* ---------- INSERT / UPDATE ---------- */

        if (editId) {

            await sb.from("articulos")
                .update(payload)
                .eq("id", editId);

            articuloId = editId;

            // borrar videos viejos SOLO en edición
            await sb.from("articulos_videos")
                .delete()
                .eq("articulo_id", articuloId);

        } else {

            const { data } = await sb
                .from("articulos")
                .insert(payload)
                .select()
                .single();

            articuloId = data.id;
        }

        setProgress(30);


        /* =====================================================
           🔥 VIDEOS + AUTO THUMBNAILS
        ===================================================== */

        for (let i = 0; i < currentVideos.length; i++) {

            // progreso aproximado (no hay progress real en supabase-js upload)
            const p1 = 30 + Math.floor((i / Math.max(1, currentVideos.length)) * 50);
            const p2 = 30 + Math.floor(((i + 1) / Math.max(1, currentVideos.length)) * 50);

            setProgress(p1);

            const url = await upload(
                "videos-articulos",
                currentVideos[i],
                $("titulo").value
            );

            setProgress(p2);

            await sb.from("articulos_videos").insert({
                articulo_id: articuloId,
                orden: i + 1,
                url
            });

            // 🔥 GENERA thumbs automáticamente (vercel)
            await generateThumbs(url);
        }

        setProgress(100);
        hideProgressSoon();

        resetForm();
        cargar();

    } catch (e) {
        hideProgressSoon();
        alert("Error: " + e.message);
        console.error(e);
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

    if (error) return console.error(error);

    const lista = $("lista");
    lista.innerHTML = "";

    data.forEach(a => {

        const card = document.createElement("div");
        card.className = "articleCard";

        card.innerHTML = `
      ${a.imagen
                ? `<img src="${a.imagen}" class="thumb">`
                : `<div class="thumb placeholder">Sin imagen</div>`}
      <div class="articleTitle">${a.titulo}</div>
      <div class="status ${a.estado}">${a.estado}</div>
      <div class="row">
        <button class="editBtn">Editar</button>
        <button class="danger delBtn">Eliminar</button>
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
        preview.src = a.imagen;
        preview.classList.remove("hidden");
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

    preview.classList.add("hidden");
    videoCount.innerText = "o arrastrar acá";
}


/* =====================================================
   DELETE
===================================================== */

async function eliminar(id) {

    if (!confirm("Eliminar artículo?")) return;

    await sb.from("articulos")
        .update({ estado: "eliminado" })
        .eq("id", id);

    cargar();
}