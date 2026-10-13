export async function POST(req: Request) {
  try {
    const body = await req.text();
    console.log("[CLIENT-ERROR]", req.headers.get("user-agent"), body.slice(0, 6000));
  } catch {}
  return new Response("ok");
}
