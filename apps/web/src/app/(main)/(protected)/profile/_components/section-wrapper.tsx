import type { ReactNode } from 'react';

export function SectionWrapper({
    title,
    description,
    children,
}: {
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-4">
            <header className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">{title}</h2>
                {description && (
                    <p className="text-muted-foreground text-sm">
                        {description}
                    </p>
                )}
            </header>
            {children}
        </section>
    );
}
