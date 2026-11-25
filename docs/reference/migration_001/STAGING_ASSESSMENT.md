# Can Migration 001 be tested on a disposable Supabase without touching production? (assessment, 2026-11-01)

**Answer: yes, in two ways that need no production credentials. Neither has been done:** both need the owner's approval (one adds a
new development tool and large downloads; the other is a new hosted project). Nothing was provisioned, downloaded or connected.

## What a Supabase test would add over the local tests

The 294 local tests run on plain PostgreSQL 16 with stand-ins. A real Supabase stack would also show: the migration running as
Supabase's `postgres` role (not a superuser), Supabase's own event triggers (for example automatic row-level security), the Data API
(PostgREST) refusing the private schema and serving the two `ref_*` functions to real signed-in and signed-out tokens, GraphQL not
exposing the schema, and the default grants as they really are. It would **not** prove anything about the production project's own
functions (`my_staff_role_code`, `has_permission`): those would still be stand-ins unless their definitions are copied in (see
"Limits").

## Option A (recommended): a local Supabase stack with the Supabase command-line tool

| Point | Finding (checked 2026-11-01 in the cloud work container, without downloading anything) |
|---|---|
| Docker | Client 29.9.2 and Compose 5.6.1 are installed; **the Docker engine is not running** (`/var/run/docker.sock` missing). Whether it can be started inside this container is unverified (it may need privileges the container does not have). On the owner's own Mac or Linux computer, Docker Desktop would do |
| Supabase command-line tool | Available from npm (`supabase` 2.122.0); not installed; it would be run with `npx` and never added to the repository |
| Images | About a dozen container images (several GB) from Docker Hub / AWS public registry; both registries are reachable from here |
| Disk | About 30 GB free here |
| Credentials | None from production. The local stack makes its own throwaway keys |
| Effect on the live project | None: nothing connects to it |

Steps if approved: `npx supabase init` in a scratch folder (not the repository), `npx supabase start`, load `tests/stub_supabase.sql`'s
role-function stand-ins (only those the local stack lacks), run `001_wine_reference_foundation.sql`, `001_verify.sql`, the behaviour
tests and `concurrency_tests.sh` against the local database, then call `ref_published_names` and `ref_review` through the local Data API
with tokens for a signed-out visitor, a player and staff, and confirm the private schema is not served. `npx supabase stop
--no-backup` deletes everything.

## Option B: a new, empty hosted Supabase project created by the owner

A free-tier project in the owner's account, separate from production, with its own keys. The owner would either run the scripts in its
SQL Editor by hand, or give this session that project's keys as an environment secret (never the production keys). It is closer to the
hosted service than option A, but needs the owner to create and later delete it, the free tier allows only a few projects, and keys must
be handled. Not recommended unless option A cannot run.

## Not recommended

- **Supabase branching** of the production project (a paid feature that creates preview branches *of production*): it is attached to the
  live project.
- **A schema dump of production** to copy its functions into the test stack: `supabase db dump` needs the production database password.
  The owner could run it themselves on their own computer, but the result would show the real role functions and must be kept private;
  the read-only `owner_role_check.sql` already gives the parts that matter.

## Limits that remain even with a Supabase test

The production project's own role functions, grants and data are not in a fresh stack; the owner's run of `owner_role_check.sql` on
production stays the only check of those. Performance with real volumes stays untested until there is content.
