import {
    AccountHttp, Transaction, TransactionTypes, Address, NEMLibrary, NetworkTypes,
    MultisigTransaction, TransferTransaction, PlainMessage, BlockHttp, ChainHttp, Block,
    Observable, AccountHistoricalInfo, AccountInfoWithMetaData,
} from "nem-library";

// NEMLibrary.bootstrap(NetworkTypes.MAIN_NET);

const accountHttp = new AccountHttp();
const chainHttp = new ChainHttp();
const blockHttp = new BlockHttp();

const getTransactionsWithString =
(queryString: string, receiver: Address, sender?: Address, position: number = 0): Observable<TransferTransaction[]> => {
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
    return chainHttp.getBlockchainHeight().first().toPromise();
};

const getBlockByHeight = (height: number): Promise<Block> => {
    return blockHttp.getBlockByHeight(height).first().toPromise();
};

const getLastBlock = (): Promise<Block> => {
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
        const elapsed = now - nemTimestamp;
        // get current height and approx from there
        const curHeight = await getBlockchainHeight();
        const lastBlock = await getBlockByHeight(curHeight);
        // nem blocks are approximately 1min
        let height = Math.floor(curHeight - (elapsed / 60));
        // 2.Find exact block
        let foundHeight;
        // TODO: implement as binary searcn -> first find a lower bound then search
        // (maybe dont cut exactly in half, go by prediction)
        while (foundHeight === undefined) {
            const block = await getBlockByHeight(height);
            let x = Math.floor((nemTimestamp - block.timeStamp) / 60);
            if (x < 0 && x > -10) {
                x = -1;
            }
            if (x >= 0 && x <= 10) {
                x = 1;
            }
            if (block.timeStamp <= nemTimestamp && (x === 1 || x === -1)) {
                const nextBlock = await getBlockByHeight(height + 1);
                // check if target
                if (nextBlock.timeStamp > nemTimestamp) {
                    foundHeight = height;
                } else {
                    height++;
                }
            } else {
                height += x;
            }
        }
        return foundHeight;
    } catch (err) {
        throw err;
    }
};

const getHeightByTimestamp = (timestamp: number) => {
    return Observable.fromPromise(getHeightByTimestampPromise(timestamp));
};

const getImportances = (addresses: Address[], block?: number): Observable<number[]> => {
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

export {
    getImportances, getHeightByTimestamp, getHeightByTimestampPromise, getFirstMessageWithString,
    getTransactionsWithString,
};
