import { getFirstMessageWithString, generatePollAddress, deriveOptionAddress, sendMessage } from "./utils";
import { Address, NEMLibrary, NetworkTypes, Account, NemAnnounceResult, PublicAccount, Transaction } from "nem-library";
import { PollConstants } from "./constants";
import { IResults, getWhitelistResults, getPOIResults, getPOIResultsCsv, IVote, getPOIResultsArray } from "./counting";
import { Observable } from "rxjs";
import { vote, multisigVote, getVotes } from "./voting";
import { PollIndex } from "./poll-index";

interface IFormData {
    /**
     * Title of the poll
     */
    title: string;
    /**
     * date of ending, as milliseconds from UNIX epoch
     */
    doe: number;
    /**
     * True if multiple votes are accepted
     */
    multiple: boolean;
    /**
     * type of the poll
     */
    type: number;
}

interface IPollData {
    /**
     * General information abount the poll
     */
    formData: IFormData;
    /**
     * Detailed description for the poll
     */
    description: string;
    /**
     * Options of the poll
     */
    options: string[];
    /**
     * (optional) Array of Addresses to be whitelisted. Only for whitelist polls
     */
    whitelist?: Address[];
}

/**
 * Maps strings to  addresses, one for each poll option
 */
interface IAddressLink {
    [key: string]: Address;
}

/**
 * Abstract class that represents a poll
 */
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

/**
 * An unbroadcasted poll. Exists only locally and not on the blockchain yet
 */
class UnbroadcastedPoll extends Poll {
    constructor(formData: IFormData, description: string, options: string[], whitelist?: Address[]) {
        super(formData, description, options, whitelist);
    }

    /**
     * Broadcasts an unbroadcasted poll and returns the resulting broadcasted poll object (as a promise)
     * @param account - NEM Account that will broadcast the poll
     * @param pollIndex - optionally provide the poll index to send the poll to.
     *                    If not specified the default public index is used
     * @return Promise<BroadcastedPoll>
     */
    private broadcastPromise = async (account: Account, pollIndex?: PollIndex): Promise<BroadcastedPoll> => {
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
            if (this.data.formData.type === PollConstants.WHITELIST_POLL) {
                const whitelistMessage = "whitelist:" + JSON.stringify(this.data.whitelist!.map((a) => a.plain()));
                const whitelistPromise = sendMessage(account, whitelistMessage, pollAddress).first().toPromise();
                messagePromises.push(whitelistPromise);
            }
            await Promise.all(messagePromises);
            const header: {[key: string]: any} = {
                title: this.data.formData.title,
                type: this.data.formData.type,
                doe: this.data.formData.doe,
                address: pollAddress.plain(),
            };
            if (this.data.formData.type === PollConstants.WHITELIST_POLL) {
                header.whitelist = this.data.whitelist!.map((a) => a.plain());
            }
            const headerMessage = "poll:" + JSON.stringify(header);
            let pollIndexAddress: Address;
            if (pollIndex) {
                pollIndexAddress = pollIndex.address;
            } else {
                pollIndexAddress = (NEMLibrary.getNetworkType() === NetworkTypes.MAIN_NET) ?
                    new Address(PollConstants.MAINNET_POLL_INDEX) : new Address(PollConstants.TESTNET_POLL_INDEX);
            }
            await sendMessage(account, headerMessage, pollIndexAddress).first().toPromise();
            return new BroadcastedPoll(this.data.formData, this.data.description, this.data.options, pollAddress, link, this.data.whitelist);
        } catch (err) {
            throw err;
        }
    }

    /**
     * Broadcasts an unbroadcasted poll and returns the resulting broadcasted poll object as an Observable
     * @param account - NEM Account that will broadcast the poll
     * @param pollIndex - optionally provide the poll index to send the poll to.
     *                    If not specified the default public index is used
     * @return Observable<BroadcastedPoll>
     */
    public broadcast = (account: Account, pollIndex?: PollIndex): Observable<BroadcastedPoll> => {
        return Observable.fromPromise(this.broadcastPromise(account, pollIndex));
    }
}

/**
 * A broadcasted poll. Exists in the blockchain
 */
class BroadcastedPoll extends Poll {
    /**
     * The poll address
     */
    public readonly address: Address;
    /**
     * Map from option to option address
     */
    private optionAddresses: IAddressLink;

    constructor(formData: IFormData, description: string, options: string[], pollAddress: Address, optionAddresses: IAddressLink, whitelist?: Address[]) {
        super(formData, description, options, whitelist);
        this.address = pollAddress;
        this.optionAddresses = optionAddresses;
    }

    /**
     * Fetches a Broadcasted Poll from the blockchain by its address
     * @param pollAddress - The poll's NEM Address
     * @return Promise<BroadcastedPoll>
     */
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

            if (formData.type === PollConstants.WHITELIST_POLL) {
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

    /**
     * Fetches a Broadcasted Poll from the blockchain by its address
     * @param pollAddress - The poll's NEM Address
     * @return Observable<BroadcastedPoll>
     */
    public static fromAddress = (pollAddress: Address): Observable<BroadcastedPoll> => {
        return Observable.fromPromise(BroadcastedPoll.fromAddressPromise(pollAddress));
    }

    /**
     * Gets the option address for a given option
     * @param option - The option
     * @return Address | null
     */
    public getOptionAddress = (option: string): Address | null => {
        const address = this.optionAddresses[option];
        if (!address) {
            return null;
        } else {
            return address;
        }
    }

    /**
     * Gets the results for the poll
     * @param pollAddress - The poll's NEM Address
     * @return Observable<IResults>
     */
    public getResults = (): Observable<IResults> => {
        const poll = this;
        if (poll.data.formData.type === PollConstants.POI_POLL) {
            return getPOIResults(poll);
        } else if (poll.data.formData.type === PollConstants.WHITELIST_POLL) {
            return getWhitelistResults(poll);
        } else {
            throw new Error("unsupported type");
        }
    }

    /**
     * Gets the results for the poll as a csv string
     * @param pollAddress - The poll's NEM Address
     * @return Observable<string>
     */
    public getCsvResults = (): Observable<string> => {
        const poll = this;
        if (poll.data.formData.type === PollConstants.POI_POLL) {
            return getPOIResultsCsv(poll);
        } else {
            throw new Error("CSV results only available for POI polls");
        }
    }

    /**
     * Gets the results for the poll as an array of vote objects
     * @param pollAddress - The poll's NEM Address
     * @return Observable<IResults>
     */
    public getVoters = (): Observable<IVote[]> => {
        const poll = this;
        if (poll.data.formData.type === PollConstants.POI_POLL) {
            return getPOIResultsArray(poll);
        } else {
            throw new Error("voters function only available for POI polls");
        }
    }

    /**
     * validates a poll's structure and returns wether it is correct or not
     * @return boolean
     */
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

    /**
     * Votes on the poll from a given account, returns the vote transaction result
     * @param account - The voter account
     * @param option - The option to vote
     * @return Observable<NemAnnounceResult>
     */
    public vote = (account: Account, option: string): Observable<NemAnnounceResult> => {
        const now = Date.now();
        if (this.data.formData.doe < now) {
            throw new Error("Poll Ended");
        }
        return vote(account, this, option);
    }

    /**
     * Votes on the poll from a multisig account, returns the vote transaction result
     * @param account - The cosigner account that signs the multisig transaction
     * @param multisigAccount - The public account of the multisig account that votes
     * @param option - The option to vote
     * @return Observable<NemAnnounceResult>
     */
    public voteMultisig = (account: Account, multisigAccount: PublicAccount, option: string): Observable<NemAnnounceResult> => {
        const now = Date.now();
        if (this.data.formData.doe < now) {
            throw new Error("Poll Ended");
        }
        return multisigVote(account, multisigAccount, this, option);
    }

    /**
     * Gets the votes that an address has sent to the poll, if it has not voted returns null
     * @param address - The address of the voter
     * @return Observable<Transaction[] | null>
     */
    public getVotes = (address: Address): Observable<Transaction[] | null> => {
        return getVotes(address, this);
    }

}

export {IPollData, IFormData, IAddressLink, Poll, BroadcastedPoll, UnbroadcastedPoll};
