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

- 前端产品模式已连接浏览器钱包和本地 Anvil 合约，支持真实链上捐款、带审批材料的拨款提案、按地址计票、执行拨款和执行凭证。
- 页面按 Manager 与 Registered donor 自动隔离操作。金额以固定演示汇率 `1 ETH = 2,000 USD` 显示，实际交易仍使用原生测试 ETH。
- 审批材料在提案时绑定 SHA-256 和访问标识。捐赠者可在投票前打开材料并核对哈希；本地演示上传的文件保存在当前浏览器，内置样例文件从站点静态目录读取。
- 执行方的 Donors、Approval Flow 和 Fund Contract 页面从本地合约读取资产、投票、批次和凭证状态。
- 后端提供健康检查与项目概览 API；身份认证、数据库和链上事件索引待实现。
- 合约演示原生币托管与顺序拨款。每笔拨款需赞成票严格超过登记地址的 50%，且反对票严格低于 30%；拨款转出后，项目负责人提交执行凭证摘要，合约才开放下一笔申请。
- 链上凭证摘要不证明现实世界的资金用途，仍需独立的凭证审核流程。

产品模式启动：

```bash
cd frontend
npm run dev:product -- --host 127.0.0.1 --port 5173
```

产品需求与待确认事项见 [docs/PRODUCT.md](docs/PRODUCT.md)。

产品演示版的手工验收账户、主流程和失败场景见 [docs/DEMO_ACCEPTANCE.md](docs/DEMO_ACCEPTANCE.md)。

## 文档分工

- README 保留项目简介、快速启动、演示环境和文档入口。
- [docs/PRODUCT.md](docs/PRODUCT.md) 说明产品定位、角色权限、业务流程、合约规则、MVP 边界和已知限制。
- [docs/DEMO_ACCEPTANCE.md](docs/DEMO_ACCEPTANCE.md) 提供可直接照着点击的端到端验收步骤。
- [docs/DEVELOPER_HANDOFF.md](docs/DEVELOPER_HANDOFF.md) 提供环境搭建、合约部署、账户配置、重置流程和常见故障处理。

## 当前演示环境

- 分支：`feat/local-chain-demo`
- 前端：http://127.0.0.1:5173/
- Anvil RPC：http://127.0.0.1:8545
- Chain ID：`31337`
- 合约：`0x5FbDB2315678afecb367f032d93F642f64180aa3`
- 演示汇率：`1 ETH = 2,000 USD`

| 角色 | 演示账户 | 页面职责 |
|---|---|---|
| Manager | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | 查看完整目录、提交带材料提案、执行拨款、提交执行凭证 |
| Donor A | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 捐款、查看审批材料、批准或反对 |
| Donor B | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 捐款、查看审批材料、批准或反对 |

## 快速演示摘要

1. Donor A 和 Donor B 分别捐款。
2. Manager 提交带用途和审批材料的拨款提案。
3. Donor A 和 Donor B 核验材料并分别投票。
4. 赞成票严格超过登记捐赠地址的 50%，且反对票低于 30% 后，提案进入 `Ready to disburse`。
5. Manager 执行拨款并提交执行凭证哈希。
6. 合约开放 next tranche，进入下一轮提案与审批。

详细权限和边界以 [docs/PRODUCT.md](docs/PRODUCT.md) 为准；实际点击顺序和预期结果以 [docs/DEMO_ACCEPTANCE.md](docs/DEMO_ACCEPTANCE.md) 为准。

## 当前已知限制

- 只演示一个固定项目，不提供项目发布和多项目切换。
- 钱包使用本地测试 ETH；美元金额来自固定的前端演示汇率。
- 自定义审批材料保存在当前浏览器，跨浏览器演示应使用内置样例材料。
- 执行凭证当前只保存 SHA-256 摘要，不保存文件内容或 IPFS 地址。
- 暂无投票截止、退款、稳定币、完整事件索引、正式通知系统和管理员多签。
- Manager 捐款入口只在界面上隐藏，合约层仍允许 Manager 直接调用 `deposit()`。
