# Findings

这里存放从真机测试里沉淀出来的问题草稿与证据。原始运行产物放在 `../reports/`，不要直接提交整轮原始结果。

## 工作流

1. 在 `reports/` 里跑出结果，确认问题可复现。
2. 把可追踪的问题整理成 `findings/` 下的 Markdown 草稿，默认 `Status: local-draft`、`Linear: pending`。
3. 只把说明问题所需的关键截图拷到 `findings/assets/<run-name>/`，不要链接原始报告文件。
4. 提交 Linear 前先查重；创建后用 `Linear: COW-xx` 与链接回填草稿。
5. 代码修复请用 Linear 号命名分支/提交/PR，方便 GitHub 反向关联。

## 草稿模板

```markdown
## FINDING-ID: 一句话标题

Status: local-draft
Linear: pending
Project: CoWallet v2
Labels: Improvement
Priority: Medium
Source: iOS/Android 真机 <用例名>
Source report: ../reports/<run-name>/summary.json
Screenshots:
- ./assets/<run-name>/<screenshot>.png

### 观察到

### 期望

### 影响

### 复现步骤

1.
2.
```

## 提交提醒

测试结束后，如果存在以下任一情况，请确认是否要提交到 Linear：

- 涉及隐私、恢复、签名、转账、删号等高风险路径的问题；
- 同一流程出现 3 个以上中等问题；
- 任何 `Linear: pending` 的新草稿。

## 与 midscene-test-cw 的差异

`../cowallet/blackbox-device-tests/findings/` 里是 v1.0.2 的历史记录，含 Linear 编号与截图，可作为写作风格参考；v2 的新问题写在本目录，不要覆盖历史结论。
