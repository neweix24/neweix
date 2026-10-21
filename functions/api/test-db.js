export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare("SELECT 1 AS test").first();

    return Response.json({
      success: true,
      message: "Neweix database connected",
      result
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "Database connection failed" },
      { status: 500 }
    );
  }
}