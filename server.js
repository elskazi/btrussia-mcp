import express from "express"
import { Octokit } from "@octokit/rest"

const app = express()

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
})

app.get("/", (req, res) => {
  res.send("BTRussia MCP server running")
})

app.get("/repo", async (req, res) => {
  const repo = await octokit.repos.get({
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO
  })

  res.json(repo.data)
})

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log("Server running on port " + port)
})
