import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { isValidSuiAddress } from "@mysten/sui/utils";

import type { WalletFacts } from "@/types/reputation";

const MIST_PER_SUI = 1_000_000_000;

export function validateSuiAddress(address: string) {
  return isValidSuiAddress(address.trim());
}

export function getSuiClient() {
  return new SuiClient({
    url: process.env.SUI_RPC_URL || getFullnodeUrl("mainnet")
  });
}

export async function fetchWalletFacts(address: string): Promise<WalletFacts> {
  const client = getSuiClient();
  const normalizedAddress = address.trim();

  const [balance, ownedObjects, coins, outgoingTransactions, incomingTransactions] = await Promise.all([
    client.getBalance({ owner: normalizedAddress }),
    client.getOwnedObjects({
      owner: normalizedAddress,
      limit: 50,
      options: {
        showType: true,
        showContent: true,
        showDisplay: true,
        showOwner: true
      }
    }),
    client.getCoins({
      owner: normalizedAddress,
      limit: 50
    }),
    client.queryTransactionBlocks({
      filter: { FromAddress: normalizedAddress },
      limit: 50,
      order: "descending",
      options: {
        showBalanceChanges: true,
        showEffects: true,
        showInput: true
      }
    }),
    client.queryTransactionBlocks({
      filter: { ToAddress: normalizedAddress },
      limit: 50,
      order: "descending",
      options: {
        showBalanceChanges: true,
        showEffects: true,
        showInput: true
      }
    })
  ]);

  const allTransactions = [...outgoingTransactions.data, ...incomingTransactions.data];
  const timestamps = allTransactions
    .map((transaction) => Number(transaction.timestampMs))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
    .sort((a, b) => a - b);

  const uniqueDays = new Set(timestamps.map((timestamp) => new Date(timestamp).toISOString().slice(0, 10)));
  const counterparties = new Set<string>();

  for (const transaction of allTransactions) {
    const sender = transaction.transaction?.data.sender;
    if (sender && sender !== normalizedAddress) {
      counterparties.add(sender);
    }

    for (const change of transaction.balanceChanges ?? []) {
      const owner = change.owner;
      if (
        owner &&
        typeof owner === "object" &&
        "AddressOwner" in owner &&
        owner.AddressOwner !== normalizedAddress
      ) {
        counterparties.add(owner.AddressOwner);
      }
    }
  }

  const ownedTypes = ownedObjects.data
    .map((object) => object.data?.type)
    .filter((type): type is string => Boolean(type));

  const coinTypes = new Set(coins.data.map((coin) => coin.coinType));
  const nftLikeObjectCount = ownedTypes.filter(
    (type) => !type.includes("::coin::Coin<") && !type.toLowerCase().includes("coin")
  ).length;

  const lastTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : undefined;

  return {
    address: normalizedAddress,
    suiBalance: Number(balance.totalBalance) / MIST_PER_SUI,
    objectCount: ownedObjects.data.length,
    coinObjectCount: coins.data.length,
    nftLikeObjectCount,
    transactionCount: new Set(allTransactions.map((transaction) => transaction.digest)).size,
    incomingTransactions: incomingTransactions.data.length,
    outgoingTransactions: outgoingTransactions.data.length,
    activeDays: uniqueDays.size,
    firstSeen: timestamps[0] ? new Date(timestamps[0]).toISOString() : null,
    lastSeen: lastTimestamp ? new Date(lastTimestamp).toISOString() : null,
    distinctCounterparties: counterparties.size,
    tokenTypes: [...coinTypes].slice(0, 12),
    recentDigestSample: allTransactions.slice(0, 6).map((transaction) => transaction.digest)
  };
}
