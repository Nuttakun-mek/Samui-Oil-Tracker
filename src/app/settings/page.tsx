import { createClient } from '@/lib/supabase/server';
import type { Station } from '@/lib/types/domain';
import { updateStationSettings } from './actions';

export const revalidate = 0;

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: stations } = await supabase.from('stations').select('*').order('id');
  const list = (stations ?? []) as Station[];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .single();
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-navy">ตั้งค่าระบบ</h1>
        <p className="text-sm text-muted mt-1">
          กำหนดความจุถังและเกณฑ์แจ้งเตือนน้ำมันใกล้หมดของแต่ละพื้นที่
          {!isAdmin && ' — เฉพาะผู้ดูแลระบบ (admin) เท่านั้นที่แก้ไขได้ (RLS บังคับที่ database)'}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {list.map((st) => (
          <form key={st.id} action={updateStationSettings} className="panel space-y-3">
            <input type="hidden" name="id" value={st.id} />
            <h4 className="font-bold text-navy text-sm">{st.name}</h4>
            <div>
              <label className="field-label">ความจุถังสำรอง (ลิตร)</label>
              <input
                name="tank_capacity_liters"
                type="number"
                defaultValue={st.tank_capacity_liters}
                className="field"
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="field-label">แจ้งเตือนเมื่อเหลือใช้ได้น้อยกว่า (วัน)</label>
              <input
                name="low_stock_days"
                type="number"
                defaultValue={st.low_stock_days}
                className="field"
                disabled={!isAdmin}
              />
            </div>
            {isAdmin && (
              <button type="submit" className="btn-primary">
                บันทึก
              </button>
            )}
          </form>
        ))}
      </div>
    </div>
  );
}
