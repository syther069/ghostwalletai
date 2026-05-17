import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { isValidSuiAddress } from "@mysten/sui/utils";

import type { MoveCallFact, WalletFacts } from "@/types/reputation";

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
  const balanceChangeAmountsSui: number[] = [];

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

      const amount = Math.abs(Number(change.amount) / MIST_PER_SUI);
      if (Number.isFinite(amount)) {
        balanceChangeAmountsSui.push(amount);
      }
    }
  }

  const ownedTypes = ownedObjects.data
    .map((object) => object.data?.type)
    .filter((type): type is string => Boolean(type));

  const coinTypes = new Set(coins.data.map((coin) => coin.coinType));
  const moveCalls = allTransactions.flatMap((transaction) =>
    extractMoveCalls(transaction.transaction?.data.transaction)
  );
  const protocolCount = new Set(moveCalls.map(getProtocolLabel)).size;
  const swapCount = moveCalls.filter(isSwapMoveCall).length;
  const defiInteractionCount = moveCalls.filter(isDefiMoveCall).length;
  const stakingObjectCount = ownedTypes.filter((type) => type.toLowerCase().includes("stake")).length;
  const liquidityObjectCount = ownedTypes.filter((type) => {
    const lowerType = type.toLowerCase();
    return lowerType.includes("pool") || lowerType.includes("liquidity") || lowerType.includes("lp");
  }).length;
  const largestBalanceChangeSui = Math.max(0, ...balanceChangeAmountsSui);
  const averageBalanceChangeSui =
    balanceChangeAmountsSui.length > 0
      ? balanceChangeAmountsSui.reduce((sum, amount) => sum + amount, 0) / balanceChangeAmountsSui.length
      : 0;
  const largeTransferCount = balanceChangeAmountsSui.filter((amount) => amount >= 1_000).length;
  const stablecoinRatio =
    coinTypes.size > 0
      ? [...coinTypes].filter((coinType) => /usdc|usdt|usd|stable/i.test(coinType)).length / coinTypes.size
      : 0;
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
    recentDigestSample: allTransactions.slice(0, 6).map((transaction) => transaction.digest),
    moveCalls: moveCalls.slice(0, 40),
    protocolCount,
    swapCount,
    defiInteractionCount,
    stakingObjectCount,
    liquidityObjectCount,
    largeTransferCount,
    averageBalanceChangeSui,
    largestBalanceChangeSui,
    stablecoinRatio
  };
}

function extractMoveCalls(transactionKind: unknown): MoveCallFact[] {
  const commands = getProgrammableCommands(transactionKind);

  return commands.flatMap((command) => {
    const moveCall = readMoveCall(command);
    if (!moveCall) {
      return [];
    }

    return [
      {
        packageId: readString(moveCall.package) ?? readString(moveCall.packageId) ?? "unknown",
        module: readString(moveCall.module) ?? "unknown",
        function: readString(moveCall.function) ?? "unknown"
      }
    ];
  });
}

function getProgrammableCommands(value: unknown): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  if (Array.isArray(value.transactions)) {
    return value.transactions;
  }

  const programmable = value.ProgrammableTransaction;
  if (isRecord(programmable) && Array.isArray(programmable.transactions)) {
    return programmable.transactions;
  }

  return [];
}

function readMoveCall(command: unknown): Record<string, unknown> | null {
  if (!isRecord(command)) {
    return null;
  }

  if (isRecord(command.MoveCall)) {
    return command.MoveCall;
  }

  if (readString(command.kind) === "MoveCall") {
    return command;
  }

  return null;
}

function isSwapMoveCall(call: MoveCallFact) {
  const text = `${call.packageId} ${call.module} ${call.function}`.toLowerCase();
  return /swap|deepbook|cetus|turbos|kriya|flowx|aftermath|hop|bluefin/.test(text);
}

function isDefiMoveCall(call: MoveCallFact) {
  const text = `${call.packageId} ${call.module} ${call.function}`.toLowerCase();
  return /lend|borrow|stake|staking|vault|pool|liquidity|lp|deepbook|cetus|turbos|kriya|scallop|navi|bucket/.test(
    text
  );
}

function getProtocolLabel(call: MoveCallFact) {
  const text = `${call.packageId}:${call.module}`.toLowerCase();
  const knownProtocol = ["deepbook", "cetus", "turbos", "kriya", "flowx", "aftermath", "scallop", "navi", "bucket"].find(
    (protocol) => text.includes(protocol)
  );

  return knownProtocol ?? `${call.packageId.slice(0, 10)}:${call.module}`;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
