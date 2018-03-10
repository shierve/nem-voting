import {getFirstMessageWithString} from "./utils";
import { Address, Observable, NEMLibrary, NetworkTypes } from "nem-library";
import { WHITELIST_POLL, POI_POLL } from "./constants";
import { IResults, getWhitelistResults, getPOIResults } from "./counting";

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

    // public broadcast = (): Observable<BroadcastedPoll> => {
    // }
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

    public getResults = (poll: BroadcastedPoll): Observable<IResults> => {
        if (poll.data.formData.type === POI_POLL) {
            return getPOIResults(poll);
        } else if (poll.data.formData.type === WHITELIST_POLL) {
            return getWhitelistResults(poll);
        } else {
            throw new Error("unsupported type");
        }
    }

}

export {IPollData, IFormData, IAddressLink, Poll, BroadcastedPoll, UnbroadcastedPoll};
