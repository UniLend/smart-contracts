pragma solidity 0.6.2;

import { ERC20 } from "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "openzeppelin-solidity/contracts/access/Ownable.sol";

import { ERC20Permit } from "./ERC20Permit/ERC20Permit.sol";

/**
 * @title UniLendToken
 * @dev UniLend ERC20 Token
 */
contract UniLendToken is ERC20Permit,  Ownable {
    constructor (string memory name, string memory symbol, uint256 totalSupply)
    public
    ERC20 (name, symbol) {
        _mint(msg.sender, totalSupply);
    }

    /**
     * @notice Function to rescue funds
     * Owner is assumed to be governance or UFT trusted party to helping users
     * Funtion can be disabled by destroying ownership via `renounceOwnership` function
     * @param token Address of token to be rescued
     * @param destination User address
     * @param amount Amount of tokens
     */
    function rescueTokens(address token, address destination, uint256 amount) external onlyOwner {
        require(token != destination, "Invalid address");
        require(ERC20(token).transfer(destination, amount), "Retrieve failed");
    }
}
