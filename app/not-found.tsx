import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="status-page">
      <h1>صفحه پیدا نشد</h1>
      <Link className="button primary" href="/">
        بازگشت به خانه
      </Link>
    </main>
  );
}
