import { requirePageAccess } from '@/lib/auth/server';
import EntryForm from './entry-form';

export default async function EntryPage() {
  await requirePageAccess('entry');

  return <EntryForm />;
}
