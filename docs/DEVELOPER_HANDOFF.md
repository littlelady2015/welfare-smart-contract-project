# GoodFund 本地链 MVP 开发交接

本文档用于让另一位开发人员在当前 Windows 工作环境中启动 GoodFund、部署合约、完成一次产品演示并排查常见问题。

## 当前交付状态

- 分支：`feat/local-chain-demo`
- 分支尚未合并到 `main`
- 当前成果仍以工作区或远端分支的实际 Git 状态为准
- 产品模式使用浏览器钱包，不使用页面内的 Local Demo 账户选择器
- 本地链使用 Anvil，Chain ID 为 `31337`
- 当前部署地址：`0x5FbDB2315678afecb367f032d93F642f64180aa3`

功能范围、角色权限和已知限制见 [PRODUCT.md](PRODUCT.md)。实际点击验收步骤见 [DEMO_ACCEPTANCE.md](DEMO_ACCEPTANCE.md)。

## 环境要求

- Node.js 20 或更高版本
- npm
- Foundry，包括 `anvil`、`forge` 和 `cast`
- Google Chrome 与 MetaMask
- Python 3.11 或更高版本，仅在启动 FastAPI 健康检查服务时需要

先确认工具可用：

```powershell
node --version
npm --version
anvil --version
forge --version
```

如果 Foundry 已安装但 PowerShell 找不到命令，请把 Foundry 的 `bin` 目录加入 `PATH`，或使用其绝对路径。

## 获取代码

分支推送到远端后执行：

```powershell
git fetch origin
git switch --track origin/feat/local-chain-demo
cd "frontend"
npm install
```

当前阶段不要将该分支合并到 `main`。

## 启动本地链

在第一个 PowerShell 窗口启动 Anvil：

```powershell
anvil --host 127.0.0.1 --port 8545 --chain-id 31337
```

启动后应看到：

- RPC：`http://127.0.0.1:8545`
- Chain ID：`31337`
- 默认解锁账户及其本地测试私钥

这些账户和私钥只用于本地测试。不要把私钥、助记词或 MetaMask 密码写入仓库。

## 部署合约

在第二个 PowerShell 窗口执行：

```powershell
cd contracts
forge test

$env:ANVIL_MANAGER_PRIVATE_KEY = "<使用 Anvil 输出的第一个测试私钥>"

forge create src/WelfareFund.sol:WelfareFund `
  --rpc-url http://127.0.0.1:8545 `
  --private-key $env:ANVIL_MANAGER_PRIVATE_KEY `
  --broadcast `
  --constructor-args 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

在全新的 Anvil 上按上述顺序部署时，合约地址应为：

```text
0x5FbDB2315678afecb367f032d93F642f64180aa3
```

如果部署地址发生变化，需要在 `frontend/.env.product` 中设置新的 `VITE_WELFARE_FUND_ADDRESS`，然后重启前端服务。

## 启动前端

在第三个 PowerShell 窗口执行：

```powershell
cd frontend
npm run dev:product -- --host 127.0.0.1 --port 5173
```

浏览器打开：

```text
http://127.0.0.1:5173/
```

`frontend/.env.product` 当前至少需要：

```text
VITE_LOCAL_DEMO_WALLET=false
```

如果合约地址或 RPC 端口发生变化，再在 `.env.product` 中补充：

```text
VITE_WELFARE_FUND_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
VITE_LOCAL_RPC_URL=http://127.0.0.1:8545
```

未显式配置时，前端会使用 `frontend/src/chain.ts` 中的同值默认地址和 RPC。

## 配置 MetaMask

添加本地网络：

| 配置项 | 值 |
|---|---|
| Network name | GoodFund Localhost |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

演示账户：

| 角色 | Anvil 顺序 | 地址 |
|---|---|---|
| Manager | 第 1 个账户 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Donor A | 第 2 个账户 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Donor B | 第 3 个账户 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |

建议把三个 Anvil 账户导入同一个 MetaMask，通过账户切换完成演示。第二个 Chrome 配置或多个 Chrome 窗口可能造成内存不足。

## 演示流程

1. 使用 Manager 打开页面，确认不显示捐款表单。
2. 切换到 Donor A，输入 `1000 USD` 并捐款，实际结算为 `0.5 test ETH`。
3. 切换到 Donor B，输入 `1000 USD` 并捐款。
4. 切回 Manager，填写用途、`800 USD` 和内置审批材料，提交提案。
5. 切换到 Donor A，打开审批材料并核对哈希，然后点击 Approve。
6. 确认一票时为 50%，状态仍为 Awaiting approval。
7. 切换到 Donor B 并点击 Approve，确认进入 Ready to disburse。
8. 切回 Manager，执行拨款并提交执行凭证哈希。
9. 确认 current tranche 增加，状态回到 Funding。

详细预期结果见 [DEMO_ACCEPTANCE.md](DEMO_ACCEPTANCE.md)。

## 重置到初始状态

Anvil 默认不持久化链上状态。停止并重新启动 Anvil 即可清除捐款、提案和投票记录：

```powershell
# 停止当前 Anvil 进程后，重新启动
anvil --host 127.0.0.1 --port 8545 --chain-id 31337
```

随后必须重新部署合约：

```powershell
cd contracts
forge create src/WelfareFund.sol:WelfareFund `
  --rpc-url http://127.0.0.1:8545 `
  --private-key $env:ANVIL_MANAGER_PRIVATE_KEY `
  --broadcast `
  --constructor-args 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

重置后的预期链上状态：

- 合约余额：`0`
- total received：`0`
- registered donors：`0`
- current tranche：`1`
- phase：`Funding`
- pending / queued transactions：`0 / 0`

## MetaMask 交易一直等待确认

链重置后，MetaMask 可能继续使用重置前的本地 nonce。此时交易会停留在 Anvil 的 queued 队列，不会进入区块。

处理步骤：

1. 切换到出现问题的账户。
2. 打开 `Settings > Advanced > Clear activity tab data`。
3. 对 Manager、Donor A 和 Donor B 分别执行一次。
4. 关闭旧的 `Transaction submitted` 提示。
5. 刷新 GoodFund 页面后重新操作。

前端交易确认等待上限为 90 秒。超时后会停止转圈并提示检查 MetaMask 活动和 nonce。

## 测试与构建

合约测试：

```powershell
cd contracts
forge test -vv
```

当前预期结果：`7 passed, 0 failed`。

前端构建：

```powershell
cd frontend
npm run build
```

构建应成功。当前主包体积警告不会阻止演示，但后续正式产品应进行代码拆分。

## 已知限制

- 只支持一个固定演示项目，不包含项目发布和多项目选择。
- 金额前端固定按 `1 ETH = 2,000 USD` 展示，链上仍使用 test ETH。
- 自定义审批材料只保存在当前浏览器；跨浏览器应使用内置样例。
- 执行凭证只记录 SHA-256，没有文件存储或 IPFS 地址。
- Manager 捐款入口只在界面隐藏，合约仍允许 Manager 直接调用 `deposit()`。
- 暂无投票截止、退款、稳定币、事件索引、正式通知和管理员多签。
- 该系统适合课程项目的本地链 MVP 演示，不具备生产资金托管资质。

## 提交前检查

- 不提交 `.idea/`、`.playwright-cli/`、临时构建目录或个人环境文件。
- 不提交私钥、助记词、MetaMask 密码或浏览器配置。
- 复核 `README.md`、`PRODUCT.md` 和验收文档与实际界面一致。
- 保持 `feat/local-chain-demo` 独立，未经团队确认不要合并 `main`。
- push 后由另一位成员从远端重新拉取并执行一次启动检查。
