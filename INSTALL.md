# mubu-mcp 安装指南（给 AI Agent）

> 用户让你安装 mubu-mcp 时，按以下步骤执行。

## 1. 克隆并安装依赖

```bash
git clone https://github.com/zxsos/mubu-mcp.git
cd mubu-mcp
npm install
```

记下 `index.js` 的绝对路径，后面配置要用。

## 2. 配置 MCP 客户端

### Claude Desktop / 通用 MCP 客户端

配置文件（`claude_desktop_config.json` 或对应客户端的 MCP 配置）：

```json
{
  "mcpServers": {
    "mubu": {
      "command": "node",
      "args": ["/绝对路径/mubu-mcp/index.js"]
    }
  }
}
```

把 `/绝对路径` 换成第 1 步记下的实际路径。

### DeepSeek Harness

在 profile 的 `cordis.patch.yml` 中添加：

```yaml
- insert:
    - id: mcp-mubu
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: mubu
        transport: stdio
        command: node
        args: ['/绝对路径/mubu-mcp/index.js']
        toolCallTimeoutMs: 120000
        failOnStartupError: false
```

## 3. 登录幕布

配置完成后重启 MCP 客户端，然后调用 `mubu_login` 工具：

- `phone`：幕布绑定的手机号
- `password`：幕布密码

登录成功后 Token 自动保存到 `~/.config/mubu-mcp/token.json`，后续无需重复登录。Token 过期后重新调用 `mubu_login` 即可。

也可以手动从浏览器 localStorage 复制 mubu.com 的 `Jwt-Token`，调用 `mubu_set_token` 设置。

## 4. 验证

调用 `mubu_list_docs`，能列出文档即安装成功。

## 故障排查

| 问题 | 解决 |
|------|------|
| 工具调用报鉴权失败 | Token 过期，重新 `mubu_login` |
| `node` 找不到 | 确认 Node.js 已安装（需 v18+） |
| 依赖报错 | 重新运行 `npm install` |
