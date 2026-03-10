import express from "express";
import { Octokit } from "@octokit/rest";

const app = express();

function buildOctokit() {
  return new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
}

function getConfig() {
  return {
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    token: process.env.GITHUB_TOKEN,
  };
}

app.get("/", (req, res) => {
  res.send("BTRussia MCP server running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    owner: process.env.GITHUB_OWNER ?? null,
    repo: process.env.GITHUB_REPO ?? null,
    hasToken: Boolean(process.env.GITHUB_TOKEN),
    tokenPrefix: process.env.GITHUB_TOKEN
      ? process.env.GITHUB_TOKEN.slice(0, 10)
      : null,
    railwayEnv: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
    railwayService: process.env.RAILWAY_SERVICE_NAME ?? null,
  });
});

app.get("/repo", async (req, res) => {
  try {
    const { owner, repo, token } = getConfig();

    if (!owner || !repo || !token) {
      return res.status(500).json({
        error: "Missing required environment variables",
        ownerExists: Boolean(owner),
        repoExists: Boolean(repo),
        tokenExists: Boolean(token),
      });
    }

    const octokit = buildOctokit();

    const response = await octokit.repos.get({
      owner,
      repo,
    });

    return res.json({
      id: response.data.id,
      name: response.data.name,
      full_name: response.data.full_name,
      private: response.data.private,
      default_branch: response.data.default_branch,
      html_url: response.data.html_url,
    });
  } catch (error) {
    console.error("GitHub API error:", error);

    return res.status(error.status || 500).json({
      error: "Failed to fetch repository",
      message: error.message,
      status: error.status || 500,
      owner: process.env.GITHUB_OWNER || null,
      repo: process.env.GITHUB_REPO || null,
    });
  }
});

app.get("/file", async (req, res) => {
  try {
    const { owner, repo, token } = getConfig();
    const path = req.query.path;
    const ref = req.query.ref || undefined;

      // защита от чтения секретных файлов
    if (path.includes(".env")) {
      return res.status(403).json({ error: "Forbidden file" });
    }

    if (!owner || !repo || !token) {
      return res.status(500).json({
        error: "Missing required environment variables",
      });
    }

    if (!path) {
      return res.status(400).json({
        error: "Query parameter 'path' is required",
      });
    }

    const octokit = buildOctokit();

    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (Array.isArray(response.data)) {
      return res.status(400).json({
        error: "Path points to a directory, not a file",
        path,
      });
    }

    const content = Buffer.from(response.data.content, "base64").toString("utf-8");

    return res.json({
      path: response.data.path,
      name: response.data.name,
      sha: response.data.sha,
      size: response.data.size,
      content,
    });
  } catch (error) {
    console.error("GitHub file read error:", error);

    return res.status(error.status || 500).json({
      error: "Failed to fetch file",
      message: error.message,
      status: error.status || 500,
      path: req.query.path || null,
    });
  }
});

app.get("/dir", async (req, res) => {
  try {
    const { owner, repo, token } = getConfig();
    const path = req.query.path || "";
    const ref = req.query.ref || undefined;

    if (!owner || !repo || !token) {
      return res.status(500).json({
        error: "Missing required environment variables",
      });
    }

    const octokit = buildOctokit();

    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (!Array.isArray(response.data)) {
      return res.status(400).json({
        error: "Path points to a file, not a directory",
        path,
      });
    }

    return res.json({
      path,
      items: response.data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size ?? null,
      })),
    });
  } catch (error) {
    console.error("GitHub dir read error:", error);

    return res.status(error.status || 500).json({
      error: "Failed to fetch directory",
      message: error.message,
      status: error.status || 500,
      path: req.query.path || "",
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
