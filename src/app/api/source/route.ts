import { readFile } from "node:fs/promises";
export async function GET() {
  try {
    const bytes = await readFile(
      /* turbopackIgnore: true */
      process.env.LINKORA_SOURCE_ARCHIVE || ".local/linkora-source.zip",
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="linkora-source.zip"',
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return new Response(
      "Corresponding source archive has not been prepared. Run npm run source:bundle.",
      { status: 503 },
    );
  }
}
