## graphify + LLMWiki — Mandatory Knowledge Graph Enforcement

This project has a graphify knowledge graph at `graphify-out/`.

### MANDATORY Rules (Non-Negotiable):
1. **Before answering architecture or codebase questions**, read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure. Do NOT grep raw files first.
2. **After modifying ANY code files**, you MUST run:
   ```
   export PYENV_ROOT="$HOME/.pyenv" && export PATH="$PYENV_ROOT/versions/3.12.4/bin:$PATH"
   graphify update apps/web/src
   graphify update services/agents/src
   ```
   This keeps the knowledge graph current (AST-only, zero API cost).
3. **Git hooks are installed** (`post-commit`, `post-checkout`). They auto-rebuild the graph on every commit. Do NOT remove them.
4. **Every significant change** must be documented in `graphify-out/GRAPH_REPORT.md` with a changelog entry at the bottom noting what was added/modified/removed.
5. If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
6. If the graphify MCP server is active, use `query_graph`, `get_node`, and `shortest_path` tools for precise architecture navigation.

### Graph Locations:
- Frontend graph: `graphify-out/graph_frontend.json` (894 nodes)
- AI Agents graph: `graphify-out/graph_agents.json` (589 nodes)
- Interactive HTML: `graphify-out/graph_frontend.html`, `graphify-out/graph_agents.html`
- Combined report: `graphify-out/GRAPH_REPORT.md`
