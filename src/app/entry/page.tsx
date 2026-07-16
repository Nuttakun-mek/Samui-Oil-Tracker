import { getCurrentUserAccess, requirePageAccess } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { type Station } from '@/lib/types/domain';
import EntryForm from './entry-form';

export default async function EntryPage() {
  await requirePageAccess('entry');
  const access = await getCurrentUserAccess();
  const supabase = await createClient();
  const { data: stations } = await supabase
    .from('stations')
    .select('*')
    .in('id', access.stationIds)
    .order('name');

  return <EntryForm stations={(stations ?? []) as Station[]} />;
}
