import { getFirstMessageWithString, generatePollAddress, deriveOptionAddress, sendMessage } from "./utils";
import { Address, NEMLibrary, NetworkTypes, Account, NemAnnounceResult, PublicAccount, Transaction } from "nem-library";
import { WHITELIST_POLL, POI_POLL, MAINNET_POLL_INDEX, TESTNET_POLL_INDEX } from "./constants";
import { IResults, getWhitelistResults, getPOIResults } from "./counting";
import { Observable } from "rxjs";
import { vote, multisigVote, getVotes } from "./voting";

interface IFormData {
    title: string;
    doe: number;
    multiple: boolean;
    type: number;
}

interface IPollData {
    formData: IFormData;
    description: string;
    options: string[];
    whitelist?: Address[];
}

interface IAddressLink {
    [key: string]: Address;
}

abstract class Poll {
    public readonly data: IPollData;
    constructor(formData: IFormData, description: string, options: string[], whitelist?: Address[]) {
        this.data = {
            formData: (formData),
            description: (description),
            options: (options),
        };
        if (whitelist) {
            this.data.whitelist = whitelist;
        }
    }
}

class UnbroadcastedPoll extends Poll {
    constructor(formData: IFormData, description: string, options: string[], whitelist?: Address[]) {
        super(formData, description, options, whitelist);
    }

    private broadcastPromise = async (account: Account): Promise<BroadcastedPoll> => {
        try {
            const pollAddress = generatePollAddress(this.data.formData.title, account.publicKey);
            const link: IAddressLink = {};
            const simplifiedLink: {[key: string]: string} = {};
            this.data.options.forEach((option) => {
                const addr = deriveOptionAddress(pollAddress, option);
                link[option] = addr;
                simplifiedLink[option] = addr.plain();
            });
            const formDataMessage = "formData:" + JSON.stringify(this.data.formData);
            const descriptionMessage = "description:" + this.data.description;
            const optionsObject = {strings: this.data.options, link: (simplifiedLink)};
            const optionsMessage = "options:" + JSON.stringify(optionsObject);

            const formDataPromise = sendMessage(account, formDataMessage, pollAddress).first().toPromise();
            const descriptionPromise = sendMessage(account, descriptionMessage, pollAddress).first().toPromise();
            const optionsPromise = sendMessage(account, optionsMessage, pollAddress).first().toPromise();
            const messagePromises = [formDataPromise, descriptionPromise, optionsPromise];
            if (this.data.formData.type === WHITELIST_POLL) {
                const whitelistMessage = "whitelist:" + JSON.stringify(this.data.whitelist);
                const whitelistPromise = sendMessage(account, whitelistMessage, pollAddress).first().toPromise();
                messagePromises.push(whitelistPromise);
            }
            await Promise.all(messagePromises);
            const header = {
                title: this.data.formData.title,
                type: this.data.formData.type,
                doe: this.data.formData.doe,
                address: pollAddress.plain(),
            };
            const headerMessage = "poll:" + JSON.stringify(header);
            const pollIndexAddress = (NEMLibrary.getNetworkType() === NetworkTypes.MAIN_NET) ?
                new Address(MAINNET_POLL_INDEX) : new Address(TESTNET_POLL_INDEX);
            await sendMessage(account, headerMessage, pollIndexAddress).first().toPromise();
            return new BroadcastedPoll(this.data.formData, this.data.description, this.data.options, pollAddress, link, this.data.whitelist);
        } catch (err) {
            throw err;
        }
    }

    public broadcast = (account: Account): Observable<BroadcastedPoll> => {
        return Observable.fromPromise(this.broadcastPromise(account));
    }
}

class BroadcastedPoll extends Poll {
    public readonly address: Address;
    private optionAddresses: IAddressLink;

    constructor(formData: IFormData, description: string, options: string[], pollAddress: Address, optionAddresses: IAddressLink, whitelist?: Address[]) {
        super(formData, description, options, whitelist);
        this.address = pollAddress;
        this.optionAddresses = optionAddresses;
    }

    private static fromAddressPromise = async (pollAddress: Address): Promise<BroadcastedPoll> => {
        try {
            const formDataPromise = getFirstMessageWithString("formData:", pollAddress).first().toPromise();
            const descriptionPromise = getFirstMessageWithString("description:", pollAddress).first().toPromise();
            const optionsPromise = getFirstMessageWithString("options:", pollAddress).first().toPromise();

            const pollBasicData = await Promise.all([formDataPromise, descriptionPromise, optionsPromise]);
            if (pollBasicData.some((e) => e === null)) {
                throw new Error("Error fetching poll");
            }
            const formData = JSON.parse(pollBasicData[0]!.replace("formData:", ""));
            const description = pollBasicData[1]!.replace("description:", "");
            const options = JSON.parse(pollBasicData[2]!.replace("options:", ""));

            const unique = (list: any[]) => {
                return list.sort().filter((item, pos, ary) => {
                    return !pos || item !== ary[pos - 1];
                });
            };

            // This part is for compatibility with the old poll structure
            const addressLink: IAddressLink = {};
            if (options.link) {
                options.strings.forEach((option: string) => {
                    addressLink[option] = new Address(options.link[option]);
                });
            } else {
                options.addresses = options.addresses.sort();
                options.strings.forEach((option: string, i) => {
                    addressLink[option] = new Address(options.addresses[i]);
                });
            }

            const orderedAddresses = Object.keys(addressLink).map((option) => addressLink[option]);
            if (orderedAddresses.length !== unique(orderedAddresses).length || Object.keys(addressLink).length !== options.strings.length) {
                // same account for different options
                throw Error("Poll is invalid");
            }

            if (formData.type === WHITELIST_POLL) {
                const whitelistString = await getFirstMessageWithString("whitelist:", pollAddress).first().toPromise();
                if (whitelistString === null) {
                    throw new Error("Error fetching poll");
                }
                const whitelist = (JSON.parse(whitelistString!.replace("whitelist:", ""))).map((a: string) => new Address(a));
                return new BroadcastedPoll(formData, description, options.strings, pollAddress, addressLink, whitelist);
            } else {
                return new BroadcastedPoll(formData, description, options.strings, pollAddress, addressLink);
            }
        } catch (err) {
            throw err;
        }
    }

    public static fromAddress = (pollAddress: Address): Observable<BroadcastedPoll> => {
        return Observable.fromPromise(BroadcastedPoll.fromAddressPromise(pollAddress));
    }

    public getOptionAddress = (option: string): Address | null => {
        const address = this.optionAddresses[option];
        if (!address) {
            return null;
        } else {
            return address;
        }
    }

    public getResults = (): Observable<IResults> => {
        const poll = this;
        if (poll.data.formData.type === POI_POLL) {
            return getPOIResults(poll);
        } else if (poll.data.formData.type === WHITELIST_POLL) {
            return getWhitelistResults(poll);
        } else {
            throw new Error("unsupported type");
        }
    }

    public validate = (): boolean => {
        const sortedOptions = this.data.options.sort();
        if (sortedOptions.some((v, i, a) => (i !== 0 && a[i - 1] === v))) {
            return false;
        }
        const pollAddress = this.address;
        const validOptionAddress = (option: string) => {
            const expected = deriveOptionAddress(pollAddress, option);
            const actual = this.getOptionAddress(option);
            if (!actual) {
                return false;
            }
            return (expected.plain() === actual.plain());
        };
        return (sortedOptions.every(validOptionAddress));
    }

    public vote = (account: Account, option: string): Observable<NemAnnounceResult> => {
        return vote(account, this, option);
    }

    public voteMultisig = (account: Account, multisigAccount: PublicAccount, option: string): Observable<NemAnnounceResult> => {
        return multisigVote(account, multisigAccount, this, option);
    }

    public getVotes = (address: Address): Observable<Transaction[] | null> => {
        return getVotes(address, this);
    }

}

export {IPollData, IFormData, IAddressLink, Poll, BroadcastedPoll, UnbroadcastedPoll};
