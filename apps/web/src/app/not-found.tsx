import { MoveLeft } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@shipkit/ui/components/button';

export default function NotFound() {
    return (
        <main className="flex min-h-[calc(100vh-4.5rem)] flex-col items-center justify-center gap-4 p-6">
            <h1 className="text-2xl font-bold">Page does not exist!</h1>
            <p className="text-muted-foreground">
                Uh oh! The page you are looking for does not exist.
            </p>
            <Link href="/">
                <Button>
                    <MoveLeft />
                    <span>Go to Home</span>
                </Button>
            </Link>
        </main>
    );
}
