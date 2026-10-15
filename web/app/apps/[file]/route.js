import { APPS, manifestFor } from "../../lib/apps";

// /apps/<id>.webmanifest: each screen's web app manifest, built at build time.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(APPS).map((id) => ({ file: `${id}.webmanifest` }));
}

export async function GET(_request, { params }) {
  const id = (await params).file.replace(/\.webmanifest$/, "");
  return new Response(JSON.stringify(manifestFor(id)), {
    headers: { "content-type": "application/manifest+json; charset=utf-8" },
  });
}
