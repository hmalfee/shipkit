import { implement } from '@orpc/server';

import type { AnyContractRouter } from '@orpc/contract';
import type { Context } from '@orpc/server';

/**
 * Binds a contract to a server context type.
 *
 * @example
 * const implementer = createImplementer<AppContext>()(contract);
 */
export function createImplementer<TContext extends Context>() {
    return <T extends AnyContractRouter>(contract: T) =>
        implement(contract).$context<TContext>();
}
