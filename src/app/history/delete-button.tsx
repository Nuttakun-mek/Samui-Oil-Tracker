'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFuelRecord } from '../entry/actions';

export function DeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      className="text-xs font-bold text-red-700 border border-red-100 bg-red-50 rounded-md px-2.5 py-1 hover:bg-red-100 disabled:opacity-50"
      disabled={isPending}
      onClick={() => {
        if (!confirm('ยืนยันลบข้อมูลรายการนี้? (เฉพาะ admin)')) return;
        startTransition(async () => {
          await deleteFuelRecord(id);
          router.refresh();
        });
      }}
    >
      ลบ
    </button>
  );
}
