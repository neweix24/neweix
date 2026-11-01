import Link from "next/link";
export default function UnauthorizedPage() {
  return (
    <main className="hero">
      <p className="eyebrow">NEWEIX · ACCESS CONTROL</p>

      <h1>Access denied</h1>

      <p className="hero-copy">
        Your account does not have permission to access this page.
        Sign in with an active, authorized staff account.
      </p>

      <p>
        <Link className="primary-button" href="/auth/login">
          Return to login
        </Link>
      </p>

      <p className="hero-copy">
        <Link href="/">Return home</Link>
      </p>
    </main>
  );
}