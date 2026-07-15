'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteFuelRecord } from '../entry/actions';

export function DeleteButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
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
