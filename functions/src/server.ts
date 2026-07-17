/**
 * Cloud Run Ollama proxy — server-side API key only.
 * Hardening: path allowlist, body cap, dual-mode Firebase auth, per-instance rate limit.
 *
 * Env:
 *   OLLAMA_API_KEY (required)
 *   PROXY_AUTH_REQUIRED=true|false (default true — set false only for local smoke without Firebase)
 *   CORS_ORIGINS=comma-separated (default: Hosting + localhost)
 *   RATE_LIMIT_PER_MIN=60 (default)
 */
import express from "express";
import * as https from "https";
import * as admin from "firebase-admin";

const app = express();
app.use(express.json({ limit: "256kb" }));

const API_KEY = process.env.OLLAMA_API_KEY;
if (!API_KEY) {
  console.error("OLLAMA_API_KEY environment variable is required");
  process.exit(1);
}

// Default ON for production safety; explicit "false" disables for local smoke tests.
const AUTH_REQUIRED = String(process.env.PROXY_AUTH_REQUIRED ?? "true").toLowerCase() !== "false";
const RATE_LIMIT_PER_MIN = Math.max(1, parseInt(process.env.RATE_LIMIT_PER_MIN || "60", 10));
const DEFAULT_CORS =
  "https://vocabmaster112225.web.app,https://vocabmaster112225.firebaseapp.com,http://localhost:5000,http://127.0.0.1:5000,http://localhost:5173";
const CORS_ORIGINS = (process.env.CORS_ORIGINS || DEFAULT_CORS)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Only these Ollama API paths are allowed through the proxy. */
const PATH_ALLOWLIST = new Set(["/api/tags", "/api/generate"]);

// Firebase Admin (ADC on Cloud Run; optional locally)
try {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
} catch (e) {
  console.warn("[proxy] firebase-admin init deferred/failed:", (e as Error).message);
}

type Bucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, Bucket>();

function clientKey(req: express.Request, uid: string | null): string {
  if (uid) return "uid:" + uid;
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  return "ip:" + ip;
}

function rateLimitOk(key: string): boolean {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + 60_000 };
    rateBuckets.set(key, b);
  }
  b.count++;
  return b.count <= RATE_LIMIT_PER_MIN;
}

function setCors(req: express.Request, res: express.Response) {
  const origin = req.headers.origin || "";
  if (CORS_ORIGINS.includes("*")) {
    res.set("Access-Control-Allow-Origin", "*");
  } else if (origin && CORS_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  } else if (!origin) {
    // non-browser / same-origin tools
    res.set("Access-Control-Allow-Origin", CORS_ORIGINS[0] || "*");
  }
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

async function verifyAuth(
  req: express.Request
): Promise<{ uid: string | null; error?: string; status?: number }> {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    if (AUTH_REQUIRED) return { uid: null, error: "Missing Authorization bearer token", status: 401 };
    return { uid: null };
  }
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    return { uid: decoded.uid || null };
  } catch {
    if (AUTH_REQUIRED) return { uid: null, error: "Invalid or expired token", status: 401 };
    return { uid: null };
  }
}

function normalizePath(p: string): string | null {
  if (!p || typeof p !== "string") return null;
  let path = p.trim();
  if (!path.startsWith("/")) path = "/" + path;
  // strip query
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  return path;
}

app.options("*", (req, res) => {
  setCors(req, res);
  res.status(204).send("");
});

app.get("/", (req, res) => {
  setCors(req, res);
  res.json({
    ok: true,
    message: "Ollama proxy is running",
    authRequired: AUTH_REQUIRED,
    allowlist: Array.from(PATH_ALLOWLIST),
  });
});

app.post("/", async (req, res) => {
  setCors(req, res);
  const started = Date.now();

  const auth = await verifyAuth(req);
  if (auth.error) {
    res.status(auth.status || 401).json({ error: auth.error });
    return;
  }

  const rk = clientKey(req, auth.uid);
  if (!rateLimitOk(rk)) {
    res.status(429).json({ error: "Too many AI requests — try again shortly" });
    return;
  }

  const { path: rawPath, method = "GET", body } = req.body || {};
  const path = normalizePath(rawPath);
  if (!path) {
    res.status(400).json({ error: "Missing path" });
    return;
  }
  if (!PATH_ALLOWLIST.has(path)) {
    res.status(403).json({ error: "Path not allowlisted", path });
    return;
  }

  const reqMethod = String(method || "GET").toUpperCase();
  const isTags = path === "/api/tags";

  const options: https.RequestOptions = {
    hostname: "api.ollama.com",
    path,
    method: isTags ? "GET" : reqMethod,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + API_KEY,
      // Do not forward client Authorization to Ollama
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    setCors(req, res);
    res.status(proxyRes.statusCode || 200);
    const contentType = proxyRes.headers["content-type"] || proxyRes.headers["Content-Type"];
    if (contentType) res.setHeader("Content-Type", contentType);
    if (proxyRes.headers["transfer-encoding"]) {
      res.setHeader("Transfer-Encoding", proxyRes.headers["transfer-encoding"] as string);
    }
    proxyRes.on("data", (chunk) => res.write(chunk));
    proxyRes.on("end", () => {
      const ms = Date.now() - started;
      console.log(
        JSON.stringify({
          t: "proxy",
          path,
          status: proxyRes.statusCode,
          ms,
          uid: auth.uid ? auth.uid.slice(0, 8) : null,
        })
      );
      res.end();
    });
  });

  proxyReq.on("error", (e) => {
    setCors(req, res);
    res.status(502).json({ error: e.message });
  });

  if (!isTags && body !== undefined && body !== null) {
    proxyReq.write(typeof body === "string" ? body : JSON.stringify(body));
  }
  proxyReq.end();
});

const PORT = parseInt(process.env.PORT || "8080", 10);
app.listen(PORT, () => {
  console.log(
    `Ollama proxy on :${PORT} authRequired=${AUTH_REQUIRED} rate=${RATE_LIMIT_PER_MIN}/min`
  );
});
