import { BroadcastedPoll } from "./poll";
import { Account, PublicAccount, TransferTransaction, TimeWindow, XEM, EmptyMessage, NemAnnounceResult, Address, Transaction, MultisigTransaction } from "nem-library";
import { getMessageTransaction, getMultisigMessage, findTransaction } from "./utils";
import { Observable } from "rxjs";

const vote = (poll: BroadcastedPoll, option: string): TransferTransaction => {
    const address = poll.getOptionAddress(option);
    if (!address) {
        throw new Error("Invalid option");
    }
    return getMessageTransaction("", address);
};

const multisigVote = (multisigAccount: PublicAccount, poll: BroadcastedPoll, option: string): MultisigTransaction => {
    const address = poll.getOptionAddress(option);
    if (!address) {
        throw new Error("Invalid option");
    }
    const message = "vote on poll " + address.plain() + " with option \"" + option + "\"";
    return getMultisigMessage(multisigAccount, message, address);
};

const getVotes = (address: Address, poll: BroadcastedPoll): Observable<Transaction[] | null> => {
    const promises = poll.data.options.map((option) => {
        const optAddress = poll.getOptionAddress(option);
        return findTransaction(address, optAddress!);
    });
    return Observable.forkJoin(promises)
        .map((transactions: Transaction[]) => {
            const trans = transactions.filter((t) => t !== null).map((t) => t!);
            if (trans.length === 0) {
                return null;
            } else {
                return trans;
            }
        });
};

export { vote, multisigVote, getVotes };
