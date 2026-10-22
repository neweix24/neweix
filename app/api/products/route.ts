import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    data: [],
    message: "পণ্যের ডাটাবেস এখনো সংযুক্ত নয়।",
  });
}