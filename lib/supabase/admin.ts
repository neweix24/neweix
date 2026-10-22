/**
 * নিরাপত্তার জন্য আপাতত বন্ধ রাখা হয়েছে।
 * Service-role key কখনো browser/client code-এ রাখবে না।
 */
export function createSupabaseAdminClient(): never {
  throw new Error(
    "Admin client চালুর আগে server-only secrets ও authorization সেটআপ করতে হবে।"
  );
}