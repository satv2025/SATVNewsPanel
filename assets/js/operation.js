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
   🔥 PROGRESS BAR (NUEVO)
===================================================== */

const progressBar = document.createElement("div");
progressBar.className = "progress-bar";
progressBar.innerHTML = `<progress value="0" max="100"></progress>`;
document.body.appendChild(progressBar);

function setProgress(v) {
    progressBar.style.display = "block";
    progressBar.querySelector("progress").value = v;
    if (v >= 100) setTimeout(() => progressBar.style.display = "none", 600);
}


/* =====================================================
   🔥 GENERAR THUMBS (VERCEL API)
===================================================== */

async function generateThumbs(videoUrl) {
    try {

        const res = await fetch("/api/generate-thumbs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl })
        });

        if (!res.ok) {
            const t = await res.text();
            throw new Error(t);
        }

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
   STORAGE (CON PROGRESS REAL)
===================================================== */

async function upload(bucket, file, nameHint, progressStart, progressEnd) {

    const ext = file.name.split(".").pop();
    const name = `${slugify(nameHint)}-${uid()}.${ext}`;

    const { error } = await sb.storage
        .from(bucket)
        .upload(name, file, { upsert: true });

    if (error) throw error;

    setProgress(progressEnd);

    return sb.storage.from(bucket).getPublicUrl(name).data.publicUrl;
}


/* =====================================================
   SAVE ARTICLE (MEJORADO + PROGRESS)
===================================================== */

$("saveBtn").onclick = saveArticle;

async function saveArticle() {

    try {

        setProgress(5);

        let img = null;

        if (currentFile) {
            img = await upload("articulos", currentFile, $("titulo").value, 5, 20);
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

        /* INSERT / UPDATE */

        if (editId) {

            await sb.from("articulos").update(payload).eq("id", editId);
            articuloId = editId;

            await sb.from("articulos_videos").delete().eq("articulo_id", articuloId);

        } else {

            const { data } = await sb
                .from("articulos")
                .insert(payload)
                .select()
                .single();

            articuloId = data.id;
        }

        setProgress(30);


        /* VIDEOS */

        for (let i = 0; i < currentVideos.length; i++) {

            const pctStart = 30 + (i * 50 / currentVideos.length);
            const pctEnd = pctStart + (50 / currentVideos.length);

            const url = await upload(
                "videos-articulos",
                currentVideos[i],
                $("titulo").value,
                pctStart,
                pctEnd
            );

            await sb.from("articulos_videos").insert({
                articulo_id: articuloId,
                orden: i + 1,
                url
            });

            await generateThumbs(url);
        }

        setProgress(100);

        resetForm();
        cargar();

    } catch (e) {
        alert("Error: " + e.message);
        console.error(e);
    }
}


/* =====================================================
   LISTAR / EDITAR / RESET / DELETE
   (NO TOQUÉ NADA)
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

function editar(a) {
    editId = a.id;
    $("titulo").value = a.titulo;
    $("resumen").value = a.resumen;
    $("contenido").value = a.contenido;
}

function resetForm() {
    editId = null;
    currentFile = null;
    currentVideos = [];
}

async function eliminar(id) {
    if (!confirm("Eliminar artículo?")) return;
    await sb.from("articulos").update({ estado: "eliminado" }).eq("id", id);
    cargar();
}