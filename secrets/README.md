# secrets/

Every real credential the stack needs, one value per file. This is the only
directory in the repo that holds secrets, and `.gitignore` keeps all of it out
of git — this README is the single committed exception.

Create the files with:

```sh
make secrets
```

## The files

| File | Filled by | Contains |
|---|---|---|
| `postgres_password.txt` | `make secrets` | random 64-char hex, never typed by a human |
| `jwt_secret.txt` | `make secrets` | random 64-char hex, signs the session JWTs |
| `google_client_secret.txt` | **you** | client secret of your Google OAuth app |
| `ft_client_secret.txt` | **you** | client secret of your 42 OAuth app |

The two `*_client_secret.txt` files start with the placeholder `CHANGE_ME`.
Open them and paste the real value in — nothing else, one line. `make secrets`
warns while a placeholder is still there; the stack boots either way, only
OAuth login stops working.

The matching **client IDs** and **callback URLs** are not secret (they travel
in the browser's address bar during the OAuth redirect), so they live in `.env`
next to the other configuration.

## How they reach the containers

Compose mounts each file read-only at `/run/secrets/<name>` inside the services
that are listed for it — `docker-compose.yml` decides who gets what. The
entrypoint of each service reads the files it needs and hands the values to the
app as environment variables, so no application code had to change.

This is better than putting the values in `environment:` because they then
never appear in `docker compose config`, in `docker inspect`, or in a shared
`.env` that every service could read.

## Rules

- **Never commit these files.** If one ever lands in git, rotate the value; the
  history keeps it forever.
- One value per file, no `KEY=` prefix, no quotes.
- A trailing newline is fine, and so is a file saved on Windows — the
  entrypoints strip `\r` and the final newline.
- Rotating `postgres_password.txt` after the database volume exists is not
  enough: Postgres baked the old password into the volume on first boot. Run
  `make fclean && make up`.
