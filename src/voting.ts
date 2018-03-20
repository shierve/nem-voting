import { BroadcastedPoll } from "./Poll";
import { Account, PublicAccount, TransferTransaction, TimeWindow, XEM, EmptyMessage, NemAnnounceResult, Address, Transaction } from "nem-library";
import { sendMessage, sendMultisigMessage, findTransaction } from "./utils";
import { Observable } from "rxjs";

const vote = (account: Account, poll: BroadcastedPoll, option: string): Observable<NemAnnounceResult> => {
    const address = poll.getOptionAddress(option);
    if (!address) {
        throw new Error("Invalid option");
    }
    return sendMessage(account, "", address);
};

const multisigVote = (account: Account, multisigAccount: PublicAccount, poll: BroadcastedPoll, option: string) => {
    const address = poll.getOptionAddress(option);
    if (!address) {
        throw new Error("Invalid option");
    }
    const message = "vote on poll " + address.plain() + " with option \"" + option + "\"";
    return sendMultisigMessage(account, multisigAccount, message, address);
};

const getVotes = (address: Address, poll: BroadcastedPoll): Observable<Transaction[] | null> => {
    const promises = poll.data.options.map((option) => {
        const optAddress = poll.getOptionAddress(option);
        return findTransaction(address, optAddress!);
    });
    return Observable.forkJoin(promises)
        .map((transactions) => {
            const trans = transactions.filter((t) => t !== null).map((t) => t!);
            if (trans.length === 0) {
                return null;
            } else {
                return trans;
            }
        });
};

export { vote, multisigVote, getVotes };
