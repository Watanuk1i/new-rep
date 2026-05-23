'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Страница «Долги» перенесена в «Кредиты/Долги» (/loans).
// Управление долгами Ведущего — в админке: /admin?tab=debts
export default function DebtsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/loans'); }, [router]);
  return (
    <div className="px-4 py-12 text-center text-sm text-muted-foreground">
      Раздел переехал в «Кредиты/Долги»...
    </div>
  );
}
