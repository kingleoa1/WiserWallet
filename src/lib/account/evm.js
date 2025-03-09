import { getEvmPrivateKey } from "@mybucks.online/core";
import { tokens as defaultTokensList } from "@uniswap/default-token-list";
import { Alchemy, WalletConnectProvider } from "alchemy-sdk";
import { ethers, Contract } from "ethers";
import WalletConnect from "@walletconnect/client";
import QRCodeModal from "qrcode-modal";

import { EVM_NETWORKS, NETWORK } from "@mybucks/lib/conf";
import IERC20 from "@mybucks/lib/erc20.json";

const alchemyApiKey = import.meta.env.VITE_ALCHEMY_API_KEY;
const infuraApiKey = import.meta.env.VITE_INFURA_API_KEY;

class EvmAccount {
  network = NETWORK.EVM;
  chainId = null;
  networkInfo = null;

  signer = null;
  account = null;
  provider = null;

  address = null;

  // evm account is activated as default
  activated = true;

  // wei unit
  gasPrice = 0;

  alchemyClient = null;
  walletConnectProvider = null;
  walletConnectConnector = null;

  constructor(hashKey, chainId) {
    this.chainId = chainId;
    this.networkInfo = EVM_NETWORKS.find((n) => n.chainId === chainId);

    if (this.networkInfo.name === NETWORK.WALLET_CONNECT) {
      this.provider = this.initWalletConnect();
    } else {
      this.provider = new ethers.JsonRpcProvider(this.networkInfo.provider);
    }

    this.signer = getEvmPrivateKey(hashKey);
    this.account = new ethers.Wallet(this.signer, this.provider);
    this.address = this.account.address;

    this.alchemyClient = new Alchemy({
      network: this.networkInfo.networkId,
      apiKey: alchemyApiKey,
    });
  }

  isAddress(value) {
    return ethers.isAddress(value);
  }

  linkOfAddress(address) {
    return this.networkInfo.scanner + "/address/" + address;
  }

  linkOfContract(address) {
    return this.networkInfo.scanner + "/address/" + address + "#code";
  }

  linkOfTransaction(txn) {
    return this.networkInfo.scanner + "/tx/" + txn;
  }

  initWalletConnect() {
    const provider = new WalletConnectProvider({
      infuraId: infuraApiKey,
    });

    const connector = new WalletConnect({
      bridge: "https://bridge.walletconnect.org",
      qrcodeModal: QRCodeModal,
    });

    this.walletConnectProvider = provider;
    this.walletConnectConnector = connector;

    return provider;
  }

  async connectWalletConnect() {
    if (!this.walletConnectConnector.connected) {
      await this.walletConnectConnector.createSession();
    }
  }

  async getNetworkStatus() {
    if (this.networkInfo.name === NETWORK.WALLET_CONNECT) {
      const { gasPrice } = await this.walletConnectProvider.getFeeData();
      this.gasPrice = gasPrice;
    } else {
      const { gasPrice } = await this.provider.getFeeData();
      this.gasPrice = gasPrice;
    }
  }

  async queryBalances() {
    // get balances
    const [nativeBalance, { tokenBalances }] = await Promise.all([
      this.provider.getBalance(this.address),
      this.alchemyClient.core.getTokenBalances(this.address),
    ]);

    // get balances of native token, erc20 tokens and merge into single array
    // it uses wrapped asset in order to get the price of native currency
    tokenBalances.unshift({
      contractAddress: this.networkInfo.wrappedAsset,
      tokenBalance: nativeBalance,
      native: true,
    });

    // Add USDC, USDT, and USD balances if available
    const usdcBalance = await this.getTokenBalance("USDC");
    const usdtBalance = await this.getTokenBalance("USDT");
    const usdBalance = await this.getTokenBalance("USD");
    if (usdcBalance) {
      tokenBalances.push({
        symbol: "USDC",
        contractAddress: this.networkInfo.usdc,
        tokenBalance: usdcBalance,
      });
    }
    if (usdtBalance) {
      tokenBalances.push({
        symbol: "USDT",
        contractAddress: this.networkInfo.usdt,
        tokenBalance: usdtBalance,
      });
    }
    if (usdBalance) {
      tokenBalances.push({
        symbol: "USD",
        contractAddress: this.networkInfo.usd,
        tokenBalance: usdBalance,
      });
    }

    // find token details including name, symbol, decimals
    // and filter out not-listed (spam) tokens
    const filteredBalances = tokenBalances
      .map(({ contractAddress, tokenBalance, native }) => ({
        ...defaultTokensList.find(
          ({ address }) =>
            address.toLowerCase() === contractAddress.toLowerCase()
        ),
        rawBalance: tokenBalance,
        native,
      }))
      .filter((t) => !!t.address)
      .map((t) => ({
        ...t,
        balance: parseFloat(ethers.formatUnits(t.rawBalance, t.decimals)),
      }))
      .filter((t) => t.native || t.balance > 0);

    // get prices
    const response = await fetch(
      `https://api.alchemy.com/prices/v1/${alchemyApiKey}/tokens/by-address`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          addresses: filteredBalances.map(({ address }) => ({
            network: this.networkInfo.networkId,
            address,
          })),
        }),
      }
    );
    const { data: rawPrices } = await response.json();
    // converts key:value pair of address and latest price
    const prices = rawPrices
      .filter((t) => !t.error)
      .reduce(
        (acc, t) => ({ ...acc, [t.address.toLowerCase()]: t.prices[0].value }),
        {}
      );

    const balances = filteredBalances.map((t) => ({
      ...t,
      price: parseFloat(prices[t.address.toLowerCase()]),
      quote: t.balance * parseFloat(prices[t.address.toLowerCase()]),
    }));

    // remove `wrapped` for native currency
    balances[0].address = "0x";
    balances[0].name = balances[0].name.split(" ")[1];
    balances[0].symbol = balances[0].symbol.slice(1);

    return balances;
  }

  async getTokenBalance(symbol) {
    const token = defaultTokensList.find((t) => t.symbol === symbol);
    if (!token) return null;

    const tokenBalance = await this.alchemyClient.core.getTokenBalance(
      this.address, token.address
    );
    return tokenBalance;
  }

  async queryTokenHistory(tokenAddress, decimals, maxCount = 5) {
    const { transfers: rxTransfers } =
      await this.alchemyClient.core.getAssetTransfers({
        category: [tokenAddress ? "erc20" : "external"],
        order: "desc",
        withMetadata: true,
        toAddress: this.address,
        excludeZeroValue: true,
        contractAddresses: tokenAddress ? [tokenAddress] : undefined,
        maxCount,
      });
    const { transfers: txTransfers } =
      await this.alchemyClient.core.getAssetTransfers({
        category: [tokenAddress ? "erc20" : "external"],
        order: "desc",
        withMetadata: true,
        fromAddress: this.address,
        excludeZeroValue: true,
        contractAddresses: tokenAddress ? [tokenAddress] : undefined,
        maxCount,
      });

    const transfers = [...rxTransfers, ...txTransfers];
    transfers.sort(
      (a, b) => parseInt(b.blockNum, 16) - parseInt(a.blockNum, 16)
    );

    return transfers
      .map(
        ({
          from,
          to,
          value,
          hash,
          blockNum,
          metadata: { blockTimestamp },
          rawContract,
        }) => ({
          hash,
          from,
          to,
          value:
            value ||
            parseFloat(ethers.formatUnits(rawContract.value, decimals)),
          blockNum,
          blockTimestamp,
        })
      )
      .slice(0, maxCount);
  }

  async populateTransferToken(token, to, value) {
    if (!token) {
      return {
        to,
        value,
        data: null,
      };
    }

    const erc20 = new Contract(token, IERC20.abi, this.provider);
    const result = await erc20
      .connect(this.account)
      .transfer.populateTransaction(to, value);
    return result;
  }

  async estimateGas({ to, data, value = 0, from = this.address }) {
    if (this.networkInfo.name === NETWORK.WALLET_CONNECT) {
      return await this.walletConnectProvider.estimateGas({ to, data, value, from });
    } else {
      return await this.provider.estimateGas({ to, data, value, from });
    }
  }

  async execute({ to, data, value = 0, gasPrice = null, gasLimit = null }) {
    if (this.networkInfo.name === NETWORK.WALLET_CONNECT) {
      const tx = await this.walletConnectProvider.sendTransaction({
        to,
        value,
        data,
        gasPrice,
        gasLimit,
      });
      return await tx.wait();
    } else {
      const tx = await this.account.sendTransaction({
        to,
        value,
        data,
        gasPrice,
        gasLimit,
      });
      return await tx.wait();
    }
  }
}

export default EvmAccount;
