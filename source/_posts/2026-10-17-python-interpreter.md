---
title: 01｜从交互解释器开始：运行你的第一段 Python
date: 2026-10-17 09:00:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 交互式编程
series: python-tutorial
description: 认识 Python 交互解释器、脚本文件和命令行运行方式，建立可重复运行代码的习惯。
---

> 学 Python 的第一步，不是安装一堆工具，而是让一行代码运行起来，并知道它是在哪里运行的。

## 两种运行方式，解决两类问题

打开 Python 后输入 `2 + 2`，马上看到结果；把同样的表达式写进 `.py` 文件，再运行文件，也能得到结果。前者叫交互式解释器，适合探索和短实验；后者是脚本，适合保存、复用和分享。

可以把交互解释器当作工作台，把脚本当作正式的操作说明。工作台适合试几种写法，操作说明则能反复执行，不必每次重新输入。

## 在 Windows 检查和启动 Python

如果已从 python.org 安装 Python，并勾选 Python Launcher，可以在 PowerShell 中查看版本：

```powershell
py -3.14 --version
```

如果尚未安装 3.14，也可以使用机器已有的 Python 3 版本，将下面命令中的 `3.14` 替换为实际版本。进入交互解释器：

```powershell
py -3.14
```

提示符 `>>>` 表示解释器正在等待一条新语句。输入表达式后按回车，Python 会计算并显示结果：

```pycon
>>> 2 + 2
4
>>> 7 * 6
42
>>> 'Python' + ' 教程'
'Python 教程'
```

交互环境也会保留之前定义的名称：

```pycon
>>> price = 18
>>> quantity = 3
>>> price * quantity
54
```

这个状态只属于当前解释器进程。关闭后重新启动，之前定义的 `price` 和 `quantity` 就不在了。

## 交互环境和脚本的分工

交互环境适合验证一个小问题，例如检查切片结果或试用标准库函数。脚本则适合把经过验证的逻辑保存下来。

创建 `hello.py`，写入：

```python
name = input("你的名字：")
print(f"你好，{name}！")
```

在文件所在目录运行：

```powershell
py -3.14 .\hello.py
```

程序会等待输入，再输出问候语。每次执行都会重新从文件读取代码，因此脚本比交互会话更容易复现。

| 方式 | 适合做什么 | 结果是否保存在文件中 |
| --- | --- | --- |
| 交互解释器（REPL） | 试表达式、查看对象、验证小片段 | ❌ 默认不保存 |
| Python 脚本 | 执行一组步骤、重复运行、分享程序 | ✅ 代码保存在 `.py` 文件 |
| 编辑器或 IDE | 编写、导航、调试较大的项目 | ✅ 通常直接编辑文件 |

REPL 是 Read-Eval-Print Loop 的缩写，即“读取输入、求值、打印结果、继续等待”的循环。它不是另一种 Python 语言，而是让你逐条提交代码的运行界面。

## 一段代码如何走到结果

无论从解释器输入还是运行脚本，Python 都要读取源码、解析语法并执行语句。交互模式会在每次提交后显示表达式结果；脚本模式按文件内容执行，普通赋值不会自动显示。

{% mermaid %}
flowchart LR
    A["🔵 编写<br>输入表达式或脚本"] --> B["🟡 读取<br>检查语法"]
    B --> C["🟣 执行<br>计算语句"]
    C --> D["🟢 查看<br>输出或返回值"]
    D --> E{"🍑 继续探索？"}
    E -->|是| A
    E -->|完成| F["🌸 保存脚本"]
    style A fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style B fill:#FFF9C4,stroke:#F9A825,color:#333
    style C fill:#E8D5F5,stroke:#CE93D8,color:#333
    style D fill:#B5EAD7,stroke:#80CBC4,color:#333
    style E fill:#FFDAB9,stroke:#FFAB76,color:#333
    style F fill:#FFB3C6,stroke:#F48FB1,color:#333
{% endmermaid %}

## 新手常见的三个误区

### 把提示符也复制进代码

文档中的 `>>>` 和 `...` 是解释器提示符，不是 Python 语句。复制到 `.py` 文件会触发语法错误。写脚本时只复制提示符后面的代码。

### 以为每行代码都会自动显示结果

在交互环境里单独输入 `2 + 2` 会显示 `4`。但脚本中的 `2 + 2` 只是计算后丢弃结果；需要显示时要写 `print(2 + 2)`。

### 把错误当成“环境坏了”

`SyntaxError` 通常表示当前代码不符合语法，解释器会指出大致位置。先从报错行附近检查引号、括号、冒号和缩进，不要马上重装 Python。

## 练习：计算并展示购物小计

先在交互解释器中试下面的表达式，再放到脚本里运行：

```python
item = "笔记本"
price = 12.5
quantity = 4
total = price * quantity

print(f"{item}：{quantity} 本，共 {total:.2f} 元")
```

运行后应看到 `笔记本：4 本，共 50.00 元`。试着修改数量，并观察输出如何变化。

## 下一步

把几行代码保存在 `.py` 文件中，是从“试着写”到“能重复运行”的转折点。下一篇会从 Python 速览出发，认识名称、数字、字符串和列表，开始处理真正的数据。

**官方资料**：[课前甜点](https://docs.python.org/zh-cn/3.14/tutorial/appetite.html)、[使用 Python 解释器](https://docs.python.org/zh-cn/3.14/tutorial/interpreter.html)。
