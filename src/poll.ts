import { getFirstMessageWithString, generatePollAddress, deriveOptionAddress, getMessageTransaction, getAllMessagesWithString, getFirstSender, getHeightByTimestamp } from "./utils";
import { Address, NEMLibrary, NetworkTypes, Account, NemAnnounceResult, PublicAccount, Transaction, TransferTransaction, MultisigTransaction } from "nem-library";
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

interface IBroadcastData {
    /**
     * Transactions that need to be sent and confirmed for the poll to be broadcasted
     */
    transactions: TransferTransaction[];
    /**
     * Broadcasted Poll object. Can not be used until the transactions have been broadcasted and confirmed
     */
    broadcastedPoll: BroadcastedPoll;
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

    /**
     * @internal
     * @param formData
     * @param description
     * @param options
     * @param whitelist
     */
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
     * @param creatorPublicKey - public key of the poll creator
     * @param pollIndex - optionally provide the poll index to send the poll to.
     *                    If not specified the default public index is used
     * @return {pollAddress: Address, transactions: TransferTransaction[]} - returns the poll address
     * and the transactions that need to be sent for it to be broadcasted
     */
    public broadcast = (creatorPublicKey: string, pollIndex?: PollIndex): IBroadcastData => {
        try {
            const pollAddress = generatePollAddress(this.data.formData.title, creatorPublicKey);
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

            const formData = getMessageTransaction(formDataMessage, pollAddress);
            const description = getMessageTransaction(descriptionMessage, pollAddress);
            const options = getMessageTransaction(optionsMessage, pollAddress);
            const messages = [formData, description, options];
            if (this.data.formData.type === PollConstants.WHITELIST_POLL) {
                const splitAddresses: string[][] = [];
                const addresses = this.data.whitelist!.map((a) => a.plain());
                while (addresses.length > 0) {
                    splitAddresses.push(addresses.splice(0, 24)); // 24 is the maximum amount of addresses that fit in a single transaction
                }
                const whitelistMessages = splitAddresses.map((partialWhitelist) => {
                    const whitelistMessage = "whitelist:" + JSON.stringify(partialWhitelist);
                    return getMessageTransaction(whitelistMessage, pollAddress);
                });
                messages.concat(whitelistMessages);
            }
            const header: {[key: string]: any} = {
                title: this.data.formData.title,
                type: this.data.formData.type,
                doe: this.data.formData.doe,
                address: pollAddress.plain(),
            };
            // if (this.data.formData.type === PollConstants.WHITELIST_POLL) {
            //     header.whitelist = this.data.whitelist!.map((a) => a.plain());
            // }
            const headerMessage = "poll:" + JSON.stringify(header);
            let pollIndexAddress: Address;
            if (pollIndex) {
                pollIndexAddress = pollIndex.address;
            } else {
                pollIndexAddress = (NEMLibrary.getNetworkType() === NetworkTypes.MAIN_NET) ?
                    new Address(PollConstants.MAINNET_POLL_INDEX) : new Address(PollConstants.TESTNET_POLL_INDEX);
            }
            messages.push(getMessageTransaction(headerMessage, pollIndexAddress));
            return {
                transactions: messages,
                broadcastedPoll: new BroadcastedPoll(this.data.formData, this.data.description, this.data.options, pollAddress, link, this.data.whitelist),
            };
        } catch (err) {
            throw err;
        }
    }
}

/**
 * A broadcasted poll. Represents a Poll that exists in the blockchain.
 */
class BroadcastedPoll extends Poll {
    /**
     * The poll address
     */
    public readonly address: Address;
    /**
     * The block the poll ended on. It is undefined until fetched.
     */
    public endBlock?: number;
    /**
     * Map from option to option address
     */
    private optionAddresses: IAddressLink;

    /**
     * @internal
     */
    constructor(formData: IFormData, description: string, options: string[], pollAddress: Address, optionAddresses: IAddressLink, whitelist?: Address[], endBlock?: number) {
        super(formData, description, options, whitelist);
        this.address = pollAddress;
        this.optionAddresses = optionAddresses;
        this.endBlock = endBlock;
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
                let endBlock: number | undefined;
                // TODO: multi-message whitelist
                const creator = await getFirstSender(pollAddress).first().toPromise();
                const end = (formData.doe < Date.now()) ? (formData.doe) : (undefined);
                if (end !== undefined) {
                    endBlock = await getHeightByTimestamp(end).first().toPromise();
                }
                const whitelistStrings = await getAllMessagesWithString("whitelist:", pollAddress, creator!, endBlock).first().toPromise();
                if (whitelistStrings === null) {
                    throw new Error("Error fetching poll");
                }
                const whitelist = whitelistStrings.reduce((addresses, whitelistString) => {
                    return addresses.concat(JSON.parse(whitelistString.replace("whitelist:", "")).map((a) => {
                        return new Address(a);
                    }));
                }, []);
                return new BroadcastedPoll(formData, description, options.strings, pollAddress, addressLink, whitelist, endBlock);
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
     * Sets the end block when the poll ends
     * @param block - The end block
     * @return void
     */
    public setEndBlock = (block: number): void => {
        this.endBlock = block;
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
     * @param option - The option to vote
     * @return TransferTransaction - the transaction that needs to be sent to vote
     */
    public vote = (option: string): TransferTransaction => {
        const now = Date.now();
        if (this.data.formData.doe < now) {
            throw new Error("Poll Ended");
        }
        return vote(this, option);
    }

    /**
     * Votes on the poll from a multisig account, returns the vote transaction result
     * @param multisigAccount - The public account of the multisig account that votes
     * @param option - The option to vote
     * @return MultisigTransaction - the transaction that needs to be sent to vote
     */
    public voteMultisig = (multisigAccount: PublicAccount, option: string): MultisigTransaction => {
        const now = Date.now();
        if (this.data.formData.doe < now) {
            throw new Error("Poll Ended");
        }
        return multisigVote(multisigAccount, this, option);
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

export {IPollData, IFormData, IBroadcastData, IAddressLink, Poll, BroadcastedPoll, UnbroadcastedPoll};
