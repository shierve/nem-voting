import { Address, TransactionTypes, PlainMessage, Account, TransferTransaction } from "nem-library";
import { Observable } from "rxjs";
import { getFirstMessageWithString, getTransactionsWithString, generateRandomAddress, getMessageTransaction } from "./utils";

/**
 * Represents the info from a poll header sent to an index
 */
interface IPollHeader {
    title: string;
    type: number;
    doe: number;
    address: Address;
    creator: Address;
    whitelist?: Address[];
}

/**
 * Contains the info for a poll index, public or private
 */
class PollIndex {
    /**
     * Poll Index Address
     */
    public address: Address;
    /**
     * true if the index is private. On private indexes only the creator can send valid polls
     */
    public isPrivate: boolean;
    /**
     * the creator of the poll, only needed for private indexes
     */
    public creator?: Address;
    /**
     * array of broadcasted header polls for the index
     */
    public headers: IPollHeader[];

    /**
     * @internal
     */
    constructor(address: Address, isPrivate: boolean, headers: IPollHeader[], creator?: Address) {
        this.address = address;
        this.isPrivate = isPrivate;
        this.headers = headers;
        this.creator = creator;
    }

    /**
     * Gets a poll index from its address with all of its broadcasted polls
     * @param address - the index account address
     * @return Observable<PollIndex>
     */
    public static fromAddress = (address: Address): Observable<PollIndex> => {
        let indexObject: {
            isPrivate: boolean;
            creator?: string;
        };
        return getFirstMessageWithString("pollIndex:", address)
            .switchMap((indexMessage) => {
                indexObject = JSON.parse(indexMessage!.replace("pollIndex:", "")).private;
                if (indexObject.isPrivate) {
                    return getTransactionsWithString("poll:", address, new Address(indexObject.creator!));
                } else {
                    return getTransactionsWithString("poll:", address);
                }
            }).map((transactions) => {
                const headers = transactions.map((transaction) => {
                    try {
                        if (transaction.type !== TransactionTypes.TRANSFER || !transaction.signer) {
                            return null;
                        }
                        const header = JSON.parse((transaction.message as PlainMessage).plain().replace("poll:", ""));
                        return {
                            title: header.title,
                            type: header.type,
                            doe: header.doe,
                            address: new Address(header.address),
                            creator: transaction.signer.address,
                            whitelist: header.whitelist,
                        } as IPollHeader;
                    } catch (err) {
                        return null;
                    }
                }).filter((h) => h !== null).map((h) => h!);
                if (indexObject.isPrivate) {
                    return new PollIndex(address, indexObject.isPrivate, headers, new Address(indexObject.creator!));
                } else {
                    return new PollIndex(address, indexObject.isPrivate, headers);
                }
            });
    }

    /**
     * Creates a new poll Index
     * @param isPrivate - will create a private index if true
     * @param creatorAddress - needed only if the index is private
     * @return Observable<PollIndex>
     */
    public static create = (isPrivate: boolean, creatorAddress?: Address): {address: Address, transaction: TransferTransaction} => {
        const address = generateRandomAddress();
        const ownMessage = "createdPollIndex:" + address.plain();
        const obj: {[key: string]: any} = {
            private: isPrivate,
        };
        if (isPrivate) {
            obj.creator = creatorAddress;
        }
        const indexMessage = "pollIndex:" + JSON.stringify(obj);
        return {
            address,
            transaction: getMessageTransaction(indexMessage, address),
        };
    }
}

/**
 * Gets the addresses for all the poll indexes created by an address
 * @param creator - the address of the creator of the indexes we want
 * @return Observable<Address[]>
 */
const getCreatedIndexAddresses = (creator: Address): Observable<Address[]> => {
    return getTransactionsWithString("createdPollIndex:", creator, creator)
        .map((transactions) => {
            return transactions.map((transaction) => {
                try {
                    const address = (transaction.message as PlainMessage).plain().replace("createdPollIndex:", "");
                    return new Address(address);
                } catch (err) {
                    return null;
                }
            }).filter((h) => h !== null).map((h) => h!);
        });
};

export { PollIndex, IPollHeader, getCreatedIndexAddresses };
