import { Observable } from "rxjs";
import { getOutgoingTransactionsWithString } from "./utils";
import { Address, TransactionTypes, PlainMessage } from "nem-library";
import { PollConstants } from "./constants";
import { IPollHeader } from "./poll-index";

const getAllOfficialPolls = (): Observable<IPollHeader[]> => {
    return getOutgoingTransactionsWithString("poll:", new Address(PollConstants.OFFICAL_POLL_ACCOUNT)).map((transactions) => {
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
        return headers;
    });
};

export {
    getAllOfficialPolls,
};
