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
   🔥 NUEVO — GENERAR THUMBS AUTOMÁTICOS (YOUTUBE STYLE)
===================================================== */

async function generateThumbs(videoUrl) {
    try {
        await fetch("/api/generate-thumbs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl })
        });

        console.log("✅ thumbs generados:", videoUrl);

    } catch (e) {
        console.error("❌ thumbs error:", e);
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

        let img = null;

        if (currentFile) {
            img = await upload("articulos", currentFile, $("titulo").value);
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


        /* =====================================================
           🔥 VIDEOS + AUTO THUMBNAILS
        ===================================================== */

        for (let i = 0; i < currentVideos.length; i++) {

            const url = await upload(
                "videos-articulos",
                currentVideos[i],
                $("titulo").value
            );

            await sb.from("articulos_videos").insert({
                articulo_id: articuloId,
                orden: i + 1,
                url
            });

            // 🔥 GENERA thumbs automáticamente
            await generateThumbs(url);
        }

        resetForm();
        cargar();

    } catch (e) {
        alert("Error: " + e.message);
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