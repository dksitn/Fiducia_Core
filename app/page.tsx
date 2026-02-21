import { redirect } from 'next/navigation';

// app/page.tsx — 根路徑直接重導向至 dashboard/admin
// 原本的 Admin 控制台已移至 /dashboard/admin
export default function RootPage() {
  redirect('/dashboard/admin');
}
