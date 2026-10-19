---
title: 02｜Python 速览：变量、字符串与列表
date: 2026-10-17 09:10:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 字符串
  - 列表
series: python-tutorial
description: 用名称、数字、字符串和列表快速认识 Python 的基本数据操作，并通过一个小例子串起常用写法。
---

> Python 变量更像贴在对象上的标签，而不是装数据的盒子。理解这一点，能少踩不少复制和修改的坑。

## 从一组待处理文件开始

假设我们有三份文件名，需要取出扩展名、筛选目标文件并统计数量。这个小任务会用到名称、字符串和列表，正好可以观察 Python 的基本表达方式。

```python
files = ["日报.csv", "临时.tmp", "订单.csv"]
csv_files = [name for name in files if name.endswith(".csv")]

print(csv_files)
print(f"待处理 {len(csv_files)} 个文件")
```

输出是 `['日报.csv', '订单.csv']` 和 `待处理 2 个文件`。接下来逐步拆开这些语句。

## 名称指向对象

在 `files = [...]` 中，`files` 是名称（name），列表是对象（object）。赋值不会把列表塞进一个固定类型的变量盒子；它让名称 `files` 指向这个列表对象。

```python
count = 3
count = "三份"
```

第二次赋值后，`count` 指向字符串对象。Python 是动态类型语言，类型属于对象，名称可以在不同时间指向不同类型的对象。实际编程中仍建议让一个名称长期表达同一类含义，否则代码难读。

常用数字包括整数和浮点数：

```python
items = 7
unit_price = 2.5
subtotal = items * unit_price
print(subtotal)  # 17.5
```

除法 `/` 总会产生浮点结果；`//` 是向下取整除法；`%` 得到余数。比如 `7 // 3` 是 `2`，`7 % 3` 是 `1`。判断奇偶数时，余数运算就很直接。

## 字符串是不可变的文本序列

字符串可以用单引号或双引号创建。需要在字符串里包含引号时，可以换一种引号，或使用反斜杠转义：

```python
message = "It's Python"
quoted = '她说："开始处理"'
```

字符串支持索引和切片。索引从 `0` 开始，负数从末尾倒数；切片的结束位置不包含在结果中：

```pycon
>>> name = "python"
>>> name[0]
'p'
>>> name[-1]
'n'
>>> name[1:4]
'yth'
>>> name[:2]
'py'
```

字符串不能原地修改。`name[0] = "P"` 会报错；如果要得到新字符串，可以拼接或调用方法：

```python
name = "Python"
upper_name = name.upper()
print(upper_name)  # PYTHON
```

格式化输出优先考虑 f-string：

```python
filename = "report.csv"
size_kb = 18.236
print(f"{filename}：{size_kb:.1f} KB")
```

它会把花括号中的表达式求值，`:.1f` 这样的格式说明可以控制数字显示方式，例如保留一位小数。

## 列表保存有顺序的一组对象

列表（list）用方括号表示，可以增删元素：

```python
files = ["日报.csv", "临时.tmp", "订单.csv"]
files.append("汇总.csv")
files.remove("临时.tmp")
print(files)
```

列表是可变对象（mutable object）。两个名称可以指向同一个列表：

```python
source = ["a.csv"]
alias = source
alias.append("b.csv")

print(source)  # ['a.csv', 'b.csv']
```

修改 `alias` 看到的内容，也会通过 `source` 看到，因为它们指向同一对象。如果希望得到浅拷贝，可以用 `source.copy()` 或 `source[:]`。

列表切片会创建一个新列表：

```pycon
>>> numbers = [10, 20, 30, 40]
>>> numbers[1:3]
[20, 30]
>>> numbers[:2] + [99]
[10, 20, 99]
```

切片复制的是列表容器本身，不会递归复制其中更深层的可变对象。这个区别在嵌套列表中很重要，后续可以通过 `copy` 模块学习深拷贝。

## 把操作组合起来

回到文件名例子：

```python
files = ["日报.csv", "临时.tmp", "订单.csv"]
csv_files = [name for name in files if name.endswith(".csv")]

for name in csv_files:
    print(f"准备处理：{name}")

print(f"共 {len(csv_files)} 个 CSV 文件")
```

这里的列表推导式（list comprehension）从 `files` 中依次取出名称，只保留 `endswith(".csv")` 为真的元素，生成新列表。它不会改变原来的 `files`。

{% mermaid %}
flowchart LR
    A["🔵 原始列表<br>全部文件名"] --> B{"🟡 后缀是 CSV？"}
    B -->|是| C["🟢 放入结果列表"]
    B -->|否| D["🍑 跳过当前项"]
    C --> E["🟣 格式化输出<br>文件名与数量"]
    D --> E
    style A fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style B fill:#FFF9C4,stroke:#F9A825,color:#333
    style C fill:#B5EAD7,stroke:#80CBC4,color:#333
    style D fill:#FFDAB9,stroke:#FFAB76,color:#333
    style E fill:#E8D5F5,stroke:#CE93D8,color:#333
{% endmermaid %}

## 常见误区

| 写法或想法 | 实际情况 | 更稳妥的处理 |
| --- | --- | --- |
| `text[0] = "A"` | 字符串不可变，不能通过索引改写 | 创建新字符串，例如 `"A" + text[1:]` |
| `b = a` 就是复制列表 | 两个名称指向同一个列表 | 使用 `a.copy()` 创建浅拷贝 |
| `a[1:3]` 包含索引 3 | 切片右端不包含 | 把结束位置理解为“边界” |
| `3 / 2` 得到整数 | `/` 返回浮点数 `1.5` | 需要整除时使用 `//` |

## 练习：筛选并格式化文件列表

写一个列表，包含 `.csv`、`.txt` 和 `.tmp` 文件名；生成只包含 `.csv` 的新列表；最后逐项打印文件名，并打印总数。

检查两点：原列表是否保持不变？把某个文件名改成大写扩展名后，`endswith(".csv")` 是否仍匹配？可以查阅字符串方法的 `casefold()` 或 `lower()`，决定要不要忽略大小写。

## 下一步

名称、字符串和列表构成了很多脚本的基础。下一篇将给程序加入分支、循环和函数，让相同的数据可以根据规则自动处理。

**官方资料**：[Python 速览](https://docs.python.org/zh-cn/3.14/tutorial/introduction.html)。
