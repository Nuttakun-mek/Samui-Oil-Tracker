import { Wrench } from 'lucide-react';

export function MaintenanceBanner({ message, isAdmin }: { message: string | null; isAdmin: boolean }) {
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] items-start gap-2.5">
        <Wrench size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="font-semibold leading-5">
          ระบบกำลังปรับปรุง {message || 'กรุณาบันทึกข้อมูลที่ค้างไว้ก่อน อาจมีการขัดข้องชั่วคราว'}
          {isAdmin && ' — บัญชีผู้ดูแลระบบยังบันทึกข้อมูลได้ตามปกติ'}
          {!isAdmin && ' — ปุ่มบันทึก/แก้ไขข้อมูลถูกปิดใช้งานชั่วคราว'}
        </p>
      </div>
    </div>
  );
}
