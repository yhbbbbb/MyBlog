---
title: RAG 应用实践（下）：用评估集证明系统真的变好了
date: 2026-10-21 18:00:00
updata: 2026-10-22 8:30:00
categories:
  - 技术科普
tags:
  - RAG
  - 系统评估
  - LangSmith
  - RAGAS
series: rag-practice
description: 建立可复用的 RAG 评估集，分别衡量检索、回答忠实度、相关性、延迟和成本，并把离线评估连接到持续监控。
---

> 换了 Embedding、切块或提示词后，如果没有固定的问题集对照，团队只能凭几条演示问题猜测系统有没有进步。

## RAG 至少要评估三个对象

完整 RAG 的输入是问题，检索器返回上下文，生成器输出答案。评估不能只给最终答案打一个总分：检索失败和生成失败需要不同的修复方式。

{% asset_img rag-evaluation-loop.svg RAG 离线评估与线上监控闭环图 %}

离线评估用于比较改动，线上监控则用于发现真实用户问题分布和数据变化。

## 建立一份小而有代表性的评估集

每条样例至少保存：用户问题、正确答案要点、支持答案的来源文档或段落、问题类型，以及可能的不可回答标记。样例应覆盖常见问题、长尾问题、模糊表达、相似文档干扰和资料缺失情况。

可以从真实日志抽样，但要移除个人信息和敏感内容。专家标注成本高时，先选 30 到 100 个高价值问题，确保每个重要类别都有覆盖，再逐步扩充。评估集不是越大越好，标签必须可信且能追溯。

建议用 JSONL 管理样本，每一行是一条独立记录，便于 Git diff、批量运行和增量标注。答案可以保存必要事实点，而不是只保存一段标准措辞；这样能接受语义等价的回答，同时保持可审计的判定依据。

```json
{"id":"expense-001","question":"出差回来后多久要提交报销？","reference_points":["返程后10个工作日内","提交报销申请"],"relevant_chunk_ids":["travel-policy-v3:42"],"answerable":true,"category":"期限"}
{"id":"expense-002","question":"临时出差的特殊报销额度是多少？","reference_points":[],"relevant_chunk_ids":[],"answerable":false,"category":"资料缺失"}
```

`relevant_chunk_ids` 应标出所有必要证据，不应只记录一条“看起来相关”的段落。不可回答样本同样重要：它们用于检查系统是否会在资料缺失时坦率拒答，而不是把相似内容拼成一个看似可信的答案。

## 分层指标，不让一个分数掩盖失败

| 层次 | 常见指标 | 它回答的问题 |
| --- | --- | --- |
| 检索 | Recall@k、Precision@k、MRR、nDCG | 正确证据是否进入候选，位置是否足够靠前？ |
| 上下文 | Context Precision、Context Recall | 上下文是否相关、是否覆盖回答所需事实？ |
| 生成 | Faithfulness、Answer Relevance | 回答是否被证据支持，是否回应了问题？ |
| 运行 | 延迟、失败率、Token/调用成本 | 系统是否足够快、稳定且可负担？ |

指标定义会因评估工具而有细节差异。例如 Recall@k 依赖你如何标注文档相关性；Faithfulness 常由另一个模型评审，也会继承评审模型的偏差。因此指标要结合人工复核和固定样例使用。

### 检索指标

Recall@k 衡量相关证据是否出现在前 `k` 个结果中；Precision@k 衡量这 `k` 个结果里相关内容占多少。MRR 关注第一个相关结果的位置，nDCG 则考虑多个结果的排序和相关等级。

如果答案依赖两个不同章节，单看第一条命中会高估检索效果。标注时需要记录全部必要证据，而不只是最容易找到的一段。

下面这个纯 Python 实现可以计算单问题的 Recall@k、Precision@k 和 MRR。它假设每个相关块同等重要；若相关性有等级差异或问题需要多个证据联合回答，应另外计算 nDCG，并用人工检查确认标注口径。

```python
def retrieval_metrics(retrieved_ids: list[str], relevant_ids: set[str], k: int = 5):
    """对一个问题计算基础检索指标。空相关集返回 None，避免伪造高分。"""
    top_k = retrieved_ids[:k]
    if not relevant_ids:
        return {"recall@k": None, "precision@k": None, "mrr": None}

    hits = [doc_id for doc_id in top_k if doc_id in relevant_ids]
    first_rank = next(
        (rank for rank, doc_id in enumerate(retrieved_ids, start=1)
         if doc_id in relevant_ids),
        None,
    )
    return {
        "recall@k": len(set(hits)) / len(relevant_ids),
        "precision@k": len(set(hits)) / k,
        "mrr": 1 / first_rank if first_rank else 0.0,
    }


print(retrieval_metrics(
    retrieved_ids=["chunk-a", "chunk-c", "chunk-b"],
    relevant_ids={"chunk-b", "chunk-c"},
    k=3,
))
```

MRR 的倒数排名针对第一个相关结果；Recall@k 看所有已标注必要证据中命中了多少。计算 `precision@k` 时，即使实际返回不足 `k` 条，也按固定的 `k` 作分母，以反映候选列表空缺。不同团队可能采用不同约定，报告时要写明定义。

### 生成指标

忠实度（faithfulness）关注回答中的陈述能否从上下文推出；答案相关性（answer relevance）关注是否答到了用户真正问的内容。回答“资料没有说明”有时是正确结果，因此评估集要加入缺少证据的问题，检查系统是否会编造。

LLM-as-a-judge 可以批量评分，但它是辅助标注者，不是客观裁判。对高风险领域，应抽样人工审核，并检查评分标准是否偏爱冗长、格式化但并不准确的答案。

让评审模型按明确维度分别给分，比只问“答案好吗”更容易定位问题。评审输入至少包含原问题、检索上下文、生成答案和评分规则；不要把参考答案直接混入模型回答上下文，否则评测会绕过检索系统本身。

```text
请只按下面的证据评估回答，不要补充外部知识。

问题：{question}
检索上下文：{contexts}
系统回答：{answer}
必要事实点：{reference_points}

输出 JSON：
{
  "faithfulness": 0-2,
  "coverage": 0-2,
  "answers_question": true/false,
  "unsupported_claims": ["逐条列出上下文无法支持的陈述"],
  "missing_points": ["未覆盖的必要事实点"]
}
评分约定：0=失败，1=部分满足，2=满足。若资料不足且系统明确拒答，
不得因它没有猜测 reference_points 而扣分。
```

要固定评审模型、提示词和采样参数，并抽取一部分样本由人复核。自动评分适合发现相对回归，不适合单独决定高风险回答是否可发布。

## 人工评估和自动化评估配合使用

人工评估能发现业务语境、危险遗漏和引用是否真正支持结论，但速度较慢。自动评估适合重复比较配置、快速定位回归；它也可能受模型版本、提示词和样例分布影响。

LangSmith、RAGAS、Langfuse 等工具可以管理数据集、运行追踪或评估器。选工具时要看数据如何保存、是否会发送到外部服务、团队是否需要长期追踪。工具本身不会替你定义业务上的“正确答案”。

一个最小迭代循环是：

1. 固定数据集和当前基线。
2. 每次改变一个主要因素，例如切块或 reranker。
3. 运行检索与生成评估，保存失败样例。
4. 人工检查指标变化背后的答案和证据。
5. 只有质量收益超过延迟、成本和维护代价时才保留改动。

可以把实验结果写成 CSV 或数据表，至少保留配置版本、数据集版本、检索指标、生成指标、P50/P95 延迟、失败率和每次请求成本。基线必须可复现：固定评估样本、模型版本、Embedding 版本、提示词、检索参数和索引快照。否则前后分数差异可能来自数据或模型变化，而不是此次优化。

一个简单的评估循环可以先把检索指标和人工/模型评审结果分开保存：

```python
def run_retrieval_eval(dataset, search, k=5):
    rows = []
    for sample in dataset:
        hits = search(sample["question"], limit=k)
        hit_ids = [item["id"] for item in hits]
        metrics = retrieval_metrics(
            hit_ids, set(sample["relevant_chunk_ids"]), k=k
        )
        rows.append({"id": sample["id"], **metrics, "hit_ids": hit_ids})
    return rows


# dataset 为 JSONL 解析后的字典列表；search 接入你的检索器。
# 将 rows 连同代码版本、索引版本和模型配置写入实验记录。
```

对生成质量的自动评分器应作为独立阶段运行，并记录原始评审理由。若平均分提高但某个关键类别退步，不能只看全体平均值；要按类别切片检查，例如“资料缺失”“日期版本”“多段证据”和“权限边界”。

## 从离线分数走向线上可靠性

生产监控还要记录检索耗时、生成耗时、超时、空检索、引用缺失、模型调用失败和成本。日志应使用文档 ID 或版本标识，而不是无差别保存敏感原文。

数据更新也需要纳入评估。索引构建应有版本号、更新时间和回滚方案；新文档导入后，跑一组关键回归问题，确认权限过滤、来源定位和回答质量没有退化。

线上观测还应注意数据治理：日志可能包含用户问题、检索片段或个人信息。记录必要的追踪 ID、文档 ID、分数、耗时和错误类型；是否保存原文、保存多久、谁能访问，应由数据分级和组织政策决定。对外部评估平台要先确认数据传输和保留设置。

## 练习：评估一次检索优化

沿用中篇建立的问题集，新增每个问题的必要证据标注。比较基础向量检索和“向量 + 关键词 + reranker”的 Recall@5、MRR、忠实度、P95 延迟和单次成本；随机抽查回答，解释指标升降是由哪批样例造成的。

**只有把质量、速度和成本放在同一张结果表里，才能判断优化是否适合真实用户。**

## 系列回顾

上篇拆解了索引、检索和生成；中篇根据错误类型选择检索优化；本篇用评估集和生产指标验证改动。三篇合起来是一条工程闭环：先拿到可追溯证据，再改善证据命中，最后用数据证明改善确实发生。

## 参考资料

- [知乎专栏：《深度好文！最全的大模型 RAG 技术概览》](https://zhuanlan.zhihu.com/p/678893732) @AI技术社区。
- [知乎专栏：《大模型应用之RAG详解》](https://zhuanlan.zhihu.com/p/13679111673)
- [鱼皮：RAG 是什么？16 种 RAG 方案一次讲清](https://ai.codefather.cn/post/2047162931736592386)。
- [RAGAS 指标文档](https://docs.ragas.io/en/latest/concepts/metrics/)。
- [LangSmith Evaluation 文档](https://docs.smith.langchain.com/evaluation)。


