import { and, desc, eq } from '@mento-mark/db/pg';
import { todos } from '@mento-mark/db/pg/schema';

import { cr, os } from '../base';

export const todo = os.todo.router({
    list: cr.todo.list.handler(async ({ context, errors }) => {
        if (!context.session) {
            throw errors.UNAUTHORIZED({ message: 'You must be logged in' });
        }

        const items = await context.db.query.todos.findMany({
            where: eq(todos.userId, context.session.user.id),
            orderBy: desc(todos.createdAt),
            limit: 50,
        });

        return { status: 200, body: items };
    }),

    byId: cr.todo.byId.handler(async ({ context, input, errors }) => {
        if (!context.session) {
            throw errors.UNAUTHORIZED({ message: 'You must be logged in' });
        }

        const result = await context.db.query.todos.findFirst({
            where: and(
                eq(todos.id, input.params.id),
                eq(todos.userId, context.session.user.id),
            ),
        });

        if (!result) throw errors.NOT_FOUND();

        return { status: 200, body: result };
    }),

    create: cr.todo.create.handler(async ({ context, input, errors }) => {
        if (!context.session) {
            throw errors.UNAUTHORIZED({ message: 'You must be logged in' });
        }

        const [row] = await context.db
            .insert(todos)
            .values({
                ...input.body,
                userId: context.session.user.id,
            })
            .returning();

        return { status: 201, body: row! };
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
            .returning();

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
