import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

const MCP_PATH = "/mcp";
const port = Number(process.env.PORT ?? 3000);

const forbidden = [".env", ".key", ".pem", "id_rsa", ".p12", ".crt"];

function isForbidden(path) {
  return forbidden.some((item) => path.includes(item));
}

function getConfig() {
  return {
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    token: process.env.GITHUB_TOKEN,
  };
}

function buildOctokit() {
  return new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
}

function healthPayload() {
  return {
    ok: true,
    owner: process.env.GITHUB_OWNER ?? null,
    repo: process.env.GITHUB_REPO ?? null,
    hasToken: Boolean(process.env.GITHUB_TOKEN),
    railwayEnv: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
    railwayService: process.env.RAILWAY_SERVICE_NAME ?? null,
  };
}

function jsonText(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function createGitHubMcpServer() {
  const server = new McpServer({
    name: "btrussia",
    version: "1.0.0",
  });

  server.registerTool(
    "get_repo_info",
    {
      title: "Get repository info",
      description: "Returns metadata for the configured GitHub repository.",
      inputSchema: {},
    },
    async () => {
      try {
        const { owner, repo, token } = getConfig();

        if (!owner || !repo || !token) {
          return jsonText({
            error: "Missing required environment variables",
            ownerExists: Boolean(owner),
            repoExists: Boolean(repo),
            tokenExists: Boolean(token),
          });
        }

        const octokit = buildOctokit();
        const response = await octokit.repos.get({ owner, repo });

        return jsonText({
          id: response.data.id,
          name: response.data.name,
          full_name: response.data.full_name,
          private: response.data.private,
          default_branch: response.data.default_branch,
          html_url: response.data.html_url,
        });
      } catch (error) {
        return jsonText({
          error: "Failed to fetch repository",
          message: error.message,
          status: error.status || 500,
        });
      }
    }
  );

  server.registerTool(
    "list_dir",
    {
      title: "List directory",
      description: "Lists files and folders in a directory of the configured GitHub repository.",
      inputSchema: {
        path: z.string().optional().describe("Directory path inside the repository"),
        ref: z.string().optional().describe("Optional git ref, branch, tag, or commit SHA"),
      },
    },
    async ({ path = "", ref }) => {
      try {
        const { owner, repo, token } = getConfig();

        if (!owner || !repo || !token) {
          return jsonText({
            error: "Missing required environment variables",
          });
        }

        if (isForbidden(path)) {
          return jsonText({
            error: "Forbidden path",
            path,
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
          return jsonText({
            error: "Path points to a file, not a directory",
            path,
          });
        }

        const items = response.data
          .filter((item) => !isForbidden(item.path))
          .map((item) => ({
            name: item.name,
            path: item.path,
            type: item.type,
            size: item.size ?? null,
          }));

        return jsonText({
          path,
          items,
        });
      } catch (error) {
        return jsonText({
          error: "Failed to fetch directory",
          message: error.message,
          status: error.status || 500,
          path,
        });
      }
    }
  );

  server.registerTool(
    "read_file",
    {
      title: "Read file",
      description: "Reads a text file from the configured GitHub repository.",
      inputSchema: {
        path: z.string().min(1).describe("File path inside the repository"),
        ref: z.string().optional().describe("Optional git ref, branch, tag, or commit SHA"),
      },
    },
    async ({ path, ref }) => {
      try {
        const { owner, repo, token } = getConfig();

        if (!owner || !repo || !token) {
          return jsonText({
            error: "Missing required environment variables",
          });
        }

        if (isForbidden(path)) {
          return jsonText({
            error: "Forbidden file",
            path,
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
          return jsonText({
            error: "Path points to a directory, not a file",
            path,
          });
        }

        const content = Buffer.from(response.data.content, "base64").toString("utf-8");

        return jsonText({
          path: response.data.path,
          name: response.data.name,
          sha: response.data.sha,
          size: response.data.size,
          content,
        });
      } catch (error) {
        return jsonText({
          error: "Failed to fetch file",
          message: error.message,
          status: error.status || 500,
          path,
        });
      }
    }
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("BTRussia MCP server");
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(healthPayload()));
    return;
  }

  if (req.method === "GET" && url.pathname === "/version") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ version: "mcp-v1" }));
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);

  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createGitHubMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(`BTRussia MCP server listening on http://localhost:${port}${MCP_PATH}`);
});
