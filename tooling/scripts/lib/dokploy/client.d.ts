import type {
    RequestBodyJSON,
    SuccessResponseJSON,
} from 'openapi-typescript-helpers';
import type { paths } from './schema.js';

/** Typed return for a POST operation: { body } -> response data */
type PostMethod<Op extends Record<string | number, any>> = (opts: {
    body: RequestBodyJSON<Op>;
}) => Promise<SuccessResponseJSON<Op>>;

/** Typed return for a GET operation: { query? } -> response data */
type GetMethod<Op extends Record<string | number, any>> = Op extends {
    parameters: { query?: infer Q };
}
    ? (opts?: { query?: Q }) => Promise<SuccessResponseJSON<Op>>
    : () => Promise<SuccessResponseJSON<Op>>;

/** Determine POST vs GET for a path item (unused methods are `?: never`) */
type DpMethod<PathItem extends Record<string | number, any>> =
    NonNullable<PathItem['post']> extends never
        ? GetMethod<PathItem['get']>
        : PostMethod<PathItem['post']>;

/**
 * For a given group string G, build the methods object by finding
 * all path keys matching `"/${G}.${method}"` and capitalizing the name.
 */
type DpGroup<G extends string> = {
    [
        K in keyof paths & `/${G}.${string}` as Capitalize<
            K extends `/${G}.${infer M}` ? M : never
        >
    ]: DpMethod<paths[K]>;
};

type ExtractGroups<K> = K extends `/${infer G}.${string}` ? G : never;

/** Groups are extracted from the first segment of each path key */
type Groups = ExtractGroups<keyof paths>;

/** The fully typed dp proxy */
export type DpClient = {
    [G in Groups]: DpGroup<G>;
};
