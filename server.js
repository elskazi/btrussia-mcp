import express from "express";
import { Octokit } from "@octokit/rest";

const app = express();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

app.get("/", (req, res) => {
  res.send("BTRussia MCP server running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    owner: process.env.GITHUB_OWNER || null,
    repo: process.env.GITHUB_REPO || null,
    hasToken: Boolean(process.env.GITHUB_TOKEN),
  });
});

app.get("/repo", async (req, res) => {
  try {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!owner || !repo || !process.env.GITHUB_TOKEN) {
      return res.status(500).json({
        error: "Missing required environment variables",
        ownerExists: Boolean(owner),
        repoExists: Boolean(repo),
        tokenExists: Boolean(process.env.GITHUB_TOKEN),
      });
    }

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
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
