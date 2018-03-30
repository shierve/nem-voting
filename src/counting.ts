import { AccountHttp, Address, NEMLibrary, NetworkTypes, Transaction, TransactionTypes, TransferTransaction } from "nem-library";
import { BroadcastedPoll } from "./poll";
import { getHeightByTimestamp, getTransactionsWithString, getAllTransactions, getTransferTransaction, getImportances } from "./utils";
import { PollConstants } from "./constants";
import { Observable } from "rxjs";

interface IResults {
    totalVotes: number;
    options: [{
        text: string;
        votes: number;
        weighted: number;
        percentage: number;
    }];
}

/**
 * VOTING FUNCTIONS
 */

/**
 * getWhitelistResults(poll) returns the result object for the poll
 *
 * @param {BroadcastedPoll} poll - broadcasted poll
 *
 * @return {promise} - A promise that returns the result object of the poll
 */
const getWhitelistResultsPromise = async (poll: BroadcastedPoll): Promise<IResults> => {
    if (poll.data.formData.type !== PollConstants.WHITELIST_POLL || !poll.data.whitelist) {
        throw new Error("Not a whitelist poll");
    }
    const whitelist = poll.data.whitelist!.map((address) => address.plain());

    let end = (poll.data.formData.doe < Date.now()) ? (poll.data.formData.doe) : (null);

    let blockPromise;
    if (end !== null) {
        blockPromise = getHeightByTimestamp(end).first().toPromise();
    } else {
        blockPromise = Promise.resolve(-1);
    }
    const endBlock = await blockPromise;
    // get all Transactions that can potentially be votes
    const orderedAddresses = poll.data.options.map((option) => poll.getOptionAddress(option));
    const optionTransactionPromises = orderedAddresses.map((address) => {
        if (address === null) {
            throw new Error("Error while counting votes");
        }
        return getAllTransactions(address!).first().toPromise();
    });
    let optionTransactions = await Promise.all(optionTransactionPromises);
    // Filter only confirmed Transactions. If the poll has ended filter out all the votes that confirmed after the end.
    if (end !== null) {
        optionTransactions = optionTransactions.map((transactions: Transaction[]) => {
            return transactions.filter((transaction) => {
                return (transaction.isConfirmed() && transaction.getTransactionInfo().height <= endBlock);
            });
        });
    } else {
        end = Date.now();
        optionTransactions = optionTransactions.map((transactions: Transaction[]) => {
            return transactions.filter((transaction) => transaction.isConfirmed());
        });
    }
    // Only ransactions with 0 xem and 0 mosaics (Invalidates votes from exchanges and other cheating attempts)
    optionTransactions = optionTransactions.map((transactions) => {
        return transactions.map((transaction) => {
            return getTransferTransaction(transaction)!;
        }).filter((transaction) => {
            return (!transaction.containsMosaics()) && (transaction.xem().amount ===  0);
        });
    });
    // convert public keys to addresses and filter by WhiteList
    let voteAddresses = optionTransactions.map((transactions: Transaction[])  => {
        return transactions.map((transaction) => {
            return transaction.signer!.address;
        }).filter((address) => whitelist.includes(address.plain()));
    });

    // eliminate repetitions in array (return array is sorted)
    const unique = (addresses: Address[]) => {
        return addresses.sort((a: Address, b: Address) => (a.plain().localeCompare(b.plain())))
        .filter((item, pos, ary) => {
            return !pos || item.plain() !== ary[pos - 1].plain();
        });
    };
    voteAddresses = voteAddresses.map(unique);

    // merge for two sorted arrays
    const merge = (a: Address[], b: Address[]) => {
        const answer = new Array(a.length + b.length);
        let i = 0;
        let j = 0;
        let k = 0;
        while (i < a.length && j < b.length) {
            if (a[i].plain() < b[j].plain()) {
                answer[k] = a[i];
                i++;
            } else {
                answer[k] = b[j];
                j++;
            }
            k++;
        }
        while (i < a.length) {
            answer[k] = a[i];
            i++;
            k++;
        }
        while (j < b.length) {
            answer[k] = b[j];
            j++;
            k++;
        }
        return answer;
    };
    // merge addresses from all options (they remain sorted)
    let allAddresses = voteAddresses.reduce(merge, []);
    // we don't need to do anything if there are no votes
    if (allAddresses.length === 0) {
        return {
            totalVotes: 0,
            options: poll.data.options.map((option) => {
                return {
                    text: option,
                    votes: 0,
                    weighted: 0,
                    percentage: 0,
                };
            }),
        } as IResults;
    }
    // if not multiple invalidate multiple votes
    const occurences = {};
    if (poll.data.formData.multiple) {
        allAddresses.map((address) => {
            if (!occurences[address.plain()]) {
                occurences[address.plain()] = 1;
            } else {
                occurences[address.plain()]++;
            }
        });
    } else {
        // Since we deleted repeated votes in the same option, we can know all repetitions now mean they voted in more than one option
        const nullified = allAddresses.filter((item, pos, ary) => {
            return pos && item === ary[pos - 1];
        });
        // remove null votes
        voteAddresses = voteAddresses.map((addresses) => {
            return addresses.filter((address) => (!nullified.includes(address)));
        });
        allAddresses = allAddresses.filter((address) => (!nullified.includes(address)));
        allAddresses.forEach((address) => {
            occurences[address.plain()] = 1;
        });
    }
    // Only valid votes now on voteAddresses

    // calculate weights
    const weights = allAddresses.map((address) => 1 / occurences[address.plain()] );
    const addressWeights = {}; // maps addresses to their importance
    allAddresses.forEach((address, i) => {
        addressWeights[address.plain()] = weights[i];
    });
    // count number of votes for each option
    const voteCounts = voteAddresses.map((addresses) => addresses.length );
    // count votes weighted
    const voteCountsWeighted = voteAddresses.map((addresses) => {
        return addresses.reduce((acc, v) => {
            return acc + addressWeights[v.plain()];
        }, 0);
    });

    const totalVotes = allAddresses.length;
    const optionResults = poll.data.options.map((option, i) => {
        const percentage = (totalVotes === 0) ? (0) : (voteCountsWeighted[i] * 100 / totalVotes);
        return {
            text: poll.data.options[i],
            votes: voteCounts[i],
            weighted: voteCountsWeighted[i],
            percentage: (percentage),
        };
    });
    return {
        totalVotes: (totalVotes),
        options: optionResults,
    } as IResults;
};

const getWhitelistResults = (poll: BroadcastedPoll): Observable<IResults> => {
    return Observable.fromPromise(getWhitelistResultsPromise(poll));
};

/**
 * getPOIResults(poll) returns the result object for the poll
 *
 * @param {BroadcastedPoll} poll - broadcasted poll
 *
 * @return {promise} - A promise that returns the result object of the poll
 */
const getPOIResultsPromise = async (poll: BroadcastedPoll): Promise<IResults> => {
    try {
        if (poll.data.formData.type !== PollConstants.POI_POLL) {
            throw new Error("Not a POI poll");
        }

        let end = (poll.data.formData.doe < Date.now()) ? (poll.data.formData.doe) : (null);

        let blockPromise;
        if (end !== null) {
            blockPromise = getHeightByTimestamp(end).first().toPromise();
        } else {
            blockPromise = Promise.resolve(-1);
        }
        const endBlock = await blockPromise;
        // get all Transactions that can potentially be votes
        const orderedAddresses = poll.data.options.map((option) => poll.getOptionAddress(option));
        const optionTransactionPromises = orderedAddresses.map((address) => {
            if (address === null) {
                throw new Error("Error while counting votes");
            }
            return getAllTransactions(address!).first().toPromise();
        });
        let optionTransactions = await Promise.all(optionTransactionPromises);
        // Filter only confirmed Transactions. If the poll has ended filter out all the votes that confirmed after the end.
        if (end !== null) {
            optionTransactions = optionTransactions.map((transactions: Transaction[]) => {
                return transactions.filter((transaction) => {
                    return (transaction.isConfirmed() && transaction.getTransactionInfo().height <= endBlock);
                });
            });
        } else {
            end = -1;
            optionTransactions = optionTransactions.map((transactions: Transaction[]) => {
                return transactions.filter((transaction) => transaction.isConfirmed());
            });
        }

        // Only transactions with 0 xem and 0 mosaics (Invalidates votes from exchanges and other cheating attempts)
        optionTransactions = optionTransactions.map((transactions) => {
            return transactions.map((transaction) => {
                return getTransferTransaction(transaction)!;
            }).filter((transaction) => {
                return (!transaction.containsMosaics()) && (transaction.xem().amount ===  0);
            });
        });

        // convert public keys to addresses
        let voteAddresses = optionTransactions.map((transactions: Transaction[])  => {
            return transactions.map((transaction) => transaction.signer!.address);
        });

        // eliminate repetitions in array (return array is sorted)
        const unique = (addresses: Address[]) => {
            return addresses.sort((a: Address, b: Address) => (a.plain().localeCompare(b.plain())))
                .filter((item, pos, ary) => {
                    return !pos || item !== ary[pos - 1];
                });
        };
        voteAddresses = voteAddresses.map(unique);

        // merge for two sorted arrays
        const merge = (a: Address[], b: Address[]) => {
            const answer = new Array(a.length + b.length);
            let i = 0;
            let j = 0;
            let k = 0;
            while (i < a.length && j < b.length) {
                if (a[i].plain() < b[j].plain()) {
                    answer[k] = a[i];
                    i++;
                } else {
                    answer[k] = b[j];
                    j++;
                }
                k++;
            }
            while (i < a.length) {
                answer[k] = a[i];
                i++;
                k++;
            }
            while (j < b.length) {
                answer[k] = b[j];
                j++;
                k++;
            }
            return answer;
        };
        // merge addresses from all options (they remain sorted)
        let allAddresses = voteAddresses.reduce(merge, []);
        // we don't need to do anything if there are no votes
        if (allAddresses.length === 0) {
            return {
                totalVotes: 0,
                options: poll.data.options.map((option) => {
                    return {
                        text: option,
                        votes: 0,
                        weighted: 0,
                        percentage: 0,
                    };
                }),
            } as IResults;
        }
        // if not multiple invalidate multiple votes
        const occurences = {};
        if (poll.data.formData.multiple) {
            allAddresses.map((address) => {
                if (!occurences[address.plain()]) {
                    occurences[address.plain()] = 1;
                } else {
                    occurences[address.plain()]++;
                }
            });
        } else {
            // Since we deleted repeated votes in the same option, we can know all repetitions now mean they voted in more than one option
            const nullified = allAddresses.filter((item, pos, ary) => {
                return pos && item.plain() === ary[pos - 1].plain();
            });
            // remove null votes
            voteAddresses = voteAddresses.map((addresses) => {
                return addresses.filter((address) => (!nullified.includes(address)));
            });
            allAddresses = allAddresses.filter((address) => (!nullified.includes(address)));
            allAddresses.map((address) => {
                occurences[address.plain()] = 1;
            });
        }
        // We only want to query for importance once for every account
        const uniqueAllAddresses = unique(allAddresses);
        // Only valid votes now on voteAddresses and allAddresses
        // Get Importances
        const importances = await getImportances(uniqueAllAddresses, endBlock).first().toPromise();
        const weightedImportances = importances.map((importance, i) => {
            return importance /= occurences[uniqueAllAddresses[i].plain()];
        });
        const totalImportance = importances.reduce((a, b) => {
            return a + b;
        }, 0);
        const addressImportances = {};
        uniqueAllAddresses.forEach((address, i) => {
            addressImportances[address.plain()] = weightedImportances[i];
        });

        // count number of votes for each option
        const voteCounts = voteAddresses.map((addresses) => addresses.length );
        // count votes weighted by importance
        const voteCountsWeighted = voteAddresses.map((addresses) => {
            return addresses.reduce((acc, v) => {
                return acc + addressImportances[v.plain()];
            }, 0);
        });

        const totalVotes = allAddresses.length;
        const optionResults = poll.data.options.map((option, i) => {
            const percentage = (totalVotes === 0) ? (0) : (voteCountsWeighted[i] * 100 / totalImportance);
            return {
                text: poll.data.options[i],
                votes: voteCounts[i],
                weighted: voteCountsWeighted[i],
                percentage: (percentage),
            };
        });
        return {
            totalVotes: (totalVotes),
            options: optionResults,
        } as IResults;
    } catch (err) {
        throw err;
    }
};

const getPOIResults = (poll: BroadcastedPoll): Observable<IResults> => {
    return Observable.fromPromise(getPOIResultsPromise(poll));
};

const toCsv = (o: object): string => {
    const keys = Object.keys(o);
    const params = Object.keys(o[keys[0]]);
    let resultString: string = params[0];
    params.forEach((param, i) => {
        if (i !== 0) {
            resultString += "," + param;
        }
    });
    resultString += "\n";
    keys.forEach((key) => {
        resultString += o[key][params[0]];
        params.forEach((param, i) => {
            if (i !== 0) {
                resultString += "," + o[key][param];
            }
        });
        resultString += "\n";
    });
    return resultString;
};

const getPOIResultsCsv = async (poll: BroadcastedPoll): Promise<string> => {
    try {
        if (poll.data.formData.type !== PollConstants.POI_POLL) {
            throw new Error("Not a POI poll");
        }

        const end = (poll.data.formData.doe < Date.now()) ? (poll.data.formData.doe) : -1;

        let blockPromise;
        if (end !== -1) {
            blockPromise = getHeightByTimestamp(end).first().toPromise();
        } else {
            blockPromise = Promise.resolve(-1);
        }
        const endBlock = await blockPromise;

        // get all Transactions that can potentially be votes
        const orderedAddresses = poll.data.options.map((option) => poll.getOptionAddress(option));
        const optionTransactionPromises = orderedAddresses.map((address) => {
            if (address === null) {
                throw new Error("Error while counting votes");
            }
            return getAllTransactions(address!).first().toPromise();
        });
        let optionTransactions = await Promise.all(optionTransactionPromises);
        // filter unconfirmed
        optionTransactions = optionTransactions.map((transactions: Transaction[]) => {
            return transactions.filter((transaction) => transaction.isConfirmed());
        });

        const votesObj: object = {};

        // get individual information
        optionTransactions.forEach((transactions: Transaction[], i) => {
            transactions.forEach((trans) => {
                const transaction = getTransferTransaction(trans)!;
                const address = transaction.signer!.address.plain();
                const block = transaction.getTransactionInfo().height;
                const multisig = (trans.type === TransactionTypes.MULTISIG);
                let validity = "Valid";
                if (block > endBlock) {
                    validity = "Too Late";
                }
                if (transaction.containsMosaics() || !(transaction.xem().amount ===  0)) {
                    validity = "Not a 0xem transaction";
                }
                const opt = poll.data.options[i];
                votesObj[transaction.signer!.address.plain()] = {
                    address: (address),
                    block: (block),
                    validity: (validity),
                    multisig: (multisig),
                    option: opt,
                };
            });
        });

        optionTransactions = optionTransactions.map((transactions) => {
            return transactions.map((transaction) => {
                return getTransferTransaction(transaction)!;
            });
        });

        let voteAddresses = optionTransactions.map((transactions: Transaction[])  => {
            return transactions.map((transaction) => transaction.signer!.address);
        });

        // eliminate repetitions in array (return array is sorted)
        const unique = (addresses: Address[]) => {
            return addresses.sort((a: Address, b: Address) => (a.plain().localeCompare(b.plain())))
                .filter((item, pos, ary) => {
                    return !pos || item !== ary[pos - 1];
                });
        };
        voteAddresses = voteAddresses.map(unique);

        // merge for two sorted arrays
        const merge = (a: Address[], b: Address[]) => {
            const answer = new Array(a.length + b.length);
            let i = 0;
            let j = 0;
            let k = 0;
            while (i < a.length && j < b.length) {
                if (a[i].plain() < b[j].plain()) {
                    answer[k] = a[i];
                    i++;
                } else {
                    answer[k] = b[j];
                    j++;
                }
                k++;
            }
            while (i < a.length) {
                answer[k] = a[i];
                i++;
                k++;
            }
            while (j < b.length) {
                answer[k] = b[j];
                j++;
                k++;
            }
            return answer;
        };
        // merge addresses from all options (they remain sorted)
        const allAddresses = voteAddresses.reduce(merge, []);
        // we don't need to do anything if there are no votes
        if (allAddresses.length === 0) {
            return "";
        }

        // Since we deleted repeated votes in the same option, we can know all repetitions now mean they voted in more than one option
        const nullified = allAddresses.filter((item, pos, ary) => {
            return pos && item.plain() === ary[pos - 1].plain();
        });
        // mark null votes
        nullified.forEach((address) => {
            votesObj[address.plain()].validity = "Multiple Vote";
        });

        // We only want to query for importance once for every account
        const uniqueAllAddresses = unique(allAddresses);
        // Only valid votes now on voteAddresses and allAddresses
        // Get Importances
        const importances = await getImportances(uniqueAllAddresses, endBlock).first().toPromise();

        uniqueAllAddresses.forEach((address, i) => {
            votesObj[address.plain()].importance = importances[i];
        });

        return toCsv(votesObj);
    } catch (err) {
        throw err;
    }
};

export { IResults, getWhitelistResultsPromise, getWhitelistResults, getPOIResultsPromise, getPOIResults, getPOIResultsCsv };
