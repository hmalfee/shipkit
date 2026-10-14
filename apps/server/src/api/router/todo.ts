import { and, desc, eq, pickColumns } from '@shipkit/db/pg';
import { todos } from '@shipkit/db/pg/schema';

import { cr, os } from '../base';

const todoColumns = pickColumns(todos, {
    id: true,
    userId: true,
    title: true,
    completed: true,
    createdAt: true,
    updatedAt: true,
});

export const todo = os.todo.router({
    list: cr.todo.list.handler(async ({ context, errors }) => {
        if (!context.session) {
            throw errors.UNAUTHORIZED({ message: 'You must be logged in' });
        }
        const items = await context.db
            .select(todoColumns)
            .from(todos)
            .where(eq(todos.userId, context.session.user.id))
            .orderBy(desc(todos.createdAt))
            .limit(50);
        return { status: 200, body: items };
    }),

    byId: cr.todo.byId.handler(async ({ context, input, errors }) => {
        if (!context.session) {
            throw errors.UNAUTHORIZED({ message: 'You must be logged in' });
        }
        const [result] = await context.db
            .select(todoColumns)
            .from(todos)
            .where(
                and(
                    eq(todos.id, input.params.id),
                    eq(todos.userId, context.session.user.id),
                ),
            )
            .limit(1);
        if (!result) throw errors.NOT_FOUND();
        return { status: 200, body: result };
    }),

    create: cr.todo.create.handler(async ({ context, input, errors }) => {
        if (!context.session) {
            throw errors.UNAUTHORIZED({ message: 'You must be logged in' });
        }
        const [row] = await context.db
            .insert(todos)
            .values({ ...input.body, userId: context.session.user.id })
            .returning(todoColumns);
        if (!row) throw errors.INTERNAL_SERVER_ERROR();
        return { status: 201, body: row };
    }),

    update: cr.todo.update.handler(async ({ context, input, errors }) => {
        if (!context.session) {
            throw errors.UNAUTHORIZED({ message: 'You must be logged in' });
        }
        const [row] = await context.db
            .update(todos)
            .set(input.body)
            .where(
                and(
                    eq(todos.id, input.params.id),
                    eq(todos.userId, context.session.user.id),
                ),
            )
            .returning(todoColumns);
        if (!row) throw errors.NOT_FOUND();
        return { status: 200, body: row };
    }),

    delete: cr.todo.delete.handler(async ({ context, input, errors }) => {
        if (!context.session) {
            throw errors.UNAUTHORIZED({ message: 'You must be logged in' });
        }
        await context.db
            .delete(todos)
            .where(
                and(
                    eq(todos.id, input.params.id),
                    eq(todos.userId, context.session.user.id),
                ),
            );
        return { status: 204 };
    }),
});
