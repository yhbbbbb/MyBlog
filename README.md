# MyBlog

基于 Hexo 8 与 NexT 的中文技术博客，源码维护在 `main`，GitHub Actions 将静态页面发布到 `gh-pages`。

## 需要我手动执行的命令

在 Windows PowerShell 中进入仓库目录。若 PowerShell 的执行策略拦截 `npm.ps1`，请使用 `npm.cmd`。

### 环境校验

```powershell
node --version
npm.cmd --version
git --version
```

Node.js 需为 20.19.0 或更高版本（推荐 LTS 22）；npm 使用随 Node.js 安装的版本。

确认：Node.js 显示 `v20.19.0` 或更高，`npm.cmd` 与 Git 都能输出版本号。

### 安装依赖并本地预览

```powershell
npm.cmd install
npm.cmd run server
```

浏览器打开 `http://localhost:4000/MyBlog/`。首次安装后提交生成的 `package-lock.json`。

确认：终端显示 Hexo 正在 `http://localhost:4000/MyBlog/` 运行，首页和示例文章可以打开。

### 一键新建文章

```powershell
npm.cmd run new -- "Python 自动化实践"
```

文章会创建在 `source/_posts/`。图片建议放进同名资源目录（`post_asset_folder: true`），然后在文章中使用 `![说明](图片文件名.png)`。

确认：新 Markdown 文件出现在 `source/_posts/`，文件名与文章标题相符。

### 构建、清理与检查

```powershell
npm.cmd run build
npm.cmd run clean
npm.cmd run build
```

生成文件位于 `public/`。改配置或遇到旧页面时先执行清理，再重新构建。

确认：构建输出显示生成文件数，`public/index.html` 和 `public/atom.xml` 存在。

### 连接并推送到 GitHub

```powershell
git branch -M main
git remote add origin https://github.com/yhbbbbb/MyBlog.git
git add .
git commit -m "初始化 Hexo 博客"
git push -u origin main
```

如果本地已经有 `origin`，不要重复添加；先运行 `git remote -v` 检查地址。如果仓库网页创建时勾选了 README、许可证或 `.gitignore`，首次推送前先拉取并合并远端 `main`，解决冲突后再推送。

确认：`git status --short --branch` 显示当前分支为 `main`，`git remote -v` 指向 `yhbbbbb/MyBlog`，推送后 GitHub 的 `main` 能看到源码和 `themes/next` 子模块。

## GitHub Pages 设置

1. GitHub 仓库 `Settings > Actions > General > Workflow permissions` 选择允许工作流读写仓库内容（Read and write permissions）。
2. `Settings > Pages > Build and deployment > Source` 选择 `Deploy from a branch`，分支选择 `gh-pages`，目录选择 `/ (root)`。
3. 推送 `main` 后，在 `Actions` 中确认 `Deploy Hexo to GitHub Pages` 成功。项目站点地址为 `https://yhbbbbb.github.io/MyBlog/`。

首次工作流会自动创建 `gh-pages` 分支。不要在该分支手动放源码。

确认：Actions 工作流成功，仓库出现 `gh-pages` 分支，Pages 页面显示已发布且项目地址能打开。

## 可选配置

### 数学公式

在 `_config.next.yml` 中启用 `math.katex.enable: true`，文章 Front Matter 中添加 `mathjax: true`，然后用 `$...$` 和 `$$...$$` 编写公式。NexT 自带 KaTeX 浏览器端资源。

### RSS

已安装 `hexo-generator-feed`，主配置 `_config.yml` 中的 `feed` 项生成 Atom 订阅。RSS 地址为 `/MyBlog/atom.xml`。

### 自定义域名

在仓库根目录创建 `source/CNAME`，文件内容为你的域名（例如 `blog.example.com`，不加协议）。将 `_config.yml` 的 `url` 改为 `https://blog.example.com`、`root` 改为 `/`，配置 DNS 指向 GitHub Pages，并在仓库 `Settings > Pages` 填入相同域名并启用 HTTPS。

## 排错

- **渲染失败或插件缺失**：确认 Node 版本满足要求，执行 `npm.cmd ci`；本地没有锁文件时先执行 `npm.cmd install`。查看终端中第一个 Hexo 插件报错。
- **Actions 部署失败**：查看仓库 Actions 日志；确认工作流权限为 Read and write、默认分支为 `main`，且 Pages 发布源设置为 `gh-pages / (root)`。
- **页面样式或链接 404**：项目站点必须使用 `root: /MyBlog/`；只有自定义域名才改成 `/`。修改后运行 `npm.cmd run clean` 和 `npm.cmd run build`。
- **图片 404**：资源目录和文章文件名应一致；本地路径区分大小写的部署环境中，链接大小写必须与文件名一致。不要用 Windows 绝对路径。
- **npm 提示无法加载 npm.ps1**：在 PowerShell 运行 `npm.cmd ...`，无需修改系统执行策略。
