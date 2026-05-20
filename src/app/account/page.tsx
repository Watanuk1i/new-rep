'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';

export default function AccountPage() {
  const { currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      router.replace(`/profile/${currentUser.id}`);
    }
  }, [currentUser, router]);

  if (!currentUser) {
    return (
      <div className="px-4 py-12 text-center max-w-md mx-auto">
        <div className="text-5xl mb-3 opacity-40">💳</div>
        <h2 className="font-heading text-xl font-bold mb-2">Вы не вошли</h2>
        <Link href="/login" className="btn-primary inline-flex">Войти</Link>
      </div>
    );
  }

  return null;
}
