import { Building2, Phone } from 'lucide-react';
import { APP_RELEASE } from '@/lib/app-version';

export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
            <Building2 size={18} aria-hidden="true" />
          </div>
          <div className="text-xs leading-5 text-slate-600">
            <p className="font-bold text-slate-800">แผนกแผนบริหารความต่อเนื่องทางธุรกิจ การไฟฟ้าส่วนภูมิภาค</p>
            <p className="flex items-center gap-1.5"><Phone size={12} aria-hidden="true" /> โทร. 9517</p>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-3 font-mono text-[11px] leading-5 text-slate-500 md:border-0 md:pt-0 md:text-right">
          <p>{APP_RELEASE.environmentLabel}</p>
          <p>{APP_RELEASE.label}</p>
        </div>
      </div>
    </footer>
  );
}
