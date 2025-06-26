import type React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode; // For action buttons etc.
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-6 border-b pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">
          {title}
        </h1>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
      {description && (
        <p className="mt-2 text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
