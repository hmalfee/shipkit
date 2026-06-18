import Header from '@/components/header';
import { ssr } from '@/lib/api/ssr';

export default async function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    // all pages under this layout will be dynamic because of this prefetch
    await ssr.auth.me.prefetchQuery();

    return (
        <div className="grid h-svh grid-rows-[auto_1fr]">
            <ssr.HydrateClient>
                <Header />
                {children}
            </ssr.HydrateClient>
        </div>
    );
}
