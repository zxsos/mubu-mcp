# mubu-mcp

幕布 (mubu.com) 的 MCP Server + 内部 API 逆向文档。

幕布没有公开 API，本项目逆向其内部接口，提供完整的文档读写能力。

## 功能

19 个工具，覆盖幕布全部 20 个可用内部接口：

| 分类 | 工具 |
|------|------|
| 鉴权 | `mubu_login`（手机号+密码自动换 token）、`mubu_set_token`、`mubu_user_info` |
| 读取 | `mubu_list_docs`、`mubu_get_doc`（转 Markdown）、`mubu_get_doc_name`、`mubu_search`、`mubu_recent` |
| 新建 | `mubu_create_doc`、`mubu_create_folder`、`mubu_create_from_template`、`mubu_write_doc` |
| 修改 | `mubu_rename_doc`、`mubu_rename_folder`、`mubu_move`、`mubu_copy_doc` |
| 删除 | `mubu_delete_doc`、`mubu_delete_folder`、`mubu_batch_delete` |

## 快速开始

```bash
npm install
```

### 配置 MCP 客户端

```json
{
  "mcpServers": {
    "mubu": {
      "command": "node",
      "args": ["/path/to/mubu-mcp/index.js"]
    }
  }
}
```

### 登录

首次使用先登录（任选其一）：

- 调用 `mubu_login` 工具，传入手机号和密码，自动获取并保存 Token
- 或从浏览器 localStorage 复制 mubu.com 的 `Jwt-Token`，调用 `mubu_set_token`

Token 保存在 `~/.config/mubu-mcp/token.json`，过期后重新登录即可。

## API 文档

完整的内部接口逆向文档（OpenAPI 3.0 + Swagger UI）：

**https://zxsos.github.io/mubu-mcp/**

本地查看：`docs/openapi.json`，或用浏览器打开 `docs/index.html`。

## 接口说明

- Base URL: `https://api2.mubu.com`
- 全部为 POST，`Content-Type: application/json`
- 鉴权：请求头 `Jwt-Token`
- 统一响应：`{code: 0, data, msg}`，`code: 0` 为成功
- 写入文档内容走 `POST /v3/api/list/import_doc`（一次导入完整 `define`）
- `memberId`（colla 接口用）即登录返回的 `userId`

已证伪（不可用）：`/v3/api/doc/save`、`/v3/api/list/delete`、`/v3/api/list/move`，均返回 code 17。

## 免责声明

幕布无公开 API，以上均为逆向的内部接口，随时可能变更，仅供学习研究。
