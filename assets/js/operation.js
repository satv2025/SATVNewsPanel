/* =====================================================
   SUPABASE
===================================================== */

const sb = window.supabase.createClient(
    "https://spzgxvkedsdjjhzzyysr.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwemd4dmtlZHNkampoenp5eXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MzQwOTAsImV4cCI6MjA4NTExMDA5MH0.RgFghlZVV4Ww27rfh96nTiafDwRu9jtC3S6Y6aFdIxE"
);


/* =====================================================
   HELPERS
===================================================== */

const $ = id => document.getElementById(id);

let editId = null;
let currentFile = null;

/* 🔥 NUEVO */
let estadoActual = "borrador";


/* =====================================================
   UTILS
===================================================== */

function slugify(text) {
    return text
        .toLowerCase()
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
   INIT SESSION
===================================================== */

async function init() {

    const { data: { session } } = await sb.auth.getSession();

    if (session) {
        $("loginBox").classList.add("hidden");
        $("dash").classList.remove("hidden");
        $("logoutBtn").classList.remove("hidden");

        cargar();
    }
}

init();


/* =====================================================
   🔥 DROPDOWN CUSTOM ESTADO (NUEVO)
===================================================== */

const estadoSelected = $("estadoSelected");
const estadoMenu = $("estadoMenu");

if (estadoSelected) {

    estadoSelected.onclick = () =>
        estadoMenu.classList.toggle("hidden");

    document.querySelectorAll(".estadoItem").forEach(item => {
        item.onclick = () => {
            estadoActual = item.dataset.value;
            estadoSelected.innerText = item.innerText;
            estadoMenu.classList.add("hidden");
        };
    });

    document.addEventListener("click", e => {
        if (!$("estadoDropdown").contains(e.target)) {
            estadoMenu.classList.add("hidden");
        }
    });
}


/* =====================================================
   UPLOAD (drag & drop)
===================================================== */

const uploadBox = $("uploadBox");
const fileInput = $("imagenFile");
const fileName = $("fileName");
const preview = $("preview");

uploadBox.onclick = () => fileInput.click();

fileInput.onchange = () => handleFile(fileInput.files[0]);

uploadBox.ondragover = e => {
    e.preventDefault();
    uploadBox.classList.add("dragover");
};

uploadBox.ondragleave = () =>
    uploadBox.classList.remove("dragover");

uploadBox.ondrop = e => {
    e.preventDefault();
    uploadBox.classList.remove("dragover");

    const file = e.dataTransfer.files[0];
    fileInput.files = e.dataTransfer.files;

    handleFile(file);
};

function handleFile(file) {

    if (!file) return;

    currentFile = file;

    fileName.innerText = file.name;

    preview.src = URL.createObjectURL(file);
    preview.classList.remove("hidden");
}


/* =====================================================
   STORAGE
===================================================== */

async function upload(file, tituloTexto) {

    const ext = file.name.split(".").pop();
    const name = `${slugify(tituloTexto)}-${uid()}.${ext}`;

    const { error } = await sb
        .storage
        .from("articulos")
        .upload(name, file);

    if (error) throw error;

    const { data } = sb
        .storage
        .from("articulos")
        .getPublicUrl(name);

    return data.publicUrl;
}


/* =====================================================
   SAVE (CREATE + UPDATE)
===================================================== */

$("saveBtn").onclick = saveArticle;

async function saveArticle() {

    try {

        let img = null;

        if (currentFile) {
            img = await upload(currentFile, $("titulo").value);
        }

        /* 🔥 CAMBIO: publicado → estado */
        const payload = {
            titulo: $("titulo").value,
            slug: slugify($("titulo").value),
            resumen: $("resumen").value,
            contenido: $("contenido").value,
            estado: estadoActual
        };

        if (img) payload.imagen = img;

        let res;

        if (editId) {
            res = await sb.from("articulos").update(payload).eq("id", editId);
        } else {
            res = await sb.from("articulos").insert(payload);
        }

        if (res.error) return alert(res.error.message);

        resetForm();
        cargar();

    } catch (err) {
        console.error(err);
        alert("Error guardando");
    }
}


/* =====================================================
   LISTAR
===================================================== */

async function cargar() {

    const { data, error } = await sb
        .from("articulos")
        .select("*")
        .neq("estado", "eliminado") /* 🔥 soft delete */
        .order("fecha_creacion", { ascending: false });

    if (error) return console.error(error);

    const lista = $("lista");
    lista.innerHTML = "";

    const labels = {
        publicado: "Publicado",
        programado: "Programado",
        revision: "En revisión",
        borrador: "No publicado",
        eliminado: "Eliminado"
    };

    data.forEach(a => {

        const card = document.createElement("div");
        card.className = "articleCard";

        const imgHTML = a.imagen
            ? `<img src="${a.imagen}" class="thumb">`
            : `<div class="thumb placeholder">Sin imagen</div>`;

        card.innerHTML = `
            ${imgHTML}

            <div class="articleTitle">${a.titulo}</div>

            <div class="status ${a.estado}">
                ${labels[a.estado]}
            </div>

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

    /* 🔥 estado */
    estadoActual = a.estado;

    if (estadoSelected) {
        estadoSelected.innerText = {
            publicado: "Publicado",
            programado: "Programado",
            revision: "En revisión",
            borrador: "No publicado",
            eliminado: "Eliminado"
        }[a.estado];
    }

    if (a.imagen) {
        preview.src = a.imagen;
        preview.classList.remove("hidden");
    }

    $("formTitle").innerText = "Editar artículo";
    $("cancelEdit").classList.remove("hidden");

    window.scrollTo({ top: 0, behavior: "smooth" });
}


/* =====================================================
   CANCELAR
===================================================== */

$("cancelEdit").onclick = resetForm;

function resetForm() {

    editId = null;
    currentFile = null;

    $("titulo").value = "";
    $("resumen").value = "";
    $("contenido").value = "";

    estadoActual = "borrador";

    if (estadoSelected)
        estadoSelected.innerText = "No publicado";

    fileInput.value = "";

    preview.classList.add("hidden");
    fileName.innerText = "o arrastrar acá";

    $("formTitle").innerText = "Nuevo artículo";
    $("cancelEdit").classList.add("hidden");
}


/* =====================================================
   DELETE (soft)
===================================================== */

async function eliminar(id) {

    if (!confirm("Eliminar artículo?")) return;

    /* 🔥 soft delete */
    await sb
        .from("articulos")
        .update({ estado: "eliminado" })
        .eq("id", id);

    cargar();
}