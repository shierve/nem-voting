import {getFirstMessageWithString} from "./utils";
import { Address, Observable, NEMLibrary, NetworkTypes } from "nem-library";

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
}

class BroadcastedPoll extends Poll {
    public readonly address: Address;
    private optionAddresses: Address[];

    constructor(formData: IFormData, description: string, options: string[], pollAddress: Address, optionAddresses: Address[], whitelist?: Address[]) {
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
            // console.log(pollBasicData);
            const formData = JSON.parse(pollBasicData[0]!.replace("formData:", ""));
            const description = pollBasicData[1]!.replace("description:", "");
            const options = JSON.parse(pollBasicData[2]!.replace("options:", ""));

            const unique = (list: any[]) => {
                return list.sort().filter((item, pos, ary) => {
                    return !pos || item !== ary[pos - 1];
                });
            };

            // This part is for compatibility with the old poll structure
            let orderedAddresses = [];
            if (options.link) {
                orderedAddresses = options.strings.map((option: string) => {
                    return options.link[option];
                });
            } else {
                orderedAddresses = options.addresses;
            }

            if (orderedAddresses.length !== unique(orderedAddresses).length) {
                // same account for different options
                throw Error("Poll is invalid");
            }

            const optionAddresses = orderedAddresses.map((a: string) => new Address(a));

            if (formData.type === 1) {
                const whitelistString = await getFirstMessageWithString("whitelist:", pollAddress).first().toPromise();
                if (whitelistString === null) {
                    throw new Error("Error fetching poll");
                }
                const whitelist = (JSON.parse(whitelistString!.replace("whitelist:", ""))).map((a) => new Address(a));
                return new BroadcastedPoll(formData, description, options.strings, pollAddress, optionAddresses, whitelist);
            } else {
                return new BroadcastedPoll(formData, description, options.strings, pollAddress, optionAddresses);
            }
        } catch (err) {
            throw err;
        }
    }

    public static fromAddress = (pollAddress: Address): Observable<BroadcastedPoll> => {
        return Observable.fromPromise(BroadcastedPoll.fromAddressPromise(pollAddress));
    }

}

export {IPollData, IFormData, Poll, BroadcastedPoll, UnbroadcastedPoll};
