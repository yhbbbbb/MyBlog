---
title: 03｜条件、循环与函数：让代码按规则运行
date: 2026-10-17 09:20:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 控制流
  - 函数
series: python-tutorial
description: 使用 if、for、range 和函数拆解重复逻辑，理解循环控制、参数传递与常见函数设计习惯。
---

> 自动化不是把一段代码重复粘贴十次，而是把变化的条件和重复的动作写成清楚的规则。

## 让程序替你做重复判断

如果要检查一批文件名是否符合规则，人可以逐个看，程序则可以逐项判断。Python 的控制流工具主要包括条件语句、循环和函数：条件决定走哪条路，循环处理一组数据，函数为一组有名字的步骤划出边界。

下面先看一个简单分类器：

```python
def category_for(filename):
    if filename.startswith("GS") and filename.endswith("K.txt"):
        return "针织 K 类"
    elif filename.startswith("GS") and filename.endswith("W.txt"):
        return "梭织 W 类"
    else:
        return None

files = ["GS01K.txt", "GS02W.txt", "notes.txt"]

for filename in files:
    category = category_for(filename)
    if category is None:
        print(f"跳过：{filename}")
    else:
        print(f"{filename} -> {category}")
```

这里把“判断一个文件名”的工作放进函数，再对列表中的每个名字重复调用。规则只写一份，修改时也只需要改一个位置。

## 条件语句：选择一条路径

Python 用 `if`、`elif`、`else` 表达分支。条件后面必须有冒号，代码块通过缩进表示：

```python
status = "ready"

if status == "ready":
    print("可以开始")
elif status == "waiting":
    print("继续等待")
else:
    print("检查状态")
```

`==` 用于比较是否相等，`=` 用于赋值。初学者常把二者混淆。组合条件可以使用 `and`、`or` 和 `not`；复杂条件最好拆成带有含义的变量或函数，避免一行里塞进过多判断。

Python 3.10 起还支持 `match` 结构，可用于匹配具体值或数据结构。它不只是其他语言中 `switch` 的逐项替代：模式可以解构序列和映射。简单的真假分支仍然用 `if` 更直观。

## 循环：遍历数据，而不是手写下标

`for` 循环会从可迭代对象（iterable）中依次取值：

```python
names = ["日报.csv", "订单.csv", "汇总.txt"]

for name in names:
    print(name)
```

如果确实需要序号，使用 `enumerate`，不要自己维护计数器：

```python
for index, name in enumerate(names, start=1):
    print(f"{index}. {name}")
```

`range` 生成整数序列，结束值不包含在结果中：

```pycon
>>> list(range(2, 6))
[2, 3, 4, 5]
```

常见写法是 `range(len(items))`，但如果只需要元素，直接遍历更清楚；如果需要位置和元素，一般用 `enumerate`。

`while` 会在条件为真时重复执行，适合“直到满足条件为止”的场景。要确保循环体能改变条件，否则程序会一直运行：

```python
attempts = 0
while attempts < 3:
    print("检查连接")
    attempts += 1
```

`break` 退出最近一层循环，`continue` 跳过本轮剩余语句。循环也可以带 `else`：当循环没有被 `break` 提前结束时执行。这常用于搜索：

```python
target = "订单.csv"

for name in names:
    if name == target:
        print("找到了")
        break
else:
    print("列表里没有目标文件")
```

这里的 `else` 属于 `for`，不是 `if`。如果阅读起来不直观，也可以改用一个布尔标记或单独的搜索函数。

## 函数：给一组步骤一个名字

函数通过 `def` 定义，可以接收参数并用 `return` 返回结果。没有显式 `return` 时，函数返回 `None`：

```python
def classify(filename):
    if filename.endswith("K.txt"):
        return "K"
    if filename.endswith("W.txt"):
        return "W"
    return None
```

参数可以使用位置或关键字传入：

```python
def make_label(filename, prefix="待处理"):
    return f"{prefix}：{filename}"

print(make_label("订单.csv"))
print(make_label("订单.csv", prefix="已发现"))
```

默认参数在函数定义时求值。不要把可变列表或字典直接作为默认值，否则多个调用可能共享同一个对象：

```python
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items
```

函数可以用文档字符串说明用途，也可以用类型标注表达预期输入和输出：

```python
def file_count(names: list[str]) -> int:
    """返回文件名列表中的项目数量。"""
    return len(names)
```

类型标注默认不会在运行时强制检查类型。它主要供读者、编辑器和静态检查工具使用。

{% mermaid %}
flowchart TD
    A["🔵 获取文件名"] --> B{"🟡 符合 K 规则？"}
    B -->|是| C["🟢 返回 K 类"]
    B -->|否| D{"🍑 符合 W 规则？"}
    D -->|是| E["🟢 返回 W 类"]
    D -->|否| F["🌸 返回未匹配"]
    C --> G["🟣 调用者处理结果"]
    E --> G
    F --> G
    style A fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style B fill:#FFF9C4,stroke:#F9A825,color:#333
    style C fill:#B5EAD7,stroke:#80CBC4,color:#333
    style D fill:#FFDAB9,stroke:#FFAB76,color:#333
    style E fill:#B5EAD7,stroke:#80CBC4,color:#333
    style F fill:#FFB3C6,stroke:#F48FB1,color:#333
    style G fill:#E8D5F5,stroke:#CE93D8,color:#333
{% endmermaid %}

## 常见误区

| 误区 | 问题 | 建议 |
| --- | --- | --- |
| 用 `range(len(items))` 遍历所有列表 | 下标让代码更绕，也容易越界 | 直接遍历元素；需要编号时用 `enumerate` |
| 把 `print` 当作函数结果 | `print` 负责显示，返回值是 `None` | 需要计算结果时使用 `return` |
| 默认参数写 `items=[]` | 列表只在定义函数时创建一次，调用间会共享 | 用 `None` 作为默认值，再在函数内创建列表 |
| 循环中无条件使用 `break` | 只处理到第一项就退出 | 明确写出终止条件，并测试有/无匹配两种情况 |

## 练习：批量统计分类结果

扩展前面的 `category_for`，遍历至少五个文件名，分别统计 K 类、W 类和未匹配文件的数量。把“判断分类”和“统计输出”放在不同函数中。

测试时要包括边界样例：空列表、没有匹配项、大小写不同的扩展名，以及名称前缀正确但后缀不正确的文件。

## 下一步

控制流告诉程序如何走，数据结构则决定程序如何保存和查找信息。下一篇会比较列表、元组、集合和字典，并用它们实现更清晰的统计逻辑。

**官方资料**：[更多控制流工具](https://docs.python.org/zh-cn/3.14/tutorial/controlflow.html)。
