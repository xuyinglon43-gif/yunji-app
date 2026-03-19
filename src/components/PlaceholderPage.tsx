'use client';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full text-[var(--ink3)]">
      <div className="text-center">
        <p className="text-lg font-medium text-[var(--ink2)]">{title}</p>
        <p className="text-sm mt-1">功能开发中...</p>
      </div>
    </div>
  );
}
