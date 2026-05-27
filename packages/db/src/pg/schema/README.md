# DB Schema Folder Convention

## Structure

Each file or folder in `db/src/pg/schema/` must be named after its corresponding PostgreSQL schema.

## Options

### Option 1: Single File

```
db/src/pg/schema/auth.ts
```

Export all tables from the schema file directly.

### Option 2: Folder Structure

```
db/src/pg/schema/auth/
├── index.ts
└── sessions.ts
```

- Folder name matches the PostgreSQL schema
- Must contain an `index.ts` file
- Export the tables from `index.ts`

## Final Export

Export all schemas from `db/src/pg/schema/index.ts` **VERY IMPORTANT!**
If you ignore the file/folder options above, your local development using `drizzle-kit push` will be affected such as schema names won't be properly accounted for in `schemaFilter`, but if you don't export everything from `db/src/pg/schema/index.ts`, your migration generation will be affected, ultimately your production environment.

## Example

For an `auth` schema with a `sessions` table:

**Single file approach:**

```typescript
// db/src/pg/schema/auth.ts
export const sessions = pgTable('sessions', { ... });
```

**Folder approach:**

```typescript
// db/src/pg/schema/auth/index.ts
export { sessions } from './sessions';
```

Both approaches must be exported from:

```typescript
// db/src/pg/schema/index.ts
export * from './auth';
```
