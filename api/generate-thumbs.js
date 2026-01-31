// =====================================================
// VERCEL SERVERLESS FUNCTION
// Genera sprite + VTT automáticamente (YouTube style)
// =====================================================

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import ffmpeg from "ffmpeg-static";

export default async function handler(req, res) {
    try {
        if (req.method !== "POST")
            return res.status(405).json({ error: "Method not allowed" });

        const { videoUrl } = req.body;

        if (!videoUrl)
            return res.status(400).json({ error: "videoUrl required" });

        // =====================================================
        // CONFIG
        // =====================================================

        const interval = 5; // segundos por thumb
        const w = 160;
        const h = 90;
        const cols = 10;
        const rows = 10;

        // =====================================================
        // PATHS TEMP
        // =====================================================

        const tmpDir = "/tmp";
        const videoPath = path.join(tmpDir, "video.mp4");
        const spritePath = path.join(tmpDir, "sprite.jpg");
        const vttPath = path.join(tmpDir, "thumbs.vtt");

        // =====================================================
        // DESCARGAR VIDEO
        // =====================================================

        const videoBuffer = await fetch(videoUrl).then(r => r.arrayBuffer());
        fs.writeFileSync(videoPath, Buffer.from(videoBuffer));

        // =====================================================
        // GENERAR SPRITE CON FFMPEG
        // =====================================================

        const fps = 1 / interval;

        execSync(
            `${ffmpeg} -i ${videoPath} -vf "fps=${fps},scale=${w}:${h},tile=${cols}x${rows}" ${spritePath}`
        );

        // =====================================================
        // GENERAR VTT
        // =====================================================

        let vtt = "WEBVTT\n\n";

        for (let i = 0; i < cols * rows; i++) {
            const start = i * interval;
            const end = start + interval;

            const x = (i % cols) * w;
            const y = Math.floor(i / cols) * h;

            vtt += `${fmt(start)} --> ${fmt(end)}\n`;
            vtt += `sprite.jpg#xywh=${x},${y},${w},${h}\n\n`;
        }

        fs.writeFileSync(vttPath, vtt);

        // =====================================================
        // SUBIR A SUPABASE STORAGE
        // =====================================================

        const base = videoUrl.replace(".mp4", "");

        await upload(`${base}-sprite.jpg`, fs.readFileSync(spritePath), "image/jpeg");
        await upload(`${base}.vtt`, fs.readFileSync(vttPath), "text/vtt");

        return res.json({ ok: true });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
}

// =====================================================
// HELPERS
// =====================================================

function fmt(s) {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `00:${m}:${sec}.000`;
}

async function upload(url, buffer, type) {
    await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": type },
        body: buffer
    });
}