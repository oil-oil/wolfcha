export async function GET() {
  return Response.json({ ok: false, error: "deprecated" }, { status: 404 });
}

