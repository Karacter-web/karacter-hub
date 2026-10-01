import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import HomePage from '../page';

export default async function WorkspaceRoute() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=%2Fapp');
  return <HomePage />;
}