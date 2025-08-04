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
		console.log(`=== Starting ZEP tool call: ${toolName} ===`);
		console.log(`Tool params:`, JSON.stringify(params, null, 2));

		try {
			// First get a session ID from ZEP server
			console.log(`Fetching session from: ${this.ZEP_SERVER_URL}/sse`);
			const sseResponse = await fetch(`${this.ZEP_SERVER_URL}/sse`);
			console.log(`SSE response status: ${sseResponse.status}`);

			if (!sseResponse.ok) {
				const errorText = await sseResponse.text();
				console.error(`SSE fetch failed: ${sseResponse.status} - ${errorText}`);
				throw new Error(`Could not connect to ZEP server: ${sseResponse.status}`);
			}

			const sseText = await sseResponse.text();
			console.log(`SSE response text: ${sseText.substring(0, 200)}...`);

			const sessionMatch = sseText.match(/session_id=([a-f0-9]+)/);

			if (!sessionMatch) {
				console.error('No session ID found in SSE response');
				throw new Error("Could not get session ID from ZEP server");
			}

			const sessionId = sessionMatch[1];
			console.log(`Using ZEP session: ${sessionId}`);

			// Prepare the tool call request
			const requestBody = {
				jsonrpc: "2.0",
				id: Date.now(), // Use timestamp for unique ID
				method: "tools/call",
				params: {
					name: toolName,
					arguments: params
				}
			};

			console.log(`Sending to ZEP:`, JSON.stringify(requestBody, null, 2));

			// Make the tool call
			const toolUrl = `${this.ZEP_SERVER_URL}/messages/?session_id=${sessionId}`;
			console.log(`Tool call URL: ${toolUrl}`);

			const response = await fetch(toolUrl, {
				method: "POST",
				headers: {
					'Content-Type': 'application/json',
					'Accept': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			console.log(`ZEP tool response status: ${response.status}`);
			console.log(`ZEP tool response headers:`, JSON.stringify(Object.fromEntries(response.headers.entries())));

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`ZEP tool call failed: ${response.status} - ${errorText}`);
				throw new Error(`ZEP server error: ${response.status} - ${errorText}`);
			}

			const responseText = await response.text();
			console.log(`ZEP raw response: ${responseText}`);

			let result;
			try {
				result = JSON.parse(responseText);
			} catch (parseError) {
				console.error(`Failed to parse ZEP response as JSON:`, parseError);
				console.error(`Raw response was: ${responseText}`);
				throw new Error(`Invalid JSON response from ZEP server`);
			}

			console.log("ZEP parsed response:", JSON.stringify(result, null, 2));

			if (result.error) {
				console.error(`ZEP returned error:`, result.error);
				throw new Error(`ZEP error: ${result.error.message || JSON.stringify(result.error)}`);
			}

			console.log(`=== ZEP tool call successful: ${toolName} ===`);
			return result.result || result;

		} catch (error) {
			console.error(`=== ZEP tool call failed: ${toolName} ===`);
			console.error(`Error details:`, error);
			throw error;
		}
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
