import { Dashboard } from '@/components/dashboard';
import { queryOf } from '@/lib/query';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Dashboard query={queryOf(await searchParams)} />;
}
