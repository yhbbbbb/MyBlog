---
title: 让 Agent 帮我搭建 Hexo 技术博客
date: 2026-10-15 16:00:00
categories:
  - 项目笔记
tags:
  - Hexo
  - GitHub Pages
  - Agent
  - AI 编程
series: agent-assisted-development
description: 复盘如何用清晰的任务边界和验收标准，让 Agent 从空目录搭建 Hexo、配置 NexT 与 Actions，并排查 GitHub Pages 部署问题。
---

> 搭出一个博客并不难，难的是让它从本地预览一路稳定地走到 GitHub Pages。

这次我用 Agent 从一个空的本地目录搭建技术博客，记录 Python、AHK、n8n、SQL、前端和项目实践。最后跑通了本地构建、GitHub Actions 和 GitHub Pages。回头看，真正决定效率的不是提示词写得多长，而是有没有把**目标、仓库现状、操作边界和验收方式**一次说明白。

## 先把任务说清楚

一开始的需求有两个版本。简洁版适合快速启动，要求列出环境、初始化命令、主题、自动部署和常见操作；详细版进一步明确了 Windows、源码放 `main`、静态页面放 `gh-pages`、本地预览、文章创建和自定义域名等约束。

两种写法各有用途：快速版先拿到路线图，详细版则把容易反复确认的决定提前说清楚。

| 提示词 | 适用场景 | 容易遗漏的内容 |
|---|---|---|
| 简洁版 | 先看整体方案、验证技术路线 | 当前仓库状态、部署分支、验收标准 |
| 详细版 | 希望 Agent 直接改仓库并验证 | 如何保护已有改动、远端初始提交如何处理 |

实际协作时，我会在原需求上再补几条边界：**先检查工作区，不覆盖已有文件；命令和配置分开；每一步给核对项；遇到冲突先检查历史；完成后实际构建并报告结果。**这能减少“配置看起来正确，但没法部署”的返工。

下面是这次需求整理后的提示词骨架，可以按自己的仓库替换信息：

```text
请在当前仓库搭建一个 Hexo 技术博客，并直接完成可在本地验证的配置。

目标：Windows 本地写作和预览；源码在 main；GitHub Actions 将 public/ 发布到 gh-pages。
技术栈：Hexo、NexT、GitHub Pages。内容方向：Python、AHK、n8n、SQL、前端和项目笔记。

请按顺序完成：
1. 检查 Node、npm、Git 版本和当前仓库状态；说明最低版本及校验命令。
2. 初始化 Hexo 项目，配置本地预览和新建文章命令。
3. 安装 NexT，设置标题、简介、导航、代码高亮和文章目录。
4. 配置 main push 后自动构建并发布到 gh-pages 的 GitHub Actions。
5. 写明新建文章、预览、构建、清理缓存和查看部署日志的方法。
6. 说明图片路径、渲染失败、部署失败和自定义域名的处理方式。

操作边界：
- 修改前先检查仓库，不覆盖或删除已有文件和未提交改动。
- 如果远端已有提交，先 fetch 并检查差异，再合并，不要强制推送。
- 配置文件使用中文注释；区分需要手动执行的命令和文件内容。
- 每个阶段列出检查项；最后实际执行构建并报告未通过项。
```

提示词把**想要的结果**和**Agent 的操作权限**分开写。前者让它知道要交付什么，后者能减少覆盖文件、强推分支等风险。部署权限、仓库名称和站点根路径也应写明，因为这些选项会直接改变最终地址和工作流行为。

## 从环境检查到本地预览

仓库已经在 GitHub 创建，工作目录是 `D:\MyBlog`。第一步不是立刻运行初始化命令，而是先检查目录和版本，确定有没有现存文件需要保留。

```powershell
node --version
npm.cmd --version
git --version
git status --short --branch
```

这次电脑上是 Node.js `v24.15.0`、npm `11.12.1`。Hexo 8 要求 Node.js `20.19.0` 或更高版本，CI 使用 Node.js 22。PowerShell 的执行策略还拦截了 `npm.ps1`，所以本机命令使用 `npm.cmd`；无需为了 Hexo 去修改整台电脑的执行策略。

项目依赖通过 `package.json` 和锁文件安装，主题 NexT 作为 Git 子模块放在 `themes/next`。这让主仓库记录明确的主题版本，也让 Actions checkout 时能取回主题源码。

基础站点信息和访问路径放在 `_config.yml`。这是普通 GitHub 项目站点，不是 `username.github.io` 根站点，因此需要：

```yaml
url: https://yhbbbbb.github.io/MyBlog
root: /MyBlog/
```

如果少了 `/MyBlog/`，CSS、图片和导航链接会指向域名根目录，发布后就会出现资源 404。绑定自定义域名时，才将 `url` 改成自己的域名并把 `root` 改为 `/`。

主题使用 NexT 的 Gemini 方案。网站标题、简介、导航栏、头像、文章目录和代码块配置分别落在站点配置与 `_config.next.yml` 中。以后升级主题时，个人设置留在独立配置文件里，更容易检查和维护。

本地常用命令如下：

```powershell
npm.cmd ci
npm.cmd run server
npm.cmd run new -- "Agent 辅助搭建博客"
npm.cmd run build
npm.cmd run clean
```

预览地址是 `http://localhost:4000/MyBlog/`。文章保存在 `source/_posts/`；启用文章资源目录后，可以把图片放在文章对应的资源目录内，再用相对图片名引用。

## 自动构建和发布

工作流监听 `main` 分支的 push：检出主仓库和 NexT 子模块、安装锁文件指定的依赖、运行 Hexo 构建，再把 `public/` 发布到 `gh-pages`。工作流使用仓库自带的 `GITHUB_TOKEN`，并需要有写入仓库内容的权限。

{% mermaid %}
flowchart LR
    A["📝 更新文章或配置"] --> B["⬆️ 推送 main"]
    B --> C["⚙️ Actions 检出源码和主题"]
    C --> D["📦 npm ci 并构建 public"]
    D --> E["🚀 发布到 gh-pages"]
    E --> F["🌐 GitHub Pages 提供网站"]
    C -.-> G["⚠️ 构建失败时查看 Actions 日志"]
    D -.-> G
    style A fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style B fill:#FFDAB9,stroke:#FFAB76,color:#333
    style C fill:#E8D5F5,stroke:#CE93D8,color:#333
    style D fill:#FFF9C4,stroke:#F9A825,color:#333
    style E fill:#B5EAD7,stroke:#80CBC4,color:#333
    style F fill:#B5EAD7,stroke:#80CBC4,color:#333
    style G fill:#FFB3C6,stroke:#F48FB1,color:#333
{% endmermaid %}

这里有两个独立设置容易混淆：Actions 工作流需要 **Read and write permissions** 才能推送 `gh-pages`；仓库的 Pages 设置还要将发布源指定为 `gh-pages / (root)`。工作流成功只说明文件已经发布到分支，不代表 Pages 站点一定已经启用。

## 真正花时间的是边界问题

### Hexo 命令只显示帮助

初次构建时，Hexo 没有执行 `generate`，只列出了帮助命令。排查后发现项目 `package.json` 缺少 Hexo CLI 用于识别项目的 `hexo` 元数据。补齐项目标记并更新锁文件后，构建开始正常生成页面。

这个问题说明“依赖已经安装”不等于“项目已经正确初始化”。验证要看真实命令是否执行，并检查 `public/index.html`、文章页和 `atom.xml` 是否生成。

### 远端 main 已有初始化提交

本地提交第一次推送时被拒绝，因为 GitHub 仓库创建时已有 README 和许可证。安全的处理方式是先 fetch、检查提交差异，再合并两段历史；README 冲突保留完整的博客手册，远端 MIT 许可证也保留下来。**没有用 force push 覆盖远端。**

这正是提示词里需要明确“先检查远端历史”的原因。一个已创建的仓库不一定是空仓库，即使本地目录看起来刚初始化。

### Pages 还没有站点配置

Actions 创建并发布了 `gh-pages` 后，站点一开始仍返回 GitHub Pages 404。问题不在 Hexo 构建，而是仓库 Pages 发布源尚未选择。设置为 `gh-pages` 分支和根目录后，项目地址才返回 HTTP 200，页面的 CSS、头像和文章路径也正确使用 `/MyBlog/`。

### 其他检查结果

- 本地执行 `npm.cmd run clean` 和 `npm.cmd run build`，Hexo 成功生成首页、文章、分类、标签、归档、关于页和 Atom 订阅。
- 图片链接要使用站点相对或文章资源目录中的路径，不能使用 `D:\...` 这样的本机绝对路径。
- npm audit 报告了传递依赖问题。`npm audit fix --force` 提议将 Hexo 降级到 3.9，因此没有照单执行；这类修复要先核对影响，不能为了清空数字破坏锁定的主版本。

## 可选功能按需打开

NexT 已提供代码高亮和文章目录。数学公式可以启用主题内置 KaTeX，并在需要公式的文章 Front Matter 中加 `mathjax: true`。RSS 则由 `hexo-generator-feed` 生成 Atom 文件。Mermaid 原本默认关闭；为了让本文流程图实际渲染，我在 `_config.next.yml` 启用了主题内置支持，没有手写主题 JavaScript。

对于读者看不到、构建产物也没有生成的功能，提示词里可以先标为“可选”，不要误以为配置文件里写了一段 YAML 就代表功能已经可用。开启后应在本地构建页面确认对应资源和输出。

## 一次有效协作的验收清单

这次搭建走通的判断标准不是“Agent 说配置好了”，而是下面这些结果都能被检查：

- 本机能运行 Hexo，本地预览页面能打开。
- `npm ci` 后可重复安装，构建输出写入 `public/`。
- `main` 保存源码，主题子模块可被 CI 检出。
- push 后 Actions 构建成功，`gh-pages` 有生成的 HTML 和静态资源。
- GitHub Pages 设置使用正确的发布分支和目录，线上地址返回 HTTP 200。
- 已有文件、远端提交和个人修改都没有被意外覆盖。

**Agent 最适合承担的是把清晰任务变成可验证的改动。**把仓库状态、成功标准和不可触碰的边界一起交代，再要求它执行构建和检查，才是把“帮我搭个网站”变成一次可复现的工程协作。
