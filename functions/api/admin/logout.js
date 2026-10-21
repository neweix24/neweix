export async function onRequestPost() {
  return Response.json({ success: true }, {
    headers: {
      "Set-Cookie": "neweix_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
    }
  });
}