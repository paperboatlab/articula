<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/banner-dark.webp">
    <img src=".github/readme/banner-light.webp" width="382" alt="Paperboat Articula">
  </picture>
</h1>

Acausal modelling: an OpenModelica editor with a library browser, a diagram, the model's text, a model
check, and Simulate with a plot and a variables browser. A C++ server speaks to omc, which runs as
Paperboat's `omc` runtime in a container. Part of [Paperboat](https://github.com/paperboatlab/paperboat).

**Docs:** <https://paperboatlab.org/apps/articula/> (sources in [`docs/`](docs/))

**Status:** v0.1, rebuilt on the new platform from Squero Studio OM, archived as
[squero-studio-om-legacy](https://github.com/paperboatlab/squero-studio-om-legacy).
**Design:** [ARCHITECTURE.md](ARCHITECTURE.md) · **Look:** [@paperboatlab/ui](https://github.com/paperboatlab/paperboat-ui)

## Layout

```text
server/        the app server (C++20): articula/0 over WebSocket, omc through paperboatd, the importer
src/           the page (React, @paperboatlab/ui), built into dist/
bin/articula   the command
docs/          the manual (reStructuredText)
examples/      models to open
```

## Install

```sh
paperboat app install articula      # pulls the omc runtime too
```

```sh
npm ci && npm run build && npm run build:server
paperboat app install articula --from .
```

Pushing a tag `v<version>` (package.json's) publishes the release `app install` downloads (Linux x86_64).

## Run

```sh
paperboat app open articula ~/models        # or: bin/articula ~/models
paperboat package add omc Modelica --project ~/models   # the Modelica Standard Library, once per folder
```

Opens at `http://127.0.0.1:30472/`. omc needs `paperboatd` (the `paperboat-cli` package, or
`PAPERBOATD=/path/to/paperboatd`) and podman or docker.

## Check

```sh
npm run typecheck && npm test && npm run build
npm run build:server && npm run test:server   # the [omc] tests need paperboatd
```

## Licence

GNU General Public License version 3 (see [LICENSE](LICENSE)).
