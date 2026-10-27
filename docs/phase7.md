# Phase 7: NestJS User Service (Setup & PostgreSQL Integration)

## What We Did
- Generated the NestJS boilerplate for the User Service (`service-user`) to handle highly structured relational data.
- Configured PostgreSQL as the relational database backend within the centralized `docker-compose.yml`.
- Integrated Prisma ORM to interact with PostgreSQL using strict TypeScript types.
- Defined the initial schema in `prisma/schema.prisma` mapping out the `User` and `Profile` entities based on the Phase 1 architectural design.

## Why We Did It
- **Why NestJS over Go for Users?** User management involves complex, rigid business rules (authentication, roles, relations). NestJS enforces a strict modular architecture and integrates flawlessly with TypeScript, making it easier to maintain enterprise-grade REST APIs than writing raw Go handlers.
- **Why PostgreSQL + Prisma?** Unlike the unstructured job postings (which sit nicely in MongoDB), user profiles and authentication tokens require relational integrity. Prisma generates a type-safe client, meaning if we rename a column in the database, the TypeScript code will instantly throw a compiler error if we try to access the old column name. This eliminates runtime database errors.
