const Token = artifacts.require("./contracts/UniLendToken.sol")
const { bufferToHex, keccakFromString, ecsign, toBuffer } = require('ethereumjs-util')
const { getPermitHash } = require("./utils/permitUtils")

const BigNumber = web3.utils.BigNumber



// Note: this is test only, please don't do this in prod ;-)
const privateKey = "0x1361196f27b43e439151b8ed56e932c2a60df55ba4c7a0adedcc60bd5997bed6"



async function assertRevert(promise, errorMessage = null) {
  try {
    const tx = await promise
    const receipt = await web3.eth.getTransactionReceipt(tx.tx)
    if (receipt.gasUsed >= 6700000) {
      return
    }
  } catch (error) {
    if (errorMessage) {
      assert(
        error.message.search(errorMessage) >= 0,
        `Expected ${errorMessage} `
      )
    }
    const invalidOpcode = error.message.search("revert") >= 0
    assert(invalidOpcode, "Expected revert, got '" + error + "' instead")
    return
  }
  assert.ok(false, 'Error containing "revert" must be returned')
}

const toWei = web3.utils.toWei

require("chai")
  .use(require("chai-bignumber")(BigNumber))
  .should()

contract("Token", async accounts => {
  let owner = accounts[0]
  let token
  let initialBalance = toWei("100000000")

  let setup = async function() {
    token = await Token.new("UniLend Finance Token", "UFT", initialBalance, {
      from: owner
    })
  }

  describe("Setup: totalsupply, permit", function() {
    beforeEach(setup)
    it("returns the total amount of tokens", async function() {
      const total = await token.totalSupply.call()
      const balance = await token.balanceOf.call(owner)
      assert.equal(total.toString(), initialBalance)
      assert.equal(balance.toString(), initialBalance)
    })
    it("returns correct permit hash", async function() {
      assert.equal(await token.PERMIT_TYPEHASH(),
      bufferToHex(keccakFromString('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)'))
      )
    })
  })

  describe("transfer", function() {
    beforeEach(setup)
    it("should successfully transfer 1 wei", async function() {
      const amount = toWei("1")
      await token.transfer(accounts[1], amount)
      const destBalance = await token.balanceOf.call(accounts[1])
      assert.equal(destBalance.toString(), amount.toString())
    })

    it("should successfully transfer full balance", async function() {
      await token.transfer(accounts[1], initialBalance)
      const destBalance = await token.balanceOf.call(accounts[1])
      assert.equal(destBalance.toString(), initialBalance.toString())
    })

    it("should fail to transfer amount exceeding balance", async function() {
      const amount = toWei("100000001")
      await assertRevert(token.transfer(accounts[1], amount))
    })
  })

  describe("Rescue funds", function() {
    beforeEach(setup)
    it("Should be able to get accidentally sent tokens back", async function() {
      let usdc = await Token.new("USD coin", "USDC", initialBalance, {
        from: owner
      })
      const user = accounts[1]
      const amount = toWei("100")
      // Transfer 100 usdc to user
      await usdc.transfer(user, amount)
      assert.equal(await usdc.balanceOf.call(user), amount)
      // User transferred 100 usdc to UFT contract accidentally
      await usdc.transfer(token.address, amount, { from:user })
      assert.equal(await usdc.balanceOf.call(token.address), amount)
      assert.equal(await usdc.balanceOf.call(user), '0')
      // Rescue user funds
      await token.rescueTokens(usdc.address, user, amount)
      assert.equal(await usdc.balanceOf.call(user), amount)
    })
  })

  describe("permit function", function() {
    beforeEach(setup)
    it('permit', async function() {
      const user1 = accounts[1]
      const amount = 100
      const nonce = await token.nonces(owner)
      const deadline = web3.utils.toBN(99999999999999) // random timestamp in future
      const hash = await getPermitHash(
        token,
        owner,
        user1,
        amount,
        nonce,
        deadline
      )
      
      const sig = ecsign(toBuffer(hash), toBuffer(privateKey))
      let result = await token.permit(owner, user1, amount, deadline, sig.v, sig.r, sig.s)
      const approvalLog = result.logs[0]
      assert.equal(approvalLog.args.owner, owner)
      assert.equal(approvalLog.args.spender, user1)
      assert.equal(approvalLog.args.value, amount)
    })

    it('permit: wrong data', async function() {
      const user1 = accounts[1]
      const amount = 100
      const nonce = await token.nonces(owner)
      const deadline = web3.utils.toBN(99999999999999) // random timestamp in future
      const hash = await getPermitHash(
        token,
        owner,
        user1,
        amount,
        nonce,
        deadline
      )
      
      const sig = ecsign(toBuffer(hash), toBuffer(privateKey))
      await assertRevert(token.permit(user1, owner, amount, deadline, sig.v, sig.r, sig.s))
    })

  })
})
