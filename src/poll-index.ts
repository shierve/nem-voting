import { Address, TransactionTypes, PlainMessage, Account } from "nem-library";
import { Observable } from "rxjs";
import { getFirstMessageWithString, getTransactionsWithString, generateRandomAddress, sendMessage } from "./utils";

interface IPollHeader {
    title: string;
    type: number;
    doe: number;
    address: Address;
}

class PollIndex {
    public address: Address;
    public isPrivate: boolean;
    public headers: IPollHeader[];

    constructor(address: Address, isPrivate: boolean, headers: IPollHeader[]) {
        this.address = address;
        this.isPrivate = isPrivate;
        this.headers = headers;
    }

    public static fromAddress = (address: Address): Observable<PollIndex> => {
        let isPrivate: boolean;
        return getFirstMessageWithString("pollIndex:", address)
            .switchMap((indexMessage) => {
                isPrivate = JSON.parse(indexMessage!.replace("pollIndex:", "")).private;
                return getTransactionsWithString("poll:", address);
            }).map((transactions) => {
                const headers = transactions.map((transaction) => {
                    try {
                        if (transaction.type !== TransactionTypes.TRANSFER) {
                            return null;
                        }
                        const header = JSON.parse((transaction.message as PlainMessage).plain().replace("poll:", ""));
                        return {
                            title: header.title,
                            type: header.type,
                            doe: header.doe,
                            address: new Address(header.address),
                        } as IPollHeader;
                    } catch (err) {
                        return null;
                    }
                }).filter((h) => h !== null).map((h) => h!);
                return new PollIndex(address, isPrivate, headers);
            });
    }

    public static create = (account: Account, isPrivate: boolean): Observable<PollIndex> => {
        const address = generateRandomAddress();
        const ownMessage = "createdPollIndex:" + address.plain();
        const indexMessage = "pollIndex:" + JSON.stringify({ private: isPrivate });
        return sendMessage(account, indexMessage, address)
            .switchMap((announce) => {
                return sendMessage(account, ownMessage, account.address);
            }).map((announce) => {
                return new PollIndex(address, isPrivate, []);
            });
    }
}

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
