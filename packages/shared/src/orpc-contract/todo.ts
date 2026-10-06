import z from 'zod';

import { group, rb } from '@shipkit/orpc-utils/contract';

const TodoSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    title: z.string(),
    completed: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

const TodoParamsSchema = z.object({
    id: z.uuid(),
});

export const todo = group('/todo', {
    list: rb
        .query('/')
        .errors({ UNAUTHORIZED: {} })
        .responses({
            OK: z.array(TodoSchema),
        }),
    byId: rb
        .query('/{id}')
        .input({ params: TodoParamsSchema })
        .responses({
            OK: TodoSchema,
        })
        .errors({
            NOT_FOUND: {},
            UNAUTHORIZED: {},
        }),
    create: rb
        .mutation('/')
        .input({
            body: z.object({
                title: z.string().min(1).max(500),
            }),
        })
        .errors({ UNAUTHORIZED: {} })
        .responses({
            CREATED: TodoSchema,
        }),
    update: rb
        .mutation('/{id}', 'PUT')
        .input({
            params: TodoParamsSchema,
            body: z.object({
                title: z.string().min(1).max(500).optional(),
                completed: z.boolean().optional(),
            }),
        })
        .responses({
            OK: TodoSchema,
        })
        .errors({
            NOT_FOUND: {},
            UNAUTHORIZED: {},
        }),
    delete: rb
        .mutation('/{id}', 'DELETE')
        .input({ params: TodoParamsSchema })
        .errors({ UNAUTHORIZED: {} })
        .responses({
            NO_CONTENT: undefined,
        }),
});
