# AGENTS.md

本文档为 AI Agent（Cursor、Copilot、Codex 等）提供项目级开发规范。  
Agent 在处理本项目代码时 **必须** 遵循以下规则。

---

## 项目概览

- **名称**：D.I.G.E.（Dijiang Integrated Generator Efficiency）
- **用途**：明日方舟：终末地（Arknights: Endfield）热能池最优发电方案计算器
- **技术栈**：React 19 + Vite + Tailwind CSS v4 + Chart.js
- **包管理**：pnpm
- **支持语言**：中文 (zh)、英文 (en)、日文 (ja)、韩文 (ko)、俄文 (ru)、法文 (fr)、德文 (de)

---

## i18n 多语言翻译（强制规则）

### 翻译工具

项目提供命令行翻译工具 `scripts/i18n.ts`。  
**任何涉及新增、修改、删除翻译 key 的操作，必须通过此工具完成，禁止手动编辑 locale JSON 文件。**

### 命令

```bash
# 检查各语言的同步状态
pnpm run i18n translate

# 新增 / 更新翻译（必须同时提供 7 种语言）
pnpm run i18n translate add <key> --zh "中文" --en "English" --ja "日本語" --ko "한국어" --ru "Русский" --fr "Français" --de "Deutsch"

# 批量新增（一条命令添加多个 key）
pnpm run i18n translate add <key1> --zh "..." --en "..." --ja "..." --ko "..." --ru "..." --fr "..." --de "..." \
                         add <key2> --zh "..." --en "..." --ja "..." --ko "..." --ru "..." --fr "..." --de "..."

# 生成待翻译模板（格式: [key][lang][xxx]）
pnpm run i18n translate generate <output.json> <key1> [<key2> ...]

# 从模板批量写回翻译
pnpm run i18n translate apply <input.json>

# 删除 key
pnpm run i18n translate delete <key1> [<key2> ...]

# 清理代码中未使用的 key
pnpm run i18n prune --write
```

### 工作流

1. 确定需要新增的 key 名称（camelCase，语义清晰）
2. 选择以下任一方式写入翻译：
   - 方式 A（直接写入）：准备 7 语言翻译后使用 `pnpm run i18n translate add`
   - 方式 B（模板写入）：先 `generate` 生成模板，手动填写后用 `apply` 批量写回
3. 脚本会自动校验同步状态，确认输出 `All locale files are in sync`

### 模板格式（generate / apply）

```json
{
  "keyName": {
    "zh": "中文",
    "en": "English",
    "ja": "日本語",
    "ko": "한국어",
    "ru": "Русский",
    "fr": "Français",
    "de": "Deutsch"
  }
}
```

### 翻译规范

| 规则 | 说明 |
|------|------|
| Source of truth | **zh (中文)** 为基准，其他语言以 zh 的 key 集合为标准 |
| 语言完整性 | 每个 key 必须同时提供 zh / en / ja / ko / ru / fr / de 七种翻译，缺一不可 |
| 翻译质量 | 符合游戏（明日方舟：终末地）语境，简洁专业 |
| 术语一致 | 保持各语言间术语统一（如 震荡发电 → Oscillating → 振動 → 진동） |
| Key 命名 | camelCase，语义清晰，如 `fuelConsumption`、`minBatteryPercent` |
| 文件格式 | 扁平 key-value JSON，禁止嵌套结构 |

### 禁止事项

- ❌ 手动编辑 `locales.*.json` 文件来添加/修改翻译
- ❌ 只添加部分语言（必须 7 语言齐全）
- ❌ 使用嵌套结构
- ❌ 留下未翻译的占位符（如 `"TODO"`、空字符串）

### 文件结构

```
src/i18n/
├── index.jsx          # I18nProvider + useI18n hook
├── locales.js         # locale 文件导入汇总
├── locales.zh.json    # 中文 (source of truth)
├── locales.en.json    # 英文
├── locales.ja.json    # 日文
├── locales.ko.json    # 韩文
├── locales.ru.json    # 俄文
├── locales.fr.json    # 法文
└── locales.de.json    # 德文

scripts/
└── i18n.ts            # 统一 i18n 工具（translate + prune）
```

---

## 更新日志（Changelog）编写规范

更新日志位于 `src/i18n/announcement/locales.*.json`，面向终端用户展示。

### 编写原则

| 规则 | 说明 |
|------|------|
| 面向用户 | 用用户能理解的语言描述，避免技术实现细节（如 Header、侧边栏、API 等） |
| 简洁明了 | 每条更新一句话概括，不冗长 |
| 语言限制 | 若功能仅在特定语言/地区可用，需明确说明（如「仅中文界面显示」） |
| 同步更新 | 新增或修改条目时，必须同步更新 zh / en / ja / ko / ru / fr / de 七种语言 |

### 示例

- 好的：`新增加入 QQ 群功能，方便交流（仅中文界面显示）`
- 好的：`Added QQ group join feature (Chinese only)`
- 坏的：`新增中文用户 QQ 群入口（Header 悬停二维码、侧边栏、公告）`（技术细节、用户不关心）

### 版本号与更新日志

| 规则 | 说明 |
|------|------|
| package.json | 版本号按实际发布更新（如 1.7.1 → 1.7.2） |
| changelog | **不新增新版本条目**。新内容追加到当前大版本的 `items` 里（如 v1.7.0），不要新增 v1.7.2 等小节 |

### 文件位置

```
src/i18n/announcement/
├── locales.zh.json
├── locales.en.json
├── locales.ja.json
├── locales.ko.json
├── locales.ru.json
├── locales.fr.json
└── locales.de.json
```

changelog 结构：`changelog.sections[].items` 为字符串数组，按版本分组。

---

## 通用开发规范

### 代码风格

- 组件使用 `.jsx` 文件，函数式组件 + Hooks
- 样式使用 Tailwind CSS 实用类，不写自定义 CSS
- 工具脚本使用 TypeScript (`.ts`)，通过 `tsx` 运行

### 响应式设计

- 移动端优先，使用 Tailwind 的 `sm:` / `md:` 断点
- 侧边栏在移动端为抽屉式叠加，桌面端为固定面板

### 提交前检查

- 运行 `pnpm run i18n translate` 确认翻译同步
- 确保无 linter 错误
- 不提交包含 secrets 的文件

### 提交信息（Commit Message）

采用 Conventional Commits，英文小写：

| 类型 | 格式 | 示例 |
|------|------|------|
| 功能 | `feat(scope): 描述` | `feat(v1.7.1): add QQ group entry for Chinese users` |
| 修复 | `fix: 描述` | `fix: prevent auto-translate DOM mutation` |
| 重构 | `refactor(scope): 描述` | `refactor(i18n): merge translate and prune into unified CLI` |

版本发布时 scope 使用 `v1.x.x`。

