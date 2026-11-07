---
title: NexT 文本块与标签插件测试
date: 2026-11-07 18:00:00
updated: 2026-11-07 18:00:00
categories:
  - 技术科普
tags:
  - Hexo
  - NexT
  - 学习笔记
series: hello-agents
description: 测试当前 NexT 主题实际支持的文本块、代码块、标签页、图片组和常用标签插件。
---

> 这篇文章用于验证当前仓库的 NexT 8.29.0 标签插件。示例以主题源码实际注册的标签为准，不把 Butterfly 专属语法当成 NexT 功能。

## 一、NexT 的 note 文本块

{% note default %}
default：默认说明块。
{% endnote %}

{% note primary %}
primary：重点内容。
{% endnote %}

{% note info %}
info：提示信息，适合记录概念和防忘内容。
{% endnote %}

{% note success %}
success：成功或正确结果 ✅
{% endnote %}

{% note warning %}
warning：需要留意的风险 ⚠️
{% endnote %}

{% note danger %}
danger：危险操作或错误信息 ❌
{% endnote %}

### 去掉图标与折叠摘要

NexT 支持 no-icon 参数，也支持把剩余参数作为折叠块摘要：

{% note warning no-icon %}
这个警告块没有图标。
{% endnote %}

{% note info 点击展开详情 %}
这里是折叠内容。NexT 会把标题参数渲染为 details 的 summary。
{% endnote %}

> 注意：simple、modern、flat 在当前 NexT 中是主题级配置，不是 note 标签的单块参数。需要切换时，应修改主题配置中的 note.style，然后重新构建。

## 二、标签页 tabs

NexT 的 tabs 需要一个唯一名称，并用 tab 注释分隔每个页签：

{% tabs code-demo %}
<!-- tab Python -->
~~~python
def greet(name: str) -> str:
    # 返回一条问候语
    return f"Hello, {name}!"
~~~
<!-- endtab -->
<!-- tab JavaScript -->
~~~javascript
function greet(name) {
  // JavaScript 版本的同一功能
  return "Hello, " + name + "!";
}
~~~
<!-- endtab -->
{% endtabs %}

{% tabs active-demo, 2 %}
<!-- tab 第一种方案 -->
方案一：适合简单场景。
<!-- endtab -->
<!-- tab 第二种方案 -->
方案二：当前默认打开的页签。
<!-- endtab -->
{% endtabs %}

## 三、图片组 grouppicture

当前 NexT 注册名是 grouppicture，别名是 gp，不是 Butterfly 的 gallery：

{% grouppicture 2-1 %}
![博客头像](/MyBlog/images/avatar.gif)
![博客头像](/MyBlog/images/avatar.gif)
{% endgrouppicture %}

上面的 2-1 表示两张图片使用第一种两列布局。图片组内容必须是图片或带图片的链接。

## 四、行内标签、按钮与居中引用

这是 {% label info @提示标签 %}、{% label success @stable %}、{% label danger @deprecated %}。

{% button https://hexo.io, Hexo 官网, home, 打开 Hexo 官网 %}

{% centerquote %}
这是一段居中引用，适合放置文章中的关键结论。
{% endcenterquote %}

{% cq %}
别名 cq 与 centerquote 的效果相同。
{% endcq %}

## 五、链接网格 linkgrid

linkgrid 根据“名称 | URL | 描述 | 图片地址”生成链接卡片：

{% linkgrid %}
Hexo | https://hexo.io/ | 静态博客生成器 | /MyBlog/images/avatar.gif
NexT | https://theme-next.js.org/ | Hexo 主题 | /MyBlog/images/avatar.gif
{% endlinkgrid %}

也可以使用别名 lg。每行的分隔符默认是竖线，空行和以百分号开头的行会被忽略。

## 六、Mermaid 流程图

{% mermaid %}
flowchart LR
    A["🔵 输入<br>文章内容"] --> B["🟣 Hexo 渲染<br>标签插件"]
    B --> C["🟢 输出<br>静态 HTML"]
    style A fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style B fill:#E8D5F5,stroke:#CE93D8,color:#333
    style C fill:#B5EAD7,stroke:#80CBC4,color:#333
{% endmermaid %}

Mermaid 必须使用 NexT 标签语法，节点换行使用 <br>，不要使用 Mermaid 三反引号代码块。

## 七、代码与引用块

{% blockquote NexT 文档, Tag Plugins https://theme-next.js.org/docs/tag-plugins/ %}
这是 blockquote 标签生成的引用。
{% endblockquote %}

{% codeblock Python 示例 lang:python %}
def add(left: int, right: int) -> int:
    # 返回两个整数的和
    return left + right
{% endcodeblock %}

{% pullquote %}
这是 pullquote 侧边引语，适合突出文章中的一句判断。
{% endpullquote %}

## 八、其他 NexT 标签

### WaveDrom

{% wavedrom %}
{ signal: [
  { name: "clk", wave: "p....." },
  { name: "data", wave: "x.345x", data: "A B C" }
] }
{% endwavedrom %}

### caniuse

下面会加载 Can I Use 的 iframe，网络受限时可能无法显示：

{% caniuse flexbox %}

### video、pdf

下面只测试 HTML 容器生成，地址是占位地址：

{% video /MyBlog/demo.mp4 %}

{% pdf /MyBlog/demo.pdf %}

## 九、当前 NexT 不支持的其他主题标签

| 标签 | 当前 NexT 状态 | 建议 |
| --- | --- | --- |
| folding | ❌ 未注册 | 使用 note 折叠摘要或主题代码折叠 |
| cb / checkbox | ❌ 未注册 | 使用 Markdown 任务列表 |
| timeline | ❌ 未注册 | 使用 Markdown 列表或 Mermaid |
| gallery | ❌ 未注册 | 使用 grouppicture / gp |

Markdown 任务列表可以直接使用：

- [x] 已完成部署
- [ ] 待调试标签参数

## 十、测试结论

- note、tabs、grouppicture、label、button、centerquote、linkgrid、mermaid、wavedrom、caniuse、video、pdf 已按当前 NexT 注册代码编写。
- simple、modern、flat 需要在主题配置中设置，不能当作每个 note 的独立参数。
- folding、cb、timeline、gallery 属于其他主题生态，当前 NexT 不会按预期渲染。
- 如果某个标签构建时报错，先检查标签名、开始和结束标签、参数逗号以及资源 URL。
