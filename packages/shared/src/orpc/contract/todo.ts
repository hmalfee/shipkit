import { oc } from '@orpc/contract';
import z from 'zod';

import { rb } from '@mento-mark/orpc-utils/contract';

import {
    CreateTodoBodySchema,
    TodoParamsSchema,
    TodoSchema,
    UpdateTodoBodySchema,
} from '../schemas/todo';

export const todo = oc.prefix('/todo').router({
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
        .input({ body: CreateTodoBodySchema })
        .errors({ UNAUTHORIZED: {} })
        .responses({
            CREATED: TodoSchema,
        }),
    update: rb
        .mutation('/{id}', 'PUT')
        .input({ params: TodoParamsSchema, body: UpdateTodoBodySchema })
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
