import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).end();
    }

    const { bucket, name } = req.body;

    const sb = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const base = name.replace(".mp4", "");
    const vttName = `${base}.vtt`;

    const interval = 5;
    const w = 160;
    const h = 90;
    const cols = 10;
    const rows = 10;

    let vtt = "WEBVTT\n\n";

    for (let i = 0; i < cols * rows; i++) {

        const start = i * interval;
        const end = start + interval;

        const x = (i % cols) * w;
        const y = Math.floor(i / cols) * h;

        vtt += `${fmt(start)} --> ${fmt(end)}\n`;
        vtt += `${base}.jpg\n\n`;
    }

    await sb.storage
        .from(bucket)
        .upload(vttName, vtt, {
            contentType: "text/vtt",
            upsert: true
        });

    res.status(200).json({ ok: true });
}

function fmt(s) {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `00:${m}:${sec}.000`;
}