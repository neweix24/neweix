import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "অর্ডার জমা দেওয়ার সুবিধা এখনো সেটআপ করা হয়নি।" },
    { status: 501 }
  );
}