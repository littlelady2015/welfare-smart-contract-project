# GoodFund 产品演示版手工验收

## 当前环境

- 前端：http://127.0.0.1:5173/
- Anvil RPC：http://127.0.0.1:8545
- Chain ID：31337
- 合约：`0x5FbDB2315678afecb367f032d93F642f64180aa3`
- 演示汇率：`1 ETH = 2,000 USD`
- 初始状态：余额 0、累计收到 0、捐赠者 0、current tranche 1、Funding

MetaMask 使用同一个窗口切换账户：

| 角色 | 账户名称 | 地址 |
|---|---|---|
| 执行方 | Admin | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| 捐赠者 A | Donor A | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| 捐赠者 B | Donor B | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |

## 主流程

1. 使用执行方账户打开首页。确认不显示捐款表单，只显示钱包连接和执行方提案控制。
2. 切换到 Donor A，输入 `1000 USD` 并捐款。确认页面显示结算为 `0.5 test ETH`，登记捐赠者为 1。
3. 切换到 Donor B，再捐 `1000 USD`。确认合约余额和累计收到均为 `$2,000`，登记捐赠者为 2。
4. 切回执行方。填写用途，输入 `800 USD`，点击 `Use sample approval pack`，再点击 `Propose $800 payout`。
5. 确认状态为 `Awaiting approval`，页面显示审批材料、SHA-256 和真实提案编号，同时捐款表单消失。
6. 切换到 Donor A。打开审批材料，点击 `Verify file hash`，确认显示 `Verified`，然后点击 `Approve`。
7. 确认赞成比例为 50%，状态仍为 `Awaiting approval`，拨款按钮不可执行。
8. 切换到 Donor B 并点击 `Approve`。确认赞成比例为 100%，状态变为 `Ready to disburse`。
9. 切回执行方，点击 `Execute payout`。确认状态变为 `Awaiting execution report`，合约余额减少 `$800`。
10. 点击 `Verify sample file`，再点击 `Confirm execution & open tranche 2`。
11. 确认状态回到 `Funding`、current tranche 为 2，并出现最新执行凭证哈希。

## 失败场景

- 主流程第一票之后，Donor A 的 Approve/Oppose 按钮应禁用，并显示该地址已经投票。
- 两个捐赠者场景下，如果 Donor A 在首次投票时选择 Oppose，反对比例为 50%，提案应立即拒绝并回到 Funding，current tranche 不增加。
- 提案被拒绝后，执行方首页和 Approval Flow 应显示最近一次拒通知，包括提案编号、用途、金额、赞成/反对票数、拒绝原因和交易哈希。
- 执行前把提案金额设为 `5000 USD`，点击提案应显示超过合约余额的错误，链上状态不变。
- 未达到投票阈值时，执行方不能执行拨款。
- 拨款已执行但未提交执行凭证时，不能申请下一笔拨款。
- 审批材料哈希与链上值不一致时，捐赠者页面应显示 `Mismatch`。

## 角色与页面检查

- 执行方侧栏显示 Donors、Funding Projects、Approval Flow、Fund Contract。
- 捐赠者侧栏只显示 Funding Projects。
- 捐赠者看不到 Notify donors、Approval Flow 或 Executor controls。
- 执行方看不到捐款表单。
- Donors 页面只显示实际登记的 Donor A 和 Donor B。
- Approval Flow 页面显示当前链上提案、材料、票数和阈值。
- Fund Contract 页面显示 Localhost 31337、真实地址、余额和最新执行凭证。

## 最终状态

手工验收完成后，系统会保留真实链上结果。需要重新演示时，应重启 Anvil、重新部署同一合约地址并刷新页面。服务重启与合约部署由执行助手完成。

## 链重置后 MetaMask 交易一直等待确认

这是钱包缓存 nonce 与全新链不一致造成的，不是捐款或合约逻辑错误。链上余额和捐赠者仍为 0，而 MetaMask 可能继续使用重置前的 nonce，导致交易进入 Anvil 的 `queued` 队列。

修复方法：

1. 在 MetaMask 中切换到出现问题的账户，例如 Donor A。
2. 打开 `Settings > Advanced > Clear activity tab data`。
3. 确认清除当前账户在此网络上的活动与 nonce 缓存。
4. 对 Donor B 和执行方账户重复一次。
5. 关闭 MetaMask 中旧的 `Transaction submitted` 提示，刷新 GoodFund 页面。
6. 再点击一次捐款；该笔交易应从正确的 nonce 开始并立即被 Anvil 确认。

如果页面等待 90 秒仍未确认，前端现在会停止转圈并显示 nonce 或活动记录提示。
