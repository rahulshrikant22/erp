'use client';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Wrap sonner's <Toaster /> so the look matches our shadcn tokens.
 * Mounted once at the top of the admin layout (and the auth layout) so
 * any client component can call `toast.success(...)` from `sonner`.
 */
export function Toaster({ ...props }: ToasterProps): React.ReactElement {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { toast } from 'sonner';
