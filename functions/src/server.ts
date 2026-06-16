import express from "express";
import * as https from "https";

const app = express();
app.use(express.json());

const API_KEY = process.env.OLLAMA_API_KEY;
if (!API_KEY) {
  console.error("OLLAMA_API_KEY environment variable is required");
  process.exit(1);
}

app.options("*", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.status(204).send("");
});

app.get("/", (_req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.json({ ok: true, message: "Ollama proxy is running" });
});

app.post("/", (req, res) => {
  const { path, method = "GET", headers = {}, body } = req.body;
  if (!path) {
    res.status(400).json({ error: "Missing path" });
    return;
  }

  const options = {
    hostname: "api.ollama.com",
    path: path,
    method: method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + API_KEY,
      ...headers,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.status(proxyRes.statusCode || 200);

    const contentType = proxyRes.headers["content-type"] || proxyRes.headers["Content-Type"];
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    if (proxyRes.headers["transfer-encoding"]) {
      res.setHeader("Transfer-Encoding", proxyRes.headers["transfer-encoding"]);
    }

    proxyRes.on("data", (chunk) => res.write(chunk));
    proxyRes.on("end", () => res.end());
  });

  proxyReq.on("error", (e) => {
    res.status(502).json({ error: e.message });
  });

  if (body) proxyReq.write(JSON.stringify(body));
  proxyReq.end();
});

const PORT = parseInt(process.env.PORT || "8080", 10);
app.listen(PORT, () => {
  console.log(`Ollama proxy listening on port ${PORT}`);
});
