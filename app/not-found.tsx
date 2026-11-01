import Link from "next/link";

export default function NotFound() {
  return (
    <main className="hero">
      <p className="eyebrow">404</p>
      <h1>Page not found.</h1>
      <p className="hero-copy">Check the URL and try again.</p>
      <Link className="primary-button" href="/">Return home ↗</Link>
    </main>
  );
}