---
title: RAG 应用实践（中）：检索不准，先定位再优化
date: 2026-10-21 17:00:00
updata: 2026-10-22 8:30:00
categories:
  - 技术科普
tags:
  - RAG
  - 信息检索
  - Reranker
  - Agent
series: rag-practice
description: 从检索失败现象出发，整理切块、混合检索、查询改写、重排序、上下文压缩和语义路由的适用场景与成本。
---

> 检索效果不好时，先找出是哪一步漏了证据；盲目叠加“高级 RAG”模块，只会让问题更贵、更难定位。

## 先判断错误发生在哪一段

同一个错误答案可能来自完全不同的原因：原始文档没有答案、切块丢了条件、召回没有找到证据、排序把正确片段压下去，或模型拿到证据却没有遵循要求。需要把检索结果和最终回答分开检查。

{% asset_img rag-retrieval-map.svg RAG 检索失败诊断与优化手段图 %}

上图为 Excalidraw 绘制，编辑源文件与 SVG 同目录。诊断时保存问题、召回候选、重排结果、最终上下文和回答，才能判断某项优化是否真正修复了失败点。

## 从简单、低成本的方法开始

### 切块与元数据

如果证据在原文中，却被切成两段，先调整切块边界或增加父子块检索：用小块找位置，再把所属段落或章节扩展给模型。若文档包含版本、生效日期、部门等属性，元数据过滤可以先缩小候选范围。

元数据要在加载时真实可得且持续维护。错误的日期或权限标签，比没有过滤更危险，因为它会把正确证据排除在外。

### 混合检索

向量检索适合语义表达变化，关键词检索适合编号、产品名、代码和精确术语。混合检索把两类候选合并，再统一排序。比如查询“报销流程”适合语义召回，而查询“费用单据 R-1042”更依赖精确词项。

融合分数必须做尺度处理，不能直接假设不同搜索引擎的原始分数可比较。常见做法是 Reciprocal Rank Fusion（RRF）按排名融合，或者对合并候选使用专门的重排器。

RRF 不比较向量相似度和 BM25 的原始分数，而是按候选在各自结果列表中的名次计分：`RRF(d) = Σ 1 / (k + rank_i(d))`。`k` 是平滑常数，常用值在几十左右；同一文档在多个列表中都靠前，就会得到更高融合分。以下实现可直接运行：

```python
from collections import defaultdict


def reciprocal_rank_fusion(result_lists, *, rank_constant=60):
    """result_lists 是多个按相关性从高到低排列的文档 ID 列表。"""
    scores = defaultdict(float)
    for results in result_lists:
        seen = set()
        for rank, doc_id in enumerate(results, start=1):
            if doc_id in seen:
                continue
            seen.add(doc_id)
            scores[doc_id] += 1 / (rank_constant + rank)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))


vector_hits = ["policy-17", "policy-05", "policy-31"]
keyword_hits = ["policy-05", "policy-42", "policy-17"]
print(reciprocal_rank_fusion([vector_hits, keyword_hits]))
```

实际使用时，两个检索器应返回同一层级的 ID（例如文档块 ID）；若一个返回文档、另一个返回段落，需要先定义去重和父子映射规则。RRF 的排序结果仍需通过测试集验证，不会自动识别权限错误、过期版本或语义上的细微差异。关键词检索可用 BM25 等算法生成，向量检索负责语义近邻；两边先取较宽候选，再融合、去重并应用可靠的权限与版本过滤。

## 查询改写：改变搜索表达，不改变用户目标

用户问题可能太短、指代不清或缺少领域词。查询改写可以先补全上下文、生成多个表达，或将复杂问题拆成子问题分别检索。

另一种方法 HyDE（Hypothetical Document Embeddings）会先让模型生成一段假设性答案，再用它的向量搜索文档。它的目标是弥补“问题语言”和“资料语言”之间的差异；假设文本不是证据，不能直接拿来回答用户。

查询转换增加了模型调用和延迟，也可能把原问题改偏。应保留原始查询，在日志中记录改写版本，并比较改写前后的检索指标。

多查询适合用户说法差异较大、资料使用专业术语的场景。合并多个查询结果后要按块 ID 去重，否则相同证据可能占满 `top_k`。HyDE 生成的假设文档只能用于召回，后续上下文必须来自真实资料。路由也要保留“无法判断时走通用检索或澄清”的兜底分支。

下面是一个规则路由示例，规则适合高确定性的编号和关键词；自然语言意图复杂时可替换为分类模型，但仍要设置默认路由：

```python
import re


def route_query(question: str) -> str:
    normalized = question.strip().lower()
    if re.search(r"\b(?:R|INV|PO)-\d{3,}\b", question, re.IGNORECASE):
        return "keyword_search"  # 单号、订单号优先精确查找
    if any(word in normalized for word in ("最新", "生效日期", "版本")):
        return "metadata_filtered_search"
    if any(word in normalized for word in ("为什么", "比较", "区别")):
        return "multi_query_search"
    return "hybrid_search"  # 未命中规则时的明确默认路径
```

路由不是答案。应为每个分支准备正例、边界例和误路由案例，检查覆盖率、误分类率及各路径成本。不同路径召回的证据最终还要统一检查来源、版本、权限和重复项。

## 重排序与上下文压缩

向量检索通常适合先快速召回较多候选。重排序模型（reranker）再同时查看查询和候选文本，判断二者的具体相关性，最后选出较少片段交给生成模型。

重排常能改善候选顺序，但会增加一次模型计算；候选数量很大时尤其明显。上下文压缩可以过滤或提炼候选中的相关句子，减少提示长度，但压缩器也可能删掉例外条件、否定词或数字。上线前应检查压缩结果是否保留了原文证据。

典型候选流水线可以是：向量召回 20 条、关键词召回 20 条、RRF 合并去重为约 30 条、reranker 选出 5 条，再按 Token 预算组成上下文。这些数值只是调参起点。记录每一步候选 ID 与分数，才能区分“没召回”和“重排错了”。

```python
def retrieve_context(question, *, vector_search, keyword_search,
                     rerank, load_authorized_chunks, max_chars=6000):
    vector_hits = vector_search(question, limit=20)
    keyword_hits = keyword_search(question, limit=20)
    fused = reciprocal_rank_fusion([
        [hit["id"] for hit in vector_hits],
        [hit["id"] for hit in keyword_hits],
    ])
    candidate_ids = [doc_id for doc_id, _ in fused[:30]]
    # 按 ID 读取时再次执行权限过滤，避免权限只在路由层检查。
    candidates = load_authorized_chunks(candidate_ids)
    ranked = rerank(question, candidates)[:5]

    selected, used = [], 0
    for item in ranked:
        size = len(item["text"])
        if used + size <= max_chars:
            selected.append(item)
            used += size
    return selected
```

`load_authorized_chunks` 是应用自己的安全读取函数，`rerank` 则由重排模型实现。这里用字符数粗略限制长度；接入模型时应改用对应 tokenizer 的 Token 预算，并为系统提示、用户问题和输出预留空间。

## 路由和 Agentic RAG

当知识来自多个系统时，路由器可以先判断问题应查文档、数据库还是 API。规则路由成本低、结果可预测；语义路由能处理自然语言意图，但需要评测边界问题和兜底路径。

Agentic RAG 让模型根据中间结果决定是否继续搜索、换查询或调用工具。它适用于需要多步调查的问题，但行为路径更难预测，成本和延迟也更高。对于“制度里报销期限是多少”这种单跳问题，普通检索通常更易控制。

## 优化方案速查

| 现象 | 优先尝试 | 额外成本或风险 |
| --- | --- | --- |
| 关键词和编号查不到 | 增加关键词或混合检索 | 需要校准融合与过滤规则 |
| 原文有答案但块被切断 | 结构化切块、父子块或邻近上下文 | 上下文增大，索引结构更复杂 |
| 正确候选在列表靠后 | 增加候选后做重排序 | 增加模型调用和延迟 |
| 问题短、指代不清 | 查询补全或多查询 | 改写可能偏离原意 |
| 多个知识源混在一起 | 元数据筛选或语义路由 | 标签维护、路由错误需要兜底 |
| 上下文太长且噪声多 | 重排后压缩 | 可能丢失限制条件 |
| 问题需要多轮搜索 | 分解问题或 Agent | 成本、时延和不可预测性上升 |

## 用实验决定是否保留优化

为每个优化准备一组失败案例和一组正常案例。一次只调整一个主要变量，例如切块规则或重排模型；记录召回是否找到证据、最终答案是否忠实、延迟和成本是否变化。

如果重排让答案更准确，但 P95 延迟翻倍，就要判断这个取舍是否适合目标用户。**高级方案不是默认更好，而是在明确的错误类型上，带着可量化收益的方案。**

建议依次排查：

1. **资料是否存在且最新？** 检查源文件、权限、版本和解析结果。
2. **证据是否完整地进入索引？** 检查切块文本、元数据、向量维度和索引时间。
3. **正确证据是否被召回？** 查看原始查询的向量、关键词候选及 Recall@k。
4. **证据是否排在前面？** 比较融合与 reranker 的排序。
5. **模型上下文是否保留限定条件？** 检查过滤、截断、压缩和 Token 预算。
6. **模型是否忠实作答？** 检查提示词、引用映射和拒答行为。

每一步都保存 ID 和版本，避免只看最终答案猜原因。调参时保留基线配置，出现回归可以快速回退。

## 练习：给失败问题分诊

建立 10 个问题的测试集，为每个问题标出正确文档和段落。记录基础向量检索的候选，再分别测试关键词补充、查询改写和重排序。对比哪个方法找到了缺失证据，并检查额外耗时。

下一篇会把这组问题变成评估集，介绍如何衡量检索、生成质量和生产运行指标。

## 参考资料

- [知乎专栏：《深度好文！最全的大模型 RAG 技术概览》](https://zhuanlan.zhihu.com/p/678893732)，导出文件作者字段为“未知”，正文提及 @AI技术社区。
- [知乎专栏：《大模型应用之RAG详解》](https://zhuanlan.zhihu.com/p/13679111673)，导出文件作者字段为“未知”。
- [鱼皮：RAG 是什么？16 种 RAG 方案一次讲清](https://ai.codefather.cn/post/2047162931736592386)。
- [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)。
- [Hypothetical Document Embeddings](https://arxiv.org/abs/2212.10496)。

