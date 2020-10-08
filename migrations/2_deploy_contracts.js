const Token = artifacts.require("UniLendToken")
const TokenVesting = artifacts.require("UniLendTokenVesting")

const SCALING_FACTOR = web3.utils.toBN(10 ** 18)

module.exports = async function(deployer) {
  deployer
  .then(async () => {
    let totalSupply = web3.utils.toBN(100000000)
    let vestingSupply = web3.utils.toBN(89200000)
    totalSupply = totalSupply.mul(SCALING_FACTOR)
    vestingSupply = vestingSupply.mul(SCALING_FACTOR)

    // Deploy token contract
    await deployer.deploy(
      Token,
      "UniLend Finance Token",
      "UFT",
      totalSupply
    )
    const tokenContract = await Token.deployed()
    console.log("Token deployement done:", Token.address)

    // Deploy vesting contract
    await deployer.deploy(TokenVesting, Token.address)
    const VestingContract = await TokenVesting.deployed()
    console.log("Vesting deployement done", VestingContract.address)

    // Transfer funds to vesting contract
    await tokenContract.transfer(VestingContract.address, vestingSupply)
    console.log("transfer done")
    
  })
}
