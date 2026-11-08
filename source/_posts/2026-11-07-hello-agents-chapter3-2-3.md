---
title: Hello-Agents 第三章 3.2-3.3 学习笔记：提示工程、缩放法则与模型边界
date: 2026-11-07 10:00:00
updated: 2026-11-07 10:00:00
categories:
  - 技术科普
tags:
  - Agent
  - 大语言模型
  - Prompt
  - Token
  - 缩放法则
  - 学习笔记
series: hello-agents
description: 记录 Hello-Agents 第三章 3.2 与大语言模型交互、3.3 缩放法则与局限性，并连接到 Agent 的提示设计、成本控制和可靠性工程。
mathjax: true
---

> **大模型的能力不是“问一句就自动出现”，而是由提示、上下文、采样策略、模型规模和验证机制共同塑造的。**

## 开篇：同一个模型，为什么有人用得好，有人用不好？

同一个模型面对“帮我处理这批数据”和“按指定 JSON 找出重复订单”时，输出质量可能完全不同。后一个请求把角色、目标、输入、输出协议和异常边界都说清楚了。提示不是咒语，而是一份给模型阅读的任务接口说明。

这篇笔记整理了两条线：3.2 的提示工程、采样、分词、本地调用与模型选型；3.3 的缩放法则、数据与算力配比、能力涌现和幻觉。

## 一、模型只是交互系统中的一个节点

大语言模型（Large Language Model，LLM）接收 token 序列，经过网络计算，再生成下一个 token。应用真正可控制的对象还包括上下文、采样参数、工具和输出校验。

{% mermaid %}
flowchart LR
    U["🔵 用户目标<br>自然语言请求"] --> P["🟣 Prompt 组装<br>角色、任务、上下文"]
    P --> T["🟡 Tokenizer<br>文本转 token"]
    T --> M["🟣 LLM 推理<br>预测下一个 token"]
    M --> S["🍑 采样策略<br>Temperature / Top-k / Top-p"]
    S --> O["🟢 输出解析<br>文本或结构化 JSON"]
    O --> V{"🟡 校验通过？"}
    V -->|"是"| R["🟢 返回结果或执行工具"]
    V -->|"否"| F["🍓 重试、修复或人工介入"]
    F --> P
    style U fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style P fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style T fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style M fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style S fill:#FFDAB9,stroke:#FFAB76,stroke-width:2px,color:#333
    style O fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
    style V fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style R fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
    style F fill:#FFB3C6,stroke:#F48FB1,stroke-width:2px,color:#333
{% endmermaid %}

**模型生成结果不应直接等同于业务动作。** 删除文件、转账、修改数据库等意图必须经过权限检查、参数校验、预览和确认。

## 二、提示工程：把自然语言写成任务接口

提示工程（Prompt Engineering）不是去找一句万能提示词，而是把任务拆成模型能够稳定执行的约束。我们可以把把生产提示拆成下面这六个部分：

| 部分 | 要回答的问题 | 示例 |
| --- | --- | --- |
| 角色 | 以什么视角工作？ | Python 代码审查员 |
| 目标 | 最终完成什么？ | 找出异常处理缺口 |
| 输入 | 可以使用哪些材料？ | 代码、日志、配置 |
| 约束 | 哪些事情不能做？ | 不猜测缺失信息 |
| 输出 | 结果如何被读取？ | 表格或 JSON |
| 验收 | 什么算完成？ | 每个问题有行号和证据 |

~~~text
角色：你是 Python 代码审查员。
目标：检查文件处理脚本是否会误删文件。
输入：代码块和运行日志。
约束：只根据给出的内容判断；不确定时标记“需要补充证据”。
输出：先给结论，再用表格列出风险、证据、严重程度和建议。
验收：每个风险都能定位到代码行或日志片段。
~~~

### Zero-shot、One-shot 与 Few-shot

| 方式 | 示例数量 | 优点 | 局限 | 适合场景 |
| --- | ---: | --- | --- | --- |
| Zero-shot | 0 | 简洁、成本低 | 边界可能不稳定 | 简单分类、常规问答 |
| One-shot | 1 | 快速示范格式 | 一个例子可能有偏差 | 固定格式任务 |
| Few-shot | 多个 | 展示边界和异常 | 占用上下文 | 抽取、分类、风格迁移 |

Few-shot 不是越多越好。示例应覆盖容易混淆的边界，格式保持一致；无关示例只会增加上下文和成本。

下面是课程中的完整提示样例。它们不是 Python 程序，而是直接发送给模型的文本输入。

~~~text
# Zero-shot：不给示例，直接描述任务
文本：Datawhale 的 AI Agent 课程非常棒！
情感：
~~~

~~~text
# One-shot：先提供一个完整的输入输出示例
文本：这家餐厅的服务太慢了。
情感：负面

文本：Datawhale 的 AI Agent 课程非常棒！
情感：
~~~

~~~text
# Few-shot：用多个示例展示分类边界
文本：这家餐厅的服务太慢了。
情感：负面

文本：这部电影的情节很平淡。
情感：中性

文本：Datawhale 的 AI Agent 课程非常棒！
情感：
~~~

指令调优模型可以直接理解任务指令；早期的文本补全模型则更依赖示例：

~~~text
# 文本补全式提示：用示例教模型翻译格式
这是一段将英文翻译成中文的程序。
英文：Hello
中文：你好
英文：How are you?
中文：
~~~

~~~text
# 指令调优式提示：直接下达任务
请将下面的英文翻译成中文：
How are you?
~~~

~~~text
# 角色提示：约束解释角度和受众
你现在是一位资深的 Python 编程专家。
请解释 Python 中的 GIL（全局解释器锁），让初学者也能听懂。
~~~

~~~text
# 结构化抽取：先给出 JSON 格式示例，再提供新输入
我需要你从产品评论中提取产品名称和用户情感。
请严格按照下面的 JSON 格式输出。

评论：这款“星尘”笔记本电脑的屏幕显示效果惊人，但我不太喜欢它的键盘手感。
输出：{"product_name": "星尘笔记本电脑", "sentiment": "混合"}

评论：我刚买的“声动”耳机音质很棒，续航也超出了我的预期！
输出：
~~~

~~~text
# 思维链提示：要求模型把复杂计算拆成可检查步骤
一个篮球队在一个赛季的 80 场比赛中赢了 60%。
在接下来的赛季中，他们打了 15 场比赛，赢了 12 场。
两个赛季的总胜率是多少？
请一步一步地思考并解答。
~~~

### 结构化输出与可验证步骤

角色提示不能赋予模型不存在的事实。“你是法律专家”不会自动产生法律效力，适用法域、资料来源和审查标准才是有效约束。

结构化输出更接近软件接口：

~~~python
import json


def parse_result(raw_text: str) -> dict:
    """只接受 JSON 对象，避免自然语言直接进入业务逻辑。"""
    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError("模型没有返回合法 JSON") from exc

    required = {"status", "items"}
    missing = required - result.keys()
    if missing:
        raise ValueError(f"缺少字段: {sorted(missing)}")
    return result
~~~

关键不是让模型永远不犯错，而是让错误尽早暴露在边界上。解析失败时可以重试、请求修复，或交给人工处理。

## 三、采样参数：改变概率分布，不是增加知识

模型先为词表中的 token 计算分数，再通过 Softmax 得到概率：

$$
p_i=\frac{e^{z_i}}{\sum_{j=1}^{k}e^{z_j}}
$$

Temperature、Top-k 和 Top-p 都是在这个分布上改变采样方式。

### Temperature

温度 T 改变分布的尖锐程度：

$$
p_i^{(T)}=\frac{e^{z_i/T}}{\sum_{j=1}^{k}e^{z_j/T}},\quad T>0
$$

| 温度 | 输出倾向 | 常见用途 |
| --- | --- | --- |
| 低 | 更确定、更保守 | 事实问答、代码、抽取 |
| 中 | 稳定与多样性平衡 | 客服、总结、普通写作 |
| 高 | 更发散、更有创意 | 头脑风暴、故事、文案 |

{% note success %}
理解成热扩散，低温扩散少，越高温扩散范围越大
{% endnote %}

温度不是智力旋钮。降低温度不会修复错误知识，只会让模型更倾向于选择当前概率最高的 token。

### Top-k 与 Top-p

Top-k 保留概率最高的 k 个候选；k=1 时基本退化为贪心选择。Top-p 按概率从高到低累加，直到累计概率达到阈值 p，候选数量会随分布变化。

| 参数 | 控制方式 | 优点 | 风险 |
| --- | --- | --- | --- |
| Temperature | 整体变尖或变平 | 直观 | 高温度可能发散 |
| Top-k | 固定候选数量 | 容易理解 | 不适应不同分布 |
| Top-p | 动态候选数量 | 对长尾更灵活 | 阈值过高会引入噪声 |

调参时先固定模型和提示，只改变一个参数，用同一组测试集比较事实正确率、格式通过率、重复率和成本。

## 四、Tokenization：模型看到的不是“字”

分词（Tokenization）把文本转换成 token 序列，再映射为 token ID。现代模型通常采用子词分词（Subword Tokenization），在词表规模、未登录词和语义片段之间做折中。

| 方式 | 优点 | 问题 |
| --- | --- | --- |
| 字符 | 词表小 | 序列长，单字符语义弱 |
| 单词 | 常见词表达完整 | 词表膨胀，难处理新词 |
| 子词 | 平衡词表和序列长度 | 规则复杂，模型之间不可直接互换 |

字节对编码（Byte Pair Encoding，BPE）可以记成“反复合并最高频相邻片段”：

~~~python
import collections
import re


def get_stats(vocab: dict[str, int]) -> dict[tuple[str, str], int]:
    """统计词表中所有相邻 token 对的出现频率。"""
    pairs = collections.defaultdict(int)
    for word, frequency in vocab.items():
        symbols = word.split()
        for index in range(len(symbols) - 1):
            pair = (symbols[index], symbols[index + 1])
            pairs[pair] += frequency
    return pairs


def merge_vocab(
    pair: tuple[str, str],
    vocab: dict[str, int],
) -> dict[str, int]:
    """把词表中所有出现的目标 token 对合并成一个 token。"""
    output = {}
    # re.escape 防止 token 中的特殊字符被当成正则语法
    bigram = re.escape(" ".join(pair))
    pattern = re.compile(r"(?<!\S)" + bigram + r"(?!\S)")

    for word, frequency in vocab.items():
        merged_word = pattern.sub("".join(pair), word)
        output[merged_word] = frequency
    return output


# </w> 表示单词结束，空格用于分隔当前的基础 token
vocab = {
    "h u g </w>": 1,
    "p u g </w>": 1,
    "p u n </w>": 1,
    "b u n </w>": 1,
}
num_merges = 4  # 只做 4 轮合并，便于观察过程

for merge_index in range(num_merges):
    pair_counts = get_stats(vocab)
    if not pair_counts:
        break

    # 每一轮选择出现频率最高的相邻 token 对
    best_pair = max(pair_counts, key=pair_counts.get)
    vocab = merge_vocab(best_pair, vocab)

    print(
        f"第 {merge_index + 1} 次合并："
        f"{best_pair} -> {''.join(best_pair)}"
    )
    print(f"当前词表：{list(vocab.keys())}")
    print("-" * 20)
~~~

这段代码的完整运行结果如下：

~~~text
第 1 次合并：('u', 'g') -> ug
当前词表：['h ug </w>', 'p ug </w>', 'p u n </w>', 'b u n </w>']
--------------------
第 2 次合并：('ug', '</w>') -> ug</w>
当前词表：['h ug</w>', 'p ug</w>', 'p u n </w>', 'b u n </w>']
--------------------
第 3 次合并：('u', 'n') -> un
当前词表：['h ug</w>', 'p ug</w>', 'p un </w>', 'b un </w>']
--------------------
第 4 次合并：('un', '</w>') -> un</w>
当前词表：['h ug</w>', 'p ug</w>', 'p un</w>', 'b un</w>']
--------------------
~~~

Token 对 Agent 的影响有三点：上下文窗口按 token 计算，API 通常按 token 计费，空格、大小写、数字和罕见字符串可能被切成不同片段。长文档系统不能只看字符数判断是否超出上下文。

## 五、开源模型调用：从文本到回答

课程用 Transformers 演示本地加载小型对话模型。核心链路是：加载 tokenizer 和模型、套用对话模板、编码 token、生成新 token、去掉输入部分并解码。

~~~python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


model_id = "Qwen/Qwen1.5-0.5B-Chat"
device = "cuda" if torch.cuda.is_available() else "cpu"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id).to(device)

messages = [
    {"role": "system", "content": "你是简洁的学习助手。"},
    {"role": "user", "content": "用三句话解释 Token。"},
]
prompt = tokenizer.apply_chat_template(
    messages, tokenize=False, add_generation_prompt=True
)
inputs = tokenizer([prompt], return_tensors="pt").to(device)

with torch.no_grad():
    output_ids = model.generate(
        **inputs, max_new_tokens=128, temperature=0.3, top_p=0.9
    )
new_ids = output_ids[:, inputs["input_ids"].shape[1]:]
answer = tokenizer.batch_decode(new_ids, skip_special_tokens=True)[0]
print(answer)
~~~

### 课程版完整运行代码与注释

如果希望严格按课程的分步方式运行，可以使用下面四段代码。第一段负责加载模型：

~~~bash
pip install transformers torch
~~~

~~~python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# 指定模型 ID；首次运行会从模型仓库下载权重
model_id = "Qwen/Qwen1.5-0.5B-Chat"

# 有 NVIDIA GPU 时优先使用 CUDA，没有时使用 CPU
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

# 分词器负责把文本切成 token，并转换为 token ID
tokenizer = AutoTokenizer.from_pretrained(model_id)

# 因果语言模型根据前文预测后文，并移动到目标设备
model = AutoModelForCausalLM.from_pretrained(model_id).to(device)
print("模型和分词器加载完成！")
~~~

第二段准备对话输入：

~~~python
# 准备符合 Chat 模型格式的多轮消息
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "你好，请介绍你自己。"},
]

# 使用模型自己的对话模板，自动添加角色标记和生成提示
text = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True,
)

# 把字符串编码成模型输入的 input_ids 和 attention_mask
model_inputs = tokenizer([text], return_tensors="pt").to(device)

print("编码后的输入文本：")
print(model_inputs)
~~~

第三段调用 generate 生成回答：

~~~python
# max_new_tokens 只限制新生成的 token 数量
generated_ids = model.generate(
    model_inputs.input_ids,
    max_new_tokens=512,
)
~~~

第四段去掉输入部分并解码：

~~~python
# generate 返回“输入 token + 新生成 token”
# 截取掉输入长度后，剩下的才是模型回答
generated_ids = [
    output_ids[len(input_ids):]
    for input_ids, output_ids in zip(
        model_inputs.input_ids,
        generated_ids,
    )
]

# 把 token ID 还原成人类可读文本，并跳过特殊 token
response = tokenizer.batch_decode(
    generated_ids,
    skip_special_tokens=True,
)[0]

print("\n模型的回答：")
print(response)
~~~

如果要观察随机采样的影响，可以在生成参数中显式加入：

~~~python
generated_ids = model.generate(
    model_inputs.input_ids,
    max_new_tokens=128,
    do_sample=True,      # 开启随机采样
    temperature=0.3,     # 温度越低，输出通常越确定
    top_p=0.9,           # 从累计概率达到 90% 的候选中采样
)
~~~

本地部署并不等于零成本。模型权重、显存、内存、量化、并发和版本维护都需要资源；它的主要价值是隐私、离线运行和模型自主可控。

## 六、模型选型：不要只看排行榜

| 维度 | 闭源 API | 开源模型本地部署 |
| --- | --- | --- |
| 上手速度 | ✅ 快，接口成熟 | ⚠️ 需要准备环境 |
| 综合能力 | ✅ 通常有前沿模型 | ⚠️ 依模型和量化方案 |
| 数据控制 | ⚠️ 依赖服务商条款 | ✅ 可在内网运行 |
| 成本结构 | 按 token 或请求计费 | GPU、机器和运维成本 |
| 模型定制 | ⚠️ 受平台能力限制 | ✅ 可微调、量化和替换 |
| 延迟与并发 | ✅ 服务商负责扩容 | ⚠️ 需要自行优化 |

选型顺序应该是：先定义任务验收集，再用最小可用模型测试准确率和格式通过率；只有当错误类型明确且确实需要时，才升级更大模型。

## 七、缩放法则：为什么增加资源通常能提升能力

缩放法则（Scaling Laws）描述模型损失与参数量、训练数据量、计算量之间的可预测关系。常见抽象形式是：

$$
L(N,D,C)\approx L_{\infty}+aN^{-\alpha}+bD^{-\beta}+cC^{-\gamma}
$$

N 表示参数规模，D 表示训练数据量，C 表示计算量，L 是损失。具体指数和常数依实验而定，不能把公式当成任何模型都适用的精确预测器。

在对数坐标中，损失曲线往往比较平滑。工程结论是：增加高质量数据、参数和训练算力通常会带来可预测收益。

但“更大”不等于“无条件更好”。训练预算固定时，参数和数据需要合理配比。Chinchilla 研究强调，参数较小但训练更充分的模型，可能超过参数更大、数据不足的模型。

## 八、能力涌现：突然出现，还是连续积累？

能力涌现（Emergent Abilities）通常指模型规模扩大后，在少样本学习、代码、多步推理或指令遵循任务上的表现显著改善。

从使用者视角看，它像是跨过阈值后突然会了；从测量角度看，离散指标、提示方式和任务难度也会放大这种“突然”。更稳妥的记忆方式是：

> 模型能力来自持续的规模化积累，但某些任务的可用性会在达到阈值后明显跃升。

小模型适合边界清晰、规则明确、可用工具补足的任务；复杂规划和多步推理需要先验证模型是否达到任务阈值。

## 九、局限性：模型变强后，问题仍然存在

幻觉（Hallucination）是模型生成与事实、输入或来源不一致的内容。自回归模型直接预测下一个 token，并没有内置一个永远可靠的事实数据库和事实核查器。

| 类型 | 表现 | 例子 |
| --- | --- | --- |
| 事实性幻觉 | 与现实事实不符 | 编造不存在的论文或 API |
| 忠实性幻觉 | 没有忠实表达输入 | 摘要加入原文不存在的结论 |
| 内在幻觉 | 与给定输入直接矛盾 | 输入写“已付款”，回答却说“未付款” |

模型知识还会过时，训练数据可能包含偏见；长上下文会增加费用和注意力分散；生成 SQL 或脚本也不等于能安全执行。

{% mermaid %}
flowchart TD
    Q["🔵 模型回答"] --> C{"🟡 需要外部事实？"}
    C -->|"否"| F["🟣 格式与逻辑校验"]
    C -->|"是"| R["🟠 RAG / 搜索 / 数据库"]
    R --> F
    F --> D{"🍓 涉及真实动作？"}
    D -->|"否"| A["🟢 返回并标注不确定性"]
    D -->|"是"| P["🟡 权限、参数、审批、审计"]
    P --> E["🟢 工具执行或人工确认"]
    style Q fill:#E8D5F5,stroke:#CE93D8,stroke-width:2px,color:#333
    style C fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style R fill:#FFDAB9,stroke:#FFAB76,stroke-width:2px,color:#333
    style F fill:#C7CEEA,stroke:#9FA8DA,stroke-width:2px,color:#333
    style D fill:#FFB3C6,stroke:#F48FB1,stroke-width:2px,color:#333
    style P fill:#FFF9C4,stroke:#F9A825,stroke-width:2px,color:#333
    style A fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
    style E fill:#B5EAD7,stroke:#80CBC4,stroke-width:2px,color:#333
{% endmermaid %}

缓解幻觉不能只靠一句“请不要胡说”。更可靠的组合是：数据清洗、RAG 外部证据、多步复核、专用工具、结构化输出、权限控制和固定评测集。

## 十、把两节内容连成 Agent 工程方法

~~~text
定义任务验收标准
    → 设计角色、上下文、约束和输出格式
    → 选择合适模型与采样参数
    → 估算 token、延迟和成本
    → 接入 RAG、工具或程序校验
    → 对失败样本分类
    → 修改提示、数据、模型或边界
    → 用固定评测集回归验证
~~~

我给自己的三个实践规则：

1. **先写验收，再写 Prompt。** 不知道什么叫“答对”，提示词再长也只是文字堆积。
2. **先用小模型和低成本参数验证流程。** 流程没有跑通时，换更大模型只会让错误变贵。
3. **把不确定性设计进系统。** 允许模型返回“资料不足”“需要确认”和“无法执行”。

## 十一、复习提纲

1. Temperature、Top-k 和 Top-p 分别改变概率分布的什么部分？
2. 为什么 Few-shot 示例应覆盖边界，而不是盲目增加数量？
3. token 数量为什么同时影响上下文长度和 API 成本？
4. 固定计算预算下，为什么参数量和数据量需要配比？
5. 为什么能力涌现既可能来自模型变化，也可能受评测方式影响？
6. 为什么 RAG、工具调用和结构化输出只能降低风险，不能保证零幻觉？
7. 哪些操作必须保留代码权限控制和人工审批？

> **提示负责表达任务，模型负责生成候选，工具负责接触事实，程序负责验证边界。**

## 参考资料

- [Datawhale Hello-Agents 第三章：大语言模型基础](https://datawhalechina.github.io/hello-agents/#/./chapter3/%E7%AC%AC%E4%B8%89%E7%AB%A0%20%E5%A4%A7%E8%AF%AD%E8%A8%80%E5%9F%BA%E7%A1%80)
- Kaplan et al., *Scaling Laws for Neural Language Models*.
- Hoffmann et al., *Training Compute-Optimal Large Language Models*.

本文是个人学习笔记，按课程内容重新组织，并补充面向 Agent 开发的实践理解。
