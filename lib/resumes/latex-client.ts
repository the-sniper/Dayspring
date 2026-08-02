// Typed client for the LaTeX compile sidecar.
//
// One generated service definition, three possible wire protocols, chosen by
// DAYSPRING_LATEX_PROTOCOL:
//
//   connect (default) — Connect protocol over HTTP/1.1. Works from Vercel
//                       functions, through any proxy, and with curl. This is
//                       the one to use unless you have a reason not to.
//   grpc              — gRPC proper over h2c, against the sidecar's second
//                       listener. Real gRPC: binary framing, no base64 on the
//                       PDF, trailers and status codes.
//   grpcweb           — gRPC-Web over HTTP/1.1, for proxies that mangle h2c.
//
// The protocol is a transport detail: the call site is identical either way,
// which is the actual argument for defining the boundary in protobuf rather
// than hand-rolling JSON.
import { createClient, ConnectError, Code } from "@connectrpc/connect";
import {
  createConnectTransport,
  createGrpcTransport,
  createGrpcWebTransport,
} from "@connectrpc/connect-node";
import { LatexService } from "@/shared/gen/dayspring/latex/v1/latex_pb.js";

export type LatexProtocol = "connect" | "grpc" | "grpcweb";

export function latexProtocol(): LatexProtocol {
  const p = process.env.DAYSPRING_LATEX_PROTOCOL?.trim().toLowerCase();
  return p === "grpc" || p === "grpcweb" ? p : "connect";
}

function transportFor(baseUrl: string, protocol: LatexProtocol) {
  // gRPC needs HTTP/2 and the sidecar serves it on a separate port, because a
  // Node plaintext http2 server cannot also serve HTTP/1.1.
  if (protocol === "grpc") {
    const grpcUrl = process.env.DAYSPRING_LATEX_GRPC_URL?.trim() || baseUrl;
    return createGrpcTransport({ baseUrl: grpcUrl.replace(/\/$/, "") });
  }
  if (protocol === "grpcweb") {
    return createGrpcWebTransport({ baseUrl, httpVersion: "1.1" });
  }
  return createConnectTransport({ baseUrl, httpVersion: "1.1" });
}

export type RemoteCompile =
  | { ok: true; pdf: Buffer; pages: number; engine: string }
  | { ok: false; error: string; reachable: boolean };

export async function compileRemote(
  baseUrl: string,
  latex: string,
  timeoutMs: number,
): Promise<RemoteCompile> {
  const protocol = latexProtocol();
  const secret = process.env.DAYSPRING_LATEX_SERVICE_SECRET?.trim();
  const client = createClient(LatexService, transportFor(baseUrl, protocol));
  try {
    const res = await client.compile(
      { latex },
      {
        headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
        // The sidecar scales to zero, so the first call of the day pays a
        // container cold start on top of the compile.
        timeoutMs,
      },
    );
    if (!res.pdf?.length || !res.pages) {
      return { ok: false, error: "Compile service returned an empty PDF.", reachable: true };
    }
    return {
      ok: true,
      pdf: Buffer.from(res.pdf),
      pages: res.pages,
      engine: res.engine || "tectonic",
    };
  } catch (err) {
    if (err instanceof ConnectError) {
      // Separate "your LaTeX is broken" from "your service is misconfigured" —
      // they send you looking in completely different places, and a bare
      // compile failure used to conflate them.
      if (err.code === Code.InvalidArgument) {
        return { ok: false, error: err.rawMessage, reachable: true };
      }
      if (err.code === Code.Unauthenticated) {
        return {
          ok: false,
          error:
            "LaTeX service rejected the request — DAYSPRING_LATEX_SERVICE_SECRET doesn't match the service's LATEX_SERVICE_SECRET.",
          reachable: true,
        };
      }
      if (err.code === Code.Unavailable || err.code === Code.DeadlineExceeded) {
        return {
          ok: false,
          error: `LaTeX service at ${baseUrl} is unavailable (${err.rawMessage}). It may still be cold-starting.`,
          reachable: false,
        };
      }
      return { ok: false, error: `${err.code}: ${err.rawMessage}`, reachable: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Couldn't reach the LaTeX service at ${baseUrl} over ${protocol} (${msg}). Check DAYSPRING_LATEX_SERVICE_URL and that the service is deployed.`,
      reachable: false,
    };
  }
}
