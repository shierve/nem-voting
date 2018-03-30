import {
    AccountHttp, Transaction, TransactionTypes, Address, NEMLibrary, NetworkTypes,
    MultisigTransaction, TransferTransaction, PlainMessage, BlockHttp, ChainHttp, Block,
    AccountHistoricalInfo, AccountInfoWithMetaData, ServerConfig, TimeWindow, XEM,
    SignedTransaction, Account, TransactionHttp, NemAnnounceResult, PublicAccount,
} from "nem-library";
import CryptoJS = require("crypto-js");
import { Observable } from "rxjs";

let accountHttp: AccountHttp;
let chainHttp: ChainHttp;
let blockHttp: BlockHttp;
let transactionHttp: TransactionHttp;

const initializeHttp = () => {
    let nodes: ServerConfig[] = [];

    if (NEMLibrary.getNetworkType() === NetworkTypes.TEST_NET) {
        nodes = [
            {protocol: "http", domain: "104.128.226.60", port: 7890},
        ];
    } else if (NEMLibrary.getNetworkType() === NetworkTypes.MAIN_NET) {
        nodes = [
            {protocol: "http", domain: "88.99.192.82", port: 7890},
        ];
    } else {
        throw new Error("Not bootstrapped");
    }

    accountHttp = new AccountHttp(nodes);
    chainHttp = new ChainHttp(nodes);
    blockHttp = new BlockHttp(nodes);
    transactionHttp = new TransactionHttp(nodes);
};

const getTransferTransaction = (transaction: Transaction): TransferTransaction | null => {
    if (transaction.type === TransactionTypes.MULTISIG) {
        return (transaction as MultisigTransaction).otherTransaction as TransferTransaction;
    } else if (transaction.type === TransactionTypes.TRANSFER) {
        return (transaction as TransferTransaction);
    }
    return null;
};

const getAllTransactions = (receiver: Address): Observable<Transaction[]> => {
    initializeHttp();
    const pageable = accountHttp.incomingTransactionsPaginated(receiver, {pageSize: 100});
    return pageable
        .map((allTransactions) => {
            pageable.nextPage();
            return allTransactions.filter((t) => (t.type === TransactionTypes.MULTISIG || t.type === TransactionTypes.TRANSFER));
        }).reduce((acc, page) => {
            return acc.concat(page);
        });
};

const findTransaction = (sender: Address, receiver: Address): Observable<Transaction | null> => {
    return getAllTransactions(receiver)
        .map((transactions) => {
            const filtered = transactions.filter((transaction) => {
                const tt = getTransferTransaction(transaction);
                if (!tt) {
                    return false;
                }
                return (tt.signer!.address === sender);
            });
            if (filtered.length === 0) {
                return null;
            } else {
                return filtered[0];
            }
        });
};

const getTransactionsWithString =
(queryString: string, receiver: Address, sender?: Address, position: number = 0): Observable<TransferTransaction[]> => {
    initializeHttp();
    return accountHttp.incomingTransactions(receiver)
        .map((allTransactions) => {
            // We only want transfer and multisig transactions, and we are only interested in
            // the inner transaction for multisig transactions
            let transactions: TransferTransaction[] = allTransactions
                .filter((t) => (t.type === TransactionTypes.MULTISIG || t.type === TransactionTypes.TRANSFER))
                .map((transaction) => {
                    if (transaction.type === TransactionTypes.MULTISIG) {
                        transaction = (transaction as MultisigTransaction).otherTransaction;
                    }
                    return (transaction as TransferTransaction);
                });
            // filter by sender
            if (sender !== undefined) {
                transactions = transactions.filter((t) => (t.signer !== undefined && t.signer.address === sender));
            }
            // Then we get the messages, we only want the plain messages, not encrypted
            return transactions
                .filter((t) => t.message.isPlain())
                .filter((t) => (t.message as PlainMessage).plain().includes(queryString, position));
        });
};

const getFirstMessageWithString =
(queryString: string, receiver: Address, sender?: Address, position: number = 0): Observable<string | null> => {
    return getTransactionsWithString(queryString, receiver, sender = sender, position = position)
        .map((transactions) => {
            if (transactions.length === 0) {
                return null;
            }
            return (transactions[0].message as PlainMessage).plain();
        });
};

const NEM_EPOCH = Date.UTC(2015, 2, 29, 0, 6, 25, 0);

/**
 * Create a time stamp for a NEM transaction from a given timestamp
 *
 * @param {number} - javascript timestamp in ms
 *
 * @return {number} - The NEM transaction time stamp in milliseconds
 */
const toNEMTimeStamp = (date: number) => {
    return Math.floor((date / 1000) - (NEM_EPOCH / 1000));
};

const getBlockchainHeight = (): Promise<number> => {
    initializeHttp();
    return chainHttp.getBlockchainHeight().first().toPromise();
};

const getBlockByHeight = (height: number): Promise<Block> => {
    initializeHttp();
    return blockHttp.getBlockByHeight(height).first().toPromise();
};

const getLastBlock = (): Promise<Block> => {
    initializeHttp();
    return chainHttp.getBlockchainLastBlock().first().toPromise();
};

/**
 * getHeightByTimestamp(timestamp) returns the last harvested block at the time of the timestamp.
 *
 * @param {integer} timestamp - javascript timestamp in ms
 *
 * @return {promise} - a promise that returns the block height
 */
const getHeightByTimestampPromise = async (timestamp: number): Promise<number> => {
    try {
        // 1.Approximate (60s average block time)
        const nemTimestamp = toNEMTimeStamp(timestamp);
        const now = toNEMTimeStamp((new Date()).getTime());
        const curHeight = await getBlockchainHeight();
        const elapsed = now - nemTimestamp;
        // memoization
        const memo: {[key: number]: Block} = [];
        let foundHeight: number | null = null;
        let lastTimestamp = now;
        let lastHeight = curHeight;
        let lb = 1;
        let ub = curHeight;
        // estimation
        while (foundHeight === null) {
            if (lb === ub) {
                return lb;
            }
            let height = lastHeight + Math.ceil((nemTimestamp - lastTimestamp) / 60);
            if (height < lb) {
                height = lb;
            } else if (height > ub) {
                height = ub;
            }
            const block = (memo[height]) ? memo[height] : await getBlockByHeight(height);
            memo[height] = block;
            if (block.timeStamp <= nemTimestamp) {
                const nextBlock = (memo[height + 1]) ? memo[height + 1] : await getBlockByHeight(height + 1);
                memo[height + 1] = nextBlock;
                // check if target
                if (nextBlock.timeStamp > nemTimestamp) {
                    foundHeight = height;
                } else {
                    lb = height + 1;
                }
            } else {
                ub = height - 1;
            }
            lastHeight = height;
            lastTimestamp = block.timeStamp;
        }
        return foundHeight!;
    } catch (err) {
        throw err;
    }
};

const getHeightByTimestamp = (timestamp: number) => {
    return Observable.fromPromise(getHeightByTimestampPromise(timestamp));
};

const getImportances = (addresses: Address[], block?: number): Observable<number[]> => {
    initializeHttp();
    if (block === undefined || block < 0) {
        return accountHttp.getBatchAccountData(addresses)
            .map((accountsData: AccountInfoWithMetaData[]) => {
                return accountsData.map((account: AccountInfoWithMetaData) => {
                    return account.importance;
                });
            });
    } else {
        return accountHttp.getBatchHistoricalAccountData(addresses, block, block, 1)
            .map((accountsHistoricalInfo: AccountHistoricalInfo[][]) => {
                return accountsHistoricalInfo.map((accountInfo: AccountHistoricalInfo[]) => {
                    return accountInfo[0].importance;
                });
            });
    }
};

const sendMessage = (account: Account, message: string, address: Address): Observable<NemAnnounceResult> => {
    initializeHttp();
    const transferTransaction = TransferTransaction.create(
        TimeWindow.createWithDeadline(),
        address,
        new XEM(0),
        PlainMessage.create(message),
    );
    const signedTransaction = account.signTransaction(transferTransaction);
    return transactionHttp.announceTransaction(signedTransaction);
};

const sendMultisigMessage = (account: Account, multisigAccount: PublicAccount, message: string, address: Address): Observable<NemAnnounceResult> => {
    initializeHttp();
    const transferTransaction = TransferTransaction.create(
        TimeWindow.createWithDeadline(),
        address,
        new XEM(0),
        PlainMessage.create(message),
    );
    const multisigTransaction: MultisigTransaction = MultisigTransaction.create(
        TimeWindow.createWithDeadline(),
        transferTransaction,
        multisigAccount,
    );
    const signedTransaction = account.signTransaction(multisigTransaction);
    return transactionHttp.announceTransaction(signedTransaction);
};

const publicKeyToAddress = (pubKey: string) => {
    if (pubKey[0] >= "8") {
        pubKey = "00" + pubKey;
    }
    const pa = PublicAccount.createWithPublicKey(pubKey);
    return pa.address;
};

// Poll Address from index information and creator
const generatePollAddress = (title: string, publicKey: string) => {
    const pk = CryptoJS.SHA3(publicKey + title, { outputLength: 256 }).toString();
    const pa = PublicAccount.createWithPublicKey(pk);
    return pa.address;
};

const deriveOptionAddress = (pollAddress: Address, option: string): Address => {
    const plainAddress = pollAddress.plain();
    const pubKey = CryptoJS.SHA3(plainAddress + option, { outputLength: 256 }).toString();
    return publicKeyToAddress(pubKey);
};

export {
    getImportances, getHeightByTimestamp, findTransaction, getHeightByTimestampPromise, getFirstMessageWithString,
    getTransactionsWithString, getAllTransactions, getTransferTransaction, sendMessage, sendMultisigMessage,
    generatePollAddress, deriveOptionAddress,
};
