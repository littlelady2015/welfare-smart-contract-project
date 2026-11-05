# 慈善捐款执行与审批平台

一个用于分阶段管理公益捐款的全栈项目：React 前端、Python/FastAPI 服务、Solidity 智能合约。

## 项目结构

```text
frontend/       React + TypeScript + Vite
backend/        Python + FastAPI
contracts/      Solidity + Foundry
docs/           产品与技术文档
```

## 本地开发

前端（Node.js 20+）：

```bash
cd frontend
npm install
npm run dev
```

后端（Python 3.11+）：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

合约（Foundry）：

```bash
cd contracts
forge test
```

## 当前状态

- 前端是工作流原型，展示分笔拨款、按地址计票的 50%/30% 阈值和执行凭证状态；捐款人资料、通知与决定保存在浏览器 IndexedDB，钱包及链上读写尚未接入。
- 后端提供健康检查与项目概览 API；身份认证、数据库和链上事件索引待实现。
- 合约演示原生币托管与顺序拨款。每笔拨款需赞成票严格超过登记地址的 50%，且反对票严格低于 30%；拨款转出后，项目负责人提交执行凭证摘要，合约才开放下一笔申请。
- 链上凭证摘要不证明现实世界的资金用途，仍需独立的凭证审核流程。

产品需求与待确认事项见 [docs/PRODUCT.md](docs/PRODUCT.md)。