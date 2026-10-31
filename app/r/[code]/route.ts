import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const EIX_ID = /^EIX-[A-F0-9]{8}$/i;

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  const destination = new URL("/auth/customer-login?mode=signup&referral=1", request.url);
  const response = NextResponse.redirect(destination);

  if (EIX_ID.test(code)) {
    response.cookies.set("neweix_referral_code", code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}
