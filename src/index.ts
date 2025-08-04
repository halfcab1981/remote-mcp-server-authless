import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ZEP MCP Proxy - forwards requests to your ZEP server
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "ZEP Memory Server",
		version: "1.0.0",
	});

	private ZEP_SERVER_URL = "https://mcp-zep.halfcab.dev";

	async init() {
		// Add memory tool - proxies to ZEP
		this.server.tool(
			"add_memory",
			{
				name: z.string(),
				episode_body: z.string(),
				source: z.string().optional(),
				source_description: z.string().optional(),
				group_id: z.string().optional()
			},
			async ({ name, episode_body, source, source_description, group_id }) => {
				try {
					const response = await this.callZepTool("add_memory", {
						name,
						episode_body,
						source: source || "text",
						source_description: source_description || "",
						group_id
					});
					return {
						content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: `Error: ${error.message}` }],
					};
				}
			}
		);

		// Search memory facts tool
		this.server.tool(
			"search_memory_facts",
			{
				query: z.string(),
				max_facts: z.number().optional(),
				group_ids: z.array(z.string()).optional()
			},
			async ({ query, max_facts, group_ids }) => {
				try {
					const response = await this.callZepTool("search_memory_facts", {
						query,
						max_facts: max_facts || 10,
						group_ids
					});
					return {
						content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: `Error: ${error.message}` }],
					};
				}
			}
		);

		// Search memory nodes tool
		this.server.tool(
			"search_memory_nodes", 
			{
				query: z.string(),
				max_nodes: z.number().optional(),
				group_ids: z.array(z.string()).optional()
			},
			async ({ query, max_nodes, group_ids }) => {
				try {
					const response = await this.callZepTool("search_memory_nodes", {
						query,
						max_nodes: max_nodes || 10,
						group_ids
					});
					return {
						content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: `Error: ${error.message}` }],
					};
				}
			}
		);

		// Get episodes tool
		this.server.tool(
			"get_episodes",
			{
				group_id: z.string().optional(),
				last_n: z.number().optional()
			},
			async ({ group_id, last_n }) => {
				try {
					const response = await this.callZepTool("get_episodes", {
						group_id,
						last_n: last_n || 10
					});
					return {
						content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
					};
				} catch (error) {
					return {
						content: [{ type: "text", text: `Error: ${error.message}` }],
					};
				}
			}
		);
	}

	private async callZepTool(toolName: string, params: any): Promise<any> {
		// First get a session ID from ZEP server
		const sseResponse = await fetch(`${this.ZEP_SERVER_URL}/sse`);
		const sseText = await sseResponse.text();
		const sessionMatch = sseText.match(/session_id=([a-f0-9]+)/);
		
		if (!sessionMatch) {
			throw new Error("Could not get session ID from ZEP server");
		}

		const sessionId = sessionMatch[1];
		console.log(`Using ZEP session: ${sessionId}`);

		// Make the tool call
		const response = await fetch(`${this.ZEP_SERVER_URL}/messages/?session_id=${sessionId}`, {
			method: "POST",
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: toolName,
					arguments: params
				}
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`ZEP error: ${response.status} - ${errorText}`);
			throw new Error(`ZEP server error: ${response.status}`);
		}

		const result = await response.json();
		console.log("ZEP response:", JSON.stringify(result));
		
		if (result.error) {
			throw new Error(result.error.message);
		}

		return result.result;
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}
		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}
		return new Response("Not found", { status: 404 });
	},
};
