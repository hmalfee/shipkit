import z from 'zod';

export const TodoSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    title: z.string(),
    completed: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export const TodoParamsSchema = z.object({
    id: z.uuid(),
});

export const CreateTodoBodySchema = z.object({
    title: z.string().min(1).max(500),
});

export const UpdateTodoBodySchema = z.object({
    title: z.string().min(1).max(500).optional(),
    completed: z.boolean().optional(),
});
