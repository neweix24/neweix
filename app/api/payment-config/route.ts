import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentConfig = {
  bkash: string;
  nagad: string;
  rocket: string;
};

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as Record<string, unknown>;

    const config: PaymentConfig = {
      bkash:
        typeof runtimeEnv.PAYMENT_BKASH_NUMBER === "string"
          ? runtimeEnv.PAYMENT_BKASH_NUMBER.trim()
          : "",
      nagad:
        typeof runtimeEnv.PAYMENT_NAGAD_NUMBER === "string"
          ? runtimeEnv.PAYMENT_NAGAD_NUMBER.trim()
          : "",
      rocket:
        typeof runtimeEnv.PAYMENT_ROCKET_NUMBER === "string"
          ? runtimeEnv.PAYMENT_ROCKET_NUMBER.trim()
          : "",
    };

    return NextResponse.json(
      {
        success: true,
        paymentMethods: {
          bkash: {
            label: "bKash",
            number: config.bkash,
            enabled: config.bkash.length > 0,
          },
          nagad: {
            label: "Nagad",
            number: config.nagad,
            enabled: config.nagad.length > 0,
          },
          rocket: {
            label: "Rocket",
            number: config.rocket,
            enabled: config.rocket.length > 0,
          },
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Payment config read failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "পেমেন্ট সেটিংস লোড করা যায়নি।",
      },
      { status: 503 }
    );
  }
}