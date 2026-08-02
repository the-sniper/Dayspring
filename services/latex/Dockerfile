# Dayspring LaTeX compile sidecar.
#
# Build context is the REPO ROOT, not this directory — the service imports the
# generated protobuf code from shared/gen, which both it and the Next app use.
#   docker build -f services/latex/Dockerfile .
# (fly.toml sets this via build.dockerfile + a root-relative context.)
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# tectonic rather than TeX Live: it fetches only the packages a document actually
# uses, which keeps this image in the low hundreds of MB instead of the multiple
# GB a texlive-latex-extra base lands at.
#
# The MUSL build, downloaded directly — NOT the official curl|sh installer. That
# installer picks the gnu build, which is dynamically linked and dies on a slim
# base with "libgraphite2.so.3: cannot open shared object file". Chasing that
# means pinning libgraphite2/harfbuzz/freetype/fontconfig/icu/ssl/ssh2 versions
# against whatever the base image ships, and it breaks again on the next base
# bump. The musl artifact is statically linked and needs none of them.
#
# Pinned rather than "latest" so the image is reproducible. To bump: check
# https://github.com/tectonic-typesetting/tectonic/releases and change TECTONIC_VERSION.
ARG TECTONIC_VERSION=0.16.9
# Supplied by BuildKit: "amd64" on Fly, "arm64" if you build on Apple silicon.
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) arch=x86_64 ;; \
      arm64) arch=aarch64 ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    url="https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${arch}-unknown-linux-musl.tar.gz"; \
    curl --proto '=https' --tlsv1.2 -fsSL "$url" -o /tmp/tectonic.tar.gz; \
    tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic; \
    rm /tmp/tectonic.tar.gz; \
    chmod +x /usr/local/bin/tectonic; \
    tectonic --version; \
    # Fail the build now if the V2 CLI is missing, rather than at the first
    # request — server.js invokes `tectonic -X compile`.
    tectonic -X compile --help > /dev/null

# Where tectonic caches the TeX bundle. Pinned to an explicit path rather than
# left to default, because the default is $HOME/.cache — and HOME differs
# between the root user that runs this build and whatever user runs the
# container (UID 1000 under the k8s manifests). A cache baked into /root/.cache
# is invisible to a non-root runtime, so the "pre-warmed" image would silently
# re-download the bundle on its first request, which is the exact failure this
# step exists to prevent.
ENV XDG_CACHE_HOME=/opt/tex-cache

# Bake the bundle + package cache into the image by compiling a document that
# pulls the usual resume dependencies. tectonic fetches from the network on
# demand, so without this the FIRST request after every cold start downloads a
# chunk of TeX Live and times out — looking like a broken service rather than a
# warming one.
WORKDIR /warmup
RUN set -eux; \
    mkdir -p "$XDG_CACHE_HOME"; \
    printf '%s\n' \
      '\documentclass[11pt]{article}' \
      '\usepackage[margin=0.6in]{geometry}' \
      '\usepackage{enumitem}\usepackage{hyperref}\usepackage{titlesec}' \
      '\usepackage{tabularx}\usepackage{xcolor}' \
      '\usepackage[T1]{fontenc}\usepackage{lmodern}' \
      '\begin{document}Warmup.\newpage Second page.\end{document}' \
      > warmup.tex; \
    # Non-fatal on purpose: if the bundle relay is transiently unreachable from
    # the builder, the runtime can still fetch on demand — a slow first request
    # beats a blocked deploy. The banner makes a cold image obvious in the logs
    # instead of leaving you to discover it from a timeout later.
    if tectonic -X compile --keep-logs --print warmup.tex; then \
      echo ">>> tectonic bundle cached into $XDG_CACHE_HOME"; \
    else \
      echo ">>> WARNING: warmup failed, image ships WITHOUT a cached bundle;" >&2; \
      echo ">>> the first compile will be slow and needs outbound network." >&2; \
    fi; \
    # Readable by whatever UID ends up running the container.
    chmod -R a+rX "$XDG_CACHE_HOME"; \
    rm -rf /warmup/*

# Layout mirrors the repo — /app stands in for the repo root, so server.js and
# the generated code keep the same relative path to each other AND both sit
# below node_modules.
#
# That second part is load-bearing. Node resolves a bare import by walking UP
# from the importing file looking for node_modules. An earlier version put the
# generated code at /shared/gen with deps at /app/node_modules — siblings, so
# the walk went /shared/node_modules → /node_modules and never found them. The
# machine crash-looped with "Cannot find package '@bufbuild/protobuf' imported
# from /shared/gen/...". Keeping everything under /app fixes it, and /app's
# package.json ("type": "module") also covers shared/gen, so the generated ESM
# loads without a MODULE_TYPELESS warning.
WORKDIR /app
COPY services/latex/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY services/latex/server.js ./services/latex/server.js
# Generated protobuf code, shared with the Next app. Committed to the repo so
# neither build needs the buf toolchain.
COPY shared/gen ./shared/gen

ENV PORT=8080 GRPC_PORT=8081
EXPOSE 8080 8081
CMD ["node", "services/latex/server.js"]
