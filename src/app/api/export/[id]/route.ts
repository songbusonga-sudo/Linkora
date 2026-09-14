import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

function exportDirectory() {
  return path.resolve(process.env.LINKORA_DATA_DIR || "data", "exports");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const match = /^([a-f0-9-]{36})\.png$/i.exec(id);
  if (!match) return new Response(null, { status: 404 });
  try {
    const image = await readFile(path.join(exportDirectory(), `${match[1]}.png`));
    return new Response(image, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(image.byteLength),
        "Content-Disposition": 'inline; filename="linkora-card.png"',
        // The UUID in this short-lived URL is unguessable. A normal cacheable
        // image response is accepted by more in-app long-press save flows.
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
