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

# tectonic rather than TeX Live: it fetches only the packages a document
# actually uses, which keeps this image in the low hundreds of MB instead of the
# multiple GB a texlive-latex-extra base lands at. Official installer drops the
# binary in the working directory.
RUN curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh \
    && mv ./tectonic /usr/local/bin/tectonic \
    && chmod +x /usr/local/bin/tectonic \
    && tectonic --version

# Bake tectonic's package cache into the image by compiling a document that
# pulls the usual resume dependencies. Without this, the FIRST request after
# every cold start downloads a chunk of TeX Live and times out — which looks
# like a broken service rather than a warming one.
WORKDIR /warmup
RUN printf '%s\n' \
      '\documentclass[11pt]{article}' \
      '\usepackage[margin=0.6in]{geometry}' \
      '\usepackage{enumitem}\usepackage{hyperref}\usepackage{titlesec}' \
      '\usepackage{tabularx}\usepackage{xcolor}' \
      '\usepackage[T1]{fontenc}\usepackage{lmodern}' \
      '\begin{document}Warmup.\newpage Second page.\end{document}' \
      > warmup.tex \
    # Not fatal: a package that fails to resolve here just isn't pre-cached and
    # the real request fetches it. A broken warmup must not break the build.
    && (tectonic -X compile --keep-logs --print warmup.tex || true) \
    && rm -rf /warmup/*

WORKDIR /app
COPY services/latex/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY services/latex/server.js ./
# The generated protobuf code, shared with the Next app. Committed to the repo
# so neither build needs the buf toolchain.
COPY shared/gen ../shared/gen

ENV PORT=8080 GRPC_PORT=8081
EXPOSE 8080 8081
CMD ["node", "server.js"]
