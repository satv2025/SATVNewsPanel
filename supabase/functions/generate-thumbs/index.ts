import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {

  /* =========================
     CORS (OBLIGATORIO)
  ========================= */
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const { videoUrl } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  /* =========================
     paths
  ========================= */

  const fileName = videoUrl.split("/videos-articulos/")[1];
  const base = fileName.replace(".mp4", "");

  const vttPath = `${base}.vtt`;
  const spriteUrl = `${base}-sprite.jpg`; // futuro si usás ffmpeg

  /* =========================
     generar VTT
  ========================= */

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
    vtt += `${spriteUrl}#xywh=${x},${y},${w},${h}\n\n`;
  }

  /* =========================
     subir a storage (CORRECTO)
  ========================= */

  await supabase.storage
    .from("videos-articulos")
    .upload(vttPath, new Blob([vtt]), {
      contentType: "text/vtt",
      upsert: true
    });

  return new Response("ok", {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
});

function fmt(s: number) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `00:${m}:${sec}.000`;
}