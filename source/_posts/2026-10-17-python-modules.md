---
title: 模块与包：把 Python 代码拆开复用
date: 2026-10-17 09:40:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 模块
  - 包
series: python-tutorial
description: 了解 Python 模块的导入方式、搜索路径和执行入口，并用简单包结构把文件分类逻辑从脚本中分离。
---

> 当一个脚本里既有规则、文件操作又有界面代码，修改一个判断都可能牵动整份程序。模块让相关代码可以单独命名、测试和复用。

## 从一份脚本拆出可复用规则

上一讲的文件分类逻辑可以直接写在主程序中。但如果另一个脚本也需要同一套规则，复制代码会带来两个版本：修复一处后，另一处可能被忘记。

Python 模块（module）通常就是一个 `.py` 文件。我们可以把分类函数放进 `file_rules.py`，让主脚本导入它：

```text
file_tool/
├── file_rules.py
└── main.py
```

`file_rules.py`：

```python
def classify(filename: str) -> str | None:
    if filename.startswith("GS") and filename.endswith("K.txt"):
        return "knit"
    if filename.startswith("GS") and filename.endswith("W.txt"):
        return "woven"
    return None
```

`main.py`：

```python
from file_rules import classify

names = ["GS01K.txt", "GS02W.txt", "notes.txt"]
for name in names:
    print(name, classify(name))
```

在 `file_tool` 目录下运行 `py main.py`，Python 会在模块搜索路径中找到同目录的 `file_rules.py`。

## 导入时发生了什么

执行 `import file_rules` 时，Python 会查找模块、执行模块顶层语句，并把模块对象绑定到当前名称空间。之后可以通过 `file_rules.classify(...)` 访问函数。

```python
import file_rules

result = file_rules.classify("GS01K.txt")
```

也可以导入指定名称：

```python
from file_rules import classify
```

这种写法更短，但如果导入太多同名名称，来源会变得不清楚。模块较大时，保留 `module.name` 往往更容易追踪。

不要使用 `from file_rules import *`。星号导入会把多个名称直接放进当前名称空间，让代码难以判断一个名称来自哪里。

{% mermaid %}
flowchart LR
    A["🔵 main.py\n导入模块"] --> B["🟡 查找\nsys.path"]
    B --> C["🟣 执行模块顶层代码"]
    C --> D["🟢 绑定模块名称"]
    D --> E["🍑 调用函数或访问对象"]
    style A fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style B fill:#FFF9C4,stroke:#F9A825,color:#333
    style C fill:#E8D5F5,stroke:#CE93D8,color:#333
    style D fill:#B5EAD7,stroke:#80CBC4,color:#333
    style E fill:#FFDAB9,stroke:#FFAB76,color:#333
{% endmermaid %}

## 为什么导入模块会执行顶层代码

模块的函数定义、常量赋值和其他顶层语句都会在首次导入时执行。Python 通常会缓存已加载模块，因此同一进程再次导入时不会重复执行模块主体。

因此，模块顶层适合放函数和常量，不适合直接启动长时间监控、弹出窗口或批量移动文件。否则另一个脚本只是想导入分类函数，却可能意外启动整个程序。

把启动逻辑放在入口保护中：

```python
def main() -> None:
    print("开始处理")


if __name__ == "__main__":
    main()
```

直接运行该文件时，`__name__` 的值是 `"__main__"`，于是调用 `main()`；被其他模块导入时，`__name__` 是模块名，入口代码不会运行。

## 模块从哪里搜索

`sys.path` 是 Python 查找模块的路径列表。它通常包含脚本所在目录、环境变量提供的目录以及当前 Python 安装中的标准库和第三方包路径。

可以查看当前搜索路径：

```python
import sys

for path in sys.path:
    print(path)
```

如果项目里有一个文件叫 `random.py`、`json.py` 或 `typing.py`，它可能遮住标准库中同名模块，导致难以理解的导入错误。自己的模块应使用清楚且不与标准库冲突的名称。

不要把随意修改 `sys.path` 当成长期的项目结构方案。多个目录和可安装项目通常应该使用包（package）组织，并通过明确的入口运行。

## 包：把一组模块放在一起

包可以包含多个相关模块。传统包通常有 `__init__.py` 文件：

```text
file_tool/
├── file_tool/
│   ├── __init__.py
│   ├── rules.py
│   └── processor.py
└── run.py
```

导入可以使用完整路径：

```python
from file_tool.rules import classify
```

包内模块可以使用相对导入，例如在 `processor.py` 中写：

```python
from .rules import classify
```

前导点表示从当前包开始查找。相对导入需要在包上下文中运行，直接执行 `python processor.py` 可能无法确定父包。大型项目可以用 `python -m package.module` 从包入口运行。

Python 也支持命名空间包，不一定每个包目录都需要 `__init__.py`。入门和普通应用项目先使用明确的常规包结构，理解导入边界后再考虑更灵活的形式。

## 一个实用的拆分标准

当一段逻辑有独立名称、可能被多个入口使用，或需要单独测试时，就值得考虑放进模块。例如文件分类规则可以单独测试，不需要启动图形界面；日志配置也可以由批处理入口和监控入口共同使用。

模块不应按“每个函数一个文件”机械拆分。太碎会让读者不断跳转。更好的边界是让同一文件中的代码围绕一个清晰职责，并且不需要启动无关功能就能使用。

## 练习：拆分一个小分类器

创建 `file_rules.py` 和 `main.py`：

1. 在 `file_rules.py` 实现 `classify(filename)`。
2. 在 `main.py` 导入并测试至少三个文件名。
3. 给 `main.py` 增加 `if __name__ == "__main__":` 入口。
4. 再创建 `check_rules.py` 导入分类函数，确认导入时没有运行主程序。

如果导入第二个模块就触发批处理，说明副作用仍放在模块顶层，需要移到函数或入口保护中。

## 下一步

模块让代码有了可复用的边界。接下来学习文件输入输出时，可以把“读文件”“解析内容”和“业务规则”分开，让每部分更容易测试，也更容易替换。

**官方资料**：[模块](https://docs.python.org/zh-cn/3.14/tutorial/modules.html)。
