#!/usr/bin/env node
/**
 * mubu-mcp - MCP server for Mubu (幕布) outline notes
 *
 * Uses Mubu's internal API (api2.mubu.com) with JWT token auth.
 * Get your JWT token from browser localStorage: `Jwt-Token` on mubu.com
 *
 * Tools:
 * - mubu_list_docs: List documents and folders
 * - mubu_get_doc: Read a document as Markdown
 * - mubu_search: Full-text search
 * - mubu_recent: Recently edited documents
 * - mubu_set_token: Set the JWT token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const API_BASE = "https://api2.mubu.com";
const CONFIG_DIR = join(homedir(), ".config", "mubu-mcp");
const TOKEN_FILE = join(CONFIG_DIR, "token.json");

function loadToken() {
  try {
    if (existsSync(TOKEN_FILE)) {
      const data = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
      return data.token || null;
    }
  } catch {}
  return process.env.MUBU_JWT_TOKEN || null;
}

function saveToken(token) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify({ token }, null, 2), { mode: 0o600 });
}

async function apiPost(path, body = {}) {
  const token = loadToken();
  if (!token) {
    throw new Error("未设置 JWT Token。请先用 mubu_set_token 设置，或从浏览器 localStorage 获取 mubu.com 的 Jwt-Token。");
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "jwt-token": token,
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`API 返回非 JSON: ${text.substring(0, 200)}`);
  }

  if (json.code !== 0) {
    const msg = json.msg || json.message || "未知错误";
    if (/token|jwt|auth|login|登录/i.test(msg)) {
      throw new Error(`鉴权失败 (${msg})，Token 可能过期，请重新获取。`);
    }
    throw new Error(`API 错误 code=${json.code}: ${msg}`);
  }

  return json.data;
}

// --- Node rendering: Mubu outline tree -> Markdown ---

function htmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function nodeToMarkdown(node, depth = 0) {
  const indent = "  ".repeat(depth);
  const text = htmlToText(node.text || "").trim();
  const prefix = depth === 0 ? "## " : "- ";

  let md = "";
  if (text) {
    // Task checkbox
    const done = node.done ? "[x]" : node.task ? "[ ]" : "";
    const taskPrefix = done ? `${done} ` : "";
    md += `${indent}${prefix}${taskPrefix}${text}\n`;
  }

  if (node.note) {
    const note = htmlToText(node.note).trim();
    if (note) {
      const noteLines = note.split("\n");
      for (const line of noteLines) {
        md += `${indent}  > ${line}\n`;
      }
    }
  }

  for (const child of node.children || []) {
    md += nodeToMarkdown(child, depth + 1);
  }
  return md;
}

function docToMarkdown(data) {
  const title = data.name || data.title || "Untitled";
  let md = `# ${title}\n\n`;
  const nodes = data.nodes || data.content || [];
  for (const node of nodes) {
    md += nodeToMarkdown(node, 0);
  }
  return md;
}

// --- MCP Server ---

const server = new Server(
  { name: "mubu-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "mubu_set_token",
      description: "设置幕布 JWT Token。从浏览器 localStorage 获取 mubu.com 的 Jwt-Token 值。",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "JWT Token" },
        },
        required: ["token"],
      },
    },
    {
      name: "mubu_login",
      description: "手机号+密码登录幕布，自动获取并保存 JWT Token（用于保活/刷新）。",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "手机号" },
          password: { type: "string", description: "密码" },
        },
        required: ["phone", "password"],
      },
    },
    {
      name: "mubu_list_docs",
      description: "列出幕布文档和文件夹",
      inputSchema: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "文件夹 ID，不填则列根目录" },
        },
      },
    },
    {
      name: "mubu_get_doc",
      description: "读取幕布文档内容，转为 Markdown",
      inputSchema: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "文档 ID" },
        },
        required: ["doc_id"],
      },
    },
    {
      name: "mubu_search",
      description: "全文搜索幕布文档",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
        },
        required: ["query"],
      },
    },
    {
      name: "mubu_recent",
      description: "最近编辑的文档",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "mubu_user_info",
      description: "获取当前用户信息",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "mubu_create_doc",
      description: "新建文档",
      inputSchema: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "父文件夹 ID，根目录填 0" },
          name: { type: "string", description: "文档标题" },
          content: { type: "string", description: "初始内容（可选）" },
        },
        required: ["name"],
      },
    },
    {
      name: "mubu_create_folder",
      description: "新建文件夹",
      inputSchema: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "父文件夹 ID，根目录填 0" },
          name: { type: "string", description: "文件夹名" },
        },
        required: ["name"],
      },
    },
    {
      name: "mubu_rename_doc",
      description: "重命名文档",
      inputSchema: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "文档 ID" },
          name: { type: "string", description: "新标题" },
        },
        required: ["doc_id", "name"],
      },
    },
    {
      name: "mubu_rename_folder",
      description: "重命名文件夹",
      inputSchema: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "文件夹 ID" },
          name: { type: "string", description: "新名称" },
        },
        required: ["folder_id", "name"],
      },
    },
    {
      name: "mubu_delete_doc",
      description: "删除文档（不可恢复，谨慎）",
      inputSchema: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "文档 ID" },
        },
        required: ["doc_id"],
      },
    },
    {
      name: "mubu_delete_folder",
      description: "删除文件夹（不可恢复，谨慎）",
      inputSchema: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "文件夹 ID" },
        },
        required: ["folder_id"],
      },
    },
    {
      name: "mubu_copy_doc",
      description: "复制文档",
      inputSchema: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "源文档 ID" },
        },
        required: ["doc_id"],
      },
    },
    {
      name: "mubu_move",
      description: "移动文档/文件夹到目标文件夹",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["doc", "folder"], description: "移动对象类型" },
          id: { type: "string", description: "文档/文件夹 ID" },
          target_folder_id: { type: "string", description: "目标文件夹 ID，根目录填 0" },
        },
        required: ["type", "id", "target_folder_id"],
      },
    },
    {
      name: "mubu_write_doc",
      description: "向文档追加写入大纲节点（实验性）",
      inputSchema: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "文档 ID" },
          text: { type: "string", description: "节点文本内容" },
          note: { type: "string", description: "备注（可选）" },
        },
        required: ["doc_id", "text"],
      },
    },
    {
      name: "mubu_get_doc_name",
      description: "获取文档标题",
      inputSchema: {
        type: "object",
        properties: {
          doc_id: { type: "string", description: "文档 ID" },
        },
        required: ["doc_id"],
      },
    },
    {
      name: "mubu_batch_delete",
      description: "批量删除文档和文件夹（不可恢复，谨慎）",
      inputSchema: {
        type: "object",
        properties: {
          doc_ids: { type: "array", items: { type: "string" }, description: "文档 ID 列表" },
          folder_ids: { type: "array", items: { type: "string" }, description: "文件夹 ID 列表" },
        },
      },
    },
    {
      name: "mubu_create_from_template",
      description: "从模板创建文档",
      inputSchema: {
        type: "object",
        properties: {
          template_doc_id: { type: "string", description: "模板文档 ID" },
          folder_id: { type: "string", description: "目标文件夹 ID，根目录填 0" },
        },
        required: ["template_doc_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "mubu_set_token": {
        saveToken(args.token);
        return { content: [{ type: "text", text: "Token 已保存到 ~/.config/mubu-mcp/token.json" }] };
      }

      case "mubu_login": {
        // phone_login 不需要鉴权，直接调
        const resp = await fetch(`${API_BASE}/v3/api/user/phone_login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: args.phone, password: args.password, callbackType: 0 }),
        });
        const json = await resp.json();
        if (json.code !== 0) {
          throw new Error(`登录失败 code=${json.code}: ${json.msg || json.message}`);
        }
        const token = json.data.token;
        if (!token) throw new Error("登录成功但未返回 token");
        saveToken(token);
        // 顺手存下用户 ID（桌面端鉴权可能用得上）
        try {
          const cfg = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
          cfg.userId = json.data.id;
          cfg.userName = json.data.name;
          writeFileSync(TOKEN_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
        } catch {}
        return { content: [{ type: "text", text: `登录成功，用户：${json.data.name || json.data.id}，Token 已保存` }] };
      }

      case "mubu_list_docs": {
        const data = await apiPost("/v3/api/list/get", args.folder_id ? { folderId: args.folder_id } : {});
        const docs = data.documents || data.list || data.docs || [];
        const lines = docs.map((d) =>
          `${d.type === "folder" ? "📁" : "📄"} ${d.id} | ${d.name} | 更新: ${d.updated || d.updateTime || "-"}`
        );
        return { content: [{ type: "text", text: lines.join("\n") || "空" }] };
      }

      case "mubu_get_doc": {
        const data = await apiPost("/v3/api/document/edit/get", {
          docId: args.doc_id,
          password: "",
          isFromDocDir: true,
        });
        // definition 是 JSON 字符串，需二次解析
        let definition = {};
        try {
          definition = typeof data.definition === "string"
            ? JSON.parse(data.definition)
            : data.definition || {};
        } catch {}
        const md = docToMarkdown({ name: data.name, nodes: definition.nodes || [] });
        return { content: [{ type: "text", text: md }] };
      }

      case "mubu_search": {
        const data = await apiPost("/v3/api/list/search", { keyword: args.query });
        const results = data.list || data.results || [];
        const lines = results.map((r) =>
          `${r.type || "doc"} | ${r.id} | ${r.name} | 命中${r.hits || "-"}处 | ${(r.snippet || "").substring(0, 100)}`
        );
        return { content: [{ type: "text", text: lines.join("\n") || "无结果" }] };
      }

      case "mubu_recent": {
        const data = await apiPost("/v3/api/list/get_all_documents_page", { page: 1, pageSize: 20 });
        const docs = data.documents || data.list || [];
        docs.sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));
        const lines = docs.slice(0, 20).map((d) =>
          `📄 ${d.id} | ${d.name} | 更新: ${d.updated || "-"}`
        );
        return { content: [{ type: "text", text: lines.join("\n") || "空" }] };
      }

      case "mubu_user_info": {
        const data = await apiPost("/v3/api/user/info", { enhance: true });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "mubu_create_doc": {
        const data = await apiPost("/v3/api/list/create_doc", {
          folderId: args.folder_id || "0",
          name: args.name,
          content: args.content || "",
        });
        const id = data.doc?.id || data.id || JSON.stringify(data);
        return { content: [{ type: "text", text: `文档已创建，ID: ${id}` }] };
      }

      case "mubu_create_folder": {
        const data = await apiPost("/v3/api/list/create_folder", {
          folderId: args.folder_id || "0",
          name: args.name,
        });
        const id = data.folder?.id || data.id || JSON.stringify(data);
        return { content: [{ type: "text", text: `文件夹已创建，ID: ${id}` }] };
      }

      case "mubu_rename_doc": {
        await apiPost("/v3/api/list/rename_doc", { documentId: args.doc_id, name: args.name });
        return { content: [{ type: "text", text: `文档已重命名为：${args.name}` }] };
      }

      case "mubu_rename_folder": {
        await apiPost("/v3/api/list/rename_folder", {
          id: args.folder_id,
          folderId: args.folder_id,
          name: args.name,
        });
        return { content: [{ type: "text", text: `文件夹已重命名为：${args.name}` }] };
      }

      case "mubu_delete_doc": {
        await apiPost("/v3/api/list/delete_doc", { id: args.doc_id });
        return { content: [{ type: "text", text: `文档已删除：${args.doc_id}` }] };
      }

      case "mubu_delete_folder": {
        await apiPost("/v3/api/list/delete_folder", { id: args.folder_id });
        return { content: [{ type: "text", text: `文件夹已删除：${args.folder_id}` }] };
      }

      case "mubu_copy_doc": {
        const data = await apiPost("/v3/api/list/copy_doc", { id: args.doc_id });
        return { content: [{ type: "text", text: `文档已复制：${JSON.stringify(data).substring(0, 200)}` }] };
      }

      case "mubu_move": {
        await apiPost("/v3/api/list/custom/drag", {
          dst: null,
          src: [{ type: args.type, id: args.id }],
          folderId: args.target_folder_id,
        });
        return { content: [{ type: "text", text: `已移动到文件夹 ${args.target_folder_id}` }] };
      }

      case "mubu_write_doc": {
        // 先取当前文档
        const docData = await apiPost("/v3/api/document/edit/get", {
          docId: args.doc_id,
          password: "",
          isFromDocDir: true,
        });
        const baseVersion = docData.baseVersion || 0;
        let definition;
        try {
          definition = typeof docData.definition === "string"
            ? JSON.parse(docData.definition)
            : docData.definition;
        } catch { definition = { nodes: [] }; }
        const nodes = definition.nodes || [];

        // 从 token 文件取 userId 当 memberId
        let memberId = null;
        try {
          const cfg = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
          memberId = cfg.userId ? String(cfg.userId) : null;
        } catch {}
        if (!memberId) throw new Error("未找到 userId，请先用 mubu_login 登录");

        // 构造新节点并追加
        const nodeId = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const newNode = { id: nodeId, text: args.text, children: [] };
        if (args.note) newNode.note = args.note;
        nodes.push(newNode);

        // 根节点：id=doc_id，children=全部顶层节点（逆向自网页端，mubu-integration 真机验证）
        const root = { id: args.doc_id, children: nodes, modified: Date.now() };

        const token = loadToken();
        const resp = await fetch(`${API_BASE}/v3/api/colla/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "jwt-token": token,
            "x-reg-entrance": `https://mubu.com/app/edit/home/${args.doc_id}`,
          },
          body: JSON.stringify({
            memberId,
            type: "CHANGE",
            version: baseVersion,
            documentId: args.doc_id,
            events: [{ name: "update", updated: [{ updated: root, original: root }] }],
          }),
        });
        const json = await resp.json();
        if (json.code !== 0) throw new Error(`写入失败 code=${json.code}: ${json.msg || json.message}`);
        return { content: [{ type: "text", text: `已写入，最新版本: ${json.data.latestVersion}` }] };
      }

      case "mubu_get_doc_name": {
        const data = await apiPost("/v3/api/document/get_doc_name", { docId: args.doc_id });
        const name = typeof data === "string" ? data : data.name || JSON.stringify(data);
        return { content: [{ type: "text", text: `标题: ${name}` }] };
      }

      case "mubu_batch_delete": {
        await apiPost("/v3/api/list/batch_delete", {
          docs: args.doc_ids || [],
          folders: args.folder_ids || [],
          password: "",
        });
        const total = (args.doc_ids || []).length + (args.folder_ids || []).length;
        return { content: [{ type: "text", text: `已批量删除 ${total} 项` }] };
      }

      case "mubu_create_from_template": {
        const data = await apiPost("/v3/api/template/set_doc", {
          docId: args.template_doc_id,
          folderId: args.folder_id || "0",
        });
        return { content: [{ type: "text", text: `已从模板创建: ${JSON.stringify(data).substring(0, 200)}` }] };
      }

      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `错误: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
