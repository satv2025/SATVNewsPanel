/* =====================================================
   SUPABASE
===================================================== */

const sb = window.supabase.createClient(
    "https://api.solargentinotv.com.ar",
    "TU_ANON_KEY"
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
   🔥 PROGRESS UI
===================================================== */

function showProgress(text = "Subiendo…") {
    $("uploadProgressBox").classList.remove("hidden");
    $("uploadProgress").value = 0;
    $("uploadText").innerText = text;
}

function setProgress(p) {
    $("uploadProgress").value = p;
}

function hideProgress() {
    $("uploadProgressBox").classList.add("hidden");
}


/* =====================================================
   🔥 GENERAR VTT → VERCEL API
===================================================== */

async function generateThumbs(videoUrl) {
    try {
        await fetch("/api/generate-thumbs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl })
        });
        console.log("✅ VTT generado");
    } catch (e) {
        console.error("❌ thumbs error", e);
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
   🔥 UPLOAD CON PROGRESS REAL (XHR)
===================================================== */

async function upload(bucket, file, nameHint) {

    const ext = file.name.split(".").pop();
    const name = `${slugify(nameHint)}-${uid()}.${ext}`;

    const { data: { session } } = await sb.auth.getSession();
    const token = session.access_token;

    return new Promise((resolve, reject) => {

        const xhr = new XMLHttpRequest();

        const url = `https://api.solargentinotv.com.ar/storage/v1/object/${bucket}/${name}`;

        xhr.open("POST", url);

        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "true");

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                setProgress(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const publicUrl =
                    `https://api.solargentinotv.com.ar/storage/v1/object/public/${bucket}/${name}`;
                resolve(publicUrl);
            } else {
                reject(xhr.responseText);
            }
        };

        xhr.onerror = reject;

        xhr.send(file);
    });
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
   INPUTS
===================================================== */

$("uploadBox").onclick = () => $("imagenFile").click();
$("videoUploadBox").onclick = () => $("videosInput").click();

$("imagenFile").onchange = () => {
    currentFile = $("imagenFile").files[0];
};

$("videosInput").onchange = () => {
    currentVideos = [...$("videosInput").files];
};


/* =====================================================
   SAVE ARTICLE
===================================================== */

$("saveBtn").onclick = saveArticle;

async function saveArticle() {

    try {

        showProgress("Subiendo archivos…");

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

        if (editId) {

            await sb.from("articulos")
                .update(payload)
                .eq("id", editId);

            articuloId = editId;

        } else {

            const { data } = await sb
                .from("articulos")
                .insert(payload)
                .select()
                .single();

            articuloId = data.id;
        }


        /* 🔥 VIDEOS */

        for (let i = 0; i < currentVideos.length; i++) {

            $("uploadText").innerText = `Subiendo video ${i + 1}/${currentVideos.length}`;

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

            await generateThumbs(url);
        }

        hideProgress();

        resetForm();
        cargar();

    } catch (e) {
        hideProgress();
        alert("Error: " + e);
    }
}


/* =====================================================
   LISTAR
===================================================== */

async function cargar() {

    const { data } = await sb
        .from("articulos")
        .select("*")
        .neq("estado", "eliminado");

    const lista = $("lista");
    lista.innerHTML = "";

    data.forEach(a => {

        const card = document.createElement("div");

        card.innerHTML = `
        <div>${a.titulo}</div>
        <button onclick="eliminar('${a.id}')">Eliminar</button>
        `;

        lista.appendChild(card);
    });
}


/* =====================================================
   RESET
===================================================== */

function resetForm() {
    currentFile = null;
    currentVideos = [];
}


/* =====================================================
   DELETE
===================================================== */

async function eliminar(id) {
    await sb.from("articulos")
        .update({ estado: "eliminado" })
        .eq("id", id);

    cargar();
}