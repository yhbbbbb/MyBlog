---
title: 04｜列表、元组、集合和字典怎么选
date: 2026-10-17 09:30:00
categories:
  - 技术科普
tags:
  - Python
  - Python 教程
  - 数据结构
  - 列表
  - 字典
series: python-tutorial
description: 从顺序、可变性和查找方式比较 Python 常用容器，并用文件统计示例说明列表、元组、集合和字典的适用场景。
---

> 数据放进哪个容器，会影响后续代码怎么查找、更新和表达意图。选容器不是语法偏好，而是先问数据之间有什么关系。

## 同一批文件，四种不同的组织方式

文件处理脚本可能需要按顺序保存待处理文件、把固定配置作为一组值、去除重复后缀、统计每种后缀出现次数。Python 的列表、元组、集合和字典分别适合这些任务。

| 容器 | 是否有序 | 是否可变 | 典型用途 |
| --- | --- | --- | --- |
| 列表 `list` | ✅ 保留顺序 | ✅ 可变 | 待处理队列、结果列表 |
| 元组 `tuple` | ✅ 保留顺序 | ❌ 不可变 | 固定记录、多个返回值 |
| 集合 `set` | ❌ 不承诺位置顺序 | ✅ 可变 | 去重、成员关系测试 |
| 字典 `dict` | ✅ 保留插入顺序 | ✅ 可变 | 键到值的映射、计数 |

“有序”在这里指可以依照插入顺序遍历，不意味着每种容器都能用下标访问。集合没有位置索引；它的重点是唯一元素和快速成员检查。

{% mermaid %}
flowchart LR
    A["🔵 手头的数据"] --> B{"🟡 需要保留顺序？"}
    B -->|是| C{"🍑 需要修改？"}
    C -->|是| D["🟢 列表 list"]
    C -->|否| E["🟣 元组 tuple"]
    B -->|否或重视去重| F{"🌸 键值映射？"}
    F -->|是| G["🟢 字典 dict"]
    F -->|否| H["🟡 集合 set"]
    style A fill:#C7CEEA,stroke:#9FA8DA,color:#333
    style B fill:#FFF9C4,stroke:#F9A825,color:#333
    style C fill:#FFDAB9,stroke:#FFAB76,color:#333
    style D fill:#B5EAD7,stroke:#80CBC4,color:#333
    style E fill:#E8D5F5,stroke:#CE93D8,color:#333
    style F fill:#FFB3C6,stroke:#F48FB1,color:#333
    style G fill:#B5EAD7,stroke:#80CBC4,color:#333
    style H fill:#FFF9C4,stroke:#F9A825,color:#333
{% endmermaid %}

## 列表：有顺序、可修改

列表支持追加、插入、删除和切片：

```python
files = ["a.csv", "b.txt"]
files.append("c.csv")
files[1] = "b.csv"
del files[0]

print(files)  # ['b.csv', 'c.csv']
```

列表推导式适合从已有序列构造新列表：

```python
csv_files = [name for name in files if name.endswith(".csv")]
```

如果推导式中出现多层嵌套或很多条件，就应改成普通循环。可读性比把所有操作压成一行更重要。

把列表当栈时，可以用 `append` 入栈、`pop` 取出最后一个元素；如果需要高效地从两端插入和移除，标准库 `collections.deque` 更合适。

## 元组：固定位置的记录

元组用逗号组织多个值，括号通常用于提高可读性：

```python
record = ("订单.csv", 2048)
filename, size = record
```

解包让固定结构更清楚。只有一个元素的元组需要尾随逗号：`("a",)`；`("a")` 只是括号包住字符串。

元组不能替换其中的元素，但如果元素本身是列表，那张列表仍可能被修改。不可变只保证元组的元素引用不变，不代表深层对象都不可变。

## 集合：去重与成员检查

集合只保留唯一元素：

```python
extensions = {".csv", ".txt", ".csv"}
print(extensions)  # {'.csv', '.txt'}，展示顺序不应作为逻辑依据
```

空集合要写 `set()`，因为 `{}` 创建的是空字典。集合还支持交集、并集和差集：

```python
allowed = {".csv", ".txt"}
incoming = {".csv", ".tmp"}

print(allowed & incoming)  # 两者共有的扩展名
print(incoming - allowed)  # 未允许的扩展名
```

集合元素必须可哈希（hashable）。字符串和数字可以放进集合，列表不能，因为可变列表没有稳定的哈希值。

## 字典：用键查找关联值

字典（dictionary）将键映射到值，很适合计数：

```python
files = ["a.csv", "b.txt", "c.csv", "d.csv"]
counts = {}

for filename in files:
    extension = filename.rsplit(".", maxsplit=1)[-1]
    counts[extension] = counts.get(extension, 0) + 1

print(counts)  # {'csv': 3, 'txt': 1}
```

`dict.get(key, default)` 在键不存在时返回默认值，不会引发 `KeyError`。计数场景也可以使用 `collections.Counter`；先理解普通字典的更新方式，再用专用工具通常更容易。

遍历字典时，按需使用 `keys()`、`values()` 和 `items()`：

```python
for extension, count in counts.items():
    print(f".{extension}: {count}")
```

字典保留插入顺序，但需要按键排序时应明确调用 `sorted(counts.items())`，不要依赖偶然的插入顺序。

## 选择容器时问三个问题

第一，是否需要按位置保留顺序？需要时优先看列表或元组。第二，数据是否要修改？会不断更新的列表和字典很合适；固定记录可用元组。第三，主要操作是什么？去重和成员测试偏向集合，按标识查找统计值偏向字典。

| 任务 | 推荐容器 | 选择原因 |
| --- | --- | --- |
| 按发现顺序依次处理文件 | 列表 | 顺序明确，便于追加和筛选 |
| 保存不可变的坐标或状态组合 | 元组 | 固定位置，便于解包 |
| 找出重复扩展名或去重 | 集合 | 元素天然唯一，支持集合运算 |
| 按扩展名统计数量 | 字典 | 直接从键查到对应计数 |

## 练习：构建一份文件统计

给定一组文件名，完成以下结果：

1. 用列表保存 `.csv` 文件，并维持原始顺序。
2. 用集合得到出现过的唯一扩展名。
3. 用字典统计每种扩展名的数量。
4. 用元组保存一条不可变的“文件名、字节数”记录，并解包打印。

重点测试空列表、没有扩展名的名称，以及大小写不同的扩展名。先确定你希望如何处理这些边界，再写代码。

## 下一步

容器解决的是程序内部如何组织数据。下一篇会进一步把相关代码放进模块，让多个脚本可以共享规则和函数。

**官方资料**：[数据结构](https://docs.python.org/zh-cn/3.14/tutorial/datastructures.html)。
