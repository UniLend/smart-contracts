const Token = artifacts.require("./contracts/UniLendToken.sol")
const Vesting = artifacts.require("./contracts/UniLendTokenVesting.sol")
const BigNumber = web3.utils.BigNumber

const SCALING_FACTOR = web3.utils.toBN(10 ** 18)
const toWei = web3.utils.toWei
async function increaseBlockTime(seconds) {
  return web3.currentProvider.send(
    {
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [seconds],
      id: new Date().getTime()
    },
    () => {}
  )
}
async function mineOneBlock() {
  return web3.currentProvider.send(
    {
      jsonrpc: "2.0",
      method: "evm_mine",
      id: new Date().getTime()
    },
    () => {}
  )
}

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

require("chai")
  .use(require("chai-bignumber")(BigNumber))
  .should()

contract("Token", async accounts => {
  let owner = accounts[0]
  let token
  let vesting
  const vestedSupply = web3.utils.toBN(10800000).mul(SCALING_FACTOR)
  const vestingSupply = web3.utils.toBN(89200000).mul(SCALING_FACTOR)
  const totalSupply = vestedSupply.add(vestingSupply)

  describe("Token Vesting", function() {
    beforeEach(async function() {
      // deploy token contract
      token = await Token.new("UniLend Finance Token", "UFT", totalSupply, {
        from: owner
      })
      const total = await token.totalSupply.call()
      // deploy vesting contract
      vesting = await Vesting.new(token.address, { from: owner })
      assert.equal((await vesting.token()).toString(), token.address.toString())
      // trasnferring tokens to vesting contract
      await token.transfer(vesting.address, vestingSupply, { from: owner })
      // vesting.transferOwnership(multisig Address)
    })

    it("should test token vesting for userX", async function() {
      const amount = toWei("10")
      let block = await web3.eth.getBlock("latest")
      let blockTime = block.timestamp
      let time = new Date(blockTime)
      time.setMinutes(time.getMinutes() + 6)
      time = +time
      let result = await vesting.addVesting(
        accounts[1],
        time.toString(),
        amount,
        {
          from: accounts[0]
        }
      )
      await token.transfer(vesting.address, amount, {
        from: owner
      })
      let balance = await vesting.vestingAmount(
        result.receipt.logs[0].args.vestingId
      )
      assert.equal(balance.toString(), amount.toString())

      // "Tokens have not vested yet"
      await assertRevert(
        vesting.release(result.receipt.logs[0].args.vestingId),
        "Tokens have not vested yet"
      )

      // Time travel
      let seconds = 60 * 6000
      await increaseBlockTime(seconds)
      await mineOneBlock()
      // test release
      await vesting.release(result.receipt.logs[0].args.vestingId)
      balance = await token.balanceOf.call(accounts[1])
      assert.equal(balance.toString(), amount.toString())
    })

    it("should test addVesting data", async function() {
      const vestingAmount = toWei("10")
      const beneficiary = accounts[1]
      const block = await web3.eth.getBlock("latest")
      const blockTime = block.timestamp
      let time = new Date(blockTime)
      time.setMinutes(time.getMinutes() + 6)
      time = +time
      let result = await vesting.addVesting(
        accounts[1],
        time.toString(),
        vestingAmount,
        {
          from: accounts[0]
        }
      )
      const vestingId = +result.logs[0].args.vestingId
      assert.equal(await vesting.vestingAmount(vestingId), vestingAmount)
      assert.equal(await vesting.releaseTime(vestingId), time)
      assert.equal(await vesting.beneficiary(vestingId), beneficiary)
    })

    it("Removing a vesting entry with the owner account", async function() {
      let result = await vesting.removeVesting(3, { from: owner })
      const excessTokens = result.receipt.logs[0].args["2"]
      let balance = await token.balanceOf.call(owner)
      assert.equal(balance.toString(), vestedSupply.toString()) // initial tokens

      await vesting.retrieveExcessTokens(excessTokens, {
        from: owner
      })
      const expectedBalance = excessTokens.add(balance).toString()
      balance = await token.balanceOf.call(owner)
      assert.equal(balance.toString(), expectedBalance)
    })

    it("Removing a vesting entry with a non-owner account", async function() {
      await assertRevert(vesting.removeVesting(4, { from: accounts[1] })) //""
    })

    it("Trying to remove a non-existent vesting entry", async function() {
      await assertRevert(
        vesting.removeVesting(53, { from: owner }),
        "Invalid vesting id"
      )
    })

    it("Trying to remove an already released vesting entry", async function() {
      // Time travel
      let seconds = 30 * 86400 * 1000
      await increaseBlockTime(seconds)
      await mineOneBlock()
      await vesting.release(1, { from: owner })
      await assertRevert(
        vesting.release(1, { from: owner }),
        "Vesting already released"
      )
    })

    it("Trying to remove an already removed vesting entry", async function() {
      await vesting.removeVesting(3)
      await assertRevert(
        vesting.removeVesting(3, { from: owner }),
        "Vesting already released"
      )
    })

    it("Trying to add a vesting entry from a non-owner account", async function() {
      const amount = toWei("10")
      let block = await web3.eth.getBlock("latest")
      let blockTime = block.timestamp
      let time = new Date(blockTime)
      time.setMinutes(time.getMinutes() + 6)
      time = +time
      await assertRevert(
        vesting.addVesting(accounts[1], "" + time, amount, {
          from: accounts[1]
        })
      )
    })

    it("should test token vesting for amount greater then balance of vesting contract", async function() {
      const amount = toWei((10 ** 11).toString()) // big number then total tokens in vesting
      let block = await web3.eth.getBlock("latest")
      let blockTime = block.timestamp
      let time = new Date(blockTime)
      time.setMinutes(time.getMinutes() + 1)
      time = +time
      let result = await vesting.addVesting(
        accounts[1],
        time.toString(),
        amount,
        {
          from: accounts[0]
        }
      )
      // Time travel
      let seconds = 60 * 1000
      await increaseBlockTime(seconds)
      await mineOneBlock()

      //Insufficient balance
      await assertRevert(
        vesting.release(result.receipt.logs[0].args.vestingId),
        "Insufficient balance"
      )
      await vesting.removeVesting(result.receipt.logs[0].args.vestingId, {
        from: owner
      })
    })

    it("Trying to release the tokens associated with existing vesting entry", async function() {
      let amount = await token.balanceOf(vesting.address)
      await assertRevert(vesting.retrieveExcessTokens(amount, { from: owner }))
    })

    it("should test token vesting for amount exactly equal to the balance of vesting contract", async function() {
      let p = []
      // Time travel
      let second = 10000 * 1560 * 60
      await increaseBlockTime(second)
      await mineOneBlock()

      for (let i = 1; i < 30; i++) {
        p.push(vesting.release(i))
      }
      await Promise.all(p)
      let balanceOfVesting = await token.balanceOf(vesting.address)
      const vestingAmount = await vesting.vestingAmount(30)
      assert.equal(balanceOfVesting.toString(), vestingAmount.toString())
      await vesting.release(30)
      balanceOfVesting = await token.balanceOf(vesting.address)
      assert.equal(balanceOfVesting.toString(), "0")
    })
  })
})
