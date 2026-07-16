export type UserRole = 'admin' | 'field';
export type AppPageId = 'dashboard' | 'entry' | 'history' | 'reports' | 'settings';

export const APP_NAV_ITEMS: Array<{ id: AppPageId; href: `/${AppPageId}`; label: string }> = [
  { id: 'dashboard', href: '/dashboard', label: 'แดชบอร์ด' },
  { id: 'entry', href: '/entry', label: 'บันทึกการใช้น้ำมัน' },
  { id: 'history', href: '/history', label: 'ประวัติข้อมูล' },
  { id: 'reports', href: '/reports', label: 'รายงาน' },
  { id: 'settings', href: '/settings', label: 'ตั้งค่า' },
];

const ROLE_PAGE_ACCESS: Record<UserRole, AppPageId[]> = {
  admin: ['dashboard', 'entry', 'history', 'reports', 'settings'],
  field: ['dashboard', 'entry', 'history', 'reports'],
};

export function normalizeRole(role: string | null | undefined): UserRole {
  return role === 'admin' ? 'admin' : 'field';
}

export function canAccessPage(role: UserRole, page: AppPageId) {
  return ROLE_PAGE_ACCESS[role].includes(page);
}

export function pageFromPath(pathname: string): AppPageId | null {
  const segment = pathname.split('/').filter(Boolean)[0];
  return APP_NAV_ITEMS.some((item) => item.id === segment) ? (segment as AppPageId) : null;
}

export function canAccessPath(role: UserRole, pathname: string) {
  const page = pageFromPath(pathname);
  return page ? canAccessPage(role, page) : true;
}

export function defaultLandingPath(_role: UserRole) {
  return '/dashboard';
}
