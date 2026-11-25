'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="status-page">
      <h1>بارگذاری صفحه انجام نشد</h1>
      <button className="button primary" type="button" onClick={reset}>
        تلاش دوباره
      </button>
    </main>
  );
}
